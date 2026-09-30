# Glossary

These are the words used in the code, the UI and these docs. The product terms come from [CONTEXT.md](../CONTEXT.md), which is authoritative when the two disagree. The technical terms are specific to this codebase.

## Product terms

| Term | Meaning |
|---|---|
| **Transaction** | One incoming or outgoing card movement reported by UZCARD, or entered by hand. The Uzbek and Russian copies inside one email describe the **same** transaction. In the database it is a row in `expenses`, a name kept from before income was supported. |
| **Spending** | The sum of outgoing transactions (`direction = 'expense'`), including card-to-card transfers out (`Platezh`). In API totals it appears as `amount_minor` or `spending_minor`. |
| **Income** | Incoming money (`direction = 'income'`): salary, reimbursements, other incoming transfers (`Perevod na kartu`). |
| **Salary** | Income from an employer. Each instalment is a separate transaction. |
| **Reimbursement** | Money received back for someone else's share of a bill. It counts as income. It does **not** reduce spending. |
| **Net cash flow** | Income minus spending, per currency, for the selected rows. It is **not** a bank balance, and balances are never stored. |
| **Review item** | An email the parser couldn't read with confidence. It has a `review_reason`, all transaction fields empty, and is excluded from every total until it is resolved (fields entered by hand) or dismissed. |
| **Needs details** | A transaction still missing something from the owner: it is a review item, it has no description, or it has no category for its direction. The Needs details filter, the reminders, and the question of whether Telegram asks anything more all depend on it. |
| **Manual entry** | A transaction entered on the dashboard (`source = 'manual'`), for example cash. It never produces Telegram messages. |
| **Activation** | The one-time moment after which emails are imported (`sync_state.activated_at`). Earlier emails are ignored. |
| **Tracked day** | A Tashkent day on or after activation. Before activation, history may be incomplete, and the Month view marks that. |

## UZCARD operation labels

| Label in the email | Meaning | Treated as |
|---|---|---|
| `oplata` | Payment | Spending |
| `E-Com oplata` | Online payment | Spending |
| `Pokupka` | Purchase | Spending |
| `Platezh` | Outgoing card-to-card transfer | Spending |
| `Perevod na kartu` | Transfer to the card (incoming) | Income |
| anything else | – | Review item (`unsupported_operation`) |

`karta ***1234` is the card suffix, `summa` is the amount, and `balans` is the balance, which is thrown away.

## Technical terms

| Term | Meaning |
|---|---|
| **Minor units** | An integer amount in the smallest unit (tiyin or cents). `30500.00 UZS` is `3050000`. Every amount in the database and the API uses minor units. |
| **Outbox** | The `outbox` table of pending Telegram jobs. It is written in the same atomic batch as the change that needs the job (the "transactional outbox" pattern) and sent later by `drain()`. |
| **Outbox kind** | `expense`, `review`, `prompt`, `receipt`, `reminder`, `auth`, `delete`. See [data-model.md](data-model.md#outbox-jobs-to-send-to-telegram). |
| **Category prompt** | The first Telegram message about a transaction (outbox kind `expense`). It shows the summary and category buttons. |
| **Description prompt** | The `force_reply` message ("Reply to this message with a short description."). Replies are matched to a transaction through **this message's ID**. |
| **Receipt** | The "✓ Saved" summary sent once category and description are both set through Telegram. It triggers chat cleanup. |
| **Cleanup** | Deleting the prompts and the owner's reply after the receipt, and pruning old receipts (keep 3, maximum 47 h). |
| **Lease** | A time-limited claim (a token plus an expiry) that stops two runs from doing the same work: the `gmail` lock in `locks`, and `lease_until`/`lease_token` on outbox rows. |
| **Window / cursor** | Gmail polling state. `cursor_at` is where the last complete search ended. `window_end` is the fixed end of the search currently being paged through. |
| **Version** | The optimistic-concurrency counter on each transaction. A stale edit gets 409. |
| **Request ID** | The UUID the browser creates for a manual entry. It makes retries of the save safe. |
| **Proxy** | The Vercel function (`website/worker/index.js`) that serves the page and forwards an allowlist of API calls with the secret token. |
| **Maintenance Worker** | `backend/src/maintenance.ts`, a temporary replacement Worker used only during the mailbox switch. |
