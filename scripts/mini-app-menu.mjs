import { readFile, open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const configPath = new URL("../.env.production.json", import.meta.url);
export const snapshotPath = new URL(
  "../.env.telegram-menu.json",
  import.meta.url,
);

export function appUrl(value) {
  if (typeof value !== "string" || !/^https:\/\/[^/?#@\s\\]+\/?$/i.test(value))
    return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      value.includes("?") ||
      value.includes("#") ||
      /^(www\.)?(t\.me|telegram\.me)$/i.test(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function ownerId(value) {
  const id = String(value);
  if (!/^[1-9]\d*$/.test(id)) throw Error("Invalid owner configuration.");
  return id;
}

function validMenu(menu) {
  return (
    menu &&
    typeof menu === "object" &&
    (["default", "commands"].includes(menu.type) ||
      (menu.type === "web_app" &&
        typeof menu.text === "string" &&
        typeof menu.web_app?.url === "string"))
  );
}

function checkedSnapshot(snapshot, owner) {
  if (
    snapshot?.version !== 1 ||
    snapshot.ownerId !== ownerId(owner) ||
    !validMenu(snapshot.defaultMenu) ||
    !validMenu(snapshot.ownerMenu)
  )
    throw Error("Invalid or mismatched menu snapshot.");
  return snapshot;
}

export async function captureMenu(telegram, owner) {
  const id = ownerId(owner);
  const defaultMenu = await telegram("getChatMenuButton", {});
  const ownerMenu = await telegram("getChatMenuButton", { chat_id: id });
  return checkedSnapshot(
    { version: 1, ownerId: id, defaultMenu, ownerMenu },
    id,
  );
}

// Exclusive creation preserves the original rollback even after a failed apply.
export async function saveSnapshot(snapshot, path = snapshotPath) {
  checkedSnapshot(snapshot, snapshot?.ownerId);
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(snapshot, null, 2) + "\n");
  } finally {
    await file.close();
  }
}

export async function loadSnapshot(owner, path = snapshotPath) {
  return checkedSnapshot(JSON.parse(await readFile(path, "utf8")), owner);
}

async function setAndVerify(telegram, owner, menu) {
  const id = ownerId(owner);
  if (
    (await telegram("setChatMenuButton", {
      chat_id: id,
      menu_button: menu,
    })) !== true
  )
    throw Error("Menu change was rejected.");
  const saved = await telegram("getChatMenuButton", { chat_id: id });
  if (!isDeepStrictEqual(saved, menu))
    throw Error("Menu readback did not match.");
  return saved;
}

export async function applyMenu(telegram, owner, value, snapshot) {
  checkedSnapshot(snapshot, owner);
  const url = appUrl(value);
  if (!url) throw Error("Invalid Mini App URL.");
  return setAndVerify(telegram, owner, {
    type: "web_app",
    text: "Open tracker",
    web_app: { url },
  });
}

export async function restoreMenu(telegram, owner, snapshot) {
  const saved = checkedSnapshot(snapshot, owner);
  // The default was captured for audit only: this helper changes only the owner override.
  return setAndVerify(telegram, owner, saved.ownerMenu);
}

export function telegramClient(config, request = fetch) {
  if (!config.TELEGRAM_BOT_TOKEN) throw Error("Missing bot configuration.");
  return async (method, body) => {
    const response = await request(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await response.json();
    if (!response.ok || !data.ok) throw Error("Telegram menu request failed.");
    return data.result;
  };
}

async function main(args) {
  const [action, candidate] = args;
  if (
    !["capture", "apply", "restore", "check"].includes(action) ||
    (candidate !== undefined && action !== "apply") ||
    args.length > 2
  )
    throw Error("Invalid command.");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const owner = ownerId(config.TELEGRAM_OWNER_ID);
  const telegram = telegramClient(config);
  if (action === "capture") {
    const snapshot = await captureMenu(telegram, owner);
    await saveSnapshot(snapshot);
    console.log(
      "Default and owner menu settings captured in the protected local snapshot.",
    );
  } else if (action === "apply") {
    const snapshot = await loadSnapshot(owner);
    await applyMenu(
      telegram,
      owner,
      candidate ?? config.TELEGRAM_APP_URL,
      snapshot,
    );
    console.log("Owner Open tracker menu applied and verified.");
  } else if (action === "restore") {
    await restoreMenu(telegram, owner, await loadSnapshot(owner));
    console.log(
      "Original owner menu restored and verified. Default menu was unchanged.",
    );
  } else {
    const snapshot = await captureMenu(telegram, owner);
    const expected = appUrl(candidate ?? config.TELEGRAM_APP_URL);
    const menu = snapshot.ownerMenu;
    const matches =
      expected &&
      isDeepStrictEqual(menu, {
        type: "web_app",
        text: "Open tracker",
        web_app: { url: expected },
      });
    if (!matches)
      throw Error("Owner menu does not match configured Mini App URL.");
    console.log(
      "Owner Mini App menu matches configuration; default menu inspected.",
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main(process.argv.slice(2));
  } catch {
    console.error(
      "Mini App menu setup failed. Check configuration, connection, and the saved snapshot. Retry or restore; credentials were not printed.",
    );
    process.exitCode = 1;
  }
}
