import { test } from "node:test";
import assert from "node:assert/strict";
import maintenance, { resetHistory } from "../backend/src/maintenance";
import worker from "../backend/src/index";
import { setup, message, now, request } from "./helpers";
import { saveMessage } from "../backend/src/store";
import { parseEmail } from "../backend/src/parser";
import { handleUpdate, deliver } from "../backend/src/telegram";
import { pollGmail } from "../backend/src/gmail";

test("reset clears history atomically, preserves update deduplication, and is retry-safe", async () => {
  const { env, sqlite } = setup();
  const m = message();
  await saveMessage(env, m, parseEmail(m), now);
  const id = sqlite.prepare("SELECT id FROM expenses").get()!.id;
  sqlite
    .prepare(
      "INSERT INTO telegram_messages (message_id,expense_id,kind) VALUES (100,?,'prompt')",
    )
    .run(id);
  sqlite.exec(
    "INSERT INTO telegram_updates VALUES (42,1); INSERT INTO sync_state (id,activated_at,cursor_at,page_token) VALUES (1,1,2,'old-page')",
  );
  sqlite.exec(
    "CREATE TRIGGER fail_reset BEFORE DELETE ON expenses BEGIN SELECT RAISE(ABORT,'test failure'); END",
  );
  await assert.rejects(resetHistory(env, now));
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM outbox").get()!.n, 1);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM telegram_messages").get()!.n,
    1,
  );
  sqlite.exec("DROP TRIGGER fail_reset");
  await resetHistory(env, now);
  for (const table of ["expenses", "outbox", "telegram_messages", "locks"])
    assert.equal(sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n, 0);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM telegram_updates").get()!.n,
    1,
  );
  const state = sqlite.prepare("SELECT * FROM sync_state").get()!;
  assert.equal(state.activated_at, now);
  assert.equal(state.cursor_at, now);
  assert.equal(state.page_token, null);
  await saveMessage(env, message("new"), parseEmail(m), now);
  await resetHistory(env, now);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM expenses").get()!.n, 1);
});

test("maintenance rejects application writes and unauthorized reset; production has no reset route", async (t) => {
  const { env, sqlite } = setup();
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("Network must not run");
  });
  for (const path of ["/api/activate", "/telegram/webhook", "/api/expenses/x"])
    assert.equal(
      (await maintenance.fetch(request(path, "POST", {}), env)).status,
      503,
    );
  assert.equal(
    (
      await maintenance.fetch(
        request("/maintenance/reset", "POST", {}, false),
        env,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await maintenance.fetch(
        request("/maintenance/reset", "POST", { switched_at: -1 }),
        env,
      )
    ).status,
    400,
  );
  await maintenance.scheduled();
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sync_state").get()!.n, 0);
  assert.equal(
    (
      await worker.fetch(
        request("/maintenance/reset", "POST", { switched_at: now }),
        env,
        {} as ExecutionContext,
      )
    ).status,
    404,
  );
});

test("old Telegram interactions cannot recreate history or change a new transaction", async (t) => {
  const { env, sqlite } = setup();
  const m = message("old");
  await saveMessage(env, m, parseEmail(m), now);
  const oldId = sqlite.prepare("SELECT id FROM expenses").get()!.id;
  sqlite
    .prepare(
      "INSERT INTO telegram_messages (message_id,expense_id,kind) VALUES (100,?,'expense'),(101,?,'prompt')",
    )
    .run(oldId, oldId);
  await resetHistory(env, now);
  await saveMessage(env, message("new"), parseEmail(m), now);
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    return Response.json({ ok: true, result: true });
  });
  const callback = {
    update_id: 50,
    callback_query: {
      id: "old-cb",
      from: { id: 42 },
      data: `cat:${oldId}:0`,
      message: { message_id: 100, chat: { id: 42, type: "private" } },
    },
  };
  const reply = {
    update_id: 51,
    message: {
      message_id: 102,
      from: { id: 42 },
      chat: { id: 42, type: "private" },
      text: "old reply",
      reply_to_message: { message_id: 101 },
    },
  };
  for (const update of [callback, reply, callback, reply])
    await handleUpdate(env, update, now);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM expenses").get()!.n, 1);
  const fresh = sqlite.prepare("SELECT * FROM expenses").get()!;
  assert.equal(fresh.category, null);
  assert.equal(fresh.description, "");
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM telegram_messages").get()!.n,
    0,
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM outbox").get()!.n, 1);
  assert.ok(calls.every((url) => url.endsWith("/answerCallbackQuery")));
});

test("new activation excludes earlier mail, includes boundary, and deduplicates polling and delivery retries", async (t) => {
  const { env, sqlite } = setup();
  await resetHistory(env, now);
  let failDelivery = true;
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com"))
      return Response.json({ access_token: "synthetic" });
    if (u.includes("api.telegram.org")) {
      if (failDelivery) throw Error("synthetic network failure");
      return Response.json({ ok: true, result: { message_id: 200 } });
    }
    if (u.includes("messages?"))
      return Response.json({
        messages: [{ id: "before" }, { id: "boundary" }],
      });
    const id = u.includes("messages/before?") ? "before" : "boundary";
    return Response.json(
      message(id, undefined, "text/plain", id === "before" ? now - 1 : now),
    );
  });
  await pollGmail(env, now + 1000);
  await pollGmail(env, now + 2000);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM expenses").get()!.n, 1);
  assert.equal(
    sqlite.prepare("SELECT source_message_id FROM expenses").get()!
      .source_message_id,
    "boundary",
  );
  await deliver(env, now + 2000);
  failDelivery = false;
  await deliver(env, now + 120000);
  await deliver(env, now + 180000);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM telegram_messages").get()!.n,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM outbox WHERE sent_at IS NULL").get()!
      .n,
    0,
  );
});
