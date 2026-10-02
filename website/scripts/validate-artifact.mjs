import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import site from "../api/index.js";
const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url)),
);
assert.equal(config.framework, null);
assert.equal(config.rewrites[0].destination, "/api/index");
const response = await site.fetch(new Request("https://dashboard.example/"));
assert.equal(response.status, 200);
const html = await response.text();
assert(html.includes("Public · Tashkent"));
assert(!html.includes("__PAGE_DOCUMENT__"));
assert(!html.includes("__CLIENT_SCRIPT__"));
assert(!html.includes("__TELEGRAM_SCRIPT__"));
assert(html.includes("https://telegram.org/js/telegram-web-app.js?63"));
assert(html.includes("function createTelegramAdapter"));
assert(!html.includes("oai-authenticated"));
console.log("Vercel adapter and generated dashboard validated");
