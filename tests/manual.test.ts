import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setup, request, now, message, purchaseFixture } from "./helpers";
import { api } from "../backend/src/api";
import { saveMessage } from "../backend/src/store";
import { parseEmail } from "../backend/src/parser";
import { reminder } from "../backend/src/telegram";
import site from "../website/worker/index.js";
const details = () => ({
  id: crypto.randomUUID(),
  direction: "expense",
  merchant: "SYNTHETIC CAFE",
  amount: "12.3",
  currency: "UZS",
  local_time: "22.09.26 00:15",
  category: "Food",
  description: "Cash lunch",
  card_suffix: "",
});

test("manual creation survives lost-response retries without notifications and uses exact money/time", async () => {
  const { env, sqlite } = setup();
  const body = details();
  const first = await api(request("/api/expenses", "POST", body), env, now);
  assert.equal(first.status, 201);
  const saved = (await first.json()) as any;
  assert.equal(saved.amount_minor, 1230);
  assert.equal(saved.occurred_at, "2026-09-21T19:15:00.000Z");
  assert.equal(saved.card_suffix, null);
  assert.equal(saved.source_message_id, null);
  assert.equal(saved.source, "manual");
  const retries = await Promise.all(
    [1, 2].map(() => api(request("/api/expenses", "POST", body), env, now)),
  );
  assert.deepEqual(
    retries.map((r) => r.status),
    [200, 200],
  );
  assert.equal(
    (
      await api(
        request("/api/expenses", "POST", { ...body, amount: "13" }),
        env,
        now,
      )
    ).status,
    409,
  );
  assert.equal(sqlite.prepare("SELECT count(*) n FROM expenses").get()!.n, 1);
  await reminder(env, Date.parse("2026-09-23T15:00:00Z"));
  assert.equal(sqlite.prepare("SELECT count(*) n FROM outbox").get()!.n, 0);
  const pending = (await (
    await api(request("/api/expenses?needsDetails=true"), env, now)
  ).json()) as any;
  assert.equal(pending.expenses.length, 0);
});

test("manual validation rejects invalid input and unauthorized requests without writes", async () => {
  const { env, sqlite } = setup();
  for (const patch of [
    { amount: "0" },
    { amount: "-1" },
    { amount: "0.001" },
    { amount: "1e3" },
    { amount: "90071992547409.92" },
    { local_time: "31.02.26 00:00" },
    { local_time: "24.09.26 00:00" },
    { category: "Salary" },
    { category: null },
    { description: "  " },
    { merchant: "" },
    { card_suffix: "123" },
    { card_suffix: 1234 },
    { currency: "XXX" },
    { direction: "other" },
    { id: "invalid" },
  ])
    assert.equal(
      (
        await api(
          request("/api/expenses", "POST", { ...details(), ...patch }),
          env,
          now,
        )
      ).status,
      400,
      JSON.stringify(patch),
    );
  for (const body of [null, [], "test"])
    assert.equal(
      (await api(request("/api/expenses", "POST", body), env, now)).status,
      400,
    );
  assert.equal(
    (await api(request("/api/expenses", "POST", details(), false), env, now))
      .status,
    401,
  );
  assert.equal(sqlite.prepare("SELECT count(*) n FROM expenses").get()!.n, 0);
});

test("manual income, backdating, totals and full-field edits preserve conflicts and original retry identity", async () => {
  const { env } = setup();
  await api(request("/api/activate", "POST"), env, now);
  const expense = { ...details(), amount: "90071992547409.91" };
  assert.equal(
    (await api(request("/api/expenses", "POST", expense), env, now)).status,
    201,
  );
  const income = {
    ...details(),
    direction: "income",
    income_category: "Salary",
    amount: "100",
    card_suffix: "1234",
  };
  assert.equal(
    (await api(request("/api/expenses", "POST", income), env, now)).status,
    201,
  );
  const totals = (await (
    await api(request("/api/totals"), env, now)
  ).json()) as any;
  assert.equal(totals[0].amount_minor, "9007199254740991");
  assert.equal(totals[0].income_minor, "10000");
  const month = (await (
    await api(request("/api/insights?month=2026-09"), env, now)
  ).json()) as any;
  assert.equal(month.currencies[0].days[0].date, "2026-09-22");
  const update = {
    ...expense,
    direction: "income",
    income_category: "Reimbursement",
    amount: "5",
    version: 0,
  };
  assert.equal(
    (
      await api(
        request("/api/expenses/" + expense.id, "PATCH", update),
        env,
        now,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        request("/api/expenses/" + expense.id, "PATCH", update),
        env,
        now,
      )
    ).status,
    409,
  );
  const retry = await api(request("/api/expenses", "POST", expense), env, now);
  assert.equal(retry.status, 200);
  const saved = (await retry.json()) as any;
  assert.equal(saved.amount_minor, 500);
  assert.equal(saved.category, null);
  assert.equal(saved.income_category, "Reimbursement");
});

test("manual migration preserves email rows, outbox, reply links, deduplication and activation", async () => {
  const { env, sqlite } = setup(false);
  const m = message("preserved", purchaseFixture);
  await saveMessage(env, m, parseEmail(m), now);
  const before = sqlite.prepare("SELECT * FROM expenses").get()!;
  sqlite
    .prepare(
      "INSERT INTO telegram_messages(message_id,expense_id,kind) VALUES (1,?,'description')",
    )
    .run(before.id);
  await api(request("/api/activate", "POST"), env, now);
  const migration = readFileSync(
    new URL(
      "../backend/migrations/0004_manual_transactions.sql",
      import.meta.url,
    ),
    "utf8",
  );
  sqlite.exec("BEGIN");
  sqlite.exec(migration);
  assert.throws(() => sqlite.exec("INSERT INTO missing_table VALUES (1)"));
  sqlite.exec("ROLLBACK");
  assert.deepEqual(sqlite.prepare("SELECT * FROM expenses").get(), before);
  assert.equal(
    sqlite.prepare("SELECT expense_id FROM telegram_messages").get()!
      .expense_id,
    before.id,
  );
  sqlite.exec("BEGIN");
  sqlite.exec(migration);
  sqlite.exec("COMMIT");
  const after = sqlite.prepare("SELECT * FROM expenses").get()!;
  for (const [key, value] of Object.entries(before))
    assert.equal(after[key], value, key);
  assert.equal(after.source, "email");
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    sqlite.prepare("SELECT expense_id FROM telegram_messages").get()!
      .expense_id,
    before.id,
  );
  await saveMessage(env, m, parseEmail(m), now);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM expenses").get()!.n, 1);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM outbox").get()!.n, 1);
  assert.equal(
    sqlite.prepare("SELECT activated_at FROM sync_state").get()!.activated_at,
    now,
  );
});

test("manual proxy forwards anonymous same-origin creates and rejects unsafe writes", async (t) => {
  const { env } = setup();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    return api(new Request(String(url), options), env, now);
  });
  const frontendEnv = {
    BACKEND_URL: "https://backend.example",
    BACKEND_TOKEN: env.BACKEND_TOKEN,
  };
  const body = details();
  const send = (
    headers: Record<string, string>,
    payload = JSON.stringify(body),
  ) =>
    site.fetch(
      new Request("https://site.example/api/expenses", {
        method: "POST",
        headers,
        body: payload,
      }),
      frontendEnv,
    );
  const headers = {
    Origin: "https://site.example",
    "Content-Type": "application/json",
  };
  assert.equal((await send(headers)).status, 201);
  assert.equal((await send(headers)).status, 200);
  assert.equal(
    (await send({ ...headers, Origin: "https://evil.example" })).status,
    403,
  );
  assert.equal(
    (await send({ "Content-Type": "application/json" })).status,
    403,
  );
  assert.equal(
    (await send({ ...headers, "Content-Type": "text/plain" })).status,
    403,
  );
  assert.equal((await send(headers, "я".repeat(4001))).status, 413);
  assert.equal(calls, 2);
});

test("failed manual persistence can be retried without partial rows or notifications", async () => {
  const { env, sqlite } = setup();
  const body = details();
  sqlite.exec(
    "CREATE TRIGGER fail_manual BEFORE INSERT ON expenses WHEN NEW.source='manual' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
  );
  await assert.rejects(api(request("/api/expenses", "POST", body), env, now));
  assert.equal(sqlite.prepare("SELECT count(*) n FROM expenses").get()!.n, 0);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM outbox").get()!.n, 0);
  sqlite.exec("DROP TRIGGER fail_manual");
  assert.equal(
    (await api(request("/api/expenses", "POST", body), env, now)).status,
    201,
  );
  assert.equal(
    (await api(request("/api/expenses", "POST", body), env, now)).status,
    200,
  );
});
