// Temporary deployment only. The normal Worker does not import this module.
import { Env, equalSecret } from "./domain";
import { json } from "./api";
import { sql } from "./store";

export async function resetHistory(env: Env, switchedAt: number) {
  if (!Number.isSafeInteger(switchedAt) || switchedAt <= 0)
    throw Error("Invalid switch timestamp");
  const state = await sql(
    env,
    "SELECT activated_at FROM sync_state WHERE id=1",
  ).first<{ activated_at: number }>();
  if (state?.activated_at === switchedAt) return;
  await env.DB.batch([
    sql(env, "DELETE FROM outbox"),
    sql(env, "DELETE FROM telegram_messages"),
    sql(env, "DELETE FROM expenses"),
    sql(env, "DELETE FROM locks"),
    sql(env, "DELETE FROM sync_state"),
    sql(
      env,
      "INSERT INTO sync_state (id,activated_at,cursor_at) VALUES (1,?,?)",
      switchedAt,
      switchedAt,
    ),
  ]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    // Reject all application traffic, including Telegram retries, without writes.
    if (!path.startsWith("/maintenance/"))
      return json({ error: "Account switch in progress" }, 503);
    if (
      !(await equalSecret(
        request.headers.get("Authorization"),
        env.BACKEND_TOKEN ? `Bearer ${env.BACKEND_TOKEN}` : undefined,
      ))
    )
      return json({ error: "Unauthorized" }, 401);
    if (path === "/maintenance/status" && request.method === "GET") {
      return json({
        maintenance: true,
        sync: await sql(env, "SELECT * FROM sync_state WHERE id=1").first(),
        counts: await sql(
          env,
          `SELECT
          (SELECT COUNT(*) FROM expenses) AS transactions,
          (SELECT COUNT(*) FROM outbox) AS notifications,
          (SELECT COUNT(*) FROM telegram_messages) AS associations,
          (SELECT COUNT(*) FROM telegram_updates) AS processed_updates,
          (SELECT COUNT(*) FROM locks) AS locks`,
        ).first(),
      });
    }
    if (path === "/maintenance/reset" && request.method === "POST") {
      let switchedAt;
      try {
        switchedAt = ((await request.json()) as { switched_at?: number })
          .switched_at;
      } catch {
        return json({ error: "Invalid request" }, 400);
      }
      if (
        !Number.isSafeInteger(switchedAt) ||
        switchedAt! > Date.now() ||
        switchedAt! <= 0
      )
        return json({ error: "Invalid switch timestamp" }, 400);
      await resetHistory(env, switchedAt!);
      return json({ switched_at: switchedAt });
    }
    return json({ error: "Not found" }, 404);
  },
  async scheduled() {
    /* Deliberately no ingestion, reminders, or delivery. */
  },
};
