# Development guide

This page covers how to set up a machine, what every npm script does, how the test suite fakes the database and the network, and the rules to follow when changing code. When you're done, you should be able to make a change and prove it works without touching production.

## Prerequisites

- **Node.js 24 or newer.** The tests use the built-in `node:sqlite` module, and Vercel is pinned to Node 24.
- npm. Run `npm ci` in the project root. The website has no dependencies of its own.
- For deploying only: Wrangler (installed as a dev dependency, use it through `npx wrangler`) and the Vercel CLI (`npx vercel`). See [deployment.md](deployment.md).

```sh
npm ci
npm test          # 47 tests, a few seconds
npm run preview   # http://127.0.0.1:8788 with synthetic data
```

## npm scripts (root [`package.json`](../package.json))

| Script | What it does | When to use it |
|---|---|---|
| `npm test` | `node --import tsx --test tests/*.test.ts` | Always, before every commit or deploy. |
| `npm run typecheck` | `tsc --noEmit`. **Only `backend/src/**`** is included (see [`tsconfig.json`](../tsconfig.json)). | Part of `build`. Tests, scripts and website JS are *not* type-checked. tsx only strips their types. |
| `npm run build` | typecheck, then `wrangler deploy --dry-run` (bundles the Worker without uploading), then build and validate the website. | Before deploying. It's the closest thing to CI. |
| `npm run preview` | Builds the website, then runs [`scripts/preview.ts`](../scripts/preview.ts): the real proxy and the real `api()` against an in-memory database with synthetic data. External network is disabled. | UI work and demos. See [frontend.md](frontend.md#previewing-ui-changes). |
| `npm run dev` | `wrangler dev` for the real backend Worker, with a local D1 database and secrets from `backend/.dev.vars`. | Debugging backend HTTP behaviour end to end. |
| `npm run dev:website` | Builds, then runs the website handler in Wrangler on **port 8788** (the same port as preview). | Rarely. Without a configured backend, `/api/*` returns 503. |
| `npm run db:migrate:local` | Applies migrations to the local D1 in `.wrangler/`. | Before `npm run dev`, and after adding a migration. |
| `npm run db:migrate:remote` | Applies migrations to **production** D1. | Only during a deploy. See [deployment.md](deployment.md). |
| `npm run deploy:backend` | `wrangler deploy` to production. | Only during a deploy. |

### Running the real backend locally

```sh
cp backend/.dev.vars.example backend/.dev.vars   # fill in test values, never commit
npm run db:migrate:local
npm run dev
```

The local database starts **inactive**. Nothing polls Gmail until you `POST /api/activate` with your local token. Cron doesn't fire on its own under `wrangler dev`, so trigger it by hand if needed (see the Wrangler docs for `--test-scheduled`). Most backend work is faster to check with a test than with `npm run dev`.

## How the tests work

The tests use Node's built-in runner (`node:test`) with `node:assert/strict`, and tsx loads TypeScript directly. There is no Jest or Vitest.

**The fake D1 database.** `setup()` in [`tests/helpers.ts`](../tests/helpers.ts) creates an **in-memory SQLite** database (`node:sqlite`) and runs the **real migration files** against it, so tests exercise the real schema, CHECK constraints and foreign keys. It wraps SQLite in a small object that behaves like D1: `prepare().bind().first()/all()/run()`, and `batch()`, which runs inside `BEGIN`/`COMMIT` and rolls back on error. It returns `{ env, sqlite }`. `env` is a complete `Env` with fake secrets (for example, the owner ID is `"42"`). `sqlite` lets a test inspect tables directly.

> The migration list in `setup()` is written **by hand**. When you add a migration, add it there too. `setup(false)` stops before 0004, which lets a test fill an old-schema database and then run the migration.

**Other helpers:**
- `message(id, body, mimeType, received)` builds a Gmail API message object with the correct sender and subject.
- `fixture`, `purchaseFixture`, and `tests/fixtures/*.txt` hold **synthetic** UZCARD emails.
- `request(path, method, body, authorized)` builds a backend `Request`, with the test Bearer token by default.
- `now` is a fixed clock (`2026-09-23T15:00:00Z`). Functions such as `api(request, env, now)` take the time as a parameter so tests stay deterministic.

**Faking the network.** Gmail and Telegram are reached only through global `fetch`. A test replaces it for its own duration:

```ts
t.mock.method(globalThis, "fetch", async (url, init) => {
  // inspect url / JSON.parse(init.body), then:
  return Response.json({ ok: true, result: { message_id: 100 } });
});
```

Existing tests usually push each request into a local array inside the mock (for example, the parsed Telegram payloads), then assert on that array and on the database state.

**Test files:**

| File | Covers |
|---|---|
| `parser.test.ts` | MIME and HTML parsing, bilingual copies, each operation label, currencies, review reasons, time and money edge cases. |
| `workflows.test.ts` | End-to-end backend flows: save-then-notify, duplicate imports, retries and `retry_after`, crossed replies, reminders, auth alerts, pagination and checkpoints, rollback on database failure, exact totals, income, API auth and edits. |
| `telegram-cleanup.test.ts` | Receipts and deletion rules (keep the newest 3, 47 h, refusals). |
| `manual.test.ts` | Manual create and edit, idempotent replay and conflicts, validation, retry after a persistence failure, proxy forwarding of creates, and migration 0004 on a populated database. |
| `website.test.ts` | The proxy allowlist, method table, same-origin checks, redirect refusal, missing configuration, and anonymous edits through the proxy into a real `api()`. |
| `mailbox-switch.test.ts` | The one-time maintenance Worker and history reset. |

### Adding a test

1. Pick the file that matches the layer you changed, or create `tests/<area>.test.ts`. The glob picks it up automatically.
2. Start with `const { env, sqlite } = setup();`.
3. Put data in through the real code (`saveMessage(env, message(...), parseEmail(...), now)`) rather than raw SQL where you can, so the test stays realistic.
4. Mock `fetch` for anything that talks to Gmail or Telegram.
5. Assert on the **database** (`sqlite.prepare("SELECT …").all()`) as well as on return values. Most of the guarantees here are about what gets stored exactly once.
6. Use only synthetic data: invented merchants, card `1234`, and no real emails, names or balances.

## Rules for changing code

These rules come from [AGENTS.md](../AGENTS.md) and [PLAN.md](../PLAN.md). Read PLAN.md before changing behaviour, because it is the agreed scope.

- **Keep parsing, persistence and delivery separate.** `parser.ts` does no I/O, `store.ts` writes, and `telegram.ts` sends. That separation is what makes retries testable.
- **Email content is untrusted.** Validate it with strict patterns and length limits. Never log email bodies, tokens or balances. Fixtures must be synthetic or redacted.
- **Money stays exact.** Use integer minor units and BigInt for sums. Never do money arithmetic with `parseFloat` or `Number`.
- **Time conversions are explicit.** Store UTC and interpret or display as `Asia/Tashkent` (`+05:00`). Don't rely on the machine's local timezone.
- **Schema changes use a new migration.** See [data-model.md](data-model.md#changing-the-schema).
- **Keep the docs current.** If you change behaviour, update the matching page in `docs/` and the README.

### Checklist: changes to ingestion or notifications

Make sure there are tests for each of these:
- [ ] **Duplicates.** The same Gmail message imported twice gives one row and one notification. The same Telegram update delivered twice has one effect.
- [ ] **Retries.** A failed send is retried without creating a second transaction. A failed Gmail page is replayed without skipping or duplicating anything.
- [ ] **Reply association.** With two transactions pending, replying in reverse order puts each description on the right row.
- [ ] **Atomicity.** If the database write fails, neither the transaction nor its outbox row exists.

### Checklist: changes to access control

- [ ] Requests without a token or with a wrong token get 401. Webhooks from other chats or groups get 403.
- [ ] The website proxy still returns 404 for non-allowlisted paths (especially `/api/activate`) and 403 for cross-origin writes.

## Formatting

Prettier is installed (`npx prettier --write <files>`). Match the style of the code around your change. The code is compact, with few comments that explain *why* rather than *what*.

## FP-003 verification

Run `npm test` followed by `npm run build`. Reimbursement tests cover storage/guards, shared reporting, client recovery, Telegram receipts and populated migration/recovery. `npx wrangler deploy --dry-run --config backend/wrangler.release-pause.toml` separately validates the non-destructive pause entrypoint without publishing it. Use synthetic data only.

Local D1 migration check: `npx wrangler d1 migrations apply expenses --local --persist-to /tmp/fp003-local-d1 --config backend/wrangler.toml`. Do not substitute `--remote` without ER-07 authorization. The [candidate evidence](verification/expense-reimbursements/ER-06.md) separates SQLite tests, local D1, actual browser observations and outstanding Telegram Web verification. Preview fixtures include pending, partial and fully repaid dinner examples; `PREVIEW_THEME=dark PREVIEW_NO_SDK=1 npm run preview` supports repeatable dark/fallback screenshots without changing product files.
