// Synthetic local preview only. Never imported into either deployed Worker.
import { createServer } from "node:http";
import { setup, message, now, fixture } from "../tests/helpers";
import { parseEmail } from "../backend/src/parser";
import { saveMessage, sql } from "../backend/src/store";
import { api } from "../backend/src/api";
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
    res.end(await response.text());
  } catch {
    res.writeHead(500);
    res.end("Preview failed");
  }
}).listen(8788, "127.0.0.1", () =>
  console.log("Synthetic preview: http://127.0.0.1:8788"),
);
