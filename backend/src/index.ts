import { api, json } from "./api";
import { Env, equalSecret } from "./domain";
import { pollGmail } from "./gmail";
import { information } from "./information";
import {
  deliver,
  handleUpdate,
  ownerUpdate,
  reminder,
  Update,
} from "./telegram";
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      const publicPage = information(request);
      if (publicPage) return publicPage;
      if (Number(request.headers.get("content-length") ?? 0) > 32000)
        return json({ error: "Too large" }, 413);
      if (new URL(request.url).pathname === "/telegram/webhook") {
        if (request.method !== "POST")
          return json({ error: "Method not allowed" }, 405);
        if (
          !(await equalSecret(
            request.headers.get("X-Telegram-Bot-Api-Secret-Token"),
            env.TELEGRAM_WEBHOOK_SECRET,
          ))
        )
          return json({ error: "Unauthorized" }, 401);
        let u: Update;
        try {
          u = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        if (!u || !Number.isSafeInteger(u.update_id))
          return json({ error: "Invalid update" }, 400);
        if (!ownerUpdate(env, u)) return json({ error: "Forbidden" }, 403);
        await handleUpdate(env, u);
        ctx.waitUntil(deliver(env));
        return json({ ok: true });
      }
      return await api(request, env);
    } catch {
      return json({ error: "Service temporarily unavailable" }, 503);
    }
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        // Keep notification retries independent of Gmail failures.
        await Promise.allSettled([
          pollGmail(env),
          reminder(env, event.scheduledTime),
        ]);
        await deliver(env);
      })(),
    );
  },
};
