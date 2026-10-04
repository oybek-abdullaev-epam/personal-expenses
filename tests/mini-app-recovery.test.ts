import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, now, message, purchaseFixture } from "./helpers";
import { api } from "../backend/src/api";
import worker from "../backend/src/index";
import { parseEmail } from "../backend/src/parser";
import { saveMessage } from "../backend/src/store";
import { deliver, handleUpdate } from "../backend/src/telegram";
import site from "../website/worker/index.js";
import {
  captureMenu,
  applyMenu,
  restoreMenu,
} from "../scripts/mini-app-menu.mjs";

test("presentation rollback preserves populated state and browser recovery during a Telegram outage", async (t) => {
  const { env, sqlite } = setup();
  env.TELEGRAM_APP_URL = "https://tracker.example/";
  sqlite
    .prepare(
      "INSERT INTO sync_state(id,activated_at,cursor_at,window_end,page_token,last_success) VALUES(1,?,?,?,?,?)",
    )
    .run(now - 86400000, now - 60000, now, "synthetic-next-page", now - 120000);
  sqlite
    .prepare(
      "INSERT INTO locks(name,token,until_at) VALUES('gmail','synthetic-lease',?)",
    )
    .run(now + 300000);
  const seed = async (id: string, body = purchaseFixture) => {
    const incoming = message(id, body);
    await saveMessage(env, incoming, parseEmail(incoming), now);
    return sqlite
      .prepare("SELECT id FROM expenses WHERE source_message_id=?")
      .get(id)!.id as string;
  };
  const a = await seed("recovery-a"),
    b = await seed("recovery-b");
  let telegramAvailable = true,
    nextMessage = 100;
  const sends: any[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://backend.example/"))
      return api(new Request(input, init), env, now);
    assert.ok(url.startsWith("https://api.telegram.org/"));
    if (!telegramAvailable) throw Error("synthetic outage");
    const body = JSON.parse(init.body);
    if (url.endsWith("/sendMessage")) sends.push(body);
    return Response.json({ ok: true, result: { message_id: nextMessage++ } });
  });
  await deliver(env, now);
  for (const [i, id] of [a, b].entries()) {
    const association = sqlite
      .prepare(
        "SELECT message_id FROM telegram_messages WHERE expense_id=? AND kind='expense'",
      )
      .get(id)!;
    await handleUpdate(
      env,
      {
        update_id: i + 1,
        callback_query: {
          id: `recovery-${i}`,
          from: { id: 42 },
          data: `cat:${id}:1`,
          message: {
            message_id: Number(association.message_id),
            chat: { id: 42, type: "private" },
          },
        },
      },
      now,
    );
  }
  await deliver(env, now);
  const prompts = sqlite
    .prepare(
      "SELECT * FROM telegram_messages WHERE kind='prompt' ORDER BY message_id",
    )
    .all();
  assert.equal(prompts.length, 2);
  const manual = {
    id: crypto.randomUUID(),
    direction: "expense",
    merchant: "RECOVERY SYNTHETIC",
    amount: "2.34",
    currency: "UZS",
    local_time: "22.09.26 12:00",
    category: "Other",
    description: "Recovery fixture",
    card_suffix: "",
  };
  assert.equal(
    (await api(request("/api/expenses", "POST", manual), env, now)).status,
    201,
  );
  await seed("recovery-pending");
  await seed("recovery-review", "Unrecognized synthetic receipt");
  telegramAvailable = false;
  await deliver(env, now);
  const retryRows = sqlite
    .prepare("SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY id")
    .all();
  assert.equal(retryRows.length, 2);
  assert.ok(
    retryRows.every(
      (row) => row.attempts === 1 && row.error === "telegram_unavailable",
    ),
  );
  const tables = [
    "expenses",
    "sync_state",
    "outbox",
    "telegram_messages",
    "telegram_updates",
    "locks",
  ];
  const snapshot = () =>
    tables.map((table) =>
      sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
    );
  const beforeRollback = snapshot();

  // Presentation rollback has no migration or queue-reset step. Browser reads
  // continue while Telegram remains unavailable, including a pending target.
  delete env.TELEGRAM_APP_URL;
  const proxyEnv = {
    BACKEND_URL: "https://backend.example",
    BACKEND_TOKEN: env.BACKEND_TOKEN,
  };
  for (const path of [
    "/",
    "/api/expenses",
    "/api/totals",
    "/api/health",
    `/api/expenses/${a}`,
  ]) {
    const response = await site.fetch(
      new Request(`https://expenses.example${path}`, {headers: {"X-Tracker-Contract": "reimbursements-v1"}}),
      proxyEnv,
    );
    assert.equal(response.status, 200, path);
  }
  assert.equal(
    (
      await site.fetch(
        new Request("https://expenses.example/api/activate"),
        proxyEnv,
      )
    ).status,
    404,
  );
  assert.equal(
    (await api(request("/api/expenses", "GET", undefined, false), env, now))
      .status,
    401,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://backend.example/telegram/webhook", {
          method: "POST",
          body: "{}",
        }),
        env,
        {} as ExecutionContext,
      )
    ).status,
    401,
  );
  assert.equal(
    (await api(request("/api/expenses", "POST", manual), env, now)).status,
    200,
  );
  assert.deepEqual(
    snapshot(),
    beforeRollback,
    "rollback, public reads, rejected access, and manual retry change no stored state",
  );

  telegramAvailable = true;
  const recoveredStart = sends.length;
  await deliver(env, now + 60000);
  await deliver(env, now + 60001);
  const recoveredSends = sends.slice(recoveredStart);
  assert.equal(
    recoveredSends.length,
    2,
    "each queued notification resumes once",
  );
  assert.ok(
    recoveredSends.every(
      (body) => !JSON.stringify(body.reply_markup ?? {}).includes("web_app"),
    ),
  );
  assert.ok(
    recoveredSends
      .find((body) => body.text.includes("needs review"))
      .text.includes(env.SITE_URL),
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "SELECT * FROM telegram_messages WHERE kind='prompt' ORDER BY message_id",
      )
      .all(),
    prompts,
  );
  for (const [i, id] of [b, a].entries()) {
    const prompt = prompts.find((row) => row.expense_id === id)!;
    const update = {
      update_id: 20 + i,
      message: {
        message_id: 900 + i,
        chat: { id: 42, type: "private" },
        from: { id: 42 },
        text: `Recovered ${i}`,
        reply_to_message: { message_id: Number(prompt.message_id) },
      },
    };
    await handleUpdate(env, update, now + 60002);
    await handleUpdate(env, update, now + 60002);
    const saved = sqlite
      .prepare("SELECT description,version FROM expenses WHERE id=?")
      .get(id)!;
    assert.equal(saved.description, `Recovered ${i}`);
    assert.equal(saved.version, 2);
  }
  assert.equal(sqlite.prepare("SELECT count(*) n FROM expenses").get()!.n, 5);
  assert.deepEqual(
    sqlite.prepare("SELECT * FROM sync_state ORDER BY 1").all(),
    beforeRollback[1],
  );
  assert.deepEqual(
    sqlite.prepare("SELECT * FROM locks ORDER BY 1").all(),
    beforeRollback[5],
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT count(*) n FROM outbox WHERE kind='receipt' AND sent_at IS NULL",
      )
      .get()!.n,
    2,
  );
});

test("menu restore recovers an accepted change whose response was lost", async () => {
  const original = { type: "default" },
    defaultMenu = { type: "commands" };
  let ownerMenu: any = structuredClone(original),
    loseResponse = true;
  const writes: any[] = [];
  const telegram = async (method: string, body: any) => {
    if (method === "getChatMenuButton")
      return structuredClone(body.chat_id ? ownerMenu : defaultMenu);
    assert.equal(method, "setChatMenuButton");
    assert.equal(body.chat_id, "42");
    writes.push(structuredClone(body));
    ownerMenu = structuredClone(body.menu_button);
    if (loseResponse) {
      loseResponse = false;
      throw Error("synthetic response lost after commit");
    }
    return true;
  };
  const snapshot = await captureMenu(telegram, "42");
  const originalSnapshot = structuredClone(snapshot);
  await assert.rejects(
    applyMenu(telegram, "42", "https://tracker.example", snapshot),
    /response lost/,
  );
  assert.equal(ownerMenu.type, "web_app");
  await restoreMenu(telegram, "42", snapshot);
  assert.deepEqual(ownerMenu, original);
  assert.deepEqual(snapshot, originalSnapshot);
  assert.deepEqual(defaultMenu, { type: "commands" });
  assert.equal(writes.length, 2);
});
