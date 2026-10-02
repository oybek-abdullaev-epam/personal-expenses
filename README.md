# Expense tracker

Personal UZCARD income and spending: Gmail → Telegram → dashboard.

**[Open the public dashboard](https://personal-expenses-liard-chi.vercel.app).** No login is needed, and anyone with the link can view and edit transactions.

## What it does

- Every five minutes, it reads new UZCARD notification emails (`noreply@info.uzcard.uz`, subject `UZCARD INFO`) from a dedicated Gmail inbox with read-only access. It only does this after a one-time activation, and it never imports earlier emails.
- It saves one exact transaction per email:
  - Spending is `oplata`, `E-Com oplata`, `Pokupka` or `Platezh`. Income is `Perevod na kartu`.
  - Unknown or conflicting formats become **review items**, which are excluded from totals.
  - Balances and full emails are never stored.
- A Telegram bot asks the owner for a category (buttons) and a description (a reply to that transaction's prompt). It sends a receipt and tidies the chat. The daily summary is deployed: around **21:00 Tashkent**, it shows today’s spending so far and expense count separately per currency, any transactions still needing details across all dates, and the dashboard link. It includes email and manual spending; income, dismissed records, and unresolved reviews are excluded from spending. Days with neither spending nor outstanding details are skipped. Totals are refreshed on delivery/retry; undelivered summaries expire after the local date changes. An ambiguous Telegram timeout may repeat a message.
- The dashboard has three parts:
  - **Ledger:** All, Income or Spending; search, date and category filters, and **Needs details**; a spending and income total while filtering; editing with conflict detection; resolving review items.
  - **Month view:** spending, income and net cash flow per currency, a spending calendar and category breakdown.
  - **Add transaction:** manual entries for cash and other non-card transactions. They are idempotent and can be backdated to 2000.

## How it's built

A **Cloudflare Worker** with a **D1** database does the Gmail polling, the parsing, a retrying Telegram outbox, and an authenticated JSON API (`backend/`). A **Vercel** function serves the dashboard and forwards an allowlist of API calls with a server-held token (`website/`). The architecture is described in [docs/architecture.md](docs/architecture.md).

## Quick start

Requires Node.js 24+.

```sh
npm ci
npm test          # node:test with an in-memory SQLite database and mocked Gmail/Telegram
npm run build     # typecheck + Worker dry run + website build and validation
npm run preview   # http://127.0.0.1:8788 with synthetic data, no network
```

To run the real backend locally, run `cp backend/.dev.vars.example backend/.dev.vars`, fill in local values (never commit them), then run `npm run db:migrate:local` and `npm run dev`. See [docs/development.md](docs/development.md).

## Documentation

New to the code? Start at **[docs/README.md](docs/README.md)**.

|                                                        |                                                       |
| ------------------------------------------------------ | ----------------------------------------------------- |
| [Architecture](docs/architecture.md)                   | Components, trust boundaries, repository map          |
| [Transaction lifecycle](docs/transaction-lifecycle.md) | Email → database → Telegram → dashboard, step by step |
| [Data model](docs/data-model.md)                       | Tables, money and time rules, writing migrations      |
| [Backend API](docs/backend-api.md)                     | Endpoints, errors, environment and secrets            |
| [Frontend](docs/frontend.md)                           | Proxy rules, build, browser code                      |
| [Development](docs/development.md)                     | Scripts, tests, change checklists                     |
| [Deployment](docs/deployment.md)                       | Order, commands, smoke checks, rollback               |
| [Operations](docs/operations.md)                       | Health, error codes, helper scripts, limitations      |
| [Setup](docs/SETUP.md)                                 | First-time provisioning and recovery                  |
| [Glossary](docs/glossary.md)                           | Domain and technical terms                            |
| [History](docs/history.md)                             | Dated deployment and status records                   |

The agreed scope is in [PLAN.md](PLAN.md), and the project rules are in [AGENTS.md](AGENTS.md). The live checks still outstanding are listed in [next_steps.md](next_steps.md). Unscheduled ideas are in [future-plans/](future-plans/README.md); these are proposals, not implemented features.

## Telegram Mini App implementation

The feature branch includes the shared Telegram presentation adapter, theme/viewport/Back handling, inline discard controls, bounded network requests and exact uncertain-save retries. These passed synthetic tests and an unaliased candidate launch in Telegram Web K. The existing stable dashboard and bot menu have not been switched yet. See [implementation tickets](future-plans/telegram-mini-app/TICKETS.md) and [verification evidence](docs/verification/telegram-mini-app/MA-04.md).
