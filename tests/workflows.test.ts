import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setup,
  message,
  now,
  request,
  fixture,
  purchaseFixture,
} from "./helpers";
import { parseEmail } from "../backend/src/parser";
import { saveMessage, sql } from "../backend/src/store";
import { deliver, handleUpdate, reminder } from "../backend/src/telegram";
import { pollGmail } from "../backend/src/gmail";
import { api } from "../backend/src/api";
import worker from "../backend/src/index";
async function seed(env: any, id = "m1", body = fixture) {
  const m = message(id, body);
  await saveMessage(env, m, parseEmail(m), now);
  return (await sql(
    env,
    "SELECT * FROM expenses WHERE source_message_id=?",
    id,
  ).first<any>())!;
}
function tg(messageId: number) {
  return new Response(
    JSON.stringify({ ok: true, result: { message_id: messageId } }),
  );
}
test("save before notification, deduplicate imports, retry sends without another expense", async (t) => {
  const { env, sqlite } = setup();
  env.TELEGRAM_APP_URL = "https://tracker.example/";
  const e = await seed(env, "purchase", purchaseFixture);
  await seed(env, "purchase", purchaseFixture);
  assert.equal(e.review_reason, null);
  assert.equal(e.direction, "expense");
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    1,
  );
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("network contains private stuff");
  });
  await deliver(env, now);
  assert.equal(
    sqlite.prepare("SELECT attempts FROM outbox").get()!.attempts,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT error FROM outbox").get()!.error,
    "telegram_unavailable",
  );
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => tg(100));
  await deliver(env, now + 60000);
  await deliver(env, now + 60001);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT expense_id FROM telegram_messages").get()!
      .expense_id,
    e.id,
  );
});
test("category updates and crossed replies associate by message ID and deduplicate", async (t) => {
  const { env, sqlite } = setup(),
    a = await seed(env, "a"),
    b = await seed(env, "b", purchaseFixture);
  env.TELEGRAM_APP_URL = "https://tracker.example/";
  let next = 100;
  const sent: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: any) => {
    sent.push(JSON.parse(init.body));
    return tg(next++);
  });
  await deliver(env, now);
  const buttons = sqlite
    .prepare("SELECT * FROM telegram_messages ORDER BY message_id")
    .all();
  for (let i = 0; i < 2; i++) {
    const e = i ? a : b;
    const button = buttons.find((x) => x.expense_id === e.id)!;
    const u = {
      update_id: i + 1,
      callback_query: {
        id: "cb" + i,
        from: { id: 42 },
        data: `cat:${e.id}:${i}`,
        message: {
          message_id: Number(button.message_id),
          chat: { id: 42, type: "private" },
        },
      },
    };
    await handleUpdate(env, u, now);
    await handleUpdate(env, u, now);
  }
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='prompt'")
      .get()!.n,
    2,
  );
  await deliver(env, now);
  const prompts = sqlite
    .prepare("SELECT * FROM telegram_messages WHERE kind='prompt'")
    .all();
  for (const [i, e] of [b, a].entries()) {
    const prompt = prompts.find((x) => x.expense_id === e.id)!;
    const u = {
      update_id: 10 + i,
      message: {
        message_id: 900 + i,
        chat: { id: 42, type: "private" },
        from: { id: 42 },
        text: "Description " + e.source_message_id,
        reply_to_message: { message_id: Number(prompt.message_id) },
      },
    };
    await handleUpdate(env, u, now);
    await handleUpdate(env, u, now);
  }
  assert.equal(
    sqlite.prepare("SELECT description FROM expenses WHERE id=?").get(a.id)!
      .description,
    "Description a",
  );
  assert.equal(
    sqlite.prepare("SELECT description FROM expenses WHERE id=?").get(b.id)!
      .description,
    "Description b",
  );
  assert.equal(
    sqlite.prepare("SELECT version FROM expenses WHERE id=?").get(a.id)!
      .version,
    2,
  );
  await deliver(env, now);
  await deliver(env, now + 1);
  const confirmations = sent.filter((body) => body.text?.startsWith("✓ Saved"));
  assert.equal(
    confirmations.length,
    2,
    "Each saved description delivers one standalone receipt",
  );
  assert.ok(confirmations.every((body) => body.reply_parameters === undefined));
  assert.ok(
    confirmations.every(
      (body) =>
        [a.id, b.id].includes(
          new URL(
            body.reply_markup.inline_keyboard[0][0].web_app.url,
          ).searchParams.get("transaction")!,
        ) &&
        body.reply_markup.inline_keyboard[0][0].text === "View transaction",
    ),
  );
  assert.ok(confirmations.some((body) => body.text.includes("Description a")));
  assert.ok(confirmations.some((body) => body.text.includes("Description b")));
  assert.deepEqual(
    sent
      .filter((body) => body.message_id)
      .map((body) => body.message_id)
      .sort((a, b) => a - b),
    [...buttons, ...prompts]
      .map((m) => Number(m.message_id))
      .concat(900, 901)
      .sort((a, b) => a - b),
  );
  // A valid category payload on a different transaction's message must not change it.
  await handleUpdate(
    env,
    {
      update_id: 80,
      callback_query: {
        id: "wrong",
        from: { id: 42 },
        data: `cat:${a.id}:7`,
        message: {
          message_id: Number(
            buttons.find((x) => x.expense_id === b.id)!.message_id,
          ),
          chat: { id: 42, type: "private" },
        },
      },
    },
    now,
  );
  assert.equal(
    sqlite.prepare("SELECT version FROM expenses WHERE id=?").get(a.id)!
      .version,
    2,
  );
});
test("reminders run once per Tashkent date, skip empty days and expire stale sends", async (t) => {
  const summaryTime = now + 3600000;
  const { env, sqlite } = setup();
  await seed(env);
  await reminder(env, summaryTime - 3600000);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='reminder'")
      .get()!.n,
    0,
  );
  await reminder(env, summaryTime);
  await reminder(env, summaryTime + 300000);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='reminder'")
      .get()!.n,
    1,
  );
  const texts: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url, opts) => {
    texts.push(JSON.parse(String(opts!.body)).text);
    return tg(100 + texts.length);
  });
  await deliver(env, summaryTime);
  await deliver(env, summaryTime);
  assert.equal(texts.filter((x) => /still needs? details/.test(x)).length, 1);
  sqlite.exec("UPDATE expenses SET category='Food',description='Lunch'");
  await reminder(env, summaryTime + 86400000);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='reminder'")
      .get()!.n,
    1,
  );
});
test("API rejects unauthorized access, persists edits, resolves reviews and keeps currencies separate", async () => {
  const { env } = setup();
  assert.equal(
    (await api(request("/api/expenses", "GET", undefined, false), env)).status,
    401,
  );
  const e = await seed(env);
  await seed(env, "usd", fixture.replaceAll("UZS", "USD"));
  const review = await seed(env, "review", "unrecognized");
  assert.equal(
    (
      await api(
        request("/api/expenses/" + e.id, "PATCH", {
          version: 0,
          category: "Food",
          description: "Lunch",
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        request("/api/expenses/" + e.id, "PATCH", {
          version: 0,
          description: "stale",
        }),
        env,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        request("/api/expenses/" + e.id, "PATCH", {
          version: 1,
          category: "unknown",
        }),
        env,
      )
    ).status,
    400,
  );
  const list = (await (
    await api(request("/api/expenses?category=Food&q=lunch"), env)
  ).json()) as any;
  assert.equal(list.expenses.length, 1);
  const totals = (await (await api(request("/api/totals"), env)).json()) as any;
  assert.equal(totals.length, 2);
  assert(totals.every((x: any) => x.amount_minor === "3050000"));
  assert.equal(
    (
      await api(
        request("/api/expenses/" + review.id, "PATCH", {
          version: 0,
          resolve: {
            merchant: "Verified shop",
            card_suffix: "4321",
            currency: "UZS",
            amount: "10.00",
            local_time: "23.09.26 20:00",
          },
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (await api(request("/api/expenses?from=2026-02-31"), env)).status,
    400,
  );
  const exact = (await (
    await api(request("/api/expenses?from=2026-09-22&to=2026-09-22"), env)
  ).json()) as any;
  assert.equal(exact.expenses.length, 2);
});
test("public OAuth information leaves expense and control routes protected", async () => {
  const { env } = setup();
  const ctx = { waitUntil: () => {} } as ExecutionContext;
  for (const path of ["/about", "/privacy", "/terms"]) {
    const response = await worker.fetch(
      new Request("https://worker" + path),
      env,
      ctx,
    );
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Personal Expenses/);
    assert.equal(
      (
        await worker.fetch(
          new Request("https://worker" + path, { method: "POST" }),
          env,
          ctx,
        )
      ).status,
      405,
    );
  }
  for (const path of [
    "/api/expenses",
    "/api/health",
    "/constructor",
    "/about/../api/expenses",
  ]) {
    assert.equal(
      (await worker.fetch(new Request("https://worker" + path), env, ctx))
        .status,
      401,
    );
  }
  assert.equal(
    (
      await worker.fetch(
        new Request("https://worker/api/activate", { method: "POST" }),
        env,
        ctx,
      )
    ).status,
    401,
  );
});
test("webhook rejects missing secret, other owners and groups", async () => {
  const { env } = setup(),
    ctx = { waitUntil: () => {} } as ExecutionContext;
  assert.equal(
    (
      await worker.fetch(
        new Request("https://worker/telegram/webhook", { method: "POST" }),
        env,
        ctx,
      )
    ).status,
    401,
  );
  for (const [id, type] of [
    [43, "private"],
    [42, "group"],
  ] as const) {
    const r = new Request("https://worker/telegram/webhook", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: 1,
        message: {
          message_id: 1,
          from: { id },
          chat: { id, type },
          text: "hello",
        },
      }),
    });
    assert.equal((await worker.fetch(r, env, ctx)).status, 403);
  }
});
test("Gmail pagination catches up, activation excludes old mail, repeated polls deduplicate", async (t) => {
  const { env, sqlite } = setup();
  await api(request("/api/activate", "POST"), env, now - 10000);
  let second = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    const s = String(url);
    if (s.includes("oauth2")) return Response.json({ access_token: "access" });
    if (s.includes("/messages?")) {
      const p = new URL(s).searchParams;
      assert(p.get("q")!.includes("after:"));
      if (p.has("pageToken")) {
        second = true;
        return Response.json({ messages: [{ id: "b" }] });
      }
      return Response.json({
        messages: [{ id: "old" }, { id: "a" }],
        nextPageToken: "next",
      });
    }
    return Response.json(
      message(
        s.endsWith("/old?format=full") ? "old" : s.includes("/a?") ? "a" : "b",
        fixture,
        "text/plain",
        s.includes("/old?") ? now - 20000 : now - 1000,
      ),
    );
  });
  await pollGmail(env, now);
  assert.equal(
    sqlite.prepare("SELECT page_token FROM sync_state").get()!.page_token,
    "next",
  );
  await pollGmail(env, now + 300000);
  assert(second);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    2,
  );
  assert.equal(
    sqlite.prepare("SELECT last_success FROM sync_state").get()!.last_success,
    now + 300000,
  );
  await pollGmail(env, now + 600000);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    2,
  );
});
test("Gmail authorization failures alert once and do not advance the checkpoint", async (t) => {
  const { env, sqlite } = setup();
  await api(request("/api/activate", "POST"), env, now - 10000);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "invalid_grant" }, { status: 400 }),
  );
  await pollGmail(env, now);
  await pollGmail(env, now + 300000);
  assert.equal(
    sqlite.prepare("SELECT cursor_at FROM sync_state").get()!.cursor_at,
    now - 10000,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='auth'").get()!
      .n,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT error FROM sync_state").get()!.error,
    "gmail_authorization_required",
  );
});

test("database failures roll back both expense and notification intent", async () => {
  const { env, sqlite } = setup();
  sqlite.exec(
    "CREATE TRIGGER fail_notification BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
  );
  await assert.rejects(() => seed(env));
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    0,
  );
  sqlite.exec("DROP TRIGGER fail_notification");
  await seed(env);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox").get()!.n, 1);
});

test("Gmail retries a partially saved page without skipping or duplicating expenses", async (t) => {
  const { env, sqlite } = setup();
  await api(request("/api/activate", "POST"), env, now - 10000);
  let fail = true;
  t.mock.method(globalThis, "fetch", async (url) => {
    const s = String(url);
    if (s.includes("oauth2")) return Response.json({ access_token: "access" });
    if (s.includes("/messages?"))
      return Response.json({ messages: [{ id: "a" }, { id: "b" }] });
    if (s.includes("/b?") && fail)
      return Response.json({ error: {} }, { status: 503 });
    return Response.json(message(s.includes("/a?") ? "a" : "b"));
  });
  await pollGmail(env, now);
  assert.equal(
    sqlite.prepare("SELECT cursor_at FROM sync_state").get()!.cursor_at,
    now - 10000,
  );
  fail = false;
  await pollGmail(env, now + 300000);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    2,
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox").get()!.n, 2);
  assert.equal(
    sqlite.prepare("SELECT error FROM sync_state").get()!.error,
    null,
  );
});

test("concurrent notification drains claim a send only once and obey retry_after", async (t) => {
  const { env, sqlite } = setup();
  await seed(env);
  let sends = 0;
  t.mock.method(globalThis, "fetch", async () => {
    sends++;
    return Response.json(
      { ok: false, parameters: { retry_after: 600 } },
      { status: 429 },
    );
  });
  await Promise.all([deliver(env, now), deliver(env, now)]);
  assert.equal(sends, 1);
  assert(
    Number(
      sqlite.prepare("SELECT available_at FROM outbox").get()!.available_at,
    ) >=
      now + 600000,
  );
  await deliver(env, now + 300000);
  assert.equal(sends, 1);
});

test("aggregate money remains exact above the JavaScript safe integer limit", async () => {
  const { env } = setup();
  await seed(
    env,
    "large-a",
    fixture.replaceAll("30500.00", "90071992547409.90"),
  );
  await seed(
    env,
    "large-b",
    fixture.replaceAll("30500.00", "90071992547409.90"),
  );
  const totals = (await (await api(request("/api/totals"), env)).json()) as any;
  assert.equal(totals[0].amount_minor, "18014398509481980");
});

test("stale and no-longer-needed reminders do not send", async (t) => {
  const summaryTime = now + 3600000;
  const { env, sqlite } = setup();
  await seed(env);
  await reminder(env, summaryTime);
  sqlite.exec("UPDATE outbox SET sent_at=1 WHERE kind='expense'");
  let sends = 0;
  t.mock.method(globalThis, "fetch", async () => {
    sends++;
    return tg(1);
  });
  await deliver(env, summaryTime + 86400000);
  assert.equal(sends, 0);
  await reminder(env, summaryTime + 86400000);
  sqlite.exec("UPDATE expenses SET category='Other',description='Finished'");
  await deliver(env, summaryTime + 86400000);
  assert.equal(sends, 0);
});

test("Platezh transfers deduplicate and retry their category notification", async (t) => {
  const { env, sqlite } = setup();
  const body = fixture.replaceAll("E-Com oplata", "Platezh");
  const expense = await seed(env, "transfer", body);
  await seed(env, "transfer", body);
  assert.equal(expense.review_reason, null);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    1,
  );
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("temporary failure");
  });
  await deliver(env, now);
  t.mock.restoreAll();
  let sent = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    sent++;
    const payload = JSON.parse(String(options?.body));
    assert(
      payload.reply_markup.inline_keyboard
        .flat()
        .every((b: any) => b.callback_data.startsWith(`cat:${expense.id}:`)),
    );
    return tg(501);
  });
  await deliver(env, now + 60000);
  await seed(env, "transfer", body);
  await deliver(env, now + 120000);
  assert.equal(sent, 1);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    1,
  );
  assert.equal(
    sqlite
      .prepare("SELECT expense_id FROM telegram_messages WHERE message_id=501")
      .get()!.expense_id,
    expense.id,
  );
});

test("income stays separate from spending with exact net totals and filters", async () => {
  const { env } = setup();
  await seed(env, "out");
  const incoming = await seed(
    env,
    "in",
    fixture
      .replaceAll("E-Com oplata", "Perevod na kartu")
      .replaceAll("30500.00", "10000.00"),
  );
  const totals: any = await (await api(request("/api/totals"), env)).json();
  assert.deepEqual(totals, [
    {
      currency: "UZS",
      amount_minor: "3050000",
      income_minor: "1000000",
      net_minor: "-2050000",
    },
  ]);
  for (const income_category of ["Salary", "Reimbursement", "Other income"]) {
    const current: any = await sql(
      env,
      "SELECT version FROM expenses WHERE id=?",
      incoming.id,
    ).first();
    const response = await api(
      request(`/api/expenses/${incoming.id}`, "PATCH", {
        version: current.version,
        income_category,
        description: "Synthetic income",
      }),
      env,
    );
    assert.equal(response.status, 200);
  }
  const list: any = await (
    await api(request("/api/expenses?direction=income"), env)
  ).json();
  assert.equal(list.expenses.length, 1);
  assert.equal(list.expenses[0].income_category, "Other income");
  const missing: any = await (
    await api(request("/api/expenses?direction=income&needsDetails=true"), env)
  ).json();
  assert.equal(missing.expenses.length, 0);
  assert.equal(
    (await api(request("/api/expenses?direction=bad"), env)).status,
    400,
  );
  assert.equal(
    (
      await api(
        request(`/api/expenses/${incoming.id}`, "PATCH", {
          version: 3,
          category: "Food",
        }),
        env,
      )
    ).status,
    400,
  );
  const filtered: any = await (
    await api(
      request("/api/totals?direction=income&category=Other%20income"),
      env,
    )
  ).json();
  assert.equal(filtered[0].amount_minor, "0");
  assert.equal(filtered[0].net_minor, "1000000");
});

test("income retry, duplicate updates and crossed replies preserve associations", async (t) => {
  const { env, sqlite } = setup();
  const body = fixture.replaceAll("E-Com oplata", "Perevod na kartu");
  const a = await seed(env, "salary-one", body),
    b = await seed(env, "salary-two", body);
  await seed(env, "salary-one", body);
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("temporary");
  });
  await deliver(env, now);
  t.mock.restoreAll();
  let next = 600;
  const menus: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    if (payload.reply_markup?.inline_keyboard)
      menus.push(payload.reply_markup.inline_keyboard.flat());
    return tg(next++);
  });
  await deliver(env, now + 60000);
  assert.equal(menus.length, 2);
  assert.deepEqual(
    menus[0].map((x) => x.text),
    ["Salary", "Reimbursement", "Other income"],
  );
  const buttons = sqlite
    .prepare("SELECT * FROM telegram_messages WHERE kind='expense'")
    .all();
  for (const [i, item] of [b, a].entries()) {
    const menu = buttons.find((x) => x.expense_id === item.id)!;
    const update = {
      update_id: 200 + i,
      callback_query: {
        id: "income-" + i,
        from: { id: 42 },
        data: `inc:${item.id}:${i}`,
        message: {
          message_id: Number(menu.message_id),
          chat: { id: 42, type: "private" },
        },
      },
    };
    await handleUpdate(env, update, now + 60000);
    await handleUpdate(env, update, now + 60000);
  }
  await deliver(env, now + 60000);
  const prompts = sqlite
    .prepare("SELECT * FROM telegram_messages WHERE kind='prompt'")
    .all();
  for (const [i, item] of [a, b].entries()) {
    const prompt = prompts.find((x) => x.expense_id === item.id)!;
    const update = {
      update_id: 300 + i,
      message: {
        message_id: 800 + i,
        from: { id: 42 },
        chat: { id: 42, type: "private" },
        text: `Income ${item.source_message_id}`,
        reply_to_message: { message_id: Number(prompt.message_id) },
      },
    };
    await handleUpdate(env, update, now);
    await handleUpdate(env, update, now);
  }
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    2,
  );
  assert.equal(
    sqlite.prepare("SELECT description FROM expenses WHERE id=?").get(a.id)!
      .description,
    "Income salary-one",
  );
  assert.equal(
    sqlite.prepare("SELECT income_category FROM expenses WHERE id=?").get(a.id)!
      .income_category,
    "Reimbursement",
  );
  await reminder(env, now + 3600000);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='reminder'")
      .get()!.n,
    0,
  );
  await sql(env, "UPDATE expenses SET description='' WHERE id=?", a.id).run();
  await reminder(env, now + 3600000);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='reminder'")
      .get()!.n,
    1,
  );
});

test("review resolution records income direction without duplicating the source", async () => {
  const { env, sqlite } = setup();
  const review = await seed(env, "incoming-review", "unknown");
  const response = await api(
    request(`/api/expenses/${review.id}`, "PATCH", {
      version: 0,
      income_category: "Reimbursement",
      description: "Shared bill repayment",
      resolve: {
        direction: "income",
        merchant: "SAMPLE SENDER",
        amount: "0.29",
        currency: "UZS",
        local_time: "23.09.26 19:44",
        card_suffix: "1234",
      },
    }),
    env,
  );
  assert.equal(response.status, 200);
  const item: any = await response.json();
  assert.equal(item.direction, "income");
  assert.equal(item.category, null);
  assert.equal(item.income_category, "Reimbursement");
  await seed(
    env,
    "incoming-review",
    fixture.replaceAll("E-Com oplata", "Perevod na kartu"),
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n,
    1,
  );
  const totals: any = await (await api(request("/api/totals"), env)).json();
  assert.equal(totals[0].net_minor, "29");
});

test("description cleanup retries independently and ignores invalid replies", async (t) => {
  const { env, sqlite } = setup();
  const e = await seed(env);
  sqlite.exec(
    "UPDATE outbox SET sent_at=1; UPDATE expenses SET category='Food'",
  );
  await sql(
    env,
    "INSERT INTO telegram_messages (message_id,expense_id,kind) VALUES (100,?,'prompt')",
    e.id,
  ).run();
  const update = {
    update_id: 1000,
    message: {
      message_id: 200,
      chat: { id: 42, type: "private" },
      from: { id: 42 },
      text: "Lunch",
      reply_to_message: { message_id: 100 },
    },
  };
  for (const [index, change] of [
    { text: " " },
    { text: "x".repeat(501) },
    { reply_to_message: { message_id: 999 } },
    { from: { id: 99 } },
  ].entries()) {
    await handleUpdate(
      env,
      { update_id: 2000 + index, message: { ...update.message, ...change } },
      now,
    );
  }
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='receipt'")
      .get()!.n,
    0,
  );
  await handleUpdate(env, update, now);
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("offline");
  });
  await deliver(env, now);
  assert.equal(
    sqlite.prepare("SELECT description FROM expenses").get()!.description,
    "Lunch",
  );
  assert.equal(
    sqlite.prepare("SELECT attempts FROM outbox WHERE kind='receipt'").get()!
      .attempts,
    1,
  );
  await handleUpdate(env, update, now + 1);
  assert.equal(
    sqlite.prepare("SELECT version FROM expenses").get()!.version,
    1,
  );
  t.mock.restoreAll();
  const sent: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: any) => {
    sent.push(JSON.parse(init.body));
    return tg(300);
  });
  await deliver(env, now + 60000);
  await deliver(env, now + 60001);
  assert.equal(sent.filter((body) => body.text).length, 1);
  assert.deepEqual(sent[0].reply_markup, { remove_keyboard: true });
  assert.equal(sent[0].reply_parameters, undefined);
  assert.match(sent[0].text, /Food · Lunch/);
  assert.deepEqual(
    sent
      .filter((body) => body.message_id)
      .map((body) => body.message_id)
      .sort(),
    [100, 200],
  );
});

test("month insights bucket spending by Tashkent day and category, exactly", async () => {
  const { env } = setup();
  const at = (
    id: string,
    time: string,
    amount: string,
    operation = "E-Com oplata",
  ) =>
    seed(
      env,
      id,
      fixture
        .replaceAll("22.09.26 19:44", time)
        .replaceAll("30500.00", amount)
        .replaceAll("E-Com oplata", operation),
    );
  // 00:30 Tashkent on 24 September is still 23 September in UTC.
  const late = await at("late", "24.09.26 00:30", "90071992547409.90");
  await at("same-day", "24.09.26 21:00", "0.07");
  await at("early", "01.09.26 00:05", "10.00");
  // 00:10 on 1 October in Tashkent is 30 September in UTC; it belongs to October.
  await at("october", "01.10.26 00:10", "500.00");
  await at("salary", "25.09.26 10:00", "1000.00", "Perevod na kartu");
  await seed(env, "review", "Unsupported synthetic message");
  const dismissed = await at("dismissed", "26.09.26 12:00", "1.00");
  await sql(
    env,
    "UPDATE expenses SET review_reason='unsupported',dismissed=1 WHERE id=?",
    dismissed.id,
  ).run();
  await sql(
    env,
    "UPDATE expenses SET category='Food' WHERE id=?",
    late.id,
  ).run();
  const september: any = await (
    await api(request("/api/insights?month=2026-09"), env)
  ).json();
  assert.equal(september.month, "2026-09");
  assert.deepEqual(september.currencies, [
    {
      currency: "UZS",
      spending_minor: "9007199254741997",
      income_minor: "100000",
      net_minor: "-9007199254641997",
      days: [
        { date: "2026-09-01", spending_minor: "1000", count: 1 },
        { date: "2026-09-24", spending_minor: "9007199254740997", count: 2 },
      ],
      categories: [
        { category: "Food", spending_minor: "9007199254740990", count: 1 },
        { category: null, spending_minor: "1007", count: 2 },
      ],
    },
  ]);
  const october: any = await (
    await api(request("/api/insights?month=2026-10"), env)
  ).json();
  assert.equal(october.currencies[0].days[0].date, "2026-10-01");
  assert.equal(october.currencies[0].spending_minor, "50000");
  const empty: any = await (
    await api(request("/api/insights?month=2026-08"), env)
  ).json();
  assert.deepEqual(empty.currencies, []);
  for (const month of ["2026-13", "2026-9", "1999-01", "2026-09-01"])
    assert.equal(
      (await api(request("/api/insights?month=" + month), env)).status,
      400,
    );
  assert.equal(
    (await api(request("/api/insights", "GET", undefined, false), env)).status,
    401,
  );
});
