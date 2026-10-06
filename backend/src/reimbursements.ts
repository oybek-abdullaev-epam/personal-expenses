import { Env, Expense, needsDetailsSql } from "./domain";
import { isUuid } from "./telegram-links";
import { getExpense, sql } from "./store";

export class MutationError extends Error {
  constructor(
    message: string,
    public status = 409,
    public code = "reimbursement_conflict",
  ) {
    super(message);
  }
}
export function reimbursementFields(body: Record<string, unknown>) {
  const fields: {
    payer_name?: string;
    reimbursement_expense_id?: string | null;
  } = {};
  if ("payer_name" in body) {
    if (
      typeof body.payer_name !== "string" ||
      [...body.payer_name.trim()].length > 100
    )
      throw new MutationError(
        "From must be at most 100 characters.",
        400,
        "invalid_payer",
      );
    fields.payer_name = body.payer_name.trim();
  }
  if ("reimbursement_expense_id" in body) {
    if (
      body.reimbursement_expense_id !== null &&
      !isUuid(body.reimbursement_expense_id)
    )
      throw new MutationError(
        "Choose a valid expense or remove the link.",
        400,
        "invalid_parent",
      );
    fields.reimbursement_expense_id =
      typeof body.reimbursement_expense_id === "string"
        ? body.reimbursement_expense_id.toLowerCase()
        : null;
  }
  return fields;
}
export async function parentVersionGuard(
  env: Env,
  parents: (string | null | undefined)[],
  value: unknown,
) {
  const ids = [...new Set(parents.filter((id): id is string => !!id))];
  const versions = value as Record<string, unknown> | undefined;
  const values: (string | number)[] = [];
  const clauses: string[] = [];
  for (const id of ids) {
    if (
      !versions ||
      typeof versions !== "object" ||
      Array.isArray(versions) ||
      !Number.isSafeInteger(versions[id]) ||
      Number(versions[id]) < 0
    )
      throw new MutationError(
        "A current version is required for each linked expense.",
        400,
        "parent_version_required",
      );
    if (!(await getExpense(env, id)))
      throw new MutationError(
        "Linked expense not found.",
        404,
        "parent_not_found",
      );
    clauses.push(
      "EXISTS (SELECT 1 FROM expenses parent WHERE parent.id=? AND parent.version=?)",
    );
    values.push(id, versions[id] as number);
  }
  return { where: clauses.length ? clauses.join(" AND ") : "1", values };
}

// Place immediately after the successful UPDATE in the same batch. changes()
// refers to that conditional source update, excluding version changes in triggers.
export function reimbursementReceiptStatement(
  env: Env,
  id: string,
  now: number,
) {
  return sql(
    env,
    `INSERT INTO outbox (id,expense_id,kind,payload,available_at)
    SELECT 'receipt:'||e.id,e.id,'receipt','{}',? FROM expenses e
    WHERE e.id=? AND changes()>0 AND e.source='email' AND e.dismissed=0
      AND e.direction='income' AND e.income_category='Reimbursement' AND NOT ${needsDetailsSql("e")}
      AND NOT EXISTS (SELECT 1 FROM telegram_messages m WHERE m.expense_id=e.id AND m.kind='receipt')
    ON CONFLICT(id) DO UPDATE SET sent_at=NULL,available_at=excluded.available_at,error=NULL,lease_until=0,lease_token=NULL
    WHERE outbox.sent_at IS NOT NULL`,
    now,
    id,
  );
}
export function translateMutationError(error: unknown): never {
  if ((error as Error).message?.includes("reimbursement_conflict"))
    throw new MutationError(
      "This change would invalidate a reimbursement. Review the expense or unlink first.",
    );
  throw error;
}
export async function updateExpense(
  env: Env,
  existing: Expense,
  entries: [string, string | number | null][],
  version: number,
  parentVersions: unknown,
  now: number,
) {
  const nextLink = entries.find(([key]) => key === "reimbursement_expense_id");
  const guard = await parentVersionGuard(
    env,
    [
      existing.reimbursement_expense_id,
      nextLink
        ? (nextLink[1] as string | null)
        : existing.reimbursement_expense_id,
    ],
    parentVersions,
  );
  try {
    const result = await env.DB.batch([
      sql(
        env,
        `UPDATE expenses SET ${entries.map(([key]) => `${key}=?`).join(",")},version=version+1 WHERE id=? AND version=? AND ${guard.where}`,
        ...entries.map(([, value]) => value),
        existing.id,
        version,
        ...guard.values,
      ),
      reimbursementReceiptStatement(env, existing.id, now),
    ]);
    if (!result[0].meta.changes)
      throw new MutationError(
        "This transaction or its linked expense changed. Refresh and try again.",
        409,
        "version_conflict",
      );
  } catch (e) {
    const financial = [
      "amount_minor",
      "currency",
      "occurred_at",
      "direction",
      "income_category",
      "category",
    ];
    if (
      (e as Error).message?.includes("reimbursement_conflict") &&
      existing.reimbursement_expense_id &&
      nextLink &&
      nextLink[1] !== existing.reimbursement_expense_id &&
      entries.some(
        ([key, value]) =>
          financial.includes(key) &&
          value !== (existing as unknown as Record<string, unknown>)[key],
      )
    )
      throw new MutationError(
        "Save the unlink or new link on its own before changing the amount, currency, date or category.",
        409,
        "unlink_first",
      );
    translateMutationError(e);
  }
  return getExpense(env, existing.id);
}
