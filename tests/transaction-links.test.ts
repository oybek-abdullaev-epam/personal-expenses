import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, message, fixture, now } from "./helpers";
import { api } from "../backend/src/api";
import { parseEmail } from "../backend/src/parser";
import { saveMessage, sql } from "../backend/src/store";
import { deliver, handleUpdate } from "../backend/src/telegram";
import { transactionButton } from "../backend/src/telegram-links";
import site from "../website/worker/index.js";

const uuid = "abcdef00-0000-4000-8000-000000000001";
const config = {
  BACKEND_URL: "https://backend.example",
  BACKEND_TOKEN: "test-backend-token",
};
async function seed(
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
    "SELECT * FROM expenses WHERE source_message_id=?",
    id,
  ).first<any>())!;
}

test("transaction buttons expose only a canonical UUID and reject invalid selectors/configuration", () => {
  assert.deepEqual(
    transactionButton("https://tracker.example", uuid.toUpperCase()),
    {
      text: "View transaction",
      web_app: { url: `https://tracker.example/?transaction=${uuid}` },
    },
  );
  for (const id of [
    "-".repeat(36),
    "0".repeat(36),
    `${uuid}/extra`,
    `${uuid}?token=secret`,
    "",
    "../health",
  ])
    assert.equal(transactionButton("https://tracker.example/", id), null);
  assert.equal(transactionButton("https://tracker.example/?bad=1", uuid), null);
});

test("record lookup is one authenticated primary-key read, independent of pages/filters, with no mutations", async (t) => {
  const { env, sqlite } = setup();
  t.after(() => sqlite.close());
  const target = await seed(env, "target");
  sqlite
    .prepare(
      "UPDATE expenses SET occurred_at='2026-08-01T00:00:00.000Z' WHERE id=?",
    )
    .run(target.id);
  for (let i = 0; i < 55; i++) await seed(env, `newer-${i}`);
  const page: any = await (await api(request("/api/expenses"), env)).json();
  assert.equal(page.expenses.length, 50);
  assert.equal(page.nextOffset, 50);
  assert(!page.expenses.some((e: any) => e.id === target.id));
  const filtered: any = await (
    await api(
      request("/api/expenses?from=2026-09-01&direction=income&q=unmatched"),
      env,
    )
  ).json();
  assert.equal(filtered.expenses.length, 0);
  const snapshot = () =>
    JSON.stringify({
      expenses: sqlite.prepare("SELECT * FROM expenses ORDER BY id").all(),
      outbox: sqlite.prepare("SELECT * FROM outbox ORDER BY id").all(),
      messages: sqlite
        .prepare("SELECT * FROM telegram_messages ORDER BY message_id")
        .all(),
      updates: sqlite
        .prepare("SELECT * FROM telegram_updates ORDER BY id")
        .all(),
    });
  const before = snapshot();
  const prepare = env.DB.prepare.bind(env.DB);
  const queries: string[] = [];
  t.mock.method(env.DB, "prepare", (query: string) => {
    queries.push(query);
    return prepare(query);
  });
  const path = `/api/expenses/${target.id.toUpperCase()}?from=invalid&direction=invalid&offset=9999999`;
  for (let i = 0; i < 2; i++) {
    const response = await api(request(path), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), {
      ...target,
      occurred_at: "2026-08-01T00:00:00.000Z",
    });
  }
  assert.deepEqual(queries, [
    "SELECT * FROM expenses WHERE id=?",
    "SELECT * FROM expenses WHERE id=?",
  ]);
  assert.equal(snapshot(), before);
  for (const authorized of [false, true]) {
    const missing = await api(
      request(`/api/expenses/${uuid}`, "GET", undefined, authorized),
      env,
    );
    assert.equal(missing.status, authorized ? 404 : 401);
    assert.equal(missing.headers.get("Cache-Control"), "no-store");
  }
  sqlite.prepare("UPDATE expenses SET dismissed=1 WHERE id=?").run(target.id);
  assert.equal(
    (await api(request(`/api/expenses/${target.id}`), env)).status,
    404,
  );
  for (const id of [
    "-".repeat(36),
    "0".repeat(36),
    `${uuid}/extra`,
    `${uuid}%2Fextra`,
    "not-an-id",
  ])
    assert.equal((await api(request(`/api/expenses/${id}`), env)).status, 404);
});

test("public record proxy forwards only GET/PATCH UUID routes and preserves all integration protections", async (t) => {
  const calls: { url: string; options: RequestInit }[] = [];
  let redirect = false,
    offline = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, options: RequestInit) => {
      calls.push({ url: String(url), options });
      if (offline) throw Error("synthetic-secret-never-forward");
      if (redirect)
        return new Response(null, {
          status: 302,
          headers: { Location: "https://elsewhere.example" },
        });
      return Response.json({ id: uuid });
    },
  );
  const path = `/api/expenses/${uuid.toUpperCase()}`;
  const response = await site.fetch(
    new Request(`https://site.example${path}`),
    config,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: uuid });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert(!JSON.stringify([...response.headers]).includes(config.BACKEND_TOKEN));
  assert.equal(calls[0].url, `https://backend.example${path}`);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.body, undefined);
  assert.equal(
    (calls[0].options.headers as any).Authorization,
    `Bearer ${config.BACKEND_TOKEN}`,
  );
  assert.equal(calls[0].options.redirect, "manual");
  assert(calls[0].options.signal instanceof AbortSignal);
  for (const method of ["POST", "PUT", "DELETE", "HEAD", "OPTIONS"])
    assert.equal(
      (
        await site.fetch(
          new Request(`https://site.example${path}`, { method }),
          config,
        )
      ).status,
      405,
    );
  for (const invalid of [
    "-".repeat(36),
    "0".repeat(36),
    `${uuid}/extra`,
    `${uuid}%2Fextra`,
    "not-an-id",
  ])
    assert.equal(
      (
        await site.fetch(
          new Request(`https://site.example/api/expenses/${invalid}`),
          config,
        )
      ).status,
      404,
    );
  assert.equal(
    (
      await site.fetch(
        new Request("https://site.example/api/activate", { method: "POST" }),
        config,
      )
    ).status,
    404,
  );
  for (const [headers, body, status] of [
    [
      {
        Origin: "https://elsewhere.example",
        "Content-Type": "application/json",
      },
      "{}",
      403,
    ],
    [
      { Origin: "https://site.example", "Content-Type": "text/plain" },
      "{}",
      403,
    ],
    [
      { Origin: "https://site.example", "Content-Type": "application/json" },
      "я".repeat(4001),
      413,
    ],
  ] as const)
    assert.equal(
      (
        await site.fetch(
          new Request(`https://site.example${path}`, {
            method: "PATCH",
            headers,
            body,
          }),
          config,
        )
      ).status,
      status,
    );
  assert.equal(
    (await site.fetch(new Request(`https://site.example${path}`), {})).status,
    503,
  );
  assert.equal(calls.length, 1);
  redirect = true;
  const redirected = await site.fetch(
    new Request(`https://site.example${path}`),
    config,
  );
  assert.equal(redirected.status, 503);
  assert.equal(redirected.headers.get("Location"), null);
  offline = true;
  const unavailable = await site.fetch(
    new Request(`https://site.example${path}`),
    config,
  );
  assert.equal(unavailable.status, 503);
  assert(!(await unavailable.text()).includes("synthetic-secret"));
});

function callback(
  updateId: number,
  id: string,
  messageId: number,
  income = false,
) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      from: { id: 42 },
      data: `${income ? "inc" : "cat"}:${id}:1`,
      message: { message_id: messageId, chat: { id: 42, type: "private" } },
    },
  };
}
function reply(updateId: number, prompt: number, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: 10000 + updateId,
      from: { id: 42 },
      chat: { id: 42, type: "private" },
      text,
      reply_to_message: { message_id: prompt },
    },
  };
}

test("dashboard edits, reversed chat replies, stale prompts and receipt/cleanup retries retain transaction association", async (t) => {
  const { env, sqlite } = setup();
  t.after(() => sqlite.close());
  env.TELEGRAM_APP_URL = "https://tracker.example/";
  const a = await seed(env, "synthetic-expense"),
    b = await seed(env, "synthetic-income", true);
  await seed(env, "synthetic-expense");
  let messageId = 100,
    failReceipts = false,
    failDeletes = false;
  const calls: { method: string; body: any }[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: any) => {
    const method = String(url).split("/").at(-1)!;
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (
      (failReceipts && body.text?.startsWith("✓ Saved")) ||
      (failDeletes && method === "deleteMessage")
    )
      throw Error("synthetic timeout");
    return Response.json({ ok: true, result: { message_id: messageId++ } });
  });
  const record = (id: string) =>
    api(request(`/api/expenses/${id}`), env).then(
      (r) => r.json() as Promise<any>,
    );
  const patch = (id: string, body: unknown) =>
    api(request(`/api/expenses/${id}`, "PATCH", body), env);
  const association = (id: string, kind: string) =>
    Number(
      sqlite
        .prepare(
          "SELECT message_id FROM telegram_messages WHERE expense_id=? AND kind=?",
        )
        .get(id, kind)!.message_id,
    );
  await deliver(env, now);
  const menus = [association(a.id, "expense"), association(b.id, "expense")];
  const stale = await record(a.id);
  await handleUpdate(env, callback(1, a.id, menus[0]), now);
  assert.equal(
    (await patch(a.id, { version: stale.version, category: "Health" })).status,
    409,
  );
  const current = await record(a.id);
  assert.equal(
    (await patch(a.id, { version: current.version, category: "Health" }))
      .status,
    200,
  );
  await handleUpdate(env, callback(2, b.id, menus[1], true), now);
  await deliver(env, now);
  const prompts = [association(a.id, "prompt"), association(b.id, "prompt")];
  for (const body of calls
    .filter((c) => c.body.reply_markup?.force_reply)
    .map((c) => c.body))
    assert.equal(body.reply_markup.inline_keyboard, undefined);
  // A website edit before receipt delivery does not invalidate its pending prompt.
  const beforeReply = await record(a.id);
  assert.equal(
    (
      await patch(a.id, {
        version: beforeReply.version,
        description: "Website draft",
      })
    ).status,
    200,
  );
  for (const u of [
    reply(3, prompts[1], "Income reply"),
    reply(4, prompts[0], "Expense reply"),
  ]) {
    await handleUpdate(env, u, now);
    await handleUpdate(env, u, now);
  }
  assert.equal((await record(a.id)).description, "Expense reply");
  assert.equal((await record(a.id)).category, "Health");
  assert.equal((await record(b.id)).description, "Income reply");
  assert.equal((await record(b.id)).income_category, "Reimbursement");
  assert.equal(
    (
      await patch(a.id, {
        version: beforeReply.version,
        description: "Stale draft",
      })
    ).status,
    409,
  );
  failReceipts = true;
  await deliver(env, now);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='receipt'")
      .get()!.n,
    2,
  );
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='delete'")
      .get()!.n,
    0,
  );
  const pending = await record(a.id);
  assert.equal(
    (
      await patch(a.id, {
        version: pending.version,
        description: "Website final",
      })
    ).status,
    200,
  );
  failReceipts = false;
  failDeletes = true;
  await deliver(env, now + 60000);
  const successful = calls
    .filter((c) => c.body.text?.startsWith("✓ Saved"))
    .slice(2);
  assert.equal(successful.length, 2);
  const receipt = successful.find((c) =>
    c.body.reply_markup.inline_keyboard[0][0].web_app.url.endsWith(a.id),
  )!;
  assert.match(receipt.body.text, /Health · Website final/);
  assert.deepEqual(receipt.body.reply_markup.inline_keyboard, [
    [transactionButton(env.TELEGRAM_APP_URL, a.id)],
  ]);
  // A receipt retires chat controls even if cleanup is waiting on a retry or the dashboard reopens the row.
  const completed = await record(a.id);
  assert.equal(
    (await patch(a.id, { version: completed.version, description: "" })).status,
    200,
  );
  const reopened = await record(a.id);
  await handleUpdate(env, reply(5, prompts[0], "Stale reply"), now + 60001);
  await handleUpdate(env, callback(6, a.id, menus[0]), now + 60001);
  assert.deepEqual(await record(a.id), reopened);
  failDeletes = false;
  await Promise.all([deliver(env, now + 120000), deliver(env, now + 120000)]);
  assert.equal(
    sqlite
      .prepare(
        "SELECT cleanup_status FROM telegram_messages WHERE message_id=?",
      )
      .get(prompts[0])!.cleanup_status,
    null,
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT cleanup_status FROM telegram_messages WHERE message_id=?",
      )
      .get(prompts[1])!.cleanup_status,
    "deleted",
  );
  assert.equal(
    (
      await patch(a.id, {
        version: reopened.version,
        description: "Restored final",
      })
    ).status,
    200,
  );
  await deliver(env, now + 420000);
  assert.equal(
    sqlite
      .prepare(
        "SELECT cleanup_status FROM telegram_messages WHERE message_id=?",
      )
      .get(prompts[0])!.cleanup_status,
    "deleted",
  );
  assert.equal(
    calls.filter((c) => c.body.text?.startsWith("✓ Saved")).length,
    4,
  ); // two failed + two delivered
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    2,
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM telegram_messages WHERE kind='receipt'",
      )
      .get()!.n,
    2,
  );
});
