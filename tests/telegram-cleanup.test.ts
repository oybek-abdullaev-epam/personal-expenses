import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, message, now, fixture } from "./helpers";
import { saveMessage, sql } from "../backend/src/store";
import { parseEmail } from "../backend/src/parser";
import { deliver, handleUpdate } from "../backend/src/telegram";

async function transaction(
  env: ReturnType<typeof setup>["env"],
  id: string,
  income = false,
) {
  const m = message(
    id,
    income ? fixture.replaceAll("E-Com oplata", "Perevod na kartu") : fixture,
  );
  await saveMessage(env, m, parseEmail(m), now);
  return (await sql(
    env,
    "SELECT id FROM expenses WHERE source_message_id=?",
    id,
  ).first<{ id: string }>())!.id;
}
function reply(updateId: number, messageId: number, promptId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      chat: { id: 42, type: "private" },
      from: { id: 42 },
      text: "Synthetic lunch",
      reply_to_message: { message_id: promptId },
    },
  };
}
function response(messageId = 1000) {
  return Response.json({ ok: true, result: { message_id: messageId } });
}

test("receipt delivery precedes cleanup; delete failures retry without another receipt", async (t) => {
  const { env, sqlite } = setup();
  env.TELEGRAM_APP_URL = "https://tracker.example/";
  const id = await transaction(env, "completed");
  const pending = await transaction(env, "pending");
  sqlite.exec("UPDATE outbox SET sent_at=1");
  await sql(env, "UPDATE expenses SET category='Food' WHERE id=?", id).run();
  for (const [mid, eid, kind] of [
    [10, id, "expense"],
    [11, id, "prompt"],
    [12, pending, "prompt"],
  ] as const)
    await sql(
      env,
      "INSERT INTO telegram_messages(message_id,expense_id,kind) VALUES(?,?,?)",
      mid,
      eid,
      kind,
    ).run();
  const u = reply(1, 20, 11);
  await handleUpdate(env, u, now);
  await handleUpdate(env, u, now);
  let failReceipt = true,
    failDelete = true;
  const calls: { method: string; body: any }[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: any) => {
    const method = String(url).split("/").pop()!;
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (
      (method === "sendMessage" && failReceipt) ||
      (method === "deleteMessage" && failDelete)
    )
      return Response.json({ ok: false }, { status: 503 });
    return response();
  });
  await deliver(env, now);
  assert.equal(calls.length, 1);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='delete'")
      .get()!.n,
    0,
  );
  failReceipt = false;
  await deliver(env, now + 60000);
  assert.match(calls[1].body.text, /Food · Synthetic lunch/);
  assert.equal(calls[1].body.reply_parameters, undefined);
  assert.equal(
    calls[1].body.reply_markup.inline_keyboard[0][0].web_app.url,
    `${env.TELEGRAM_APP_URL}?transaction=${id}`,
  );
  assert.deepEqual(
    calls
      .filter((c) => c.method === "deleteMessage")
      .map((c) => c.body.message_id)
      .sort(),
    [10, 11, 20],
  );
  failDelete = false;
  await Promise.all([deliver(env, now + 120000), deliver(env, now + 120000)]);
  assert.equal(calls.filter((c) => c.method === "sendMessage").length, 2); // failed attempt + successful receipt
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM telegram_messages WHERE cleanup_status='deleted'",
      )
      .get()!.n,
    3,
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT cleanup_status FROM telegram_messages WHERE message_id=12",
      )
      .get()!.cleanup_status,
    null,
  );
  await handleUpdate(env, reply(2, 21, 11), now + 120001);
  assert.equal(
    sqlite.prepare("SELECT version FROM expenses WHERE id=?").get(id)!.version,
    1,
  );
});

test("retention keeps latest three receipts and expires them at 47 hours without deleting pending prompts", async (t) => {
  const { env, sqlite } = setup();
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) ids.push(await transaction(env, String(i)));
  sqlite.exec("UPDATE outbox SET sent_at=1");
  for (let i = 0; i < 4; i++) {
    await sql(
      env,
      "UPDATE expenses SET category='Food',description='Lunch' WHERE id=?",
      ids[i],
    ).run();
    await sql(
      env,
      "INSERT INTO telegram_messages(message_id,expense_id,kind,created_at) VALUES(?,?,'receipt',?)",
      100 + i,
      ids[i],
      now,
    ).run();
  }
  await sql(
    env,
    "INSERT INTO telegram_messages(message_id,expense_id,kind,created_at) VALUES(200,?,'prompt',?)",
    ids[4],
    now,
  ).run();
  const removed: number[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: any) => {
    removed.push(JSON.parse(init.body).message_id);
    return response();
  });
  await deliver(env, now);
  assert.deepEqual(removed, [100]);
  await deliver(env, now + 46 * 3600000);
  assert.deepEqual(removed, [100]);
  await deliver(env, now + 47 * 3600000);
  assert.deepEqual(removed.sort(), [100, 101, 102, 103]);
  assert.equal(
    sqlite
      .prepare(
        "SELECT cleanup_status FROM telegram_messages WHERE message_id=200",
      )
      .get()!.cleanup_status,
    null,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    5,
  );
});

test("missing or too-old messages finish cleanup while rate limits retry", async (t) => {
  const { env, sqlite } = setup();
  const id = await transaction(env, "one");
  sqlite.exec(
    "UPDATE outbox SET sent_at=1; UPDATE expenses SET category='Food',description='Lunch'",
  );
  for (const [mid, kind] of [
    [1, "expense"],
    [2, "prompt"],
    [3, "description"],
    [4, "receipt"],
  ] as const)
    await sql(
      env,
      "INSERT INTO telegram_messages(message_id,expense_id,kind,created_at) VALUES(?,?,?,?)",
      mid,
      id,
      kind,
      now,
    ).run();
  const calls: number[] = [];
  let limited = true;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: any) => {
    const mid = JSON.parse(init.body).message_id;
    calls.push(mid);
    if (mid === 1)
      return Response.json(
        { ok: false, description: "Bad Request: message to delete not found" },
        { status: 400 },
      );
    if (mid === 2)
      return Response.json(
        { ok: false, description: "Bad Request: message can't be deleted" },
        { status: 400 },
      );
    if (limited)
      return Response.json(
        { ok: false, parameters: { retry_after: 120 } },
        { status: 429 },
      );
    return response();
  });
  await deliver(env, now);
  assert.equal(
    sqlite
      .prepare(
        "SELECT cleanup_status FROM telegram_messages WHERE message_id=1",
      )
      .get()!.cleanup_status,
    "deleted",
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT cleanup_status FROM telegram_messages WHERE message_id=2",
      )
      .get()!.cleanup_status,
    "unavailable",
  );
  await deliver(env, now + 60000);
  assert.equal(calls.length, 3);
  limited = false;
  await deliver(env, now + 180000);
  assert.deepEqual(calls, [1, 2, 3, 3]);
});

test("income description alone stays pending; category completes it once and suppresses stale prompts", async (t) => {
  const { env, sqlite } = setup();
  const id = await transaction(env, "income", true);
  sqlite.exec("UPDATE outbox SET sent_at=1");
  for (const [mid, kind] of [
    [1, "expense"],
    [2, "prompt"],
  ] as const)
    await sql(
      env,
      "INSERT INTO telegram_messages(message_id,expense_id,kind) VALUES(?,?,?)",
      mid,
      id,
      kind,
    ).run();
  const sent: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: any) => {
    sent.push(JSON.parse(init.body));
    return response(100);
  });
  await handleUpdate(env, reply(1, 3, 2), now);
  await deliver(env, now);
  assert.equal(sent.length, 0);
  const u = {
    update_id: 2,
    callback_query: {
      id: "cb",
      from: { id: 42 },
      data: `inc:${id}:0`,
      message: { message_id: 1, chat: { id: 42, type: "private" } },
    },
  };
  await handleUpdate(env, u, now);
  await handleUpdate(env, u, now);
  await sql(
    env,
    "INSERT INTO outbox(id,expense_id,kind,available_at) VALUES('stale',?,'prompt',?)",
    id,
    now,
  ).run();
  await deliver(env, now);
  const receipts = sent.filter((s) => s.reply_markup?.remove_keyboard);
  assert.equal(receipts.length, 1);
  assert.match(receipts[0].text, /Income received/);
  assert.match(receipts[0].text, /Salary · Synthetic lunch/);
  assert.ok(sent.every((s) => !s.reply_markup?.force_reply));
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM telegram_messages WHERE cleanup_status='deleted'",
      )
      .get()!.n,
    3,
  );
});
