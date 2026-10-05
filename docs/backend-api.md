# Backend API reference

This page lists every HTTP endpoint of the Cloudflare Worker, with its request and response shapes and error codes, and every environment variable and secret it needs. The router is `fetch()` in [`backend/src/index.ts`](../backend/src/index.ts), and the JSON API is `api()` in [`backend/src/api.ts`](../backend/src/api.ts).

## Request routing

`fetch()` handles each request in this order:

1. If the path is `/about`, `/privacy` or `/terms`, it returns a static HTML page with no auth (`information()` in [`information.ts`](../backend/src/information.ts)). Google's OAuth consent screen links to these pages.
2. If `Content-Length` is over 32,000, it returns **413**.
3. If the path is `/telegram/webhook`, it uses the Telegram handler (see below).
4. Everything else goes to `api()`. The **Bearer token check happens first**, so any path without a valid token gets **401**, even one that doesn't exist.
5. Any unexpected exception becomes **503** `{"error":"Service temporarily unavailable"}`. **Nothing is logged**, so to debug a 503 you have to reproduce it locally or add temporary logging.

Every JSON response has `Cache-Control: no-store`.

FP-003 is implemented on the feature branch and is not deployed. Financial routes (`expenses`, `totals`, `insights`) additionally require `X-Tracker-Contract: reimbursements-v1` after authentication. Missing/old versions return 409 `refresh_required` with a reload message. Health and administration keep their existing contract. The browser supplies this non-secret compatibility header; the proxy only forwards it.

## Authentication

| Endpoint group                 | Requirement                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/*`                       | Header `Authorization: Bearer <BACKEND_TOKEN>`, compared in constant time by `equalSecret()` in [`domain.ts`](../backend/src/domain.ts). If the token is missing or wrong, the response is 401. |
| `/telegram/webhook`            | Header `X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>`, otherwise 401. The update must also come from the owner's private chat (`ownerUpdate()`), otherwise 403.                   |
| `/about`, `/privacy`, `/terms` | None.                                                                                                                                                                                           |

The public website never exposes the token. Its proxy adds the header on the server (see [frontend.md](frontend.md)).

## `GET /api/expenses`: list transactions

Returns the newest transactions first, ordered by `occurred_at` (or `received_at` for review items), then by `id`. Dismissed rows are never returned. Default All hides linked reimbursements and shows pending ones. Spending shows original expenses with adjusted costs; Income excludes all classified reimbursements. `category=Reimbursement` overrides direction, exposing linked and pending repayments. Dates/search apply to the displayed record, while each parent deduction includes its complete relationship across repayment dates.

**Query parameters** (all optional, parsed by `filters()`):

| Param          | Rule                                      | Effect                                                                                          |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `q`            | ≤ 200 characters                          | Case-insensitive `LIKE` search on merchant or description. `%` and `_` are escaped.             |
| `category`     | An expense category or an income category | Matches `COALESCE(income_category, category)`.                                                  |
| `direction`    | `expense` or `income`                     | Keeps only rows with that direction.                                                            |
| `needsDetails` | `true`                                    | Uses the `NEEDS_DETAILS` condition: a review item, ordinary missing category/description, or reimbursement missing payer/link. |
| `from`         | `YYYY-MM-DD` (Tashkent day)               | Includes rows from that day's local 00:00 onward.                                               |
| `to`           | `YYYY-MM-DD` (Tashkent day)               | Includes rows up to the end of that day. `from` must not be later than `to`.                    |
| `offset`       | Integer with 1–7 digits                   | Pagination offset.                                                                              |

**Response 200:**

```json
{
  "expenses": [
    {
      "id": "…uuid…",
      "source": "email",
      "source_message_id": "…",
      "manual_request": null,
      "received_at": 1790000000000,
      "occurred_at": "2026-09-22T14:44:00.000Z",
      "merchant": "SAMPLE TAXI",
      "card_suffix": "1234",
      "amount_minor": 3050000,
      "currency": "UZS",
      "direction": "expense",
      "category": "Transport",
      "income_category": null,
      "description": "Airport",
      "review_reason": null,
      "dismissed": 0,
      "version": 3
    }
  ],
  "nextOffset": 50
}
```

The endpoint returns 50 rows per page. When there are more rows, `nextOffset` is the next offset to request; otherwise it is `null`. The query fetches 51 rows to find out whether another page exists.

**Errors:** **400** `Invalid filters` for any bad filter value, and **400** `Invalid offset`.

## `GET /api/expenses/:id`: retrieve one transaction

Returns the transaction object directly, with the same fields and current `version` as a row in the list response. The ID must have the hexadecimal UUID shape `8-4-4-4-12`; uppercase hexadecimal digits are canonicalized to lowercase before lookup. Malformed paths, missing records, and dismissed records return **404** `Not found`.

This route performs one parameterized primary-key lookup, independently of list filters, date/month, pagination, or query parameters. It makes no writes and never queues a notification. Repeated opens have no transaction, outbox, or Telegram association effects. Responses retain `Cache-Control: no-store` and the backend Bearer-token requirement. The existing public proxy allows anonymous GET and same-origin JSON PATCH on this exact UUID route; other record methods and administrative routes remain rejected. The proxy keeps the credential server-side, request limits, timeout, and redirect rejection.

## `GET /api/totals`: sums per currency

It uses the same filters as `/api/expenses` (but ignores `offset`), leaves out review items, and sums every matching row with BigInt:

```json
[
  {
    "currency": "UZS",
    "amount_minor": "3050000",
    "income_minor": "0",
    "net_minor": "-3050000",
    "pending_reimbursement_minor": "0"
  }
]
```

`amount_minor` is **adjusted personal spending**. The field name is historical. All money totals are decimal strings, so exact sums survive JSON (see [data-model.md](data-model.md#money)).

## `GET /api/insights?month=YYYY-MM`: data for the Month view

`month` defaults to the current Tashkent month. It leaves out dismissed rows and review items:

```json
{
  "month": "2026-09",
  "currencies": [
    {
      "currency": "UZS",
      "spending_minor": "…",
      "income_minor": "…",
      "net_minor": "…",
      "days": [{ "date": "2026-09-22", "spending_minor": "…", "count": 2 }],
      "categories": [{ "category": "Food", "spending_minor": "…", "count": 5 }]
    }
  ]
}
```

- `days` and `categories` count **spending only**. Days are Tashkent calendar days and are sorted by date. Categories are sorted from the largest amount down, and an uncategorised expense has `category: null`.
- Rows are read in pages of 1000 using keyset pagination by `id`, so a large month never loads all at once.
- **400** `Invalid month`.

## `GET /api/health`: status for the dashboard footer

```json
{
  "sync": {
    "activated_at": 1790000000000,
    "last_success": 1790000300000,
    "error": null
  },
  "notifications": { "pending": 0, "failed": 0 }
}
```

- `sync` is `null` before activation.
- `pending` counts unsent outbox rows. `failed` counts unsent rows that already have an error.
- `error` is one of the Gmail codes described in [transaction-lifecycle.md](transaction-lifecycle.md#2-polling-gmail-pollgmail-in-gmailts).

## `POST /api/activate`: start importing email

It creates the `sync_state` row with `activated_at = cursor_at = now` if the row doesn't exist, and returns `{ "activated_at": … }`. Repeating it is harmless, because the first boundary is kept. This endpoint is **not reachable through the website**, so call it with `node scripts/integrations.mjs activate`.

## `POST /api/expenses`: create a manual transaction

**Body** (at most 8000 UTF-8 bytes, otherwise **413**):

```json
{
  "id": "0b7a…-lowercase-uuid",
  "direction": "expense",
  "merchant": "Corner shop",
  "amount": "12500",
  "currency": "UZS",
  "local_time": "30.09.26 13:05",
  "category": "Groceries",
  "income_category": null,
  "description": "Bread and milk",
  "card_suffix": ""
}
```

Every field is checked by `manualDetails()` in [`manual.ts`](../backend/src/manual.ts):

| Field                           | Rule                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | A UUID chosen by the client (uppercase is accepted and stored lowercase). It is both the idempotency key and the new row's `id`. |
| `direction`                     | `expense` or `income`.                                                                                                           |
| `merchant`                      | 1–250 characters after trimming.                                                                                                 |
| `amount`                        | `^\d+(\.\d{1,2})?$`, greater than 0, and at most 2⁵³−1 minor units.                                                              |
| `currency`                      | `UZS`, `USD`, `EUR` or `RUB`.                                                                                                    |
| `local_time`                    | `dd.mm.yy HH:MM[:SS]` in Tashkent time. It must be a real date and not in the future. The two-digit year allows 2000–2099.       |
| `category` or `income_category` | Required, and it must match the direction. The other one is stored as null.                                                      |
| `description`                   | 1–500 characters for ordinary manual rows; an optional trimmed note of at most 500 JS characters for Reimbursement.              |
| `payer_name`                    | Optional while pending; trimmed From label, at most 100 Unicode code points. Nonblank when linked.                               |
| `reimbursement_expense_id`      | UUID or null; one eligible expense for the whole repayment.                                                                      |
| `parent_versions`               | Expected versions keyed by parent UUID; required when creating with a link. Excluded from the idempotency snapshot.              |
| `card_suffix`                   | Optional, 4 digits.                                                                                                              |

**Responses:**

| Status        | When                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| **201** + row | Created.                                                                                                              |
| **200** + row | This `id` already exists with **identical** validated details, so it is a retry and nothing changes.                  |
| **409**       | This `id` already exists with different details, belongs to an email row, or parent state/version/capacity conflicts. |
| **404**       | A selected parent record is missing.                                                                                  |
| **400**       | Invalid JSON or a validation error. The message can be shown to the user as-is.                                       |

The details are compared against the **original** snapshot in `manual_request`. That snapshot is not updated by PATCH, so replaying the original create after an edit still returns 200 with the _edited_ row. Identity is checked before current parent eligibility/version validation, so replaying a successful creation does not allocate twice even after parent versions change. Ordinary snapshots retain their exact old serialization; legacy reimbursement snapshots without metadata remain accepted for matching retries. Pending manual reimbursements may omit payer, link and note.

## `PATCH /api/expenses/:id`: edit a transaction

Every PATCH must include the integer `version` the client last read. If the row changed since then, the response is **409**, and the client should reload. On success it returns the updated row with `version + 1`. It returns **404** if the id doesn't exist, and **400** for a bad body or when no changes were sent.

Record paths use the same strict UUID shape and lowercase lookup as single-record GET.

What the body can contain depends on `source`:

**Manual rows** (`source: "manual"`): the PATCH is a **full replacement**. Send the same fields as for create except `id`. They are checked by `manualDetails()` again.

**Email rows** (`source: "email"`): the PATCH is partial. Send any of these:

| Field                                                                          | Rule                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category`                                                                     | An expense category or `null`. The row must be `direction = expense`.                                                                                                                                                                     |
| `income_category`                                                              | An income category or `null`. The row must be `direction = income`.                                                                                                                                                                       |
| `description`                                                                  | A string of at most 500 JS characters. It is trimmed, and it may be empty.                                                                                                                                                                |
| `payer_name`                                                                   | Trimmed From label of at most 100 Unicode code points.                                                                                                                                                                                    |
| `reimbursement_expense_id`                                                     | A parent UUID or null.                                                                                                                                                                                                                    |
| `parent_versions`                                                              | Expected version for each distinct old/new parent; required for any linked source save or relationship change.                                                                                                                            |
| `dismiss: true`                                                                | Review items only. Sets `dismissed = 1`, which hides the row.                                                                                                                                                                             |
| `resolve: { merchant, card_suffix, currency, amount, local_time, direction? }` | Review items only. Fills in the transaction fields and clears `review_reason`, so the row starts counting in totals. `amount` must have exactly 2 decimals, and `local_time` must be `dd.mm.yy HH:MM`. `direction` defaults to `expense`. |

Parsed email fields such as amount or merchant **cannot** be edited on a normal email row. Only the owner's details can be changed.

A relationship save validates the source direction/category, resolved states, nonblank payer, currency, chronology and capacity atomically. Parent edits also validate all linked repayments. Invalidating amount/date/currency/direction/category edits must follow a separate unlink save, including manual changes. Source versions and all affected parent versions are checked in one conditional UPDATE. Relationship and linked source detail/financial changes increment each distinct parent once. Missing parent versions return 400, missing records 404, and stale versions or invalidating state/capacity return 409; stable `code` fields distinguish common conflicts.

Retry the frozen PATCH with the original versions. A successful response that was lost then retried returns 409; reload and review the latest transaction instead of guessing a new version.

Completing an email Reimbursement on the dashboard queues deterministic `receipt:<id>` atomically with the successful mutation if no retained Telegram receipt association proves prior delivery. A skipped intent is revived when completion becomes valid; `sent_at` alone does not prove delivery. Zero-row conditional updates cannot queue receipts. Delivered receipts are never replaced, and manual transactions retain their no-per-record-message policy. Ordinary website edits keep their existing message policy. This candidate behavior requires the separately authorized reimbursement rollout.

Until a receipt is delivered, pending category buttons and recorded description prompts remain valid: an accepted chat update can replace that field after a dashboard edit and increments its version. Dashboard edits using an earlier version then return 409. Receipt retries read current details. Once a receipt exists, its category buttons and prompts are retired even if cleanup is still retrying or a later dashboard edit reopens the row. Opening a transaction link does not reconcile or change this lifecycle.

## `POST /telegram/webhook`

Telegram calls this endpoint for every button press and every message the owner sends to the bot.

| Status          | When                                         |
| --------------- | -------------------------------------------- |
| 405             | Not a POST.                                  |
| 401             | The secret header is wrong.                  |
| 400             | Invalid JSON, or no integer `update_id`.     |
| 403             | Not the owner's private chat.                |
| 200 `{ok:true}` | Handled, including stale or ignored updates. |

After handling the update, it starts `deliver()` in the background (`ctx.waitUntil`), so the next Telegram message goes out immediately instead of waiting for the cron. The update handling itself is described in [transaction-lifecycle.md](transaction-lifecycle.md#6-the-owner-answers-on-telegram-handleupdate-in-telegramts).

## Environment, secrets and bindings

The `Env` type is defined in [`domain.ts`](../backend/src/domain.ts), and the non-secret settings are in [`backend/wrangler.toml`](../backend/wrangler.toml).

| Name                                       | Kind               | Purpose                                                                                                                                                   | Where it comes from                                  |
| ------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `DB`                                       | D1 binding         | The `expenses` database.                                                                                                                                  | `[[d1_databases]]` in `wrangler.toml`                |
| `SITE_URL`                                 | Plain var          | The dashboard link in Telegram messages.                                                                                                                  | `[vars]` in `wrangler.toml`                          |
| `TELEGRAM_APP_URL`                         | Optional plain var | Validated HTTPS root for Mini App launch buttons; record buttons add only a canonical UUID selector. Missing/invalid configuration retains browser links. | Deployment configuration; distinct from `SITE_URL`   |
| `BACKEND_TOKEN`                            | Secret             | Bearer token for `/api/*`. It is shared with Vercel.                                                                                                      | Generated by `scripts/google-oauth.mjs`              |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Secret             | The Google OAuth Desktop client.                                                                                                                          | The Google Cloud client JSON, via `google-oauth.mjs` |
| `GOOGLE_REFRESH_TOKEN`                     | Secret             | Read-only Gmail access.                                                                                                                                   | `google-oauth.mjs` browser consent                   |
| `TELEGRAM_BOT_TOKEN`                       | Secret             | The bot's API token.                                                                                                                                      | BotFather                                            |
| `TELEGRAM_WEBHOOK_SECRET`                  | Secret             | Checks that webhook calls come from Telegram.                                                                                                             | Generated by `google-oauth.mjs`                      |
| `TELEGRAM_OWNER_ID`                        | Secret             | The only chat and user allowed, as a numeric string.                                                                                                      | `node scripts/integrations.mjs owner`                |

All seven secrets are kept locally in the git-ignored `.env.production.json`. They are uploaded with `node scripts/deploy-secrets.mjs` (see [deployment.md](deployment.md#secrets)). For local `npm run dev`, put them in `backend/.dev.vars` (copy [`backend/.dev.vars.example`](../backend/.dev.vars.example)).

## Reimbursement read projection and relationship routes

`reporting.ts` owns financial reads and shared exact money projections used by notification summaries. Raw `amount_minor` remains the bank/manual payment. Transaction responses add string `original_minor`, `reimbursed_minor`, `personal_spending_minor`, and `pending_reimbursement_minor`, plus `payer_name`, `reimbursement_expense_id`, `parent_versions`, and nullable `reimbursement_expense` parent summary. Mutation success returns the same projection. Reviews contribute zero; fully reimbursed parents remain visible/count once. Aggregate totals and insights add pending amounts per currency and interpret `net_minor` as non-reimbursement income minus personal spending. Month days/categories and tracked-day averages use parent dates, retaining activation rules.

- `GET /api/expenses/:id/reimbursement-candidates?q=&cursor=` requires a resolved, undismissed Reimbursement. It returns `{expenses,nextCursor}` with at most 50 eligible parents, newest first (occurred_at/id), independent of ledger filters. Search is literal escaped merchant/description LIKE, max 200 characters. Each row includes `available_minor`, context and current version; the current allocation is credited back when considering its existing parent. Writes revalidate capacity and versions.
- `GET /api/expenses/:id/reimbursements?cursor=` returns the same bounded envelope for an expense's linked repayments, with payer, note, date and projection. Both routes strictly validate UUIDs/canonical cursors; invalid input is400, unavailable source404. Their proxy methods are GET-only.
- Cursor timestamps accept canonical UTC values including1999 spillover from the earliest supported Tashkent date, 1 January2000. Search `%`, `_`, and backslash are literals. Record detail lookup remains bounded and read-only outside all list filters.

Names and notes are plain text. No parser changes, inferred names, contacts, split allocations, currency conversion or public administrative routes are introduced.
