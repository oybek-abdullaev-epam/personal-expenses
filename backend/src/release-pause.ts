// Non-destructive release fence. Never imports the mailbox-reset maintenance Worker.
import { Env, equalSecret } from "./domain";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "Retry-After": "60" };
    if (new URL(request.url).pathname === "/release-status") {
      if (
        !(await equalSecret(
          request.headers.get("Authorization"),
          `Bearer ${env.BACKEND_TOKEN || ""}`,
        )) ||
        !env.BACKEND_TOKEN
      )
        return Response.json(
          { error: "Unauthorized" },
          { status: 401, headers },
        );
      if (request.method !== "GET")
        return Response.json(
          { error: "Method not allowed" },
          { status: 405, headers },
        );
      const now = Date.now();
      const leases = await env.DB.prepare(
        "SELECT (SELECT COUNT(*) FROM locks WHERE until_at>?) AS sync_leases, (SELECT COUNT(*) FROM outbox WHERE lease_until>?) AS delivery_claims",
      )
        .bind(now, now)
        .first();
      return Response.json({ paused: true, leases }, { headers });
    }
    // 503 causes Telegram to retry rather than acknowledging an unprocessed update.
    return Response.json(
      { error: "The tracker is temporarily paused for an update." },
      { status: 503, headers },
    );
  },
  async scheduled(): Promise<void> {
    // Preserve the schedule and all pending jobs without processing or acknowledging them.
  },
};
