process.on("uncaughtException", () => {
  console.error(
    "Setup failed. Check the local configuration and try again; credentials were not printed.",
  );
  process.exit(1);
});
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, rename, chmod } from "node:fs/promises";
import { spawn } from "node:child_process";
const input = process.argv[2];
const switching = input === "--switch";
const expectedEmail = switching ? process.argv[3]?.trim().toLowerCase() : null;
if (!input) {
  console.error(
    "Usage: node scripts/google-oauth.mjs /path/to/downloaded-desktop-client.json | --switch new@gmail.com",
  );
  process.exit(1);
}
if (switching && !/^[^\s@]+@[^\s@]+$/.test(expectedEmail ?? ""))
  throw Error("Provide the new Gmail address.");
const existing = switching
  ? JSON.parse(
      await readFile(
        new URL("../.env.production.json", import.meta.url),
        "utf8",
      ),
    )
  : null;
const client = switching
  ? {
      client_id: existing.GOOGLE_CLIENT_ID,
      client_secret: existing.GOOGLE_CLIENT_SECRET,
    }
  : JSON.parse(await readFile(input, "utf8")).installed;
if (!client?.client_id || !client?.client_secret)
  throw Error("Use a Google OAuth Desktop app client.");
const state = randomBytes(32).toString("base64url"),
  verifier = randomBytes(32).toString("base64url");
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const redirect = `http://127.0.0.1:${server.address().port}/callback`;
const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url.search = new URLSearchParams({
  client_id: client.client_id,
  redirect_uri: redirect,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/gmail.readonly",
  access_type: "offline",
  prompt: "consent select_account",
  state,
  code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  code_challenge_method: "S256",
}).toString();
if (expectedEmail) url.searchParams.set("login_hint", expectedEmail);
const timeout = setTimeout(() => {
  console.error("Authorization timed out. Run the command again.");
  server.close();
  process.exitCode = 1;
}, 300000);
let processing = false;
server.on("request", async (req, res) => {
  const callback = new URL(req.url, redirect);
  if (
    callback.pathname !== "/callback" ||
    callback.searchParams.get("state") !== state ||
    req.method !== "GET"
  ) {
    res.writeHead(400);
    res.end("Invalid callback");
    return;
  }
  if (processing) {
    res.writeHead(409);
    res.end("Already processing");
    return;
  }
  processing = true;
  try {
    if (!callback.searchParams.get("code")) throw Error();
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: client.client_id,
        client_secret: client.client_secret,
        code: callback.searchParams.get("code"),
        code_verifier: verifier,
        redirect_uri: redirect,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const token = await response.json();
    if (!response.ok || !token.refresh_token) throw Error();
    if (switching) {
      const scopes = (token.scope ?? "").split(" ");
      if (
        scopes.length !== 1 ||
        scopes[0] !== "https://www.googleapis.com/auth/gmail.readonly"
      )
        throw Error();
      const profileResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        {
          headers: { Authorization: `Bearer ${token.access_token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      const profile = await profileResponse.json();
      if (
        !profileResponse.ok ||
        profile.emailAddress?.toLowerCase() !== expectedEmail
      )
        throw Error();
    }
    const output = new URL(
      switching ? "../.env.gmail-switch.json" : "../.env.production.json",
      import.meta.url,
    );
    let config = {};
    if (!switching)
      try {
        config = JSON.parse(await readFile(output, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    Object.assign(config, {
      GOOGLE_CLIENT_ID: client.client_id,
      GOOGLE_CLIENT_SECRET: client.client_secret,
      GOOGLE_REFRESH_TOKEN: token.refresh_token,
    });
    if (switching) config.GMAIL_ACCOUNT = expectedEmail;
    else {
      config.BACKEND_TOKEN ??= randomBytes(32).toString("hex");
      config.TELEGRAM_WEBHOOK_SECRET ??= randomBytes(32).toString("hex");
    }
    const temporary = new URL(output.href + ".tmp");
    await writeFile(temporary, JSON.stringify(config, null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(temporary, 0o600);
    await rename(temporary, output);
    res.end("Gmail authorization saved. Close this tab and return to Codex.");
    console.log(
      switching
        ? "New inbox identity and read-only scope verified. Staged credentials saved; production is unchanged."
        : "Saved Google credentials and generated service secrets to .env.production.json (owner-readable only).",
    );
  } catch {
    res.writeHead(400);
    res.end("Authorization failed. Return to the terminal and try again.");
    console.error(
      "Authorization failed; no credentials were printed. Check the Google client and consent settings.",
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    server.close();
  }
});
console.log("Authorize only the selected Gmail account in your browser.");
const command =
  process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
const args =
  process.platform === "win32" ? ["/c", "start", "", url.href] : [url.href];
spawn(command, args, { stdio: "ignore" }).on("error", () =>
  console.log("Open this authorization URL:\n" + url.href),
);
