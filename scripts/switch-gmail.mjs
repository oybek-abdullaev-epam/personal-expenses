// Operational helper: never logs credentials, email contents, or transactions.
import { readFile, writeFile, rename, chmod, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
const root = new URL("../", import.meta.url);
const configPath = new URL(".env.production.json", root);
const stagedPath = new URL(".env.gmail-switch.json", root);
const statePath = new URL(".env.gmail-switch-state.json", root);
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
async function save(path, value) {
  const temp = new URL(path.href + ".tmp");
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
}
async function identity(config) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: config.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw Error("Gmail refresh failed");
  if (data.scope !== "https://www.googleapis.com/auth/gmail.readonly")
    throw Error("Unexpected Gmail scopes");
  const profile = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    {
      headers: { Authorization: `Bearer ${data.access_token}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  const account = await profile.json();
  if (!profile.ok || !account.emailAddress)
    throw Error("Gmail identity check failed");
  return account.emailAddress.toLowerCase();
}
async function checkedStaged(config, compareOld = false) {
  const staged = await read(stagedPath);
  if (
    staged.GOOGLE_CLIENT_ID !== config.GOOGLE_CLIENT_ID ||
    staged.GOOGLE_CLIENT_SECRET !== config.GOOGLE_CLIENT_SECRET
  )
    throw Error("OAuth client mismatch");
  if ((await identity(staged)) !== staged.GMAIL_ACCOUNT)
    throw Error("New inbox identity mismatch");
  if (compareOld && (await identity(config)) === staged.GMAIL_ACCOUNT)
    throw Error("New inbox matches old inbox");
  return staged;
}
async function backend(config, path, body) {
  const response = await fetch(new URL(path, config.BACKEND_URL), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${config.BACKEND_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error("Backend operation failed");
  return response.json();
}
async function paused(config) {
  const status = await backend(config, "/maintenance/status");
  if (!status.maintenance) throw Error("Maintenance is not active");
  return status;
}
try {
  const config = await read(configPath);
  const action = process.argv[2];
  if (action === "verify") {
    await checkedStaged(config, true);
    console.log(
      "Verified different old/new inboxes, same OAuth client, and read-only access.",
    );
  } else if (action === "record-pause") {
    await paused(config);
    let state;
    try {
      state = await read(statePath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (!state) {
      state = { paused_at: Date.now() };
      await save(statePath, state);
    }
    console.log(JSON.stringify(state));
  } else if (action === "status") {
    console.log(JSON.stringify(await paused(config)));
  } else if (action === "install-token") {
    await paused(config);
    const staged = await checkedStaged(config, true);
    const state = await read(statePath);
    const child = spawn(
      "npx",
      [
        "wrangler",
        "secret",
        "put",
        "GOOGLE_REFRESH_TOKEN",
        "--config",
        "backend/wrangler.toml",
      ],
      { cwd: root, stdio: ["pipe", "inherit", "inherit"] },
    );
    child.stdin.end(staged.GOOGLE_REFRESH_TOKEN);
    const exitCode = await new Promise((resolve, reject) => {
      child.on("exit", resolve);
      child.on("error", reject);
    });
    if (exitCode !== 0) throw Error("Token deployment failed");
    await paused(config);
    await save(statePath, { ...state, token_installed: true });
    console.log("New refresh token deployed; maintenance remains active.");
  } else if (action === "reset") {
    const state = await read(statePath);
    if (!state.token_installed || Date.now() - state.paused_at < 16 * 60000)
      throw Error(
        "Reset requires deployed token and a 16-minute maintenance drain",
      );
    await checkedStaged(config);
    await paused(config);
    state.switched_at ??= Date.now();
    await save(statePath, state); // Preserve the same boundary if the HTTP response is lost.
    await backend(config, "/maintenance/reset", {
      switched_at: state.switched_at,
    });
    const status = await paused(config);
    if (
      status.sync?.activated_at !== state.switched_at ||
      status.counts.transactions ||
      status.counts.notifications ||
      status.counts.associations
    )
      throw Error("Reset verification failed");
    await save(statePath, { ...state, reset_verified: true });
    console.log(
      JSON.stringify({
        switched_at: new Date(state.switched_at).toISOString(),
        counts: status.counts,
      }),
    );
  } else if (action === "finish") {
    const state = await read(statePath);
    if (state.completed_at) {
      await rm(stagedPath, { force: true });
      await rm(new URL(stagedPath.href + ".tmp"), { force: true });
      console.log("Mailbox switch cleanup already completed.");
      process.exit(0);
    }
    if (!state.reset_verified) throw Error("Reset has not been verified");
    const health = await backend(config, "/api/health");
    if (
      health.sync?.activated_at !== state.switched_at ||
      health.sync?.error ||
      health.sync?.last_success < state.switched_at ||
      !health.sync?.last_success
    )
      throw Error("New inbox scheduled sync is not yet verified");
    const staged = await checkedStaged(config);
    // Revoke only the OLD account's grant, never the shared OAuth client.
    if (config.GOOGLE_REFRESH_TOKEN !== staged.GOOGLE_REFRESH_TOKEN) {
      const revoked = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        body: new URLSearchParams({ token: config.GOOGLE_REFRESH_TOKEN }),
        signal: AbortSignal.timeout(15000),
      });
      if (!revoked.ok) {
        const error = await revoked.json();
        if (error.error !== "invalid_token")
          throw Error("Old grant revocation failed");
      }
      // Confirm the old refresh token can no longer mint an access token.
      const oldCheck = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: config.GOOGLE_CLIENT_ID,
          client_secret: config.GOOGLE_CLIENT_SECRET,
          refresh_token: config.GOOGLE_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(15000),
      });
      const oldResult = await oldCheck.json();
      if (oldCheck.ok || oldResult.error !== "invalid_grant")
        throw Error("Old grant revocation has not propagated; retry finish");
      await identity(staged);
      await save(configPath, { ...config, ...staged });
    }
    await save(statePath, { ...state, completed_at: Date.now() });
    await rm(stagedPath, { force: true });
    await rm(new URL(stagedPath.href + ".tmp"), { force: true });
    console.log(
      "Old Gmail grant revoked, rejection verified, new grant verified, and local credentials replaced. Staged token removed.",
    );
  } else if (action === "health") {
    console.log(JSON.stringify(await backend(config, "/api/health")));
    console.log(
      JSON.stringify({ totals: await backend(config, "/api/totals") }),
    );
  } else throw Error("Unknown switch action");
} catch (error) {
  // Only our own fixed messages are safe to display; never print response bodies.
  const safe = [
    "Reset requires deployed token and a 16-minute maintenance drain",
    "New inbox scheduled sync is not yet verified",
    "Old grant revocation has not propagated; retry finish",
  ];
  console.error(
    safe.includes(error.message)
      ? error.message
      : "Mailbox switch step failed; credentials were not printed. Check the step before retrying.",
  );
  process.exitCode = 1;
}
