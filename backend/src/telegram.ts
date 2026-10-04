import {
  CATEGORIES,
  INCOME_CATEGORIES,
  NEEDS_DETAILS,
  Env,
  Expense,
  IntegrationError,
  formatMoney,
  tashkentDay,
  complete,
  isReimbursement,
} from "./domain";
import { getExpense, sql, lock } from "./store";
import { trackerButton, transactionButton } from "./telegram-links";
import { projectExpenses } from "./reporting";
interface Outbox {
  id: string;
  expense_id: string | null;
  kind: string;
  payload: string;
  attempts: number;
}
async function telegram(
  env: Env,
  method: string,
  body: object,
): Promise<{ message_id: number }> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw new IntegrationError("telegram_unavailable");
  }
  const result = (await response.json()) as {
    ok: boolean;
    result: { message_id: number };
    parameters?: { retry_after?: number };
    description?: string;
  };
  if (method === "deleteMessage" && response.status === 400) {
    if (result.description === "Bad Request: message to delete not found")
      return { message_id: 0 }; // A prior attempt (or the owner) already removed it.
    if (result.description === "Bad Request: message can't be deleted")
      throw new IntegrationError("telegram_message_not_deletable");
  }
  if (!response.ok || !result.ok)
    throw new IntegrationError(
      response.status === 401 || response.status === 403
        ? "telegram_configuration_required"
        : "telegram_unavailable",
      (result.parameters?.retry_after ?? 0) * 1000,
    );
  return result.result;
}
const DAILY_SPENDING = `dismissed=0 AND review_reason IS NULL AND direction='expense' AND occurred_at>=? AND occurred_at<=?`;
function dailyBounds(now: number) {
  return [
    new Date(`${tashkentDay(now)}T00:00:00+05:00`).toISOString(),
    new Date(now).toISOString(),
  ] as const;
}
export async function reminder(env: Env, now: number) {
  if (new Date(now + 18000000).getUTCHours() !== 21) return;
  await sql(
    env,
    `INSERT OR IGNORE INTO outbox (id,kind,available_at) SELECT ?,'reminder',? WHERE EXISTS (SELECT 1 FROM expenses WHERE dismissed=0 AND ${NEEDS_DETAILS}) OR EXISTS (SELECT 1 FROM expenses WHERE ${DAILY_SPENDING})`,
    `reminder:${tashkentDay(now)}`,
    now,
    ...dailyBounds(now),
  ).run();
}
async function dailySummary(env: Env, now: number) {
  const count = await sql(
    env,
    `SELECT COUNT(*) AS n FROM expenses WHERE dismissed=0 AND ${NEEDS_DETAILS}`,
  ).first<{ n: number }>();
  const totals = new Map<string, { amount: bigint; count: number }>();
  let last = "";
  // Sum individual safe-integer amounts with BigInt, avoiding rounded or overflowing aggregates.
  while (true) {
    const rows = await sql(
      env,
      `SELECT * FROM expenses WHERE ${DAILY_SPENDING} AND id>? ORDER BY id LIMIT 1000`,
      ...dailyBounds(now),
      last,
    ).all<Expense>();
    for (const row of await projectExpenses(env, rows.results)) {
      const total = totals.get(row.currency!) ?? { amount: 0n, count: 0 };
      total.amount += BigInt(row.personal_spending_minor);
      total.count++;
      totals.set(row.currency!, total);
    }
    if (rows.results.length < 1000) break;
    last = rows.results.at(-1)!.id;
  }
  if (!totals.size && !count?.n) return "";
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "long",
  }).format(new Date(now));
  const lines = [`Today’s spending so far · ${date}`];
  for (const [currency, total] of [...totals].sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    lines.push(
      `${formatMoney(total.amount.toString(), currency)} · ${total.count} expense${total.count === 1 ? "" : "s"}`,
    );
  if (!totals.size) lines.push("No spending recorded today.");
  if (count?.n)
    lines.push(
      `\n${count.n} transaction${count.n === 1 ? " still needs" : "s still need"} details.`,
    );
  lines.push(`\nOpen dashboard: ${env.SITE_URL}`);
  return lines.join("\n");
}
function summary(e: Expense) {
  return `${e.direction === "income" ? "Income received" : "Expense"} · ${e.merchant}\n${formatMoney(e.amount_minor!, e.currency!)} · card ••${e.card_suffix}\n${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", dateStyle: "medium", timeStyle: "short" }).format(new Date(e.occurred_at!))} (Tashkent)`;
}
// Retain associations even after deletion, so retries and stale updates are safe.
async function queueCleanup(env: Env, now: number) {
  await sql(
    env,
    `INSERT OR IGNORE INTO outbox (id,expense_id,kind,payload,available_at)
     SELECT 'delete:'||m.message_id,m.expense_id,'delete',json_object('message_id',m.message_id),?
     FROM telegram_messages m JOIN expenses e ON e.id=m.expense_id
     WHERE m.cleanup_status IS NULL AND e.dismissed=0 AND NOT ${NEEDS_DETAILS}
       AND ((m.kind IN ('expense','prompt','description') AND EXISTS (
         SELECT 1 FROM telegram_messages r WHERE r.expense_id=m.expense_id AND r.kind='receipt'))
       OR (m.kind='receipt' AND (m.created_at<=? OR m.message_id NOT IN (
         SELECT message_id FROM telegram_messages WHERE kind='receipt' ORDER BY message_id DESC LIMIT 3))))`,
    now,
    now - 47 * 3600000,
  ).run();
}

export async function deliver(env: Env, now = Date.now()) {
  await queueCleanup(env, now);
  await drain(env, now);
  // New receipts are durably recorded before any prompts or replies are removed.
  await queueCleanup(env, now);
  await drain(env, now, true);
}

async function drain(env: Env, now: number, cleanupOnly = false) {
  const started = Date.now();
  const rows = await sql(
    env,
    `SELECT * FROM outbox WHERE sent_at IS NULL AND available_at<=? AND lease_until<=?
     ${cleanupOnly ? "AND kind='delete'" : ""} ORDER BY available_at LIMIT 15`,
    now,
    now,
  ).all<Outbox>();
  for (const row of rows.results) {
    const current = now + (Date.now() - started);
    const lease = crypto.randomUUID();
    const claimed = await sql(
      env,
      "UPDATE outbox SET lease_until=?,lease_token=? WHERE id=? AND sent_at IS NULL AND lease_until<=? AND available_at<=?",
      current + 60000,
      lease,
      row.id,
      current,
      current,
    ).run();
    if (!claimed.meta.changes) continue;
    let receiptLease: string | null = null;
    try {
      let e = row.expense_id ? await getExpense(env, row.expense_id) : null;
      if (row.kind === "delete") {
        const messageId = JSON.parse(row.payload).message_id;
        // Re-check completion: website edits may have reopened this transaction.
        if (e && complete(e)) {
          await telegram(env, "deleteMessage", {
            chat_id: env.TELEGRAM_OWNER_ID,
            message_id: messageId,
          });
          await env.DB.batch([
            sql(
              env,
              "UPDATE telegram_messages SET cleanup_status='deleted' WHERE message_id=?",
              messageId,
            ),
            sql(
              env,
              "UPDATE outbox SET sent_at=?,error=NULL,lease_until=0 WHERE id=? AND lease_token=?",
              now,
              row.id,
              lease,
            ),
          ]);
        } else {
          await sql(
            env,
            "UPDATE outbox SET available_at=?,lease_until=0 WHERE id=? AND lease_token=?",
            now + 300000,
            row.id,
            lease,
          ).run();
        }
        continue;
      }
      let text = "",
        markup: object | undefined;
      const isReceipt =
        row.kind === "receipt" || row.kind === "description_saved";
      // Legacy and current receipt intents share one transaction-level send lease.
      // Durable message associations, not outbox sent_at, prove actual delivery.
      if (isReceipt && e) {
        receiptLease = await lock(env, `receipt:${e.id}`, current, 60000);
        if (!receiptLease) {
          await sql(
            env,
            "UPDATE outbox SET available_at=?,lease_until=0 WHERE id=? AND lease_token=?",
            current + 1000,
            row.id,
            lease,
          ).run();
          continue;
        }
        e = await getExpense(env, e.id);
      }
      // Coalescing legacy receipt jobs must still retain the owner's reply for cleanup.
      if (row.kind === "description_saved" && e?.source === "email") {
        const replyId = JSON.parse(row.payload).message_id;
        if (Number.isSafeInteger(replyId) && replyId > 0)
          await sql(
            env,
            "INSERT OR IGNORE INTO telegram_messages (message_id,expense_id,kind,created_at) VALUES (?,?,'description',?)",
            replyId,
            e.id,
            now,
          ).run();
      }
      const alreadyDelivered =
        isReceipt &&
        e &&
        (await sql(
          env,
          "SELECT 1 FROM telegram_messages WHERE expense_id=? AND kind='receipt' LIMIT 1",
          e.id,
        ).first());
      if (
        isReceipt &&
        !alreadyDelivered &&
        e?.source === "email" &&
        !e.dismissed &&
        !complete(e)
      ) {
        // Completion may race this read. Keep the intent live, so a stale
        // incomplete snapshot cannot consume a concurrently completed receipt.
        await sql(
          env,
          "UPDATE outbox SET available_at=?,lease_until=0 WHERE id=? AND lease_token=?",
          current + 300000,
          row.id,
          lease,
        ).run();
        continue;
      }

      const appButton = trackerButton(env.TELEGRAM_APP_URL);
      const recordButton = e
        ? transactionButton(env.TELEGRAM_APP_URL, e.id)
        : null;
      if (e?.source === "manual" || alreadyDelivered) {
        // Manual entries never get per-transaction messages; corrections never replace a receipt.
      } else if (
        (row.kind === "expense" || row.kind === "prompt") &&
        e &&
        isReimbursement(e) &&
        !e.review_reason &&
        !e.dismissed
      ) {
        if (!complete(e)) {
          text = `${summary(e)}\n\nAdd who repaid you and link this reimbursement to an expense.\nOpen dashboard: ${env.SITE_URL}?transaction=${e.id}`;
          markup = {
            inline_keyboard: [
              [
                recordButton
                  ? { ...recordButton, text: "Link to expense" }
                  : {
                      text: "Link to expense",
                      url: `${env.SITE_URL}?transaction=${e.id}`,
                    },
              ],
            ],
          };
        }
      } else if (row.kind === "expense" && e && !e.dismissed) {
        text = `${summary(e)}\n\nChoose a category.`;
        const choices =
          e.direction === "income" ? INCOME_CATEGORIES : CATEGORIES;
        markup = {
          inline_keyboard: [
            ...Array.from({ length: Math.ceil(choices.length / 2) }, (_, i) =>
              choices.slice(i * 2, i * 2 + 2).map((c, j) => ({
                text: c,
                callback_data: `${e.direction === "income" ? "inc" : "cat"}:${e.id}:${i * 2 + j}`,
              })),
            ),
            ...(recordButton ? [[recordButton]] : []),
          ],
        };
      } else if (row.kind === "prompt" && e && !complete(e) && !e.dismissed) {
        text = `${summary(e)}\n\nReply to this message with a short description.`;
        markup = {
          force_reply: true,
          input_field_placeholder: "What was this transaction for?",
        };
      } else if (isReceipt && e && complete(e)) {
        const parent = e.reimbursement_expense_id
          ? await getExpense(env, e.reimbursement_expense_id)
          : null;
        const detail = isReimbursement(e)
          ? `Reimbursement from ${e.payer_name}\nFor ${parent?.merchant ?? "expense"} · ${parent?.occurred_at ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", dateStyle: "medium" }).format(new Date(parent.occurred_at)) : ""}${e.description ? `\n${e.description}` : ""}`
          : `${e.direction === "income" ? e.income_category : e.category} · ${e.description}`;
        text = `✓ Saved\n${summary(e)}\n\n${detail}\n\nOpen dashboard: ${env.SITE_URL}`;
        // A message accepts one markup type. Keep ForceReply on its prompt;
        // the standalone receipt uses an inline launch button when configured.
        markup = recordButton
          ? { inline_keyboard: [[recordButton]] }
          : { remove_keyboard: true };
      } else if (row.kind === "review" && e) {
        text = `An UZCARD email needs review (${e.review_reason}). It is excluded from spending totals.\n${env.SITE_URL}`;
        if (recordButton) markup = { inline_keyboard: [[recordButton]] };
      } else if (row.kind === "auth")
        text = `Gmail authorization needs attention. Reconnect Google to resume email sync.\n${env.SITE_URL}`;
      else if (row.kind === "reminder") {
        // Drop stale summaries after their local date; re-read totals and outstanding details on retries.
        if (row.id === `reminder:${tashkentDay(current)}`)
          text = await dailySummary(env, current);
        if (appButton) markup = { inline_keyboard: [[appButton]] };
      }
      if (text) {
        const sent = await telegram(env, "sendMessage", {
          chat_id: env.TELEGRAM_OWNER_ID,
          text,
          reply_markup: markup,
          link_preview_options: { is_disabled: true },
        });
        const statements = [
          sql(
            env,
            "UPDATE outbox SET sent_at=?,error=NULL,lease_until=0 WHERE id=? AND lease_token=?",
            now,
            row.id,
            lease,
          ),
        ];
        if (e && (row.kind === "expense" || row.kind === "prompt" || isReceipt))
          statements.unshift(
            sql(
              env,
              "INSERT OR IGNORE INTO telegram_messages (message_id,expense_id,kind,created_at) VALUES (?,?,?,?)",
              sent.message_id,
              e.id,
              isReceipt ? "receipt" : row.kind,
              now,
            ),
          );
        await env.DB.batch(statements);
      } else
        await sql(
          env,
          "UPDATE outbox SET sent_at=?,lease_until=0 WHERE id=? AND lease_token=?",
          now,
          row.id,
          lease,
        ).run();
    } catch (e) {
      const code =
        e instanceof IntegrationError ? e.code : "telegram_delivery_failed";
      if (row.kind === "delete" && code === "telegram_message_not_deletable") {
        await env.DB.batch([
          sql(
            env,
            "UPDATE telegram_messages SET cleanup_status='unavailable' WHERE message_id=?",
            JSON.parse(row.payload).message_id,
          ),
          sql(
            env,
            "UPDATE outbox SET sent_at=?,error=?,lease_until=0 WHERE id=? AND lease_token=?",
            now,
            code,
            row.id,
            lease,
          ),
        ]);
        continue;
      }
      const delay = Math.max(
        Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7)),
        e instanceof IntegrationError ? e.retryAfter : 0,
      );
      await sql(
        env,
        "UPDATE outbox SET attempts=attempts+1,available_at=?,lease_until=0,error=? WHERE id=? AND lease_token=?",
        current + delay,
        code,
        row.id,
        lease,
      ).run();
    } finally {
      if (receiptLease && row.expense_id)
        await sql(
          env,
          "DELETE FROM locks WHERE name=? AND token=?",
          `receipt:${row.expense_id}`,
          receiptLease,
        ).run();
    }
  }
}
interface TGMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number };
  text?: string;
  reply_to_message?: { message_id: number };
}
export interface Update {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: TGMessage;
  };
  message?: TGMessage;
}
export function ownerUpdate(env: Env, u: Update) {
  const message = u.callback_query?.message ?? u.message;
  const from = u.callback_query?.from?.id ?? u.message?.from?.id;
  return (
    message?.chat?.type === "private" &&
    String(message.chat.id) === env.TELEGRAM_OWNER_ID &&
    String(from) === env.TELEGRAM_OWNER_ID
  );
}
export async function handleUpdate(env: Env, u: Update, now = Date.now()) {
  if (!Number.isSafeInteger(u.update_id) || !ownerUpdate(env, u)) return;
  const q = u.callback_query;
  const mark = sql(
    env,
    "INSERT OR IGNORE INTO telegram_updates (id,processed_at) VALUES (?,?)",
    u.update_id,
    now,
  );
  const guard = "NOT EXISTS (SELECT 1 FROM telegram_updates WHERE id=?)";
  if (q?.message) {
    const m = /^(cat|inc):([a-f0-9-]{36}):([0-7])$/.exec(q.data ?? "");
    const association = await sql(
      env,
      "SELECT expense_id FROM telegram_messages WHERE message_id=? AND kind='expense' AND cleanup_status IS NULL AND NOT EXISTS (SELECT 1 FROM telegram_messages r WHERE r.expense_id=telegram_messages.expense_id AND r.kind='receipt')",
      q.message.message_id,
    ).first<{ expense_id: string }>();
    const item = association
      ? await getExpense(env, association.expense_id)
      : null;
    const choices =
      item?.direction === "income" ? INCOME_CATEGORIES : CATEGORIES;
    let valid = !!(
      m &&
      association?.expense_id === m[2] &&
      item &&
      !item.review_reason &&
      !item.dismissed &&
      !item.reimbursement_expense_id &&
      m[1] === (item.direction === "income" ? "inc" : "cat") &&
      choices[Number(m[3])]
    );
    if (valid && m) {
      const result = await env.DB.batch([
        sql(
          env,
          `UPDATE expenses SET ${item!.direction === "income" ? "income_category" : "category"}=?,version=version+1 WHERE id=? AND version=? AND reimbursement_expense_id IS NULL AND review_reason IS NULL AND dismissed=0 AND ${guard}`,
          choices[Number(m[3])],
          m[2],
          item!.version,
          u.update_id,
        ),
        sql(
          env,
          "INSERT OR IGNORE INTO telegram_updates (id,processed_at) SELECT ?,? WHERE changes()>0",
          u.update_id,
          now,
        ),
        sql(
          env,
          `INSERT INTO outbox (id,expense_id,kind,available_at)
           SELECT CASE WHEN NOT ${NEEDS_DETAILS} THEN 'receipt:'||id ELSE ? END,id,
           CASE WHEN NOT ${NEEDS_DETAILS} THEN 'receipt' ELSE 'prompt' END,? FROM expenses
           WHERE id=? AND changes()>0
           AND NOT EXISTS (SELECT 1 FROM telegram_messages tm WHERE tm.expense_id=expenses.id AND tm.kind='receipt')
           ON CONFLICT(id) DO UPDATE SET sent_at=NULL,available_at=excluded.available_at,error=NULL
           WHERE outbox.sent_at IS NOT NULL`,
          `prompt:${u.update_id}`,
          now,
          m[2],
        ),
      ]);
      valid = Boolean(result[0].meta.changes);
    } else await mark.run();
    // Callback acknowledgement is best-effort and must not roll back a saved selection.
    try {
      await telegram(env, "answerCallbackQuery", {
        callback_query_id: q.id,
        text: valid ? "Category saved" : "This button is no longer available",
      });
    } catch {}
  } else if (
    u.message?.reply_to_message &&
    u.message.text?.trim() &&
    u.message.text.trim().length <= 500
  ) {
    await env.DB.batch([
      sql(
        env,
        `UPDATE expenses SET description=?,version=version+1 WHERE id=(SELECT expense_id FROM telegram_messages WHERE message_id=? AND kind='prompt' AND cleanup_status IS NULL AND NOT EXISTS (SELECT 1 FROM telegram_messages r WHERE r.expense_id=telegram_messages.expense_id AND r.kind='receipt')) AND review_reason IS NULL AND dismissed=0 AND NOT (direction='income' AND COALESCE(income_category,'')='Reimbursement') AND ${guard}`,
        u.message.text.trim(),
        u.message.reply_to_message.message_id,
        u.update_id,
      ),
      // Retain the owner's reply ID, never a full Telegram message.
      sql(
        env,
        `INSERT OR IGNORE INTO telegram_messages (message_id,expense_id,kind,created_at)
         SELECT ?,e.id,'description',? FROM expenses e
         WHERE e.id=(SELECT expense_id FROM telegram_messages WHERE message_id=? AND kind='prompt' AND cleanup_status IS NULL AND NOT EXISTS (SELECT 1 FROM telegram_messages r WHERE r.expense_id=telegram_messages.expense_id AND r.kind='receipt'))
         AND e.review_reason IS NULL AND e.dismissed=0 AND NOT (e.direction='income' AND COALESCE(e.income_category,'')='Reimbursement') AND ${guard}`,
        u.message.message_id,
        now,
        u.message.reply_to_message.message_id,
        u.update_id,
      ),
      // Queue the receipt atomically with the description and update deduplication.
      sql(
        env,
        `INSERT OR IGNORE INTO outbox (id,expense_id,kind,payload,available_at)
         SELECT 'receipt:'||id,id,'receipt',?,? FROM expenses
         WHERE id=(SELECT expense_id FROM telegram_messages WHERE message_id=? AND kind='prompt' AND cleanup_status IS NULL AND NOT EXISTS (SELECT 1 FROM telegram_messages r WHERE r.expense_id=telegram_messages.expense_id AND r.kind='receipt'))
         AND dismissed=0 AND NOT (direction='income' AND COALESCE(income_category,'')='Reimbursement') AND NOT ${NEEDS_DETAILS} AND ${guard}`,
        JSON.stringify({ message_id: u.message.message_id }),
        now,
        u.message.reply_to_message.message_id,
        u.update_id,
      ),
      mark,
    ]);
  } else await mark.run();
}
