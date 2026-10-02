const page = "__PAGE_DOCUMENT__";
const response = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (
        !/^\/api\/(expenses(?:\/[a-f0-9-]{36})?|totals|insights|health)$/.test(
          url.pathname,
        )
      )
        return response({ error: "Not found" }, 404);
      const writing = request.method === "PATCH" || request.method === "POST";
      const allowed = /^\/api\/expenses\/[a-f0-9-]{36}$/.test(url.pathname)
        ? ["PATCH"]
        : url.pathname === "/api/expenses"
          ? ["GET", "POST"]
          : ["GET"];
      if (!allowed.includes(request.method))
        return response({ error: "Method not allowed" }, 405);
      if (
        writing &&
        (request.headers.get("Origin") !== url.origin ||
          !request.headers.get("Content-Type")?.startsWith("application/json"))
      )
        return response({ error: "Forbidden" }, 403);
      if (!env.BACKEND_URL || !env.BACKEND_TOKEN)
        return response(
          { error: "Connect the expense service to finish setup." },
          503,
        );
      if (!env.BACKEND_URL.startsWith("https://"))
        return response(
          { error: "Expense service is not configured correctly." },
          503,
        );
      let body;
      if (writing) {
        body = await request.text();
        if (new TextEncoder().encode(body).length > 8000)
          return response({ error: "Request too large" }, 413);
      }
      try {
        const upstream = await fetch(
          new URL(url.pathname + url.search, env.BACKEND_URL),
          {
            method: request.method,
            body,
            headers: {
              Authorization: `Bearer ${env.BACKEND_TOKEN}`,
              "Content-Type": "application/json",
            },
            redirect: "manual",
            signal: AbortSignal.timeout(15000),
          },
        );
        // Never forward our credential to a redirect destination.
        if (upstream.status >= 300 && upstream.status < 400) {
          await upstream.body?.cancel();
          throw new Error("Unexpected backend redirect");
        }
        return new Response(await upstream.text(), {
          status: upstream.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      } catch {
        return response(
          {
            error: "The expense service is temporarily unavailable. Try again.",
          },
          503,
        );
      }
    }
    if (url.pathname !== "/") return response({ error: "Not found" }, 404);
    if (!["GET", "HEAD"].includes(request.method))
      return response({ error: "Method not allowed" }, 405);
    return new Response(request.method === "HEAD" ? null : page, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline' https://telegram.org/js/telegram-web-app.js; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'",
      },
    });
  },
};
