process.on("uncaughtException", () => {
  console.error(
    "Setup failed. Check the local configuration and try again; credentials were not printed.",
  );
  process.exit(1);
});
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const config = JSON.parse(
  await readFile(new URL("../.env.production.json", import.meta.url), "utf8"),
);
const names = [
  "BACKEND_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_OWNER_ID",
];
if (names.some((k) => !config[k]))
  throw Error(
    "Complete every secret in .env.production.json before uploading.",
  );
const child = spawn(
  "npx",
  ["wrangler", "secret", "bulk", "--config", "backend/wrangler.toml"],
  { stdio: ["pipe", "inherit", "inherit"] },
);
child.stdin.end(
  JSON.stringify(Object.fromEntries(names.map((k) => [k, String(config[k])]))),
);
child.on("exit", (code) => (process.exitCode = code ?? 1));
