import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Env } from "../backend/src/domain";
import type { GmailMessage } from "../backend/src/parser";
export const fixture = readFileSync(
  new URL("./fixtures/uzcard.txt", import.meta.url),
  "utf8",
);
export const purchaseFixture = [
  "Pokupka: SAMPLE SHOP, UZ 25.09.26 13:41 karta ***1234. summa:100.00 UZS, balans:200.00 UZS",
  "Pokupka: SAMPLE SHOP, UZ 25.09.26 13:41 karta ***1234. summa:100.00 UZS, balans:200.00 UZS",
].join("\n");
export const now = Date.parse("2026-09-23T15:00:00Z");
export function message(
  id = "message-1",
  body = fixture,
  mimeType = "text/plain",
  received = now - 1000,
): GmailMessage {
  return {
    id,
    internalDate: String(received),
    payload: {
      mimeType,
      headers: [
        { name: "From", value: "noreply@info.uzcard.uz" },
        { name: "Subject", value: "UZCARD INFO" },
      ],
      body: { data: Buffer.from(body).toString("base64url") },
    },
  };
}
export function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(
    readFileSync(
      new URL("../backend/migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL("../backend/migrations/0002_income.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL(
        "../backend/migrations/0003_telegram_cleanup.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  class Statement {
    values: unknown[] = [];
    constructor(public query: string) {}
    bind(...values: unknown[]) {
      const copy = new Statement(this.query);
      copy.values = values;
      return copy;
    }
    async first() {
      return sqlite.prepare(this.query).get(...(this.values as [])) ?? null;
    }
    async all() {
      return {
        results: sqlite.prepare(this.query).all(...(this.values as [])),
        success: true,
      };
    }
    run() {
      const r = sqlite.prepare(this.query).run(...(this.values as []));
      return { success: true, meta: { changes: Number(r.changes) } };
    }
  }
  const DB = {
    prepare: (q: string) => new Statement(q),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const env = {
    DB,
    BACKEND_TOKEN: "test-backend-token",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_REFRESH_TOKEN: "test-refresh",
    TELEGRAM_BOT_TOKEN: "test-bot",
    TELEGRAM_WEBHOOK_SECRET: "test-webhook",
    TELEGRAM_OWNER_ID: "42",
    SITE_URL: "https://expenses.example",
  } as unknown as Env;
  return { env, sqlite };
}
export function request(
  path: string,
  method = "GET",
  body?: unknown,
  authorized = true,
) {
  return new Request("https://backend.example" + path, {
    method,
    headers: authorized
      ? {
          Authorization: "Bearer test-backend-token",
          "Content-Type": "application/json",
        }
      : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
