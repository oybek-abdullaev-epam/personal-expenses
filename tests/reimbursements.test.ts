import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { api } from "../backend/src/api";
import { complete, NEEDS_DETAILS, type Expense } from "../backend/src/domain";
import { getExpense, sql } from "../backend/src/store";
import { setup, request } from "./helpers";

const now = Date.parse("2026-10-03T12:00:00Z");
const uuid = () => crypto.randomUUID();
const details = (extra: Record<string, unknown> = {}) => ({
  id: uuid(),
  direction: "expense",
  merchant: "Synthetic dinner",
  amount: "300",
  currency: "UZS",
  local_time: "30.09.26 19:00",
  category: "Food",
  description: "Shared dinner",
  ...extra,
});
const repayment = (extra: Record<string, unknown> = {}) =>
  details({
    direction: "income",
    income_category: "Reimbursement",
    amount: "100",
    local_time: "01.10.26 19:00",
    description: "",
    ...extra,
  });
async function create(
  env: ReturnType<typeof setup>["env"],
  body: Record<string, unknown>,
) {
  const r = await api(request("/api/expenses", "POST", body), env, now);
  assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
  return (await r.json()) as Expense;
}
async function patch(
  env: ReturnType<typeof setup>["env"],
  expense: Expense,
  body: Record<string, unknown>,
) {
  return api(
    request(`/api/expenses/${expense.id}`, "PATCH", {
      ...body,
      version: expense.version,
    }),
    env,
    now,
  );
}
async function manualPatch(
  env: ReturnType<typeof setup>["env"],
  expense: Expense,
  body: Record<string, unknown>,
  extra: Record<string, unknown>,
) {
  return patch(env, expense, { ...body, ...extra });
}

test("populated additive migration preserves every original row and integration record, and rolls back", () => {
  const { sqlite } = setup(true, false);
  const id = uuid();
  const snapshot = '{"legacy":"exact bytes"}';
  sqlite
    .prepare(
      "INSERT INTO expenses(id,source,manual_request,received_at,occurred_at,merchant,amount_minor,currency,direction,income_category,description) VALUES (?,'manual',?,1,'2026-09-30T14:00:00.000Z','Synthetic sender',10000,'UZS','income','Reimbursement','Original note')",
    )
    .run(id, snapshot);
  const emailId = uuid();
  sqlite
    .prepare(
      "INSERT INTO expenses(id,source_message_id,received_at,review_reason) VALUES (?,'synthetic-message',2,'unsupported')",
    )
    .run(emailId);
  sqlite
    .prepare(
      "INSERT INTO outbox(id,expense_id,kind,available_at) VALUES ('old-prompt',?,'prompt',1)",
    )
    .run(id);
  sqlite
    .prepare(
      "INSERT INTO telegram_messages(message_id,expense_id,kind) VALUES (44,?,'prompt')",
    )
    .run(id);
  sqlite.exec(
    "INSERT INTO telegram_updates VALUES (9,1); INSERT INTO locks VALUES ('gmail','synthetic',20); INSERT INTO sync_state(id,activated_at,cursor_at) VALUES (1,10,20)",
  );
  const tables = [
    "expenses",
    "outbox",
    "telegram_messages",
    "telegram_updates",
    "locks",
    "sync_state",
  ];
  const before = tables.map((t) =>
    sqlite.prepare(`SELECT * FROM ${t} ORDER BY 1`).all(),
  );
  const migration = readFileSync(
    new URL("../backend/migrations/0005_reimbursements.sql", import.meta.url),
    "utf8",
  );
  sqlite.exec("BEGIN");
  sqlite.exec(migration);
  sqlite.exec("ROLLBACK");
  tables.forEach((t, i) =>
    assert.deepEqual(
      sqlite.prepare(`SELECT * FROM ${t} ORDER BY 1`).all(),
      before[i],
    ),
  );
  sqlite.exec("BEGIN");
  sqlite.exec(migration);
  sqlite.exec("COMMIT");
  tables.forEach((t, i) => {
    const rows = sqlite.prepare(`SELECT * FROM ${t} ORDER BY 1`).all();
    if (t !== "expenses") return assert.deepEqual(rows, before[i]);
    rows.forEach((r, n) => {
      for (const [key, value] of Object.entries(before[i][n]))
        assert.equal(r[key], value);
      assert.equal(r.payer_name, "");
      assert.equal(r.reimbursement_expense_id, null);
    });
  });
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
});

test("pending manual reimbursements allow missing name/link/note while ordinary descriptions and payer limits remain enforced", async () => {
  const { env } = setup();
  const pending = await create(env, repayment({ description: undefined }));
  assert.equal(pending.description, "");
  assert.equal(pending.payer_name, "");
  assert.equal(complete(pending), false);
  for (const bad of [
    details({ description: "" }),
    repayment({ payer_name: "😀".repeat(101) }),
    repayment({ payer_name: null }),
    repayment({ reimbursement_expense_id: "invalid" }),
  ])
    assert.equal(
      (await api(request("/api/expenses", "POST", bad), env, now)).status,
      400,
    );
  const unicode = await create(
    env,
    repayment({ payer_name: "  " + "😀".repeat(100) + "  " }),
  );
  assert.equal([...unicode.payer_name].length, 100);
});

test("link, relink, note correction and unlink atomically bump each affected parent exactly once", async () => {
  const { env } = setup();
  const a = await create(env, details());
  const b = await create(env, details());
  const body = repayment();
  let r = await create(env, body);
  let response = await manualPatch(env, r, body, {
    payer_name: "  Ali  ",
    reimbursement_expense_id: a.id,
    parent_versions: { [a.id]: 0 },
  });
  assert.equal(response.status, 200);
  r = (await response.json()) as Expense;
  assert.equal(r.payer_name, "Ali");
  assert.equal(complete(r), true);
  assert.equal((await getExpense(env, a.id))!.version, 1);
  response = await manualPatch(env, r, body, {
    payer_name: "Ali",
    reimbursement_expense_id: b.id,
    parent_versions: { [a.id]: 1, [b.id]: 0 },
  });
  assert.equal(response.status, 200);
  r = (await response.json()) as Expense;
  assert.equal((await getExpense(env, a.id))!.version, 2);
  assert.equal((await getExpense(env, b.id))!.version, 1);
  response = await manualPatch(env, r, body, {
    payer_name: "Ali",
    description: "Optional note",
    reimbursement_expense_id: b.id,
    parent_versions: { [b.id]: 1 },
  });
  assert.equal(response.status, 200);
  r = (await response.json()) as Expense;
  assert.equal((await getExpense(env, b.id))!.version, 2);
  response = await manualPatch(env, r, body, {
    payer_name: "Ali",
    reimbursement_expense_id: null,
    parent_versions: { [b.id]: 2 },
  });
  assert.equal(response.status, 200);
  r = (await response.json()) as Expense;
  assert.equal(r.reimbursement_expense_id, null);
  assert.equal(complete(r), false);
  assert.equal((await getExpense(env, b.id))!.version, 3);
  assert.equal((await getExpense(env, a.id))!.amount_minor, 30000);
});

test("parent versions are required and concurrency cannot overallocate capacity", async () => {
  const { env } = setup();
  const parent = await create(env, details({ amount: "100" }));
  const aBody = repayment({ amount: "60" });
  const bBody = repayment({ amount: "60" });
  const a = await create(env, aBody);
  const b = await create(env, bBody);
  const link = {
    payer_name: "Synthetic payer",
    reimbursement_expense_id: parent.id,
  };
  assert.equal((await manualPatch(env, a, aBody, link)).status, 400);
  const responses = await Promise.all([
    manualPatch(env, a, aBody, {
      ...link,
      parent_versions: { [parent.id]: 0 },
    }),
    manualPatch(env, b, bBody, {
      ...link,
      parent_versions: { [parent.id]: 0 },
    }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await getExpense(env, parent.id))!.version, 1);
  const loser = responses[0].status === 409 ? a : b;
  const loserBody = responses[0].status === 409 ? aBody : bBody;
  assert.equal(
    (
      await manualPatch(env, loser, loserBody, {
        ...link,
        parent_versions: { [parent.id]: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (await getExpense(env, loser.id))!.reimbursement_expense_id,
    null,
  );
});

test("invalid links and invalidating direct/manual/source edits preserve the whole relationship", async () => {
  const { env, sqlite } = setup();
  const parentBody = details();
  const parent = await create(env, parentBody);
  const body = repayment();
  const r = await create(env, {
    ...body,
    payer_name: "Sara",
    reimbursement_expense_id: parent.id,
    parent_versions: { [parent.id]: 0 },
  });
  const changes = [
    { amount: "50" },
    { currency: "USD" },
    { local_time: "02.10.26 19:00" },
    { direction: "income", income_category: "Salary" },
  ];
  for (const change of changes)
    assert.equal(
      (await manualPatch(env, { ...parent, version: 1 }, parentBody, change))
        .status,
      409,
    );
  for (const change of [
    { income_category: "Salary" },
    { currency: "USD" },
    { local_time: "29.09.26 19:00" },
    { amount: "301" },
  ]) {
    assert.equal(
      (
        await manualPatch(env, r, body, {
          ...change,
          payer_name: "",
          description: "Changed note",
          reimbursement_expense_id: null,
          parent_versions: { [parent.id]: 1 },
        })
      ).status,
      409,
    );
  }
  assert.equal(
    (
      await manualPatch(env, r, body, {
        payer_name: " ",
        reimbursement_expense_id: parent.id,
        parent_versions: { [parent.id]: 1 },
      })
    ).status,
    409,
  );
  assert.throws(
    () =>
      sqlite
        .prepare(
          "UPDATE expenses SET income_category='Salary',version=version+1 WHERE id=?",
        )
        .run(r.id),
    /reimbursement_conflict/,
  );
  assert.throws(
    () =>
      sqlite
        .prepare("UPDATE expenses SET dismissed=1 WHERE id=?")
        .run(parent.id),
    /reimbursement_conflict/,
  );
  assert.equal(
    (await getExpense(env, r.id))!.reimbursement_expense_id,
    parent.id,
  );
  assert.equal((await getExpense(env, parent.id))!.version, 1);
  const invalid = [
    { payer_name: "" },
    { currency: "USD", payer_name: "Ali" },
    { local_time: "29.09.26 19:00", payer_name: "Ali" },
  ];
  for (const change of invalid)
    assert.equal(
      (
        await api(
          request(
            "/api/expenses",
            "POST",
            repayment({
              ...change,
              reimbursement_expense_id: parent.id,
              parent_versions: { [parent.id]: 1 },
            }),
          ),
          env,
          now,
        )
      ).status,
      409,
    );
  assert.equal(
    (
      await api(
        request(
          "/api/expenses",
          "POST",
          repayment({
            payer_name: "Ali",
            reimbursement_expense_id: uuid(),
            parent_versions: {},
          }),
        ),
        env,
        now,
      )
    ).status,
    400,
  );
  const missing = uuid();
  assert.equal(
    (
      await api(
        request(
          "/api/expenses",
          "POST",
          repayment({
            payer_name: "Ali",
            reimbursement_expense_id: missing,
            parent_versions: { [missing]: 0 },
          }),
        ),
        env,
        now,
      )
    ).status,
    404,
  );
});

test("manual original snapshots survive later edits and parent version changes, including legacy reimbursement bytes", async () => {
  const { env, sqlite } = setup();
  const parent = await create(env, details());
  const body = repayment({
    payer_name: "Ali",
    reimbursement_expense_id: parent.id,
    parent_versions: { [parent.id]: 0 },
  });
  const r = await create(env, body);
  assert.equal(
    (
      await manualPatch(env, r, body, {
        description: "Changed",
        parent_versions: { [parent.id]: 1 },
      })
    ).status,
    200,
  );
  const snapshot = (await getExpense(env, r.id))!.manual_request;
  assert.equal(
    (
      await api(
        request("/api/expenses", "POST", {
          ...body,
          parent_versions: undefined,
        }),
        env,
        now,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        request("/api/expenses", "POST", { ...body, payer_name: "Different" }),
        env,
        now,
      )
    ).status,
    409,
  );
  assert.equal((await getExpense(env, r.id))!.manual_request, snapshot);
  const oldBody = repayment({ description: "Old note" });
  const old = await create(env, oldBody);
  const original = JSON.parse(old.manual_request!);
  delete original.payer_name;
  delete original.reimbursement_expense_id;
  const bytes = JSON.stringify(original);
  sqlite
    .prepare("UPDATE expenses SET manual_request=? WHERE id=?")
    .run(bytes, old.id);
  assert.equal(
    (await api(request("/api/expenses", "POST", oldBody), env, now)).status,
    200,
  );
  assert.equal((await getExpense(env, old.id))!.manual_request, bytes);
});

async function emailReimbursement(env: ReturnType<typeof setup>["env"]) {
  const id = uuid();
  await sql(
    env,
    "INSERT INTO expenses(id,source_message_id,received_at,occurred_at,merchant,card_suffix,amount_minor,currency,direction,income_category) VALUES (?,?,?,'2026-10-01T14:00:00.000Z','Synthetic sender','1234',10000,'UZS','income','Reimbursement')",
    id,
    `synthetic-${id}`,
    now,
  ).run();
  return (await getExpense(env, id))!;
}

test("email completion queues one receipt atomically, revives skipped intent, and never repeats delivered receipts", async () => {
  const { env, sqlite } = setup();
  const parent = await create(env, details());
  let r = await emailReimbursement(env);
  sqlite
    .prepare(
      "INSERT INTO outbox(id,expense_id,kind,available_at,sent_at) VALUES (?,?,'receipt',1,1)",
    )
    .run(`receipt:${r.id}`, r.id);
  const link = {
    payer_name: "Ali",
    reimbursement_expense_id: parent.id,
    parent_versions: { [parent.id]: 0 },
  };
  let response = await patch(env, r, link);
  assert.equal(response.status, 200);
  r = (await response.json()) as Expense;
  assert.equal(
    sqlite
      .prepare("SELECT sent_at FROM outbox WHERE id=?")
      .get(`receipt:${r.id}`)!.sent_at,
    null,
  );
  sqlite
    .prepare("UPDATE outbox SET sent_at=1 WHERE id=?")
    .run(`receipt:${r.id}`);
  assert.equal(
    (
      await patch(
        env,
        { ...r, version: 0 },
        { ...link, parent_versions: { [parent.id]: 1 } },
      )
    ).status,
    409,
  );
  assert.equal(
    sqlite
      .prepare("SELECT sent_at FROM outbox WHERE id=?")
      .get(`receipt:${r.id}`)!.sent_at,
    1,
  );
  sqlite
    .prepare(
      "INSERT INTO telegram_messages(message_id,expense_id,kind,cleanup_status) VALUES (100,?,'receipt','deleted')",
    )
    .run(r.id);
  response = await patch(env, r, {
    payer_name: "Corrected",
    parent_versions: { [parent.id]: 1 },
  });
  assert.equal(response.status, 200);
  assert.equal(
    sqlite
      .prepare("SELECT sent_at FROM outbox WHERE id=?")
      .get(`receipt:${r.id}`)!.sent_at,
    1,
  );
  const fresh = await emailReimbursement(env);
  sqlite.exec(
    "CREATE TRIGGER fail_receipt BEFORE INSERT ON outbox WHEN NEW.kind='receipt' BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END",
  );
  await assert.rejects(
    patch(env, fresh, { ...link, parent_versions: { [parent.id]: 2 } }),
    /synthetic receipt failure/,
  );
  assert.equal(
    (await getExpense(env, fresh.id))!.reimbursement_expense_id,
    null,
  );
  assert.equal((await getExpense(env, parent.id))!.version, 2);
});

test("batch failure during relink and unlink rolls back source and both parent versions; ambiguous PATCH retries conflict", async () => {
  const { env } = setup();
  const a = await create(env, details());
  const b = await create(env, details());
  const r = await emailReimbursement(env);
  const link = {
    payer_name: "Ali",
    reimbursement_expense_id: a.id,
    parent_versions: { [a.id]: 0 },
  };
  assert.equal((await patch(env, r, link)).status, 200);
  assert.equal((await patch(env, r, link)).status, 409);
  const current = (await getExpense(env, r.id))!;
  const originalBatch = env.DB.batch.bind(env.DB);
  env.DB.batch = ((statements: D1PreparedStatement[]) =>
    originalBatch([
      ...statements,
      env.DB.prepare("INSERT INTO nonexistent VALUES (1)"),
    ])) as typeof env.DB.batch;
  for (const newLink of [b.id, null])
    await assert.rejects(
      patch(env, current, {
        reimbursement_expense_id: newLink,
        parent_versions: { [a.id]: 1, [b.id]: 0 },
      }),
    );
  assert.equal((await getExpense(env, r.id))!.reimbursement_expense_id, a.id);
  assert.equal((await getExpense(env, a.id))!.version, 1);
  assert.equal((await getExpense(env, b.id))!.version, 0);
});

test("JS and SQL completion agree including Unicode blank notes and pending reimbursements; unauthorized writes are rejected", async () => {
  const { env, sqlite } = setup();
  const parent = await create(env, details());
  const pending = await create(env, repayment({ payer_name: "Ali" }));
  const linked = await create(
    env,
    repayment({
      payer_name: "Ali",
      reimbursement_expense_id: parent.id,
      parent_versions: { [parent.id]: 0 },
    }),
  );
  sqlite
    .prepare("UPDATE expenses SET description=? WHERE id=?")
    .run("\t\u00a0", parent.id);
  for (const id of [parent.id, pending.id, linked.id]) {
    const raw = (await getExpense(env, id))!;
    const row = sqlite
      .prepare(`SELECT ${NEEDS_DETAILS} AS needs FROM expenses WHERE id=?`)
      .get(id)!;
    assert.equal(!complete(raw), Boolean(row.needs));
  }
  assert.equal(
    (
      await api(
        request(
          `/api/expenses/${pending.id}`,
          "PATCH",
          { version: 0, payer_name: "X" },
          false,
        ),
        env,
        now,
      )
    ).status,
    401,
  );
});

test("permitted linked manual financial and date corrections require a parent version and refresh its details", async () => {
  const { env } = setup();
  const parent = await create(env, details());
  const body = repayment({
    payer_name: "Ali",
    reimbursement_expense_id: parent.id,
    parent_versions: { [parent.id]: 0 },
  });
  let r = await create(env, body);
  assert.equal(
    (
      await manualPatch(env, r, body, {
        amount: "110",
        parent_versions: undefined,
      })
    ).status,
    400,
  );
  let response = await manualPatch(env, r, body, {
    amount: "110",
    local_time: "02.10.26 18:00",
    merchant: "Corrected sender",
    parent_versions: { [parent.id]: 1 },
  });
  assert.equal(response.status, 200);
  r = (await response.json()) as Expense;
  assert.equal(r.amount_minor, 11000);
  assert.equal((await getExpense(env, parent.id))!.version, 2);
  response = await manualPatch(env, r, body, {
    amount: "120",
    parent_versions: { [parent.id]: 1 },
  });
  assert.equal(response.status, 409);
  assert.equal((await getExpense(env, r.id))!.amount_minor, 11000);
});

test("capacity arithmetic remains exact at the maximum safe amount and direct writes cannot bypass eligibility", async () => {
  const { env, sqlite } = setup();
  const parent = await create(env, details({ amount: "90071992547409.91" }));
  await create(
    env,
    repayment({
      amount: "90071992547409.90",
      payer_name: "Ali",
      reimbursement_expense_id: parent.id,
      parent_versions: { [parent.id]: 0 },
    }),
  );
  await create(
    env,
    repayment({
      amount: "0.01",
      payer_name: "Sara",
      reimbursement_expense_id: parent.id,
      parent_versions: { [parent.id]: 1 },
    }),
  );
  const rejected = await api(
    request(
      "/api/expenses",
      "POST",
      repayment({
        amount: "0.01",
        payer_name: "Third",
        reimbursement_expense_id: parent.id,
        parent_versions: { [parent.id]: 2 },
      }),
    ),
    env,
    now,
  );
  assert.equal(rejected.status, 409);
  assert.equal(
    (await getExpense(env, parent.id))!.amount_minor,
    Number.MAX_SAFE_INTEGER,
  );
  const p = await create(env, details());
  const pending = await emailReimbursement(env);
  for (const [query, values] of [
    [
      "UPDATE expenses SET payer_name=?,reimbursement_expense_id=? WHERE id=?",
      ["\t\u00a0", p.id, pending.id],
    ],
    [
      "UPDATE expenses SET payer_name='Ali',reimbursement_expense_id=?,currency='USD' WHERE id=?",
      [p.id, pending.id],
    ],
  ] as [string, string[]][])
    assert.throws(
      () => sqlite.prepare(query).run(...values),
      /reimbursement_conflict/,
    );
  sqlite
    .prepare("UPDATE expenses SET review_reason='synthetic review' WHERE id=?")
    .run(p.id);
  assert.equal(
    (
      await patch(env, pending, {
        payer_name: "Ali",
        reimbursement_expense_id: p.id,
        parent_versions: { [p.id]: 0 },
      })
    ).status,
    409,
  );
  assert.equal(
    (await getExpense(env, pending.id))!.reimbursement_expense_id,
    null,
  );
});
