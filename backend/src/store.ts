import { Env, Expense } from "./domain";
import { GmailMessage, Parsed } from "./parser";
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
) {
  const snapshot = JSON.stringify(details);
  const result = await sql(
    env,
    `INSERT INTO expenses (id,source,manual_request,received_at,occurred_at,merchant,card_suffix,amount_minor,currency,direction,category,income_category,description)
     VALUES (?,'manual',?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
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
  ).run();
  const expense = (await getExpense(env, id))!;
  return {
    expense,
    created: Boolean(result.meta.changes),
    conflict:
      expense.source !== "manual" || expense.manual_request !== snapshot,
  };
}
