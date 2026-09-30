import {
  CATEGORIES,
  INCOME_CATEGORIES,
  NEEDS_DETAILS,
  Env,
  Expense,
  IntegrationError,
  formatMoney,
  tashkentDay,
} from "./domain";
import { getExpense, sql } from "./store";
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
export async function reminder(env: Env, now: number) {
  if (new Date(now + 18000000).getUTCHours() !== 20) return;
  await sql(
    env,
    `INSERT OR IGNORE INTO outbox (id,kind,available_at) SELECT ?,'reminder',? WHERE EXISTS (SELECT 1 FROM expenses WHERE dismissed=0 AND ${NEEDS_DETAILS})`,
    `reminder:${tashkentDay(now)}`,
    now,
  ).run();
}
function summary(e: Expense) {
  return `${e.direction === "income" ? "Income received" : "Expense"} · ${e.merchant}\n${formatMoney(e.amount_minor!, e.currency!)} · card ••${e.card_suffix}\n${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", dateStyle: "medium", timeStyle: "short" }).format(new Date(e.occurred_at!))} (Tashkent)`;
}
function complete(e: Expense) {
  return (
    !e.dismissed &&
    !e.review_reason &&
    !!e.description.trim() &&
    !!(e.direction === "income" ? e.income_category : e.category)
  );
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
    try {
      const e = row.expense_id ? await getExpense(env, row.expense_id) : null;
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
      if (row.kind === "expense" && e) {
        text = `${summary(e)}\n\nChoose a category.`;
        const choices =
          e.direction === "income" ? INCOME_CATEGORIES : CATEGORIES;
        markup = {
          inline_keyboard: Array.from(
            { length: Math.ceil(choices.length / 2) },
            (_, i) =>
              choices.slice(i * 2, i * 2 + 2).map((c, j) => ({
                text: c,
                callback_data: `${e.direction === "income" ? "inc" : "cat"}:${e.id}:${i * 2 + j}`,
              })),
          ),
        };
      } else if (row.kind === "prompt" && e && !complete(e) && !e.dismissed) {
        text = `${summary(e)}\n\nReply to this message with a short description.`;
        markup = {
          force_reply: true,
          input_field_placeholder: "What was this transaction for?",
        };
      } else if (isReceipt && e && complete(e)) {
        text = `✓ Saved\n${summary(e)}\n\n${e.direction === "income" ? e.income_category : e.category} · ${e.description}\n\nOpen dashboard: ${env.SITE_URL}`;
        markup = { remove_keyboard: true };
      } else if (row.kind === "review" && e)
        text = `An UZCARD email needs review (${e.review_reason}). It is excluded from spending totals.\n${env.SITE_URL}`;
      else if (row.kind === "auth")
        text = `Gmail authorization needs attention. Reconnect Google to resume email sync.\n${env.SITE_URL}`;
      else if (row.kind === "reminder") {
        const count = await sql(
          env,
          `SELECT COUNT(*) AS n FROM expenses WHERE dismissed=0 AND ${NEEDS_DETAILS}`,
        ).first<{ n: number }>();
        // Drop stale daily reminders after their local date, and reminders made unnecessary by edits.
        if (count?.n && row.id === `reminder:${tashkentDay(now)}`)
          text = `${count.n} transaction${count.n === 1 ? "" : "s"} still need details.\n${env.SITE_URL}`;
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
        if (e && row.kind === "description_saved") {
          const replyId = JSON.parse(row.payload).message_id;
          if (Number.isSafeInteger(replyId))
            statements.push(
              sql(
                env,
                "INSERT OR IGNORE INTO telegram_messages (message_id,expense_id,kind,created_at) VALUES (?,?,'description',?)",
                replyId,
                e.id,
                now,
              ),
            );
        }
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
    const valid = !!(
      m &&
      association?.expense_id === m[2] &&
      item &&
      !item.review_reason &&
      !item.dismissed &&
      m[1] === (item.direction === "income" ? "inc" : "cat") &&
      choices[Number(m[3])]
    );
    if (valid && m) {
      await env.DB.batch([
        sql(
          env,
          `UPDATE expenses SET ${item!.direction === "income" ? "income_category" : "category"}=?,version=version+1 WHERE id=? AND review_reason IS NULL AND dismissed=0 AND ${guard}`,
          choices[Number(m[3])],
          m[2],
          u.update_id,
        ),
        sql(
          env,
          `INSERT OR IGNORE INTO outbox (id,expense_id,kind,available_at) SELECT ?,?,?,? WHERE ${guard}`,
          item!.description.trim()
            ? `receipt:${m[2]}`
            : `prompt:${u.update_id}`,
          m[2],
          item!.description.trim() ? "receipt" : "prompt",
          now,
          u.update_id,
        ),
        mark,
      ]);
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
        `UPDATE expenses SET description=?,version=version+1 WHERE id=(SELECT expense_id FROM telegram_messages WHERE message_id=? AND kind='prompt' AND cleanup_status IS NULL AND NOT EXISTS (SELECT 1 FROM telegram_messages r WHERE r.expense_id=telegram_messages.expense_id AND r.kind='receipt')) AND review_reason IS NULL AND dismissed=0 AND ${guard}`,
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
         AND e.review_reason IS NULL AND e.dismissed=0 AND ${guard}`,
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
         AND dismissed=0 AND NOT ${NEEDS_DETAILS} AND ${guard}`,
        JSON.stringify({ message_id: u.message.message_id }),
        now,
        u.message.reply_to_message.message_id,
        u.update_id,
      ),
      mark,
    ]);
  } else await mark.run();
}
