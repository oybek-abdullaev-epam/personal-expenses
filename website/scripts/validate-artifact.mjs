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
assert(!html.includes("__DARK_TOKENS__"));
const darkBlocks = [
  ...html.matchAll(
    /(?:prefers-color-scheme: dark\) \{\s*:root:not\(\[data-telegram-theme="light"\]\)|:root\[data-telegram-theme="dark"\])\s*\{([^}]*)\}/g,
  ),
].map((match) => match[1].replace(/\s+/g, " ").trim());
assert.equal(darkBlocks.length, 2, "Both dark palettes must be present");
assert.equal(darkBlocks[0], darkBlocks[1], "Dark palettes must be identical");
assert(darkBlocks[0].includes("--porcelain:"));
assert(html.includes("https://telegram.org/js/telegram-web-app.js?63"));
assert(html.includes("function createTelegramAdapter"));
assert(!html.includes("oai-authenticated"));
console.log("Vercel adapter and generated dashboard validated");
