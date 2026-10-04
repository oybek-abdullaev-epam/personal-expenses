import { Env, Expense } from "./domain";
import { GmailMessage, Parsed } from "./parser";
import {
  MutationError,
  parentVersionGuard,
  translateMutationError,
} from "./reimbursements";
export const sql = (
  env: Pick<Env, "DB">,
  query: string,
  ...values: (string | number | null)[]
) => env.DB.prepare(query).bind(...values);
export async function saveMessage(
  env: Env,
  message: GmailMessage,
  parsed: Parsed,
  now: number,
) {
  const review = "review_reason" in parsed;
  const id = crypto.randomUUID();
  await env.DB.batch([
    sql(
      env,
      `INSERT OR IGNORE INTO expenses (id,source_message_id,received_at,occurred_at,merchant,card_suffix,amount_minor,currency,review_reason,direction) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id,
      message.id,
      Number(message.internalDate),
      review ? null : parsed.occurred_at,
      review ? null : parsed.merchant,
      review ? null : parsed.card_suffix,
      review ? null : parsed.amount_minor,
      review ? null : parsed.currency,
      review ? parsed.review_reason : null,
      review ? "expense" : parsed.direction,
    ),
    sql(
      env,
      `INSERT OR IGNORE INTO outbox (id,expense_id,kind,available_at) SELECT 'expense:'||id,id,?,? FROM expenses WHERE source_message_id=?`,
      review ? "review" : "expense",
      now,
      message.id,
    ),
  ]);
}
export async function getExpense(env: Env, id: string) {
  return sql(env, "SELECT * FROM expenses WHERE id=?", id).first<Expense>();
}
export async function enqueue(
  env: Env,
  id: string,
  kind: string,
  payload: object,
  now: number,
  expenseId: string | null = null,
) {
  await sql(
    env,
    "INSERT OR IGNORE INTO outbox (id,expense_id,kind,payload,available_at) VALUES (?,?,?,?,?)",
    id,
    expenseId,
    kind,
    JSON.stringify(payload),
    now,
  ).run();
}
export async function lock(env: Env, name: string, now: number, ttl: number) {
  const token = crypto.randomUUID();
  const r = await sql(
    env,
    `INSERT INTO locks (name,token,until_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET token=excluded.token,until_at=excluded.until_at WHERE locks.until_at<=?`,
    name,
    token,
    now + ttl,
    now,
  ).run();
  return r.meta.changes ? token : null;
}

export async function saveManual(
  env: Env,
  id: string,
  details: ReturnType<typeof import("./manual").manualDetails>,
  now: number,
  parentVersions?: unknown,
) {
  const snapshot = JSON.stringify(details);
  const compare = (expense: Expense) => {
    let compatible = expense.manual_request === snapshot;
    // Old Reimbursement snapshots lacked the two newly introduced metadata fields.
    if (
      !compatible &&
      "payer_name" in details &&
      !details.payer_name &&
      !details.reimbursement_expense_id
    ) {
      const {
        payer_name: _payer,
        reimbursement_expense_id: _parent,
        ...legacy
      } = details;
      compatible = expense.manual_request === JSON.stringify(legacy);
    }
    return expense.source !== "manual" || !compatible;
  };
  // Retry identity is checked before validating mutable parent state/versions.
  const existing = await getExpense(env, id);
  if (existing)
    return { expense: existing, created: false, conflict: compare(existing) };
  const parent =
    "reimbursement_expense_id" in details
      ? details.reimbursement_expense_id
      : null;
  const guard = await parentVersionGuard(env, [parent], parentVersions);
  let result;
  try {
    result = await sql(
      env,
      `INSERT INTO expenses (id,source,manual_request,received_at,occurred_at,merchant,card_suffix,amount_minor,currency,direction,category,income_category,description,payer_name,reimbursement_expense_id)
      SELECT ?,'manual',?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard.where} ON CONFLICT(id) DO NOTHING`,
      id,
      snapshot,
      now,
      details.occurred_at,
      details.merchant,
      details.card_suffix as string | null,
      details.amount_minor,
      details.currency,
      details.direction,
      details.category,
      details.income_category,
      details.description,
      "payer_name" in details ? details.payer_name : "",
      parent,
      ...guard.values,
    ).run();
  } catch (e) {
    translateMutationError(e);
  }
  const expense = await getExpense(env, id);
  if (!expense)
    throw new MutationError(
      "The selected expense changed. Refresh and try again.",
      409,
      "version_conflict",
    );
  return {
    expense,
    created: Boolean(result.meta.changes),
    conflict: compare(expense),
  };
}
