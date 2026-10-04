import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, request } from "./helpers";
import { financialRead, projectExpenses } from "../backend/src/reporting";
import { getExpense } from "../backend/src/store";
import site from "../website/worker/index.js";

function fixture() {
  const state = setup();
  function add(
    options: {
      id?: string;
      amount?: number;
      at?: string;
      currency?: string;
      direction?: "expense" | "income";
      category?: string | null;
      payer?: string;
      parent?: string | null;
      description?: string;
      merchant?: string;
      review?: string | null;
      dismissed?: number;
    } = {},
  ) {
    const id = options.id ?? crypto.randomUUID();
    const direction = options.direction ?? "expense";
    state.sqlite
      .prepare(
        `INSERT INTO expenses
      (id,source_message_id,received_at,occurred_at,merchant,card_suffix,amount_minor,currency,direction,category,income_category,description,payer_name,reimbursement_expense_id,review_reason,dismissed)
      VALUES (?,?,0,?,?,'1234',?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        id,
        options.at ?? "2026-09-20T14:00:00.000Z",
        options.merchant ?? "Synthetic dinner",
        options.amount ?? 30000000,
        options.currency ?? "UZS",
        direction,
        direction === "expense"
          ? options.category === undefined
            ? "Food"
            : options.category
          : null,
        direction === "income"
          ? options.category === undefined
            ? "Reimbursement"
            : options.category
          : null,
        options.description ?? "Synthetic details",
        options.payer ?? "",
        options.parent ?? null,
        options.review ?? null,
        options.dismissed ?? 0,
      );
    return id;
  }
  async function read(path: string) {
    const response = await financialRead(request(path), state.env);
    assert(response, path);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<any>;
  }
  return { ...state, add, read };
}

test("dinner sequence and shared projection preserve originals and exact pending/spending", async () => {
  const { add, read, env, sqlite } = fixture();
  const dinner = add();
  assert.deepEqual((await read("/api/totals"))[0], {
    currency: "UZS",
    amount_minor: "30000000",
    income_minor: "0",
    net_minor: "-30000000",
    pending_reimbursement_minor: "0",
  });
  const ali = add({
    direction: "income",
    amount: 10000000,
    description: "",
    at: "2026-10-01T14:00:00.000Z",
  });
  assert.equal(
    (await read("/api/totals"))[0].pending_reimbursement_minor,
    "10000000",
  );
  assert.equal((await read("/api/totals"))[0].income_minor, "0");
  sqlite
    .prepare(
      "UPDATE expenses SET payer_name='Ali',reimbursement_expense_id=?,version=version+1 WHERE id=?",
    )
    .run(dinner, ali);
  assert.equal((await read("/api/totals"))[0].amount_minor, "20000000");
  add({
    direction: "income",
    amount: 10000000,
    payer: "Sara",
    parent: dinner,
    at: "2026-10-02T14:00:00.000Z",
  });
  const totals = (await read("/api/totals"))[0];
  assert.equal(totals.amount_minor, "10000000");
  assert.equal(totals.pending_reimbursement_minor, "0");
  const list = await read("/api/expenses");
  assert.equal(list.expenses.length, 1);
  assert.equal(list.expenses[0].amount_minor, 30000000);
  assert.equal(list.expenses[0].personal_spending_minor, "10000000");
  assert.equal(list.expenses[0].reimbursed_minor, "20000000");
  const linked = await read(`/api/expenses/${ali}`);
  assert.equal(linked.reimbursement_expense.id, dinner);
  assert.equal(
    linked.reimbursement_expense.personal_spending_minor,
    "10000000",
  );
  assert.equal(
    linked.parent_versions[dinner],
    linked.reimbursement_expense.version,
  );
  const projected = await projectExpenses(env, [
    (await getExpense(env, dinner))!,
  ]);
  assert.equal(projected[0].personal_spending_minor, totals.amount_minor);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM outbox").get()!.n, 0);
});

test("cross-period and filter matrix projects full relationships before selecting parents", async () => {
  const { add, read } = fixture();
  const dinner = add();
  add({
    direction: "income",
    amount: 30000000,
    payer: "Ali",
    parent: dinner,
    at: "2026-10-01T14:00:00.000Z",
  });
  add({
    direction: "income",
    amount: 123,
    at: "2026-10-02T14:00:00.000Z",
    description: "old note",
  });
  add({
    direction: "income",
    category: "Salary",
    amount: 1000,
    at: "2026-10-02T14:00:00.000Z",
  });
  for (const suffix of [
    "",
    "?direction=expense",
    "?category=Food",
    "?q=dinner",
    "?from=2026-09-01&to=2026-09-30",
  ]) {
    const result = await read(`/api/totals${suffix}`);
    assert.equal(result[0].amount_minor, "0", suffix);
  }
  const sep = (await read("/api/insights?month=2026-09")).currencies[0];
  assert.equal(sep.spending_minor, "0");
  assert.deepEqual(sep.days, [
    { date: "2026-09-20", spending_minor: "0", count: 1 },
  ]);
  assert.deepEqual(sep.categories, [
    { category: "Food", spending_minor: "0", count: 1 },
  ]);
  const oct = (await read("/api/insights?month=2026-10")).currencies[0];
  assert.equal(oct.income_minor, "1000");
  assert.equal(oct.pending_reimbursement_minor, "123");
  assert.equal(oct.spending_minor, "0");
  assert.equal(
    (await read("/api/expenses?direction=income")).expenses.length,
    1,
  );
  assert.equal(
    (await read("/api/expenses?category=Reimbursement&direction=expense"))
      .expenses.length,
    2,
  );
  assert.equal(
    (await read("/api/expenses?category=Reimbursement&q=Ali")).expenses.length,
    1,
  );
  assert.equal(
    (await read("/api/expenses?needsDetails=true")).expenses.length,
    1,
  );
  assert.equal(
    (await read("/api/expenses?category=Reimbursement&needsDetails=true"))
      .expenses.length,
    1,
  );
  assert.equal(
    (await read("/api/expenses?category=Reimbursement&to=2026-09-30")).expenses
      .length,
    0,
  );
  const inspected = (await read("/api/totals?category=Reimbursement"))[0];
  assert.equal(inspected.amount_minor, "0");
  assert.equal(inspected.income_minor, "0");
  assert.equal(inspected.pending_reimbursement_minor, "123");
});

test("candidate paging searches independently, excludes invalid targets, and credits current allocation", async () => {
  const { add, read, sqlite, env } = fixture();
  const current = add({ amount: 500, description: "Only 100% current" });
  const repayment = add({
    amount: 500,
    direction: "income",
    payer: "Ali",
    parent: current,
    at: "2026-10-03T14:00:00.000Z",
  });
  const other = add({
    amount: 1000,
    description: "Older special",
    at: "2026-08-01T14:00:00.000Z",
    category: null,
  });
  add({ amount: 499 });
  add({ currency: "USD" });
  add({ at: "2026-10-04T14:00:00.000Z" });
  add({ review: "Unknown" });
  add({ dismissed: 1 });
  for (let i = 0; i < 55; i++) add({ amount: 500 });
  const before = sqlite
    .prepare("SELECT SUM(version) version FROM expenses")
    .get()!.version;
  const first = await read(
    `/api/expenses/${repayment}/reimbursement-candidates`,
  );
  assert.equal(first.expenses.length, 50);
  assert(first.nextCursor);
  const second = await read(
    `/api/expenses/${repayment}/reimbursement-candidates?cursor=${first.nextCursor}`,
  );
  assert.equal(second.expenses.length, 7);
  assert.equal(second.nextCursor, null);
  const all = [...first.expenses, ...second.expenses];
  assert.equal(new Set(all.map((e) => e.id)).size, 57);
  assert.equal(all.find((e) => e.id === current).available_minor, "500");
  assert(all.some((e) => e.id === other));
  const search = await read(
    `/api/expenses/${repayment}/reimbursement-candidates?q=100%25`,
  );
  assert.equal(search.expenses.length, 1);
  assert.equal(search.expenses[0].id, current);
  const older = await read(
    `/api/expenses/${repayment}/reimbursement-candidates?q=Older&from=2026-10-01&direction=income`,
  );
  assert.equal(older.expenses.length, 1);
  assert.equal(older.expenses[0].id, other);
  assert.equal(
    sqlite.prepare("SELECT SUM(version) version FROM expenses").get()!.version,
    before,
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM outbox").get()!.n, 0);
  for (const value of ["", "invalid", "e30", "A".repeat(201)]) {
    assert.equal(
      (await financialRead(
        request(
          `/api/expenses/${repayment}/reimbursement-candidates?cursor=${value}`,
        ),
        env,
      ))!.status,
      400,
    );
  }
});

test("bounded parent repayment pages, exact multi-currency aggregates and invalid reads", async () => {
  const { add, read, env } = fixture();
  const parent = add({ amount: Number.MAX_SAFE_INTEGER });
  add({ amount: Number.MAX_SAFE_INTEGER });
  add({ amount: 500, currency: "USD" });
  for (let i = 0; i < 53; i++)
    add({ amount: 1, direction: "income", payer: `Person ${i}`, parent });
  const totals = await read("/api/totals");
  assert.equal(
    totals.find((x: any) => x.currency === "UZS").amount_minor,
    (2n * BigInt(Number.MAX_SAFE_INTEGER) - 53n).toString(),
  );
  assert.equal(
    totals.find((x: any) => x.currency === "USD").amount_minor,
    "500",
  );
  const first = await read(`/api/expenses/${parent}/reimbursements`);
  assert.equal(first.expenses.length, 50);
  const second = await read(
    `/api/expenses/${parent}/reimbursements?cursor=${first.nextCursor}`,
  );
  assert.equal(second.expenses.length, 3);
  assert.equal(
    new Set([...first.expenses, ...second.expenses].map((e) => e.id)).size,
    53,
  );
  for (const path of [
    "/api/expenses?from=2026-02-30",
    "/api/expenses?from=2026-10-01&to=2026-09-01",
    "/api/expenses?category=nope",
    "/api/expenses?direction=nope",
    "/api/expenses?offset=-1",
    "/api/insights?month=2026-13",
    `/api/expenses/${parent}/reimbursement-candidates`,
  ]) {
    assert.equal((await financialRead(request(path), env))!.status, 400, path);
  }
  assert.equal(
    (await financialRead(
      request(`/api/expenses/${crypto.randomUUID()}/reimbursements`),
      env,
    ))!.status,
    404,
  );
  assert.equal(await financialRead(request("/api/health"), env), null);
});

test("proxy relationship GET routes are bounded allowlists and contract header is forwarded unchanged", async (t) => {
  const config = {
    BACKEND_URL: "https://backend.example",
    BACKEND_TOKEN: "test-secret",
  };
  const id = crypto.randomUUID();
  const seen: (string | null)[] = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    seen.push(new Headers(init?.headers).get("X-Tracker-Contract"));
    return Response.json({ expenses: [], nextCursor: null });
  });
  for (const suffix of ["reimbursements", "reimbursement-candidates"]) {
    const path = `https://site.example/api/expenses/${id}/${suffix}`;
    assert.equal(
      (
        await site.fetch(
          new Request(path, {
            headers: { "X-Tracker-Contract": "reimbursements-v1" },
          }),
          config,
        )
      ).status,
      200,
    );
    assert.equal((await site.fetch(new Request(path), config)).status, 200);
    assert.equal(
      (await site.fetch(new Request(path, { method: "PATCH" }), config)).status,
      405,
    );
    assert.equal(
      (await site.fetch(new Request(path + "/more"), config)).status,
      404,
    );
  }
  assert.deepEqual(seen, [
    "reimbursements-v1",
    null,
    "reimbursements-v1",
    null,
  ]);
});

test("month boundaries retain Tashkent dates and the supported final year", async () => {
  const { add, read, sqlite } = fixture();
  add({ amount: 100, at: "2026-09-30T18:59:59.000Z" });
  add({ amount: 200, at: "2026-09-30T19:00:00.000Z" });
  add({ amount: 300, at: "2099-12-31T18:59:59.000Z" });
  assert.equal(
    (await read("/api/insights?month=2026-09")).currencies[0].spending_minor,
    "100",
  );
  const oct = (await read("/api/insights?month=2026-10")).currencies[0];
  assert.equal(oct.spending_minor, "200");
  assert.equal(oct.days[0].date, "2026-10-01");
  assert.equal(
    (await read("/api/insights?month=2099-12")).currencies[0].spending_minor,
    "300",
  );
  const review = add({ review: "unknown receipt" });
  sqlite
    .prepare("UPDATE expenses SET amount_minor=NULL WHERE id=?")
    .run(review);
  const projected = await read(`/api/expenses/${review}`);
  assert.equal(projected.amount_minor, null);
  assert.equal(projected.original_minor, "0");
  assert.equal(projected.personal_spending_minor, "0");
});

test("relationship cursors round-trip the earliest supported local date's UTC spillover", async () => {
  const { add, read } = fixture();
  // 2000-01-01 00:00 in Tashkent is still in 1999 in UTC storage.
  const earliest = "1999-12-31T19:00:00.000Z";
  const parents = Array.from({ length: 51 }, () =>
    add({ amount: 100, at: earliest }),
  );
  const source = add({
    direction: "income",
    amount: 1,
    at: "2000-01-01T19:00:00.000Z",
  });
  const first = await read(`/api/expenses/${source}/reimbursement-candidates`);
  assert.equal(first.expenses.length, 50);
  assert(first.nextCursor);
  const second = await read(
    `/api/expenses/${source}/reimbursement-candidates?cursor=${first.nextCursor}`,
  );
  assert.equal(second.expenses.length, 1);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.expenses, ...second.expenses].map((e) => e.id)).size,
    51,
  );
  assert(
    [...first.expenses, ...second.expenses].every(
      (e) => e.occurred_at === earliest,
    ),
  );

  for (let i = 0; i < 51; i++)
    add({
      direction: "income",
      amount: 1,
      at: earliest,
      payer: `Person ${i}`,
      parent: parents[0],
    });
  const children = await read(`/api/expenses/${parents[0]}/reimbursements`);
  assert.equal(children.expenses.length, 50);
  assert(children.nextCursor);
  const remaining = await read(
    `/api/expenses/${parents[0]}/reimbursements?cursor=${children.nextCursor}`,
  );
  assert.equal(remaining.expenses.length, 1);
  assert.equal(remaining.nextCursor, null);
  assert.equal(
    new Set([...children.expenses, ...remaining.expenses].map((e) => e.id))
      .size,
    51,
  );
});
