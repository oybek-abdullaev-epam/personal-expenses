import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { deliver, reminder } from "../backend/src/telegram";

const evening = Date.parse("2026-09-30T16:00:00Z"); // 21:00 Asia/Tashkent.
type Database = ReturnType<typeof setup>["sqlite"];
function transaction(
  db: Database,
  id: string,
  overrides: Record<string, unknown> = {},
) {
  const row = {
    id,
    source_message_id: id,
    received_at: evening,
    occurred_at: "2026-09-30T07:00:00.000Z",
    merchant: "Synthetic shop",
    card_suffix: "1234",
    amount_minor: 12500,
    currency: "UZS",
    category: "Food",
    description: "Synthetic lunch",
    direction: "expense",
    ...overrides,
  };
  db.prepare(
    `INSERT INTO expenses (${Object.keys(row).join(",")}) VALUES (${Object.keys(
      row,
    )
      .map(() => "?")
      .join(",")})`,
  ).run(...(Object.values(row) as (string | number | null)[]));
}
function success() {
  return Response.json({ ok: true, result: { message_id: 100 } });
}

test("daily summary schedules at 21:00 once, including complete spending; empty days skip", async (t) => {
  const { env, sqlite } = setup();
  await reminder(env, evening);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox").get()!.n, 0);
  transaction(sqlite, "complete");
  await reminder(env, evening - 3600000);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox").get()!.n, 0);
  await reminder(env, evening);
  await reminder(env, evening + 300000);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox").get()!.n, 1);
  const texts: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    texts.push(JSON.parse(String(options!.body)).text);
    return success();
  });
  await deliver(env, evening);
  await deliver(env, evening + 300000);
  assert.deepEqual(texts, [
    "Today’s spending so far · 30 September\n125.00 UZS · 1 expense\n\nOpen dashboard: https://expenses.example",
  ]);
  await reminder(env, evening + 86400000);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox").get()!.n, 1);
});

test("daily totals respect Tashkent boundaries, sources, missing details, exclusions and currencies", async (t) => {
  const { env, sqlite } = setup();
  transaction(sqlite, "before-midnight", {
    occurred_at: "2026-09-29T18:59:59.999Z",
  });
  transaction(sqlite, "midnight", {
    occurred_at: "2026-09-29T19:00:00.000Z",
    category: null,
    description: "",
  });
  transaction(sqlite, "manual", {
    source: "manual",
    source_message_id: null,
    manual_request: "{}",
    amount_minor: 25000,
  });
  transaction(sqlite, "usd", { currency: "USD", amount_minor: 123 });
  transaction(sqlite, "at-delivery", {
    occurred_at: new Date(evening).toISOString(),
    amount_minor: 1,
  });
  transaction(sqlite, "future", {
    occurred_at: new Date(evening + 1).toISOString(),
  });
  transaction(sqlite, "income", {
    direction: "income",
    category: null,
    income_category: "Salary",
  });
  transaction(sqlite, "dismissed", { dismissed: 1, description: "" });
  transaction(sqlite, "review", { review_reason: "unsupported_operation" });
  const texts: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    texts.push(JSON.parse(String(options!.body)).text);
    return success();
  });
  await reminder(env, evening);
  await deliver(env, evening);
  assert.equal(texts.length, 1);
  assert.match(texts[0], /1\.23 USD · 1 expense/);
  assert.match(texts[0], /375\.01 UZS · 3 expenses/);
  assert.match(texts[0], /2 transactions still need details/);
});

test("older unfinished income and review items trigger no-spending summary; edits can suppress delivery", async (t) => {
  const { env, sqlite } = setup();
  transaction(sqlite, "old-income", {
    occurred_at: "2026-09-28T07:00:00.000Z",
    direction: "income",
    category: null,
    income_category: "Salary",
    description: "",
  });
  transaction(sqlite, "old-review", {
    occurred_at: null,
    amount_minor: null,
    currency: null,
    review_reason: "invalid_format",
  });
  const texts: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    texts.push(JSON.parse(String(options!.body)).text);
    return success();
  });
  await reminder(env, evening);
  await deliver(env, evening);
  assert.match(texts[0], /No spending recorded today/);
  assert.match(texts[0], /2 transactions still need details/);
  await reminder(env, evening + 86400000);
  sqlite.exec(
    "UPDATE expenses SET description='Done' WHERE id='old-income'; UPDATE expenses SET dismissed=1 WHERE id='old-review'",
  );
  await deliver(env, evening + 86400000);
  assert.equal(texts.length, 1);
});

test("summary retries claim once, obey retry_after, refresh edits and expire after local midnight", async (t) => {
  const { env, sqlite } = setup();
  transaction(sqlite, "expense", { description: "" });
  await reminder(env, evening);
  const texts: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    texts.push(JSON.parse(String(options!.body)).text);
    return texts.length === 1
      ? Response.json(
          { ok: false, parameters: { retry_after: 600 } },
          { status: 429 },
        )
      : success();
  });
  await Promise.all([deliver(env, evening), deliver(env, evening)]);
  assert.equal(texts.length, 1);
  assert.match(texts[0], /1 transaction still needs details/);
  await deliver(env, evening + 300000);
  assert.equal(texts.length, 1);
  sqlite.exec("UPDATE expenses SET amount_minor=77700,description='Done'");
  await deliver(env, evening + 600000);
  assert.equal(texts.length, 2);
  assert.match(texts[1], /777\.00 UZS/);
  assert.doesNotMatch(texts[1], /need.*details/);
  transaction(sqlite, "next-day", { occurred_at: "2026-10-01T07:00:00.000Z" });
  await reminder(env, evening + 86400000);
  await deliver(env, Date.parse("2026-10-01T19:00:00Z")); // Next local midnight.
  assert.equal(texts.length, 2);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NULL")
      .get()!.n,
    0,
  );
});

test("summary totals remain exact above safe integers and across query pages", async (t) => {
  const { env, sqlite } = setup();
  for (let i = 0; i < 1001; i++)
    transaction(sqlite, `large-${String(i).padStart(4, "0")}`, {
      amount_minor: 9007199254740990,
    });
  let text = "";
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    text = JSON.parse(String(options!.body)).text;
    return success();
  });
  await reminder(env, evening);
  await deliver(env, evening);
  assert.match(text, /90,162,064,539,957,309\.90 UZS · 1001 expenses/);
});
