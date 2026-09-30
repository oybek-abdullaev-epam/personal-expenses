import { Env, IntegrationError } from "./domain";
import { GmailMessage, matches, parseEmail } from "./parser";
import { enqueue, lock, saveMessage, sql } from "./store";
interface SyncState {
  activated_at: number;
  cursor_at: number;
  window_end: number | null;
  page_token: string | null;
  auth_alerted: number;
}
async function accessToken(env: Env): Promise<string> {
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new IntegrationError("gmail_unavailable");
  }
  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!response.ok || !data.access_token)
    throw new IntegrationError(
      data.error === "invalid_grant"
        ? "gmail_authorization_required"
        : "gmail_unavailable",
    );
  return data.access_token;
}
async function gmail<T>(token: string, path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw new IntegrationError("gmail_unavailable");
  }
  if (!response.ok)
    throw new IntegrationError(
      response.status === 401
        ? "gmail_authorization_required"
        : response.status === 400
          ? "gmail_invalid_cursor"
          : "gmail_unavailable",
    );
  return response.json() as Promise<T>;
}
export async function pollGmail(env: Env, now = Date.now()) {
  const lease = await lock(env, "gmail", now, 240000);
  if (!lease) return;
  try {
    const state = await sql(
      env,
      "SELECT * FROM sync_state WHERE id=1",
    ).first<SyncState>();
    if (!state) return; // Explicit activation prevents accidental historical import.
    const token = await accessToken(env);
    const end = state.window_end ?? now;
    if (!state.window_end)
      await sql(
        env,
        "UPDATE sync_state SET window_end=? WHERE id=1",
        end,
      ).run();
    const params = new URLSearchParams({
      q: `from:noreply@info.uzcard.uz subject:"UZCARD INFO" after:${Math.floor(Math.max(state.activated_at, state.cursor_at - 2000) / 1000) - 1} before:${Math.ceil(end / 1000)}`,
      maxResults: "25",
      includeSpamTrash: "true",
    });
    if (state.page_token) params.set("pageToken", state.page_token);
    const page = await gmail<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(token, `messages?${params}`);
    // A page is checkpointed only after every message and its outbox entry are saved.
    for (let i = 0; i < (page.messages ?? []).length; i += 5) {
      const results = await Promise.allSettled(
        (page.messages ?? []).slice(i, i + 5).map(async ({ id }) => {
          if (
            await sql(
              env,
              "SELECT id FROM expenses WHERE source_message_id=?",
              id,
            ).first()
          )
            return;
          const message = await gmail<GmailMessage>(
            token,
            `messages/${encodeURIComponent(id)}?format=full`,
          );
          const received = Number(message.internalDate);
          if (!Number.isSafeInteger(received))
            throw new IntegrationError("gmail_invalid_message");
          if (
            received < state.activated_at ||
            received >= end ||
            !matches(message)
          )
            return;
          await saveMessage(env, message, parseEmail(message), now);
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
    if (page.nextPageToken)
      await sql(
        env,
        "UPDATE sync_state SET page_token=?,error=NULL WHERE id=1",
        page.nextPageToken,
      ).run();
    else
      await sql(
        env,
        "UPDATE sync_state SET cursor_at=?,window_end=NULL,page_token=NULL,last_success=?,error=NULL,auth_alerted=0 WHERE id=1",
        end,
        now,
      ).run();
  } catch (e) {
    const code = e instanceof IntegrationError ? e.code : "gmail_sync_failed";
    await sql(env, "UPDATE sync_state SET error=? WHERE id=1", code).run();
    if (code === "gmail_invalid_cursor")
      await sql(env, "UPDATE sync_state SET page_token=NULL WHERE id=1").run();
    if (code === "gmail_authorization_required") {
      const state = await sql(
        env,
        "SELECT auth_alerted,cursor_at FROM sync_state WHERE id=1",
      ).first<{ auth_alerted: number; cursor_at: number }>();
      if (state && !state.auth_alerted) {
        await enqueue(env, `auth:${state.cursor_at}`, "auth", {}, now);
        await sql(env, "UPDATE sync_state SET auth_alerted=1 WHERE id=1").run();
      }
    }
  } finally {
    await sql(
      env,
      "DELETE FROM locks WHERE name=? AND token=?",
      "gmail",
      lease,
    ).run();
  }
}
