#!/usr/bin/env node
// Local-only screenshot runner: headless Chrome over DevTools Protocol.
// Real phone widths, emulated dark/light scheme, scripted states, overflow report.
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CHROME =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WATCHDOG_MS = 180_000;

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  args[a.slice(2)] = process.argv[i + 1]?.startsWith("--")
    ? "true"
    : process.argv[++i];
}
if (args.help || !args.out) {
  console.log(`Usage: node screenshot.mjs --out <dir> [--prefix after] [--spec shots.json]
  [--sizes 320x800,390x844,768x1024,1280x900] [--light-sizes 390x844,1280x900]
  [--only name,name] [--url http://127.0.0.1:8788]
Default is dark. Shots with "light": true are also taken in light at --light-sizes.`);
  process.exit(args.help ? 0 : 2);
}

const base = new URL(args.url || "http://127.0.0.1:8788");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) {
  console.error("Refusing non-local URL: " + base.origin);
  process.exit(2);
}
const parseSizes = (s) =>
  s.split(",").map((p) => {
    const [w, h] = p.split("x").map(Number);
    if (!w || !h) throw Error("Bad size: " + p);
    return { w, h };
  });
const sizes = parseSizes(args.sizes || "320x800,390x844,768x1024,1280x900");
const lightSizes = parseSizes(args["light-sizes"] || "390x844,1280x900");
const prefix = args.prefix || "after";
const outDir = resolve(args.out);
const spec = JSON.parse(
  readFileSync(resolve(args.spec || join(here, "shots.default.json")), "utf8"),
);
const only = args.only ? new Set(args.only.split(",")) : null;
const shots = spec.filter((s) => !only || only.has(s.name));
if (!shots.length) {
  console.error("No shots selected.");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "design-ui-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    chrome.kill("SIGKILL");
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => process.exit(130));
const watchdog = setTimeout(() => {
  console.error("Watchdog: timed out, killing Chrome.");
  cleanup();
  process.exit(1);
}, WATCHDOG_MS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw Error("Chrome did not expose a debugging endpoint.");
}

const ws = new WebSocket(await connect());
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(Error("DevTools socket failed"));
});
let nextId = 1;
const pending = new Map();
let problems = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(Error(m.error.message)) : res(m.result);
    return;
  }
  if (m.method === "Runtime.exceptionThrown")
    problems.push(
      "exception: " +
        (m.params.exceptionDetails.exception?.description ||
          m.params.exceptionDetails.text),
    );
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    problems.push(
      "console.error: " +
        m.params.args.map((a) => a.value ?? a.description).join(" "),
    );
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
    problems.push(
      "log: " + m.params.entry.text + " " + (m.params.entry.url || ""),
    );
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    throw Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text,
    );
  return r.result.value;
};
const waitFor = async (expr, what, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(expr)) return;
    await sleep(100);
  }
  throw Error("Timed out waiting for " + what);
};
const q = (sel) => JSON.stringify(sel);

async function run(action) {
  if (action.click) {
    const ok = await evaluate(
      `(() => { const n = document.querySelector(${q(action.click)}); if (!n) return false; n.click(); return true; })()`,
    );
    if (!ok) throw Error("No element for click: " + action.click);
  } else if (action.fill) {
    const ok = await evaluate(
      `(() => { const n = document.querySelector(${q(action.fill.selector)}); if (!n) return false; n.value = ${q(action.fill.value)}; n.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`,
    );
    if (!ok) throw Error("No element for fill: " + action.fill.selector);
  } else if (action.submit) {
    const ok = await evaluate(
      `(() => { const f = document.querySelector(${q(action.submit)}); if (!f) return false; f.requestSubmit(); return true; })()`,
    );
    if (!ok) throw Error("No form for submit: " + action.submit);
  } else if (action.waitFor) {
    await waitFor(
      `!!document.querySelector(${q(action.waitFor)})`,
      action.waitFor,
    );
  } else if (action.wait) {
    await sleep(action.wait);
  } else throw Error("Unknown action: " + JSON.stringify(action));
  await sleep(150);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

const results = [];
let failed = false;
const slot = (shot, { w, h }, light) =>
  `${prefix}-${shot.name}${light ? "-light" : ""}-${w}x${h}`;

async function capture(shot, size, light) {
  const label = slot(shot, size, light);
  problems = [];
  try {
    await send("Emulation.setDeviceMetricsOverride", {
      width: size.w,
      height: size.h,
      deviceScaleFactor: 2,
      mobile: size.w < 768,
    });
    await send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: light ? "light" : "dark" },
        {
          name: "prefers-reduced-motion",
          value: shot.motion ? "no-preference" : "reduce",
        },
      ],
    });
    await send("Page.navigate", { url: "about:blank" });
    await sleep(100);
    await send("Page.navigate", { url: base.origin + "/" + (shot.hash || "") });
    await waitFor(`document.readyState === "complete"`, "page load");
    await waitFor(
      `!(document.getElementById("empty")?.textContent || "").includes("Loading")`,
      "data load",
    );
    await sleep(shot.motion ? 1600 : 300);
    for (const a of shot.actions || []) await run(a);

    const overflow = await evaluate(
      `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
    );
    let height = size.h;
    if (shot.fullPage) {
      const full = await evaluate(`document.documentElement.scrollHeight`);
      height = Math.min(Math.max(full, size.h), 6000);
      await send("Emulation.setDeviceMetricsOverride", {
        width: size.w,
        height,
        deviceScaleFactor: 2,
        mobile: size.w < 768,
      });
      await sleep(200);
    }
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const file = join(outDir, label + ".png");
    writeFileSync(file, Buffer.from(data, "base64"));
    const note = [];
    if (overflow > 0) note.push(`OVERFLOW ${overflow}px`);
    for (const p of problems) note.push(p);
    if (note.length) failed = true;
    results.push({ label, ok: !note.length, note });
  } catch (e) {
    failed = true;
    results.push({ label, ok: false, note: [String(e.message || e)] });
  }
}

try {
  for (const shot of shots) {
    const own = shot.sizes ? parseSizes(shot.sizes.join(",")) : sizes;
    for (const size of own) await capture(shot, size, false);
    if (shot.light)
      for (const size of own.filter((s) =>
        lightSizes.some((l) => l.w === s.w && l.h === s.h),
      ))
        await capture(shot, size, true);
  }
} finally {
  clearTimeout(watchdog);
  ws.close();
  cleanup();
}

for (const r of results)
  console.log(
    `${r.ok ? "ok  " : "FAIL"} ${r.label}.png${r.note.length ? "  " + r.note.join(" | ") : ""}`,
  );
console.log(
  `\n${results.length} screenshots in ${outDir}${failed ? " (with failures)" : ""}`,
);
process.exit(failed ? 1 : 0);
