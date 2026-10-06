import {
  category,
  Env,
  Expense,
  incomeCategory,
  localDateTime,
  money,
} from "./domain";
import {
  MutationError,
  parentVersionGuard,
  reimbursementFields,
  translateMutationError,
} from "./reimbursements";
import { getExpense, sql } from "./store";

// Manual entry is independent of email parsing and Telegram delivery.
export function manualDetails(body: Record<string, unknown>, now: number) {
  const {
    direction,
    merchant,
    currency,
    description,
    card_suffix,
    local_time,
  } = body;
  if (direction !== "expense" && direction !== "income")
    throw Error("Choose spending or income.");
  if (
    typeof merchant !== "string" ||
    !merchant.trim() ||
    merchant.trim().length > 250
  )
    throw Error("Enter a merchant or sender (up to 250 characters).");
  if (
    typeof currency !== "string" ||
    !["UZS", "USD", "EUR", "RUB"].includes(currency)
  )
    throw Error("Choose a supported currency.");
  const reimbursement =
    direction === "income" && body.income_category === "Reimbursement";
  const note = reimbursement && description === undefined ? "" : description;
  if (
    typeof note !== "string" ||
    (!reimbursement && !note.trim()) ||
    note.trim().length > 500
  )
    throw Error("Enter a description (up to 500 characters).");
  if (
    card_suffix !== undefined &&
    card_suffix !== null &&
    card_suffix !== "" &&
    (typeof card_suffix !== "string" || !/^\d{4}$/.test(card_suffix))
  )
    throw Error("Card suffix must be four digits or blank.");
  const chosen = direction === "income" ? body.income_category : body.category;
  if (!(direction === "income" ? incomeCategory(chosen) : category(chosen)))
    throw Error("Choose a category for this direction.");
  if (
    typeof body.amount !== "string" ||
    !/^\d+(?:\.\d{1,2})?$/.test(body.amount)
  )
    throw Error("Enter a positive amount with at most two decimal places.");
  const [whole, fraction = ""] = body.amount.split(".");
  let amount_minor: number;
  try {
    amount_minor = money(`${whole}.${fraction.padEnd(2, "0")}`);
  } catch {
    throw Error("Amount is outside the supported range.");
  }
  let occurred_at: string;
  try {
    if (typeof local_time !== "string") throw Error();
    occurred_at = localDateTime(local_time);
    if (Date.parse(occurred_at) > now) throw Error();
  } catch {
    throw Error(
      "Enter a valid Tashkent date and time that is not in the future.",
    );
  }
  const metadata = reimbursementFields(body);
  if (
    !reimbursement &&
    (metadata.payer_name || metadata.reimbursement_expense_id)
  )
    throw Error("Reimbursement details require the Reimbursement category.");
  const details = {
    direction,
    merchant: merchant.trim(),
    currency,
    description: (note as string).trim(),
    card_suffix: card_suffix || null,
    occurred_at,
    amount_minor,
    category: direction === "expense" ? (chosen as string) : null,
    income_category: direction === "income" ? (chosen as string) : null,
  };
  // Keep ordinary snapshots byte-for-byte compatible with pre-feature requests.
  return reimbursement
    ? {
        ...details,
        payer_name: metadata.payer_name ?? "",
        reimbursement_expense_id: metadata.reimbursement_expense_id ?? null,
      }
    : details;
}

export async function saveManual(
  env: Env,
  id: string,
  details: ReturnType<typeof manualDetails>,
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
