export const CATEGORIES = [
  "Transport",
  "Food",
  "Groceries",
  "Shopping",
  "Bills",
  "Health",
  "Entertainment",
  "Other",
] as const;
export const INCOME_CATEGORIES = [
  "Salary",
  "Reimbursement",
  "Other income",
] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type Direction = "expense" | "income";
// SQLite's default trim only removes ASCII spaces. Match String.trim for
// legacy notes and direct writes as well as normalized API input.
export const SQL_WHITESPACE =
  "char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)";
export function needsDetailsSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  return `(${p}review_reason IS NOT NULL OR CASE WHEN ${p}direction='income' AND ${p}income_category='Reimbursement' THEN (trim(${p}payer_name,${SQL_WHITESPACE})='' OR ${p}reimbursement_expense_id IS NULL) ELSE (trim(${p}description,${SQL_WHITESPACE})='' OR (${p}direction='expense' AND ${p}category IS NULL) OR (${p}direction='income' AND ${p}income_category IS NULL)) END)`;
}
export const NEEDS_DETAILS = needsDetailsSql();
export function isReimbursement(
  e: Pick<Expense, "direction" | "income_category">,
) {
  return e.direction === "income" && e.income_category === "Reimbursement";
}
export function complete(e: Expense) {
  return (
    !e.dismissed &&
    e.review_reason === null &&
    (isReimbursement(e)
      ? !!e.payer_name.trim() && !!e.reimbursement_expense_id
      : !!e.description.trim() &&
        !!(e.direction === "income" ? e.income_category : e.category))
  );
}
export function incomeCategory(value: unknown): value is IncomeCategory {
  return INCOME_CATEGORIES.includes(value as IncomeCategory);
}
export type Category = (typeof CATEGORIES)[number];
export interface Env {
  DB: D1Database;
  BACKEND_TOKEN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_OWNER_ID: string;
  SITE_URL: string;
  TELEGRAM_APP_URL?: string;
}
export interface Expense {
  id: string;
  source_message_id: string | null;
  source: "email" | "manual";
  manual_request: string | null;
  received_at: number;
  occurred_at: string | null;
  merchant: string | null;
  card_suffix: string | null;
  amount_minor: number | null;
  currency: string | null;
  direction: Direction;
  income_category: IncomeCategory | null;
  category: Category | null;
  description: string;
  payer_name: string;
  reimbursement_expense_id: string | null;
  review_reason: string | null;
  dismissed: number;
  version: number;
}
export function money(value: string): number {
  if (!/^\d{1,14}\.\d{2}$/.test(value)) throw new Error("invalid_amount");
  const minor = BigInt(value.replace(".", ""));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("invalid_amount");
  return Number(minor);
}
export function formatMoney(value: number | string, currency: string): string {
  const minor = BigInt(value);
  return `${(minor / 100n).toLocaleString("en-US")}.${(minor % 100n).toString().padStart(2, "0")} ${currency}`;
}
export function localDateTime(value: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (!m) throw new Error("invalid_time");
  const [, day, month, year, hour, minute, second = "00"] = m;
  const local = `20${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const d = new Date(`${local}+05:00`); // Asia/Tashkent: UTC+05, no DST for supported 2000–2099 dates.
  if (
    !Number.isFinite(d.getTime()) ||
    new Date(d.getTime() + 18000000).toISOString().slice(0, 19) !== local
  )
    throw new Error("invalid_time");
  return d.toISOString();
}
export function tashkentDay(now: number): string {
  return new Date(now + 18000000).toISOString().slice(0, 10);
}
export function category(value: unknown): value is Category {
  return CATEGORIES.includes(value as Category);
}
export class IntegrationError extends Error {
  constructor(
    public code: string,
    public retryAfter = 0,
  ) {
    super(code);
  }
}
export async function equalSecret(
  a: string | null,
  b: string | undefined,
): Promise<boolean> {
  if (!a || !b) return false;
  const digest = (s: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  const left = new Uint8Array(x),
    right = new Uint8Array(y);
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
