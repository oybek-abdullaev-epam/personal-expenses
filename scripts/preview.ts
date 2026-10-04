// Synthetic local preview only. Never imported into either deployed Worker.
import { createServer } from "node:http";
import { setup, message, now, fixture } from "../tests/helpers";
import { parseEmail } from "../backend/src/parser";
import { getExpense, saveManual, saveMessage, sql } from "../backend/src/store";
import { api } from "../backend/src/api";
import { manualDetails } from "../backend/src/manual";
import site from "../website/dist/server/index.js";
const { env } = setup();
const samples = [
  ["CITY TAXI", "30500.00", "Transport", "Ride home"],
  ["CORNER CAFE", "62000.00", "Food", "Lunch"],
  ["LOCAL MARKET", "184500.00", null, ""],
  ["BOOK SHOP", "95000.00", "Shopping", ""],
];
for (const [
  i,
  [merchant, amount, category, description],
] of samples.entries()) {
  const m = message(
    "synthetic-" + i,
    fixture
      .replaceAll("SAMPLE TAXI", merchant!)
      .replaceAll("30500.00", amount!)
      .replaceAll("19:44", `1${9 - i}:44`),
  );
  await saveMessage(env, m, parseEmail(m), now);
  await sql(
    env,
    "UPDATE expenses SET category=?,description=? WHERE source_message_id=?",
    category,
    description,
    m.id,
  ).run();
}
for (const [id, amount, incomeCategory] of [
  ["salary", "5000000.00", "Salary"],
  ["repayment", "31000.00", "Reimbursement"],
]) {
  const income = message(
    "synthetic-" + id,
    fixture
      .replaceAll("E-Com oplata", "Perevod na kartu")
      .replaceAll("SAMPLE TAXI", "SAMPLE INCOME")
      .replaceAll("30500.00", amount),
  );
  await saveMessage(env, income, parseEmail(income), now);
  await sql(
    env,
    "UPDATE expenses SET income_category=?,description=? WHERE source_message_id=?",
    incomeCategory,
    "Synthetic " + id,
    income.id,
  ).run();
}
// Spread synthetic spending across the month so the month view has shape.
const spread: [string, string, string, string][] = [
  ["09", "SAMPLE BAKERY", "18000.00", "Food"],
  ["10", "SAMPLE MARKET", "212000.00", "Groceries"],
  ["12", "SAMPLE TAXI", "24000.00", "Transport"],
  ["13", "SAMPLE CINEMA", "90000.00", "Entertainment"],
  ["15", "SAMPLE POWER", "310000.00", "Bills"],
  ["16", "SAMPLE TAXI", "36000.00", "Transport"],
  ["18", "SAMPLE PHARMACY", "54000.00", "Health"],
  ["19", "SAMPLE MARKET", "148500.00", "Groceries"],
  ["20", "SAMPLE DINER", "126000.00", "Food"],
  ["24", "SAMPLE STORE", "420000.00", "Shopping"],
  ["26", "SAMPLE MARKET", "96000.00", "Groceries"],
  ["27", "SAMPLE CAFE", "47000.00", "Food"],
  ["28", "SAMPLE TAXI", "22000.00", "Transport"],
  ["29", "SAMPLE KIOSK", "12000.00", ""],
];
for (const [day, merchant, amount, category] of spread) {
  const m = message(
    "synthetic-spread-" + day,
    fixture
      .replaceAll("SAMPLE TAXI", merchant)
      .replaceAll("22.09.26", day + ".09.26")
      .replaceAll("30500.00", amount),
  );
  await saveMessage(env, m, parseEmail(m), now);
  await sql(
    env,
    "UPDATE expenses SET category=?,description=? WHERE source_message_id=?",
    category || null,
    category ? "Synthetic purchase" : "",
    m.id,
  ).run();
}
// A non-UZS, non-round amount shows the currency tag and kept cents.
const usd = message(
  "synthetic-usd",
  fixture
    .replaceAll("SAMPLE TAXI", "SAMPLE APP STORE")
    .replaceAll("22.09.26", "21.09.26")
    .replaceAll("30500.00 UZS", "12.99 USD"),
);
await saveMessage(env, usd, parseEmail(usd), now);
await sql(
  env,
  "UPDATE expenses SET category=?,description=? WHERE source_message_id=?",
  "Entertainment",
  "Synthetic subscription",
  usd.id,
).run();
const m = message("synthetic-review", "Unsupported synthetic message");
await saveMessage(env, m, parseEmail(m), now);
await sql(
  env,
  "INSERT INTO sync_state (id,activated_at,cursor_at,last_success) VALUES (1,?,?,?)",
  Date.parse("2026-09-08T00:00:00+05:00"),
  now,
  now,
).run();
// Stable IDs make the dinner and zero-cost scenarios addressable through the
// existing read-only ?transaction= selector. All people and transactions are fake.
export const previewReimbursementIds = {
  dinner: "10000000-0000-4000-8000-000000000001",
  olderDinner: "10000000-0000-4000-8000-000000000002",
  zeroCost: "10000000-0000-4000-8000-000000000003",
  ali: "20000000-0000-4000-8000-000000000001",
  sara: "20000000-0000-4000-8000-000000000002",
  pending: "20000000-0000-4000-8000-000000000003",
  fullRepayment: "20000000-0000-4000-8000-000000000004",
};
const previewNow = Date.now();
for (const [id, merchant, amount, local_time, description] of [
  [
    previewReimbursementIds.dinner,
    "SYNTHETIC DINNER",
    "300000.00",
    "20.09.26 19:00",
    "Dinner for three",
  ],
  [
    previewReimbursementIds.olderDinner,
    "SYNTHETIC DINNER",
    "400000.00",
    "15.09.26 19:00",
    "Older dinner — search distinguishes this payment",
  ],
  [
    previewReimbursementIds.zeroCost,
    "SYNTHETIC SHARED TICKETS",
    "90000.00",
    "21.09.26 18:00",
    "Fully repaid; keep this expense visible at zero",
  ],
]) {
  await saveManual(
    env,
    id,
    manualDetails(
      {
        merchant,
        amount,
        local_time,
        description,
        currency: "UZS",
        card_suffix: "",
        direction: "expense",
        category: "Food",
      },
      previewNow,
    ),
    previewNow,
  );
}
for (const [id, payer_name, amount, parentId, description] of [
  [
    previewReimbursementIds.ali,
    "Ali (synthetic)",
    "100000.00",
    previewReimbursementIds.dinner,
    "",
  ],
  [
    previewReimbursementIds.sara,
    "Sara (synthetic)",
    "100000.00",
    previewReimbursementIds.dinner,
    "Dinner share",
  ],
  [
    previewReimbursementIds.pending,
    "",
    "100000.00",
    null,
    "Pending: enter From and choose an expense",
  ],
  [
    previewReimbursementIds.fullRepayment,
    "<Synthetic payer>",
    "90000.00",
    previewReimbursementIds.zeroCost,
    "<b>This note is plain text</b>",
  ],
] as const) {
  const target = parentId ? await getExpense(env, parentId) : null;
  await saveManual(
    env,
    id,
    manualDetails(
      {
        merchant: "SYNTHETIC CASH REPAYMENT",
        amount,
        local_time: "02.10.26 19:00",
        description,
        currency: "UZS",
        card_suffix: "",
        direction: "income",
        income_category: "Reimbursement",
        payer_name,
        reimbursement_expense_id: parentId,
      },
      previewNow,
    ),
    previewNow,
    target ? { [target.id]: target.version } : undefined,
  );
}
globalThis.fetch = async (input, init) => {
  const r = new Request(input, init);
  if (new URL(r.url).hostname !== "backend.example")
    throw Error("Network is disabled in preview");
  return api(r, env);
};
createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = new Headers(req.headers as Record<string, string>);
    const request = new Request("http://127.0.0.1:8788" + req.url, {
      method: req.method,
      headers,
      body: body.length ? body : undefined,
    });
    const response = await site.fetch(request, {
      BACKEND_URL: "https://backend.example",
      BACKEND_TOKEN: env.BACKEND_TOKEN,
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    let html = await response.text();
    if (response.headers.get("content-type")?.includes("text/html")) {
      // Local visual checks only; never enters the deployed website artifact.
      const theme = process.env.PREVIEW_THEME;
      if (theme === "light" || theme === "dark")
        html = html.replace("<html", `<html data-telegram-theme="${theme}"`);
      if (process.env.PREVIEW_NO_SDK === "1")
        html = html.replace(
          /<script\s+id="telegram-sdk"[\s\S]*?<\/script>/,
          "",
        );
    }
    res.end(html);
  } catch {
    res.writeHead(500);
    res.end("Preview failed");
  }
}).listen(8788, "127.0.0.1", () =>
  console.log("Synthetic preview: http://127.0.0.1:8788"),
);
