import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, message, purchaseFixture, now } from "./helpers";
import { parseEmail } from "../backend/src/parser";
import { saveMessage, getExpense } from "../backend/src/store";
import { updateExpense } from "../backend/src/reimbursements";
import { deliver, handleUpdate, reminder } from "../backend/src/telegram";

async function seed() {
  const { env, sqlite } = setup();
  const parentMail = message("synthetic-parent", purchaseFixture);
  const repaymentMail = message(
    "synthetic-repayment",
    purchaseFixture
      .replaceAll("Pokupka", "Perevod na kartu")
      .replaceAll("100.00", "40.00"),
  );
  await saveMessage(env, parentMail, parseEmail(parentMail), now);
  await saveMessage(env, repaymentMail, parseEmail(repaymentMail), now);
  const parent = sqlite
    .prepare("SELECT id FROM expenses WHERE source_message_id=?")
    .get(parentMail.id)!.id as string;
  const repayment = sqlite
    .prepare("SELECT id FROM expenses WHERE source_message_id=?")
    .get(repaymentMail.id)!.id as string;
  sqlite
    .prepare(
      "UPDATE expenses SET category='Food',description='Dinner' WHERE id=?",
    )
    .run(parent);
  return { env, sqlite, parent, repayment };
}
const chat = { id: 42, type: "private" };
function transport(t: any) {
  const sends: any[] = [];
  let mid = 100;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/sendMessage"))
      sends.push(JSON.parse(init.body));
    return Response.json({ ok: true, result: { message_id: ++mid } });
  });
  return sends;
}

test("reimbursement callback offers linking; old replies cannot fill note or complete it", async (t) => {
  const { env, sqlite, repayment } = await seed();
  env.TELEGRAM_APP_URL = "https://tracker.example";
  const sends = transport(t);
  await deliver(env, now);
  const messageId = sqlite
    .prepare(
      "SELECT message_id FROM telegram_messages WHERE expense_id=? AND kind='expense'",
    )
    .get(repayment)!.message_id as number;
  await handleUpdate(
    env,
    {
      update_id: 1,
      callback_query: {
        id: "one",
        from: { id: 42 },
        data: `inc:${repayment}:0`,
        message: { message_id: messageId, chat },
      },
    },
    now,
  );
  await deliver(env, now);
  const oldPrompt = sqlite
    .prepare(
      "SELECT message_id FROM telegram_messages WHERE expense_id=? AND kind='prompt'",
    )
    .get(repayment)!.message_id as number;
  const callback = {
    update_id: 2,
    callback_query: {
      id: "two",
      from: { id: 42 },
      data: `inc:${repayment}:1`,
      message: { message_id: messageId, chat },
    },
  };
  await handleUpdate(env, callback, now);
  await handleUpdate(env, callback, now);
  await deliver(env, now);
  const linkPrompt = sends.at(-1);
  assert.equal(
    linkPrompt.reply_markup.inline_keyboard[0][0].text,
    "Link to expense",
  );
  assert.match(
    linkPrompt.reply_markup.inline_keyboard[0][0].web_app.url,
    new RegExp(repayment),
  );
  assert.equal(linkPrompt.reply_markup.force_reply, undefined);
  await handleUpdate(
    env,
    {
      update_id: 3,
      message: {
        message_id: 999,
        from: { id: 42 },
        chat,
        text: "Old generic reply",
        reply_to_message: { message_id: oldPrompt },
      },
    },
    now,
  );
  assert.equal((await getExpense(env, repayment))!.description, "");
  assert.equal(
    sqlite
      .prepare(
        "SELECT count(*) n FROM outbox WHERE kind='receipt' AND expense_id=?",
      )
      .get(repayment)!.n,
    0,
  );
});

test("named email completion revives skipped intent, coalesces legacy receipt and never replaces delivered receipt", async (t) => {
  const { env, sqlite, parent, repayment } = await seed();
  const sends = transport(t);
  sqlite
    .prepare("UPDATE expenses SET income_category='Reimbursement' WHERE id=?")
    .run(repayment);
  sqlite
    .prepare(
      "INSERT INTO outbox(id,expense_id,kind,available_at) VALUES(?,?,'receipt',?)",
    )
    .run(`receipt:${repayment}`, repayment, now);
  await deliver(env, now); // incomplete receipt is processed without a send
  assert.equal(
    sqlite
      .prepare(
        "SELECT count(*) n FROM telegram_messages WHERE expense_id=? AND kind='receipt'",
      )
      .get(repayment)!.n,
    0,
  );
  const e = (await getExpense(env, repayment))!,
    p = (await getExpense(env, parent))!;
  await updateExpense(
    env,
    e,
    [
      ["payer_name", "Ali"],
      ["reimbursement_expense_id", parent],
    ],
    e.version,
    { [parent]: p.version },
    now,
  );
  sqlite
    .prepare(
      "INSERT INTO outbox(id,expense_id,kind,available_at,payload) VALUES(?,?,'description_saved',?,?)",
    )
    .run(
      `legacy:${repayment}`,
      repayment,
      now,
      JSON.stringify({ message_id: 991 }),
    );
  await Promise.all([deliver(env, now), deliver(env, now)]);
  await deliver(env, now + 2000);
  const receipts = () =>
    sends.filter(
      (s) =>
        s.text.startsWith("✓ Saved") && s.text.includes("Reimbursement from"),
    );
  assert.equal(receipts().length, 1);
  assert.equal(
    sqlite
      .prepare(
        "SELECT cleanup_status FROM telegram_messages WHERE message_id=991",
      )
      .get()!.cleanup_status,
    "deleted",
  );
  assert.match(receipts()[0].text, /Ali/);
  assert.match(receipts()[0].text, /For SAMPLE SHOP/);
  const changed = (await getExpense(env, repayment))!,
    changedParent = (await getExpense(env, parent))!;
  await updateExpense(
    env,
    changed,
    [["payer_name", "Sara"]],
    changed.version,
    { [parent]: changedParent.version },
    now + 3000,
  );
  await deliver(env, now + 3000);
  assert.equal(receipts().length, 1);
});

test("daily spending uses adjusted parent values and pending reimbursements need details", async (t) => {
  const { env, sqlite, parent, repayment } = await seed();
  const sends = transport(t);
  const day = Date.parse("2026-09-25T16:00:00Z");
  sqlite
    .prepare("UPDATE expenses SET income_category='Reimbursement' WHERE id=?")
    .run(repayment);
  const e = (await getExpense(env, repayment))!,
    p = (await getExpense(env, parent))!;
  await updateExpense(
    env,
    e,
    [
      ["payer_name", "Ali"],
      ["reimbursement_expense_id", parent],
    ],
    e.version,
    { [parent]: p.version },
    day,
  );
  await reminder(env, day);
  await deliver(env, day);
  assert.match(
    sends.find((s) => s.text.startsWith("Today’s spending")).text,
    /60\.00 UZS · 1 expense/,
  );
  const e2 = (await getExpense(env, repayment))!,
    p2 = (await getExpense(env, parent))!;
  await updateExpense(
    env,
    e2,
    [["reimbursement_expense_id", null]],
    e2.version,
    { [parent]: p2.version },
    day,
  );
  await reminder(env, day);
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind='reminder'").get()!
      .n,
    1,
  );
  assert.equal(
    sends.filter((s) => s.text.startsWith("Today’s spending")).length,
    1,
    "sent summary is not rewritten",
  );
});

test("completion racing an incomplete receipt read cannot consume the unsent intent", async (t) => {
  const { env, sqlite, parent, repayment } = await seed();
  const sends = transport(t);
  sqlite.prepare("UPDATE outbox SET sent_at=1").run();
  sqlite
    .prepare("UPDATE expenses SET income_category='Reimbursement' WHERE id=?")
    .run(repayment);
  sqlite
    .prepare(
      "INSERT INTO outbox(id,expense_id,kind,available_at) VALUES(?,?,'receipt',?)",
    )
    .run(`receipt:${repayment}`, repayment, now);
  const prepare = env.DB.prepare.bind(env.DB);
  let reads = 0,
    injected = false;
  t.mock.method(env.DB, "prepare", (query: string) => {
    const statement = prepare(query);
    if (query !== "SELECT * FROM expenses WHERE id=?") return statement;
    const bind = statement.bind.bind(statement);
    statement.bind = (...values: any[]) => {
      const bound = bind(...values),
        first = bound.first.bind(bound);
      bound.first = async (...args: any[]) => {
        const row = await first(...args);
        if (values[0] === repayment && ++reads === 2 && !injected) {
          injected = true;
          await updateExpense(
            env,
            row,
            [
              ["payer_name", "Ali"],
              ["reimbursement_expense_id", parent],
            ],
            row.version,
            { [parent]: 0 },
            now,
          );
        }
        return row;
      };
      return bound;
    };
    return statement;
  });
  await deliver(env, now);
  assert(injected);
  assert.equal(
    sqlite
      .prepare("SELECT sent_at FROM outbox WHERE id=?")
      .get(`receipt:${repayment}`)!.sent_at,
    null,
  );
  await deliver(env, now + 300001);
  assert.equal(sends.filter((s) => s.text.startsWith("✓ Saved")).length, 1);
  assert.equal(
    sqlite
      .prepare(
        "SELECT count(*) n FROM telegram_messages WHERE expense_id=? AND kind='receipt'",
      )
      .get(repayment)!.n,
    1,
  );
});

test("already-delivered then unlinked reimbursement finishes legacy intent and preserves reply association", async (t) => {
  const { env, sqlite, parent, repayment } = await seed();
  const sends = transport(t);
  sqlite.prepare("UPDATE outbox SET sent_at=1").run();
  sqlite
    .prepare(
      "UPDATE expenses SET income_category='Reimbursement',payer_name='Ali',reimbursement_expense_id=? WHERE id=?",
    )
    .run(parent, repayment);
  sqlite
    .prepare(
      "INSERT INTO telegram_messages(message_id,expense_id,kind,cleanup_status) VALUES(1000,?,'receipt','deleted')",
    )
    .run(repayment);
  sqlite
    .prepare("UPDATE expenses SET reimbursement_expense_id=NULL WHERE id=?")
    .run(repayment);
  sqlite
    .prepare(
      "INSERT INTO outbox(id,expense_id,kind,payload,available_at) VALUES('legacy-unlinked',?,'description_saved','{\"message_id\":1001}',?)",
    )
    .run(repayment, now);
  await deliver(env, now);
  assert.equal(sends.length, 0);
  assert.equal(
    sqlite
      .prepare("SELECT sent_at FROM outbox WHERE id='legacy-unlinked'")
      .get()!.sent_at,
    now,
  );
  assert.equal(
    sqlite
      .prepare("SELECT expense_id FROM telegram_messages WHERE message_id=1001")
      .get()!.expense_id,
    repayment,
  );
});

test("stale category update does not consume its deduplication ID or queue side effects", async (t) => {
  const { env, sqlite, repayment } = await seed();
  transport(t);
  await deliver(env, now);
  const mid = sqlite
    .prepare(
      "SELECT message_id FROM telegram_messages WHERE expense_id=? AND kind='expense'",
    )
    .get(repayment)!.message_id as number;
  const batch = env.DB.batch.bind(env.DB);
  let raced = false;
  t.mock.method(env.DB, "batch", async (statements: any[]) => {
    if (!raced) {
      raced = true;
      sqlite
        .prepare(
          "UPDATE expenses SET description='Concurrent dashboard edit',version=version+1 WHERE id=?",
        )
        .run(repayment);
    }
    return batch(statements);
  });
  const update = {
    update_id: 80,
    callback_query: {
      id: "race",
      from: { id: 42 },
      data: `inc:${repayment}:1`,
      message: { message_id: mid, chat },
    },
  };
  await handleUpdate(env, update, now);
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM telegram_updates WHERE id=80").get()!
      .n,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM outbox WHERE id='prompt:80'").get()!
      .n,
    0,
  );
  await handleUpdate(env, update, now);
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM telegram_updates WHERE id=80").get()!
      .n,
    1,
  );
  assert.equal(
    (await getExpense(env, repayment))!.income_category,
    "Reimbursement",
  );
});
