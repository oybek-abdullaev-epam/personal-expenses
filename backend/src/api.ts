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
import { json } from "./http";
import { manualDetails, saveManual } from "./manual";
import { isUuid } from "./telegram-links";
import { getExpense, sql } from "./store";
import {
  MutationError,
  reimbursementFields,
  updateExpense,
} from "./reimbursements";
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
    const entries: [string, string | number | null][] = [];
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
      entries.push(["direction", direction]);
    }
    if ("income_category" in body) {
      if (
        direction !== "income" ||
        (body.income_category !== null && !incomeCategory(body.income_category))
      )
        return json({ error: "Invalid income category" }, 400);
      entries.push(["income_category", body.income_category as string | null]);
    }
    if ("category" in body) {
      if (
        body.category !== null &&
        (direction !== "expense" || !category(body.category))
      )
        return json({ error: "Invalid category" }, 400);
      entries.push(["category", body.category as string | null]);
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
      entries.push(["description", body.description.trim()]);
    }
    try {
      const metadata = reimbursementFields(body);
      const reimbursement =
        direction === "income" &&
        ("income_category" in body
          ? body.income_category
          : existing.income_category) === "Reimbursement";
      if (
        !reimbursement &&
        (metadata.payer_name || metadata.reimbursement_expense_id)
      )
        throw new MutationError(
          "Reimbursement details require the Reimbursement category.",
          400,
          "invalid_reimbursement",
        );
      // A name never outlives the Reimbursement category; linked rows are blocked by the trigger.
      if (!reimbursement && !("payer_name" in metadata) && existing.payer_name)
        metadata.payer_name = "";
      for (const entry of Object.entries(metadata))
        entries.push(entry as [string, string | null]);
    } catch (e) {
      if (e instanceof MutationError)
        return json({ error: e.message, code: e.code }, e.status);
      throw e;
    }
    if (body.dismiss === true && existing.review_reason) {
      entries.push(["dismissed", 1]);
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
        entries.push(
          ["merchant", r.merchant.trim()],
          ["card_suffix", r.card_suffix],
          ["currency", r.currency],
          ["amount_minor", money(r.amount)],
          ["occurred_at", localDateTime(r.local_time)],
          ["review_reason", null],
        );
      } catch {
        return json({ error: "Invalid review details" }, 400);
      }
    }
    if (!entries.length) return json({ error: "No changes supplied" }, 400);
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
