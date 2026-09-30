import {
  category,
  incomeCategory,
  NEEDS_DETAILS,
  Env,
  equalSecret,
  Expense,
  localDateTime,
  money,
  tashkentDay,
} from "./domain";
import { manualDetails } from "./manual";
import { getExpense, saveManual, sql } from "./store";
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function filters(url: URL) {
  const p = url.searchParams,
    parts = ["dismissed=0"],
    values: (string | number)[] = [];
  const q = p.get("q");
  if (q) {
    if (q.length > 200) throw Error("invalid_search");
    parts.push(
      "(merchant LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')",
    );
    const search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    values.push(search, search);
  }
  const c = p.get("category");
  if (c) {
    if (!category(c) && !incomeCategory(c)) throw Error("invalid_category");
    parts.push("COALESCE(income_category,category)=?");
    values.push(c);
  }
  const direction = p.get("direction");
  if (direction) {
    if (!["expense", "income"].includes(direction))
      throw Error("invalid_direction");
    parts.push("direction=?");
    values.push(direction);
  }
  if (p.get("needsDetails") === "true") parts.push(NEEDS_DETAILS);
  for (const [key, op] of [
    ["from", ">="],
    ["to", "<"],
  ] as const) {
    const value = p.get(key);
    if (!value) continue;
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw Error("invalid_date");
    const [y, m, d] = value.split("-");
    const iso = localDateTime(`${d}.${m}.${y.slice(2)} 00:00`);
    parts.push(
      `COALESCE(occurred_at,strftime('%Y-%m-%dT%H:%M:%fZ',received_at/1000.0,'unixepoch')) ${op} ?`,
    );
    values.push(
      key === "to" ? new Date(Date.parse(iso) + 86400000).toISOString() : iso,
    );
  }
  if (p.get("from") && p.get("to") && p.get("from")! > p.get("to")!)
    throw Error("invalid_range");
  return { where: parts.join(" AND "), values };
}
export async function api(
  request: Request,
  env: Env,
  now = Date.now(),
): Promise<Response> {
  if (
    !(await equalSecret(
      request.headers.get("Authorization"),
      env.BACKEND_TOKEN ? `Bearer ${env.BACKEND_TOKEN}` : undefined,
    ))
  )
    return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/api/expenses" && request.method === "POST") {
    let body: Record<string, unknown>;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 8000)
        return json({ error: "Request too large" }, 413);
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    if (
      typeof body.id !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        body.id,
      )
    )
      return json({ error: "A valid request ID is required" }, 400);
    let details;
    try {
      details = manualDetails(body, now);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
    const result = await saveManual(env, body.id, details, now);
    if (result.conflict)
      return json(
        {
          error:
            "This request was already saved with different details. Refresh to review it.",
        },
        409,
      );
    return json(result.expense, result.created ? 201 : 200);
  }
  if (path === "/api/activate" && request.method === "POST") {
    await sql(
      env,
      "INSERT OR IGNORE INTO sync_state (id,activated_at,cursor_at) VALUES (1,?,?)",
      now,
      now,
    ).run();
    return json(
      await sql(env, "SELECT activated_at FROM sync_state WHERE id=1").first(),
    );
  }
  if (path === "/api/health" && request.method === "GET") {
    const state = await sql(
      env,
      "SELECT activated_at,last_success,error FROM sync_state WHERE id=1",
    ).first();
    const outbox = await sql(
      env,
      "SELECT COUNT(*) AS pending,SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS failed FROM outbox WHERE sent_at IS NULL",
    ).first();
    return json({ sync: state, notifications: outbox });
  }
  if (path === "/api/insights" && request.method === "GET") {
    const month = url.searchParams.get("month") ?? tashkentDay(now).slice(0, 7);
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
      return json({ error: "Invalid month" }, 400);
    const [y, m] = month.split("-").map(Number);
    const next =
      m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const start = (ym: string) =>
      localDateTime(`01.${ym.slice(5)}.${ym.slice(2, 4)} 00:00`);
    const at =
      "COALESCE(occurred_at,strftime('%Y-%m-%dT%H:%M:%fZ',received_at/1000.0,'unixepoch'))";
    type Sums = { minor: bigint; count: number };
    const currencies: Record<
      string,
      {
        expense: bigint;
        income: bigint;
        days: Record<string, Sums>;
        categories: Record<string, Sums>;
      }
    > = {};
    let last = "";
    while (true) {
      const rows = await sql(
        env,
        `SELECT id,amount_minor,currency,direction,category,${at} AS at FROM expenses WHERE dismissed=0 AND review_reason IS NULL AND ${at}>=? AND ${at}<? AND id>? ORDER BY id LIMIT 1000`,
        start(month),
        start(next),
        last,
      ).all<
        Pick<
          Expense,
          "id" | "amount_minor" | "currency" | "direction" | "category"
        > & {
          at: string;
        }
      >();
      for (const r of rows.results) {
        const c = (currencies[r.currency!] ??= {
          expense: 0n,
          income: 0n,
          days: {},
          categories: {},
        });
        const amount = BigInt(r.amount_minor!);
        c[r.direction] += amount;
        if (r.direction !== "expense") continue;
        // Days are Tashkent calendar days, not UTC.
        for (const [bucket, key] of [
          [c.days, tashkentDay(Date.parse(r.at))],
          [c.categories, r.category ?? ""],
        ] as const) {
          const sum = (bucket[key] ??= { minor: 0n, count: 0 });
          sum.minor += amount;
          sum.count++;
        }
      }
      if (rows.results.length < 1000) break;
      last = rows.results.at(-1)!.id;
    }
    const list = (bucket: Record<string, Sums>, name: string) =>
      Object.entries(bucket).map(([key, v]) => ({
        [name]: key || null,
        spending_minor: v.minor.toString(),
        count: v.count,
      }));
    return json({
      month,
      currencies: Object.entries(currencies).map(([currency, c]) => ({
        currency,
        spending_minor: c.expense.toString(),
        income_minor: c.income.toString(),
        net_minor: (c.income - c.expense).toString(),
        days: list(c.days, "date").sort((a, b) => (a.date! < b.date! ? -1 : 1)),
        categories: list(c.categories, "category").sort((a, b) => {
          const d = BigInt(b.spending_minor) - BigInt(a.spending_minor);
          return d > 0n ? 1 : d < 0n ? -1 : 0;
        }),
      })),
    });
  }
  if (
    (path === "/api/expenses" || path === "/api/totals") &&
    request.method === "GET"
  ) {
    let f;
    try {
      f = filters(url);
    } catch {
      return json({ error: "Invalid filters" }, 400);
    }
    if (path === "/api/totals") {
      const totals: Record<string, { expense: bigint; income: bigint }> = {};
      let last = "";
      while (true) {
        const rows = await sql(
          env,
          `SELECT id,amount_minor,currency,direction FROM expenses WHERE ${f.where} AND review_reason IS NULL AND id>? ORDER BY id LIMIT 1000`,
          ...f.values,
          last,
        ).all<
          Pick<Expense, "id" | "amount_minor" | "currency" | "direction">
        >();
        for (const r of rows.results) {
          const total = (totals[r.currency!] ??= { expense: 0n, income: 0n });
          total[r.direction] += BigInt(r.amount_minor!);
        }
        if (rows.results.length < 1000) break;
        last = rows.results.at(-1)!.id;
      }
      return json(
        Object.entries(totals).map(([currency, value]) => ({
          currency,
          amount_minor: value.expense.toString(),
          income_minor: value.income.toString(),
          net_minor: (value.income - value.expense).toString(),
        })),
      );
    }
    const raw = url.searchParams.get("offset") ?? "0";
    if (!/^\d{1,7}$/.test(raw)) return json({ error: "Invalid offset" }, 400);
    const rows = await sql(
      env,
      `SELECT * FROM expenses WHERE ${f.where} ORDER BY COALESCE(occurred_at,strftime('%Y-%m-%dT%H:%M:%fZ',received_at/1000.0,'unixepoch')) DESC,id DESC LIMIT 51 OFFSET ?`,
      ...f.values,
      Number(raw),
    ).all<Expense>();
    return json({
      expenses: rows.results.slice(0, 50),
      nextOffset: rows.results.length > 50 ? Number(raw) + 50 : null,
    });
  }
  const m = /^\/api\/expenses\/([a-f0-9-]{36})$/.exec(path);
  if (m && request.method === "PATCH") {
    const existing = await getExpense(env, m[1]);
    if (!existing) return json({ error: "Not found" }, 404);
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "Invalid body" }, 400);
    if (!Number.isInteger(body.version))
      return json({ error: "A version is required" }, 400);
    if (existing.source === "manual") {
      let details;
      try {
        details = manualDetails(body, now);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      const entries = Object.entries(details);
      const result = await sql(
        env,
        `UPDATE expenses SET ${entries.map(([key]) => key + "=?").join(",")},version=version+1 WHERE id=? AND version=?`,
        ...entries.map(([, value]) => value as string | number | null),
        existing.id,
        body.version as number,
      ).run();
      if (!result.meta.changes)
        return json(
          { error: "This transaction changed. Refresh and try again." },
          409,
        );
      return json(await getExpense(env, existing.id));
    }
    const fields: string[] = [],
      values: (string | number | null)[] = [];
    let direction = existing.direction;
    if (body.resolve && existing.review_reason) {
      const requested = (body.resolve as Record<string, unknown>).direction;
      if (
        requested !== undefined &&
        requested !== "expense" &&
        requested !== "income"
      )
        return json({ error: "Invalid direction" }, 400);
      direction = requested === "income" ? "income" : "expense";
      fields.push("direction=?");
      values.push(direction);
    }
    if ("income_category" in body) {
      if (
        direction !== "income" ||
        (body.income_category !== null && !incomeCategory(body.income_category))
      )
        return json({ error: "Invalid income category" }, 400);
      fields.push("income_category=?");
      values.push(body.income_category as string | null);
    }
    if ("category" in body) {
      if (
        body.category !== null &&
        (direction !== "expense" || !category(body.category))
      )
        return json({ error: "Invalid category" }, 400);
      fields.push("category=?");
      values.push(body.category as string | null);
    }
    if ("description" in body) {
      if (
        typeof body.description !== "string" ||
        body.description.trim().length > 500
      )
        return json(
          { error: "Description must be at most 500 characters" },
          400,
        );
      fields.push("description=?");
      values.push(body.description.trim());
    }
    if (body.dismiss === true && existing.review_reason) {
      fields.push("dismissed=1");
    }
    if (body.resolve && existing.review_reason) {
      try {
        const r = body.resolve as Record<string, string>;
        if (
          typeof r.merchant !== "string" ||
          !r.merchant.trim() ||
          r.merchant.length > 250 ||
          !/^\d{4}$/.test(r.card_suffix) ||
          !["UZS", "USD", "EUR", "RUB"].includes(r.currency)
        )
          throw Error();
        fields.push(
          "merchant=?",
          "card_suffix=?",
          "currency=?",
          "amount_minor=?",
          "occurred_at=?",
          "review_reason=NULL",
        );
        values.push(
          r.merchant.trim(),
          r.card_suffix,
          r.currency,
          money(r.amount),
          localDateTime(r.local_time),
        );
      } catch {
        return json({ error: "Invalid review details" }, 400);
      }
    }
    if (!fields.length) return json({ error: "No changes supplied" }, 400);
    const result = await sql(
      env,
      `UPDATE expenses SET ${fields.join(",")},version=version+1 WHERE id=? AND version=?`,
      ...values,
      m[1],
      body.version as number,
    ).run();
    if (!result.meta.changes)
      return json(
        { error: "This expense changed. Refresh and try again." },
        409,
      );
    return json(await getExpense(env, m[1]));
  }
  return json({ error: "Not found" }, 404);
}
