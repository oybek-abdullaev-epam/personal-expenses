import { test } from "node:test";
import assert from "node:assert/strict";
import site from "../website/worker/index.js";
const env = {
  BACKEND_URL: "https://backend.example",
  BACKEND_TOKEN: "secret-server-credential",
};
function req(
  path: string,
  owner = "owner",
  method = "GET",
  origin = "https://site.example",
) {
  return new Request("https://site.example" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
          "X-Tracker-Contract": "reimbursements-v1",
    },
    body: method === "PATCH" ? "{}" : undefined,
  });
}
test("website allows anonymous access and retains same-origin writes", async () => {
  assert.equal(
    (await site.fetch(new Request("https://site.example/"), env)).status,
    200,
  );
  assert.equal(
    (
      await site.fetch(
        req(
          "/api/expenses/00000000-0000-0000-0000-000000000000",
          "owner",
          "PATCH",
          "https://evil.example",
        ),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await site.fetch(req("/api/activate", "owner", "POST"), env)).status,
    404,
  );
});
test("website holds the credential server-side and fails closed before setup", async (t) => {
  let called = false;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    called = true;
    assert.equal(
      (options!.headers as Record<string, string>).Authorization,
      "Bearer secret-server-credential",
    );
    return Response.json({ expenses: [] });
  });
  const r = await site.fetch(req("/api/expenses"), env);
  assert.equal(r.status, 200);
  assert(called);
  assert(!JSON.stringify([...r.headers]).includes("secret-server-credential"));
  assert.equal((await site.fetch(req("/api/expenses"), {})).status, 503);
});

test("website proxy uses edge-compatible redirect handling and rejects redirects", async (t) => {
  let redirectMode: RequestRedirect | undefined;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    redirectMode = options?.redirect;
    return new Response(null, {
      status: 302,
      headers: { Location: "https://other.example" },
    });
  });
  const result = await site.fetch(req("/api/health"), env);
  // Assert outside the proxy catch, so a swallowed assertion cannot pass.
  assert.equal(redirectMode, "manual");
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("Location"), null);
  assert.deepEqual(await result.json(), {
    error: "The expense service is temporarily unavailable. Try again.",
  });
});

test("proxy preserves filters and rejects unsupported requests before fetching", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    calls++;
    assert.equal(
      String(url),
      "https://backend.example/api/expenses?q=shop&offset=50&direction=income",
    );
    return Response.json({ expenses: [], nextOffset: null });
  });
  const result = await site.fetch(
    new Request(
      "https://site.example/api/expenses?q=shop&offset=50&direction=income",
    ),
    env,
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  for (const [path, method, status] of [
    ["/api/activate", "POST", 404],
    ["/api/reset", "POST", 404],
    ["/api/health", "PATCH", 405],
    ["/api/insights", "POST", 405],
    ["/api/expenses", "DELETE", 405],
    ["/unknown", "GET", 404],
    ["/", "POST", 405],
  ] as const) {
    assert.equal(
      (
        await site.fetch(
          new Request("https://site.example" + path, { method }),
          env,
        )
      ).status,
      status,
    );
  }
  const path = "/api/expenses/00000000-0000-0000-0000-000000000000";
  for (const [headers, body, status] of [
    [
      { Origin: "https://site.example", "Content-Type": "text/plain" },
      "{}",
      403,
    ],
    [{ "Content-Type": "application/json" }, "{}", 403],
    [
      { Origin: "https://site.example", "Content-Type": "application/json" },
      "я".repeat(4001),
      413,
    ],
  ] as const) {
    assert.equal(
      (
        await site.fetch(
          new Request("https://site.example" + path, {
            method: "PATCH",
            headers,
            body,
          }),
          env,
        )
      ).status,
      status,
    );
  }
  assert.equal(calls, 1);
});

test("anonymous edits reach persistence, preserve conflicts, and resolve reviews", async (t) => {
  const { setup, message, now } = await import("./helpers");
  const { saveMessage } = await import("../backend/src/store");
  const { parseEmail } = await import("../backend/src/parser");
  const { api } = await import("../backend/src/api");
  const { env: backend, sqlite } = setup();
  t.after(() => sqlite.close());
  await saveMessage(backend, message(), parseEmail(message()), now);
  await saveMessage(
    backend,
    message("review", "unknown"),
    parseEmail(message("review", "unknown")),
    now,
  );
  await saveMessage(
    backend,
    message("dismiss", "unknown"),
    parseEmail(message("dismiss", "unknown")),
    now,
  );
  t.mock.method(globalThis, "fetch", async (url, options) =>
    api(new Request(url, options), backend),
  );
  const config = {
    BACKEND_URL: "https://backend.example",
    BACKEND_TOKEN: backend.BACKEND_TOKEN,
  };
  const list = await (
    await site.fetch(new Request("https://site.example/api/expenses", {headers: {"X-Tracker-Contract": "reimbursements-v1"}}), config)
  ).json();
  const expense = list.expenses.find(
    (e: any) => e.source_message_id === "message-1",
  );
  async function patch(id: string, body: unknown) {
    return site.fetch(
      new Request("https://site.example/api/expenses/" + id, {
        method: "PATCH",
        headers: {
          Origin: "https://site.example",
          "Content-Type": "application/json",
          "X-Tracker-Contract": "reimbursements-v1",
        },
        body: JSON.stringify(body),
      }),
      config,
    );
  }
  assert.equal(
    (
      await patch(expense.id, {
        version: expense.version,
        category: "Food",
        description: "Lunch",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await patch(expense.id, {
        version: expense.version,
        description: "Stale",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await patch(expense.id, {
        version: expense.version + 1,
        category: "Invalid",
      })
    ).status,
    400,
  );
  const review = list.expenses.find(
    (e: any) => e.source_message_id === "review",
  );
  assert.equal(
    (
      await patch(review.id, {
        version: review.version,
        resolve: {
          merchant: "Test",
          card_suffix: "1234",
          currency: "UZS",
          amount: "10.00",
          local_time: "23.09.26 15:00",
          direction: "expense",
        },
      })
    ).status,
    200,
  );
  const dismissed = list.expenses.find(
    (e: any) => e.source_message_id === "dismiss",
  );
  assert.equal(
    (await patch(dismissed.id, { version: dismissed.version, dismiss: true }))
      .status,
    200,
  );
  assert.equal(
    (await site.fetch(new Request("https://site.example/api/totals", { headers: {"X-Tracker-Contract": "reimbursements-v1"}}), config))
      .status,
    200,
  );
  assert.equal(
    (await site.fetch(new Request("https://site.example/api/health"), config))
      .status,
    200,
  );
  const insights = await site.fetch(
    new Request("https://site.example/api/insights?month=2026-09", {headers: {"X-Tracker-Contract": "reimbursements-v1"}}),
    config,
  );
  assert.equal(insights.status, 200);
  assert.equal((await insights.json()).month, "2026-09");
});

test("upstream failures are sanitized", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("secret-server-credential");
  });
  const result = await site.fetch(req("/api/health"), env);
  assert.equal(result.status, 503);
  assert(!(await result.text()).includes(env.BACKEND_TOKEN));
});

test("Telegram SDK CSP permits only its script while API and administrative boundaries remain narrow", async () => {
  const result = await site.fetch(new Request("https://site.example/"), env);
  const csp = result.headers.get("Content-Security-Policy")!;
  assert(
    csp.includes(
      "script-src 'unsafe-inline' https://telegram.org/js/telegram-web-app.js;",
    ),
  );
  assert(csp.includes("default-src 'none'"));
  assert(csp.includes("connect-src 'self'"));
  assert(!csp.includes("script-src *"));
  assert(!csp.includes("connect-src https:"));
});
