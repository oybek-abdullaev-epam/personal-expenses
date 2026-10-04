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
import { financialRead, projectExpenses } from "./reporting";
import { manualDetails } from "./manual";
import { isUuid } from "./telegram-links";
import { getExpense, saveManual, sql } from "./store";
import {
  MutationError,
  reimbursementFields,
  updateExpense,
} from "./reimbursements";
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function transactionJson(env: Env, expense: Expense | null, status = 200) {
  return expense ? json((await projectExpenses(env, [expense]))[0], status) : json({ error: "Not found" }, 404);
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
  if (/^\/api\/(expenses(?:\/|$)|totals$|insights$)/.test(path) && request.headers.get("X-Tracker-Contract") !== "reimbursements-v1")
    return json({ error: "Refresh the tracker to continue.", code: "refresh_required" }, 409);
  const read = await financialRead(request, env, now);
  if (read) return read;
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
    if (!isUuid(body.id))
      return json({ error: "A valid request ID is required" }, 400);
    let details;
    try {
      details = manualDetails(body, now);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
    let result;
    try {
      result = await saveManual(
        env,
        body.id.toLowerCase(),
        details,
        now,
        body.parent_versions,
      );
    } catch (e) {
      if (e instanceof MutationError)
        return json({ error: e.message, code: e.code }, e.status);
      throw e;
    }
    if (result.conflict)
      return json(
        {
          error:
            "This request was already saved with different details. Refresh to review it.",
        },
        409,
      );
    return transactionJson(env, result.expense, result.created ? 201 : 200);
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
  const idPart = /^\/api\/expenses\/([^/]+)$/.exec(path)?.[1];
  const m = isUuid(idPart) ? [path, idPart.toLowerCase()] : null;
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
      const entries = Object.entries(details) as [
        string,
        string | number | null,
      ][];
      // Full replacement clears reimbursement metadata after a separate unlink.
      if (!("payer_name" in details))
        entries.push(["payer_name", ""], ["reimbursement_expense_id", null]);
      try {
        return transactionJson(
          env, await updateExpense(
            env,
            existing,
            entries,
            body.version as number,
            body.parent_versions,
            now,
          ),
        );
      } catch (e) {
        if (e instanceof MutationError)
          return json({ error: e.message, code: e.code }, e.status);
        throw e;
      }
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
    try {
      for (const [key, value] of Object.entries(reimbursementFields(body))) {
        fields.push(`${key}=?`);
        values.push(value);
      }
    } catch (e) {
      if (e instanceof MutationError)
        return json({ error: e.message, code: e.code }, e.status);
      throw e;
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
    // Convert validated partial fields into one conditional mutation. Literal
    // reset fields are represented as values too, so all paths use the same guards.
    let index = 0;
    const entries = fields.map((field): [string, string | number | null] => {
      const [key, value] = field.split("=");
      return [
        key,
        value === "?"
          ? values[index++]
          : value === "NULL"
            ? null
            : Number(value),
      ];
    });
    try {
      return transactionJson(
        env, await updateExpense(
          env,
          existing,
          entries,
          body.version as number,
          body.parent_versions,
          now,
        ),
      );
    } catch (e) {
      if (e instanceof MutationError)
        return json({ error: e.message, code: e.code }, e.status);
      throw e;
    }
  }
  return json({ error: "Not found" }, 404);
}
