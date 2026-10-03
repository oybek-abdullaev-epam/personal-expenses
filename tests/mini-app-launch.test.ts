import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  miniAppUrl,
  trackerButton,
  transactionButton,
} from "../backend/src/telegram-links";
import {
  appUrl,
  captureMenu,
  applyMenu,
  restoreMenu,
  saveSnapshot,
  loadSnapshot,
  telegramClient,
} from "../scripts/mini-app-menu.mjs";
import { setup, message, fixture, now } from "./helpers";
import { parseEmail } from "../backend/src/parser";
import { saveMessage, sql } from "../backend/src/store";
import { deliver } from "../backend/src/telegram";

const app = "https://tracker.example/";
const rejected = [
  undefined,
  null,
  1,
  "",
  " https://tracker.example",
  "https://tracker.example\n",
  "http://tracker.example",
  "https:tracker.example",
  "https://tracker.example/path",
  "https://tracker.example/a/..",
  "https://tracker.example\\",
  "https://user:secret@tracker.example",
  "https://:@tracker.example",
  "https://tracker.example?",
  "https://tracker.example#",
  "https://tracker.example/?token=secret",
  "https://t.me",
  "https://telegram.me/",
];
test("Mini App destinations require an explicit HTTPS root without launch credentials", () => {
  for (const value of rejected) {
    assert.equal(miniAppUrl(value), null, String(value));
    assert.equal(appUrl(value), null, String(value));
    assert.equal(trackerButton(value), null);
  }
  assert.equal(miniAppUrl("https://tracker.example"), app);
  assert.equal(appUrl("https://tracker.example"), app);
  assert.deepEqual(trackerButton(app), {
    text: "Open tracker",
    web_app: { url: app },
  });
});

for (const configured of [app, undefined, "https://tracker.example/?bad=1"]) {
  test(`notification markup preserves controls and browser recovery (${configured ?? "absent"})`, async (t) => {
    const { env, sqlite } = setup();
    env.TELEGRAM_APP_URL = configured;
    const incoming = message("launch-test", fixture);
    await saveMessage(env, incoming, parseEmail(incoming), now);
    const e = sqlite.prepare("SELECT id FROM expenses").get()!;
    const sent: any[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: any) => {
      sent.push(JSON.parse(init.body));
      return Response.json({
        ok: true,
        result: { message_id: 100 + sent.length },
      });
    });
    await deliver(env, now);
    const category = sent[0].reply_markup.inline_keyboard;
    assert.equal(category.flat().filter((x: any) => x.callback_data).length, 8);
    assert.equal(category[0][0].callback_data, `cat:${e.id}:0`);
    assert.equal(
      category.flat().filter((x: any) => x.web_app).length,
      configured === app ? 1 : 0,
    );
    if (configured === app)
      assert.deepEqual(category.at(-1), [transactionButton(app, String(e.id))]);
    await sql(
      env,
      "INSERT INTO outbox(id,expense_id,kind,available_at) VALUES('test-prompt',?,'prompt',?)",
      e.id,
      now,
    ).run();
    await deliver(env, now);
    assert.deepEqual(sent[1].reply_markup, {
      force_reply: true,
      input_field_placeholder: "What was this transaction for?",
    });
    await sql(
      env,
      "UPDATE expenses SET category='Food',description='Synthetic launch',occurred_at='2026-09-23T14:00:00.000Z' WHERE id=?",
      e.id,
    ).run();
    for (const [id, kind, eid] of [
      ["test-review", "review", e.id],
      ["test-receipt", "receipt", e.id],
      ["test-auth", "auth", null],
      ["reminder:2026-09-23", "reminder", null],
    ])
      await sql(
        env,
        "INSERT INTO outbox(id,expense_id,kind,available_at) VALUES(?,?,?,?)",
        id,
        eid,
        kind,
        now,
      ).run();
    await deliver(env, now);
    const notifications = sent.filter((x) => x.text);
    const auth = notifications.find((x) =>
      x.text.includes("authorization needs attention"),
    );
    assert.ok(auth.text.endsWith(env.SITE_URL));
    assert.equal(auth.reply_markup, undefined);
    for (const text of ["✓ Saved", "needs review", "Today’s spending so far"]) {
      const body = notifications.find((x) => x.text.includes(text));
      assert.ok(body, text);
      assert.ok(body.text.includes(env.SITE_URL));
      if (configured === app)
        assert.deepEqual(body.reply_markup, {
          inline_keyboard: [
            [
              text === "Today’s spending so far"
                ? trackerButton(app)
                : transactionButton(app, String(e.id)),
            ],
          ],
        });
      else assert.equal(body.reply_markup?.inline_keyboard, undefined);
    }
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
      1,
    );
  });
}

function menuMock(ownerMenu: any = { type: "default" }) {
  const calls: { method: string; body: any }[] = [];
  const defaultMenu = { type: "commands" };
  let current = structuredClone(ownerMenu);
  const telegram = async (method: string, body: any) => {
    calls.push({ method, body });
    if (method === "getChatMenuButton")
      return structuredClone(body.chat_id ? current : defaultMenu);
    if (method === "setChatMenuButton") {
      current = structuredClone(body.menu_button);
      return true;
    }
    throw Error("Unexpected method");
  };
  return { telegram, calls };
}

test("menu capture, owner apply, and exact restore preserve the default and protected snapshot", async () => {
  for (const original of [
    { type: "default" },
    { type: "commands" },
    {
      type: "web_app",
      text: "Previous",
      web_app: { url: "https://previous.example/path?existing=1" },
    },
  ]) {
    const m = menuMock(original);
    const snapshot = await captureMenu(m.telegram, "42");
    assert.deepEqual(snapshot.defaultMenu, { type: "commands" });
    assert.deepEqual(snapshot.ownerMenu, original);
    const dir = await mkdtemp(join(tmpdir(), "mini-app-menu-"));
    const path = join(dir, "menu.json");
    try {
      await saveSnapshot(snapshot, path);
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      assert.deepEqual(await loadSnapshot("42", path), snapshot);
      await assert.rejects(saveSnapshot(snapshot, path), /EEXIST/);
      await assert.rejects(loadSnapshot("43", path), /mismatched/);
      await applyMenu(m.telegram, "42", app, snapshot);
      await restoreMenu(m.telegram, "42", snapshot);
      const writes = m.calls.filter((c) => c.method === "setChatMenuButton");
      assert.equal(writes.length, 2);
      assert.ok(writes.every((c) => c.body.chat_id === "42"));
      assert.deepEqual(writes[1].body.menu_button, original);
      assert.deepEqual(JSON.parse(await readFile(path, "utf8")), snapshot);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("menu failures retain rollback and reject bad URL/snapshot before changing anything", async () => {
  const m = menuMock();
  const snapshot = await captureMenu(m.telegram, "42");
  for (const value of rejected)
    await assert.rejects(applyMenu(m.telegram, "42", value, snapshot));
  await assert.rejects(applyMenu(m.telegram, "43", app, snapshot));
  assert.equal(
    m.calls.filter((c) => c.method === "setChatMenuButton").length,
    0,
  );
  const refused = async () => false;
  await assert.rejects(applyMenu(refused, "42", app, snapshot), /rejected/);
  const mismatch = async (method: string) =>
    method === "setChatMenuButton" ? true : { type: "commands" };
  await assert.rejects(applyMenu(mismatch, "42", app, snapshot), /readback/);
  await assert.rejects(restoreMenu(mismatch, "42", snapshot), /readback/);
  const timeout = async () => {
    throw Error("Synthetic timeout");
  };
  await assert.rejects(applyMenu(timeout, "42", app, snapshot), /timeout/);
  await assert.rejects(captureMenu(timeout, "42"), /timeout/);
  await restoreMenu(m.telegram, "42", snapshot);
  assert.deepEqual(snapshot.ownerMenu, { type: "default" });
});

test("menu transport uses only menu methods and hides upstream error payloads", async () => {
  const request = async (_url: unknown, init: any) => {
    assert.deepEqual(JSON.parse(init.body), { chat_id: "42" });
    return Response.json(
      { ok: false, description: "private upstream content" },
      { status: 403 },
    );
  };
  const telegram = telegramClient(
    { TELEGRAM_BOT_TOKEN: "synthetic-token" },
    request,
  );
  await assert.rejects(
    telegram("getChatMenuButton", { chat_id: "42" }),
    (e: Error) => {
      assert.equal(e.message, "Telegram menu request failed.");
      return true;
    },
  );
});
