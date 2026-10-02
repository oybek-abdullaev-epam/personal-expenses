import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const [worker, html, client, telegram] = await Promise.all(
  [
    "worker/index.js",
    "worker/page.html",
    "worker/client.js",
    "worker/telegram.js",
  ].map((p) => readFile(new URL(p, root), "utf8")),
);
await mkdir(new URL("dist/server/", root), { recursive: true });
await rm(new URL("dist/.openai/", root), { recursive: true, force: true });
await mkdir(new URL("public/", root), { recursive: true });
await writeFile(
  new URL("public/robots.txt", root),
  "User-agent: *\nDisallow: /\n",
);
await writeFile(
  new URL("dist/server/index.js", root),
  worker.replace(/(["'])__PAGE_DOCUMENT__\1/, () =>
    JSON.stringify(
      html
        .replace("__TELEGRAM_SCRIPT__", () => telegram)
        .replace("__CLIENT_SCRIPT__", () => client),
    ),
  ),
);
