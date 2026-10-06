import {
  category,
  incomeCategory,
  isReimbursement,
  localDateTime,
  needsDetailsSql,
  tashkentDay,
  type Env,
  type Expense,
} from "./domain";
import { json } from "./http";
import { getExpense, sql } from "./store";
import { isUuid } from "./telegram-links";

const at =
  "COALESCE(e.occurred_at,strftime('%Y-%m-%dT%H:%M:%fZ',e.received_at/1000.0,'unixepoch'))";
// An individual parent's allocations are constrained to its safe-integer amount.
// Cross-parent aggregates below use BigInt rather than SQLite/JS floating sums.
const allocated = (alias: string) =>
  `COALESCE((SELECT SUM(r.amount_minor) FROM expenses r WHERE r.reimbursement_expense_id=${alias}.id),0)`;
export interface MoneyProjection {
  original_minor: string;
  reimbursed_minor: string;
  personal_spending_minor: string;
  pending_reimbursement_minor: string;
}
export type ParentContext = Pick<
  Expense,
  | "id"
  | "version"
  | "merchant"
  | "description"
  | "occurred_at"
  | "amount_minor"
  | "currency"
> &
  MoneyProjection;
export type ProjectedExpense = Expense &
  MoneyProjection & {
    parent_versions: Record<string, number>;
    reimbursement_expense: ParentContext | null;
  };
type ProjectionRow = Expense & {
  _reimbursed: string;
  _parent_id: string | null;
  _parent_version: number | null;
  _parent_merchant: string | null;
  _parent_description: string | null;
  _parent_at: string | null;
  _parent_amount: number | null;
  _parent_currency: string | null;
  _parent_reimbursed: string;
};

type ProjectionInput = Pick<
  Expense,
  | "amount_minor"
  | "dismissed"
  | "review_reason"
  | "direction"
  | "income_category"
  | "reimbursement_expense_id"
>;
export function moneyProjection(
  e: ProjectionInput,
  reimbursed: string | bigint = "0",
): MoneyProjection {
  const original = BigInt(e.amount_minor ?? 0);
  const repaid = BigInt(reimbursed);
  const active = !e.dismissed && e.review_reason === null;
  return {
    original_minor: original.toString(),
    reimbursed_minor: repaid.toString(),
    personal_spending_minor: (active && e.direction === "expense"
      ? original - repaid
      : 0n
    ).toString(),
    pending_reimbursement_minor: (active &&
    isReimbursement(e) &&
    !e.reimbursement_expense_id
      ? original
      : 0n
    ).toString(),
  };
}
function project(row: ProjectionRow): ProjectedExpense {
  const {
    _reimbursed,
    _parent_id,
    _parent_version,
    _parent_merchant,
    _parent_description,
    _parent_at,
    _parent_amount,
    _parent_currency,
    _parent_reimbursed,
    ...expense
  } = row;
  return {
    ...expense,
    ...moneyProjection(expense, _reimbursed),
    parent_versions: _parent_id ? { [_parent_id]: _parent_version! } : {},
    reimbursement_expense: _parent_id
      ? {
          id: _parent_id,
          version: _parent_version!,
          merchant: _parent_merchant,
          description: _parent_description!,
          occurred_at: _parent_at,
          amount_minor: _parent_amount,
          currency: _parent_currency,
          original_minor: String(_parent_amount ?? 0),
          reimbursed_minor: _parent_reimbursed,
          personal_spending_minor: (
            BigInt(_parent_amount ?? 0) - BigInt(_parent_reimbursed)
          ).toString(),
          pending_reimbursement_minor: "0",
        }
      : null,
  };
}
async function readRows(
  env: Env,
  where: string,
  values: (string | number)[],
  suffix: string,
) {
  const result = await sql(
    env,
    `SELECT e.*,
    CAST(${allocated("e")} AS TEXT) AS _reimbursed,
    p.id AS _parent_id,p.version AS _parent_version,p.merchant AS _parent_merchant,
    p.description AS _parent_description,p.occurred_at AS _parent_at,
    p.amount_minor AS _parent_amount,p.currency AS _parent_currency,
    CAST(${allocated("p")} AS TEXT) AS _parent_reimbursed
    FROM expenses e LEFT JOIN expenses p ON p.id=e.reimbursement_expense_id
    WHERE ${where} ${suffix}`,
    ...values,
  ).all<ProjectionRow>();
  return result.results.map(project);
}

type AggregateRow = Pick<
  Expense,
  "id" | "currency" | "category" | "occurred_at"
> &
  ProjectionInput &
  MoneyProjection;
// Totals and insights need no parent context, so read only the columns they use.
async function readAggregateRows(
  env: Env,
  where: string,
  values: (string | number)[],
  suffix: string,
) {
  const result = await sql(
    env,
    `SELECT e.id,e.currency,e.category,e.income_category,e.occurred_at,e.amount_minor,
    e.dismissed,e.review_reason,e.direction,e.reimbursement_expense_id,
    CASE WHEN e.direction='expense' THEN CAST(${allocated("e")} AS TEXT) ELSE '0' END AS _reimbursed
    FROM expenses e WHERE ${where} ${suffix}`,
    ...values,
  ).all<AggregateRow & { _reimbursed: string }>();
  return result.results.map(({ _reimbursed, ...row }): AggregateRow => ({
    ...row,
    ...moneyProjection(row, _reimbursed),
  }));
}

/** Shared read boundary for API writes and daily summaries; bounded bulk queries. */
export async function projectExpenses(
  env: Env,
  expenses: Expense[],
): Promise<ProjectedExpense[]> {
  const rows = new Map<string, ProjectedExpense>();
  for (let offset = 0; offset < expenses.length; offset += 80) {
    const ids = expenses.slice(offset, offset + 80).map((e) => e.id);
    for (const row of await readRows(
      env,
      `e.id IN (${ids.map(() => "?").join(",")})`,
      ids,
      "",
    ))
      rows.set(row.id, row);
  }
  return expenses.flatMap((e) => (rows.has(e.id) ? [rows.get(e.id)!] : []));
}
function search(q: string | null, payer = true) {
  if (!q) return { where: "1=1", values: [] as string[] };
  if (q.length > 200) throw Error("Invalid search");
  const value = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const fields = ["merchant", "description", ...(payer ? ["payer_name"] : [])];
  return {
    where: `(${fields.map((f) => `e.${f} LIKE ? ESCAPE '\\'`).join(" OR ")})`,
    values: fields.map(() => value),
  };
}
function filters(url: URL) {
  const p = url.searchParams,
    parts = ["e.dismissed=0"],
    values: (string | number)[] = [];
  const c = p.get("category"),
    direction = p.get("direction");
  if (c && !category(c) && !incomeCategory(c)) throw Error("Invalid category");
  if (direction && direction !== "expense" && direction !== "income")
    throw Error("Invalid direction");
  // The Reimbursement category overrides direction (CONTRACTS.md), so a direction filter is intentionally ignored here.
  if (c === "Reimbursement")
    parts.push("e.direction='income' AND e.income_category='Reimbursement'");
  else {
    if (c) {
      parts.push("COALESCE(e.income_category,e.category)=?");
      values.push(c);
    }
    if (direction) {
      parts.push("e.direction=?");
      values.push(direction);
    }
    if (direction === "income")
      parts.push("COALESCE(e.income_category,'')<>'Reimbursement'");
    else parts.push("e.reimbursement_expense_id IS NULL");
  }
  const s = search(p.get("q"), c === "Reimbursement");
  parts.push(s.where);
  values.push(...s.values);
  if (p.get("needsDetails") === "true") parts.push(needsDetailsSql("e"));
  for (const [key, op] of [
    ["from", ">="],
    ["to", "<"],
  ] as const) {
    const value = p.get(key);
    if (!value) continue;
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw Error("Invalid date");
    const [y, m, d] = value.split("-");
    const iso = localDateTime(`${d}.${m}.${y.slice(2)} 00:00`);
    parts.push(`${at} ${op} ?`);
    values.push(
      key === "to" ? new Date(Date.parse(iso) + 86400000).toISOString() : iso,
    );
  }
  if (p.get("from") && p.get("to") && p.get("from")! > p.get("to")!)
    throw Error("Invalid range");
  return { where: parts.join(" AND "), values };
}
function encodeCursor(e: Expense) {
  return btoa(JSON.stringify([e.occurred_at, e.id]))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function cursorFilter(value: string | null) {
  if (value === null) return { where: "1=1", values: [] as string[] };
  try {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw Error();
    const raw = JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/")));
    if (
      !Array.isArray(raw) ||
      raw.length !== 2 ||
      typeof raw[0] !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw[0]) ||
      new Date(raw[0]).toISOString() !== raw[0] ||
      !isUuid(raw[1]) ||
      raw[1] !== raw[1].toLowerCase()
    )
      throw Error();
    if (encodeCursor({ occurred_at: raw[0], id: raw[1] } as Expense) !== value)
      throw Error();
    return {
      where: "(e.occurred_at<? OR (e.occurred_at=? AND e.id<?))",
      values: [raw[0], raw[0], raw[1]],
    };
  } catch {
    throw Error("Invalid cursor");
  }
}
function page(rows: ProjectedExpense[]) {
  const expenses = rows.slice(0, 50);
  return {
    expenses,
    nextCursor: rows.length > 50 ? encodeCursor(expenses[49]) : null,
  };
}
async function relationshipRead(
  url: URL,
  env: Env,
  id: string,
  candidates: boolean,
) {
  const source = await getExpense(env, id);
  if (!source || source.dismissed || source.review_reason !== null)
    return json({ error: "Not found" }, 404);
  if (candidates ? !isReimbursement(source) : source.direction !== "expense")
    return json({ error: "Invalid transaction for this operation" }, 400);
  const cursor = cursorFilter(url.searchParams.get("cursor"));
  const values: (string | number)[] = [];
  const parts = ["e.dismissed=0", "e.review_reason IS NULL"];
  if (candidates) {
    parts.push(
      "e.direction='expense'",
      "e.currency=?",
      "e.occurred_at<=?",
      `e.amount_minor-${allocated("e")}+CASE WHEN e.id=? THEN ? ELSE 0 END>=?`,
    );
    values.push(
      source.currency!,
      source.occurred_at!,
      source.reimbursement_expense_id ?? "",
      source.amount_minor!,
      source.amount_minor!,
    );
    const s = search(url.searchParams.get("q"), false);
    parts.push(s.where);
    values.push(...s.values);
  } else {
    parts.push("e.reimbursement_expense_id=?");
    values.push(id);
  }
  parts.push(cursor.where);
  values.push(...cursor.values);
  const rows = await readRows(
    env,
    parts.join(" AND "),
    values,
    "ORDER BY e.occurred_at DESC,e.id DESC LIMIT 51",
  );
  const result = page(rows);
  return json(
    candidates
      ? {
          ...result,
          expenses: result.expenses.map((e) => ({
            ...e,
            available_minor: (
              BigInt(e.personal_spending_minor) +
              (e.id === source.reimbursement_expense_id
                ? BigInt(source.amount_minor!)
                : 0n)
            ).toString(),
          })),
        }
      : result,
  );
}
type Sum = { spending: bigint; income: bigint; pending: bigint };
const sum = (): Sum => ({ spending: 0n, income: 0n, pending: 0n });
function add(total: Sum, row: AggregateRow) {
  total.spending += BigInt(row.personal_spending_minor);
  total.pending += BigInt(row.pending_reimbursement_minor);
  if (row.direction === "income" && !isReimbursement(row))
    total.income += BigInt(row.original_minor);
}
async function* scan(env: Env, where: string, values: (string | number)[]) {
  let last = "";
  while (true) {
    const rows = await readAggregateRows(
      env,
      `${where} AND e.review_reason IS NULL AND e.id>?`,
      [...values, last],
      "ORDER BY e.id LIMIT 1000",
    );
    for (const row of rows) yield row;
    if (rows.length < 1000) return;
    last = rows[rows.length - 1].id;
  }
}
async function totals(url: URL, env: Env) {
  const f = filters(url),
    currencies = new Map<string, Sum>();
  for await (const e of scan(env, f.where, f.values)) {
    const total = currencies.get(e.currency!) ?? sum();
    add(total, e);
    currencies.set(e.currency!, total);
  }
  return json(
    [...currencies].map(([currency, t]) => ({
      currency,
      amount_minor: t.spending.toString(),
      income_minor: t.income.toString(),
      net_minor: (t.income - t.spending).toString(),
      pending_reimbursement_minor: t.pending.toString(),
    })),
  );
}
async function insights(url: URL, env: Env, now: number) {
  const month = url.searchParams.get("month") ?? tashkentDay(now).slice(0, 7);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw Error("Invalid month");
  const [y, m] = month.split("-").map(Number);
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  // The exclusive endpoint of December 2099 is January 2100. Do not
  // round-trip it through the two-digit local entry-year parser.
  const start = (ym: string) =>
    new Date(`${ym}-01T00:00:00+05:00`).toISOString();
  type Bucket = Map<string, { minor: bigint; count: number }>;
  const currencies = new Map<
    string,
    Sum & { days: Bucket; categories: Bucket }
  >();
  for await (const e of scan(env, `e.dismissed=0 AND ${at}>=? AND ${at}<?`, [
    start(month),
    start(next),
  ])) {
    const c = currencies.get(e.currency!) ?? {
      ...sum(),
      days: new Map(),
      categories: new Map(),
    };
    add(c, e);
    currencies.set(e.currency!, c);
    if (e.direction !== "expense") continue;
    for (const [bucket, key] of [
      [c.days, tashkentDay(Date.parse(e.occurred_at!))],
      [c.categories, e.category ?? ""],
    ] as const) {
      const b = bucket.get(key) ?? { minor: 0n, count: 0 };
      b.minor += BigInt(e.personal_spending_minor);
      b.count++;
      bucket.set(key, b);
    }
  }
  const list = (bucket: Bucket, name: string) =>
    [...bucket].map(([key, b]) => ({
      [name]: key || null,
      spending_minor: b.minor.toString(),
      count: b.count,
    }));
  return json({
    month,
    currencies: [...currencies].map(([currency, c]) => ({
      currency,
      spending_minor: c.spending.toString(),
      income_minor: c.income.toString(),
      net_minor: (c.income - c.spending).toString(),
      pending_reimbursement_minor: c.pending.toString(),
      days: list(c.days, "date").sort((a, b) =>
        String(a.date).localeCompare(String(b.date)),
      ),
      categories: list(c.categories, "category").sort((a, b) => {
        const d =
          BigInt(String(b.spending_minor)) - BigInt(String(a.spending_minor));
        return d > 0n ? 1 : d < 0n ? -1 : 0;
      }),
    })),
  });
}
/** Called only after backend authentication and client-contract enforcement. */
export async function financialRead(
  request: Request,
  env: Env,
  now = Date.now(),
): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const url = new URL(request.url),
    path = url.pathname;
  try {
    if (path === "/api/totals") return await totals(url, env);
    if (path === "/api/insights") return await insights(url, env, now);
    if (path === "/api/expenses") {
      const f = filters(url),
        offset = url.searchParams.get("offset") ?? "0";
      if (!/^\d{1,7}$/.test(offset)) throw Error("Invalid offset");
      const rows = await readRows(
        env,
        f.where,
        [...f.values, Number(offset)],
        `ORDER BY ${at} DESC,e.id DESC LIMIT 51 OFFSET ?`,
      );
      return json({
        expenses: rows.slice(0, 50),
        nextOffset: rows.length > 50 ? Number(offset) + 50 : null,
      });
    }
    const match =
      /^\/api\/expenses\/([^/]+)(?:\/(reimbursement-candidates|reimbursements))?$/.exec(
        path,
      );
    if (!match || !isUuid(match[1])) return null;
    const id = match[1].toLowerCase();
    if (match[2])
      return await relationshipRead(
        url,
        env,
        id,
        match[2] === "reimbursement-candidates",
      );
    const rows = await readRows(
      env,
      "e.id=? AND e.dismissed=0",
      [id],
      "LIMIT 1",
    );
    return rows.length ? json(rows[0]) : json({ error: "Not found" }, 404);
  } catch (error) {
    // Only validation errors are client input; DB failures must reach the worker's 503 boundary.
    if (
      error instanceof Error &&
      /^Invalid (search|category|direction|date|range|cursor|month|offset)$/.test(
        error.message,
      )
    )
      return json({ error: error.message }, 400);
    if (error instanceof Error && error.message === "invalid_time")
      return json({ error: "Invalid date" }, 400);
    throw error;
  }
}
