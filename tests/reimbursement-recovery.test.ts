import { test } from "node:test";
import assert from "node:assert/strict";
import pause from "../backend/src/release-pause";
import { setup, message, now, purchaseFixture } from "./helpers";
import { saveMessage } from "../backend/src/store";
import { parseEmail } from "../backend/src/parser";

test("release pause preserves populated state and never acknowledges webhook or reset writes", async () => {
  const { env, sqlite } = setup();
  const email = message("pause-synthetic", purchaseFixture);
  await saveMessage(env, email, parseEmail(email), now);
  const id = sqlite.prepare("SELECT id FROM expenses").get()!.id;
  sqlite
    .prepare("INSERT INTO sync_state(id,activated_at,cursor_at) VALUES(1,?,?)")
    .run(now, now + 10);
  sqlite
    .prepare(
      "INSERT INTO telegram_messages(message_id,expense_id,kind,created_at) VALUES(1,?,'prompt',?)",
    )
    .run(id, now);
  sqlite
    .prepare("INSERT INTO telegram_updates(id,processed_at) VALUES(1,?)")
    .run(now);
  sqlite
    .prepare(
      "INSERT INTO locks(name,token,until_at) VALUES('gmail','synthetic',?)",
    )
    .run(now);
  const tables = [
    "expenses",
    "outbox",
    "sync_state",
    "telegram_messages",
    "telegram_updates",
    "locks",
  ];
  const snapshot = () =>
    tables.map((table) =>
      sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
    );
  const before = snapshot();
  for (const path of [
    "/api/expenses",
    "/api/activate",
    "/telegram/webhook",
    "/reset",
    "/switch-mailbox",
  ]) {
    const r = await pause.fetch(
      new Request(`https://backend.example${path}`, {
        method: "POST",
        body: "{}",
      }),
      env,
    );
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("Retry-After"), "60");
  }
  assert.equal(
    (
      await pause.fetch(
        new Request("https://backend.example/release-status"),
        env,
      )
    ).status,
    401,
  );
  const status = await pause.fetch(
    new Request("https://backend.example/release-status", {
      headers: { Authorization: `Bearer ${env.BACKEND_TOKEN}` },
    }),
    env,
  );
  assert.equal(status.status, 200);
  assert.equal(((await status.json()) as { paused: boolean }).paused, true);
  await pause.scheduled();
  assert.deepEqual(snapshot(), before);
});

test("populated migration, linked-state pause and compatible resume preserve history and reject old clients", async () => {
  const { readFileSync } = await import("node:fs");
  const { api } = await import("../backend/src/api");
  const { request } = await import("./helpers");
  const { env, sqlite } = setup(true, false);
  const parentMail = message("recovery-parent", purchaseFixture);
  const repaymentMail = message(
    "recovery-repayment",
    purchaseFixture
      .replaceAll("Pokupka", "Perevod na kartu")
      .replaceAll("100.00", "40.00"),
  );
  await saveMessage(env, parentMail, parseEmail(parentMail), now);
  await saveMessage(env, repaymentMail, parseEmail(repaymentMail), now);
  const parent = sqlite
    .prepare("SELECT * FROM expenses WHERE source_message_id=?")
    .get(parentMail.id)!;
  const repayment = sqlite
    .prepare("SELECT * FROM expenses WHERE source_message_id=?")
    .get(repaymentMail.id)!;
  sqlite
    .prepare(
      "UPDATE expenses SET income_category='Reimbursement',description='Historical note' WHERE id=?",
    )
    .run(repayment.id);
  sqlite
    .prepare(
      "INSERT INTO sync_state(id,activated_at,cursor_at,page_token) VALUES(1,?,?,'synthetic-page')",
    )
    .run(now, now + 10);
  sqlite
    .prepare(
      "INSERT INTO telegram_messages(message_id,expense_id,kind,created_at) VALUES(42,?,'prompt',?)",
    )
    .run(repayment.id, now);
  const integrationTables = [
    "sync_state",
    "outbox",
    "telegram_messages",
    "telegram_updates",
    "locks",
  ];
  const snapshot = () =>
    integrationTables.map((table) =>
      sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
    );
  const before = snapshot();
  await pause.scheduled();
  assert.equal((await pause.fetch(request("/api/expenses"), env)).status, 503);
  sqlite.exec(
    readFileSync(
      new URL("../backend/migrations/0005_reimbursements.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    snapshot(),
    before,
    "migration and pause create no notification burst or integration changes",
  );
  const pending: any = await (
    await api(request(`/api/expenses/${repayment.id}`), env, now)
  ).json();
  assert.equal(pending.payer_name, "");
  assert.equal(pending.description, "Historical note");
  assert.equal(pending.pending_reimbursement_minor, "4000");
  const linked = await api(
    request(`/api/expenses/${repayment.id}`, "PATCH", {
      version: 0,
      payer_name: "Ali",
      reimbursement_expense_id: parent.id,
      parent_versions: { [String(parent.id)]: 0 },
    }),
    env,
    now,
  );
  assert.equal(linked.status, 200);
  const linkedState = snapshot();
  const financialRows = sqlite
    .prepare("SELECT * FROM expenses ORDER BY id")
    .all();
  await pause.scheduled();
  assert.equal((await pause.fetch(request("/api/expenses"), env)).status, 503);
  assert.deepEqual(snapshot(), linkedState);
  assert.deepEqual(
    sqlite.prepare("SELECT * FROM expenses ORDER BY id").all(),
    financialRows,
  );
  const fresh: any = await (
    await api(request(`/api/expenses/${parent.id}`), env, now)
  ).json();
  assert.equal(fresh.amount_minor, 10000);
  assert.equal(fresh.personal_spending_minor, "6000");
  const old = request("/api/expenses");
  old.headers.delete("X-Tracker-Contract");
  const rejected = await api(old, env, now);
  assert.equal(rejected.status, 409);
  assert.equal(((await rejected.json()) as any).code, "refresh_required");
  assert.equal(
    (await api(request("/api/expenses", "GET", undefined, false), env, now))
      .status,
    401,
  );
  await saveMessage(env, parentMail, parseEmail(parentMail), now);
  await saveMessage(env, repaymentMail, parseEmail(repaymentMail), now);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM expenses").get()!.n, 2);
  assert.deepEqual(snapshot(), linkedState);
});
