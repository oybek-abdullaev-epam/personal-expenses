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
export const NEEDS_DETAILS =
  "(review_reason IS NOT NULL OR description='' OR (direction='expense' AND category IS NULL) OR (direction='income' AND income_category IS NULL))";
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
}
export interface Expense {
  id: string;
  source_message_id: string;
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
