import { category, incomeCategory, localDateTime, money } from "./domain";
import { reimbursementFields } from "./reimbursements";

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
