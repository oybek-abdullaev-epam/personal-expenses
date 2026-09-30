# Private multi-user pilot

- **Idea:** FP-001
- **Status:** Planned / not scheduled
- **Recorded:** 2026-09-30
- **Planning material:** [Tickets and dependency graph](TICKETS.md) · [Risk register](RISKS.md) · [Idea index](../README.md)

This proposal preserves the decisions made in the planning conversation. It is future work, not a description of deployed functionality. The root [PLAN.md](../../PLAN.md) remains the current implementation agreement. In particular, the current website is public; the private-account behavior below takes effect only through a future, separately scheduled rollout.

## Summary and success criteria

Extend the existing tracker to support 5–10 friends or family, each with a private dashboard, their own Gmail connection, and their own Telegram conversation. Keep the Cloudflare Worker, D1 database, Vercel frontend, and deterministic UZCARD parser.

Every account, including the owner's, must require sign-in to view or edit its data. Preserve the owner's transactions, activation date, Gmail progress, notification state, and pending Telegram reply associations. Success means isolated accounts can complete the existing transaction flow and one account's connection failure does not prevent others from making progress.

## User experience

1. The owner adds an invited Google sign-in account through a local administrative command.
2. The participant signs in with Google and connects a Gmail mailbox. The mailbox may differ from the Google account used for sign-in.
3. The participant connects a private chat with the existing shared Telegram bot using an expiring, single-use link.
4. After both connections are ready, the participant explicitly starts tracking. New accounts import only matching receipts received at or after their activation time.
5. Transactions use the existing category and transaction-specific description flow. The private dashboard shows the participant's transactions, totals, month view, review items, and connection health.
6. Account controls support sign-out and connection disconnect/reconnect. The owner manages invitation access and account removal through local administrative commands.

One mailbox and one private Telegram chat belong to each user. A mailbox or Telegram identity cannot be linked to multiple users. Ordinary reconnects retain the original activation time and source identity; switching to a different mailbox is outside this pilot.

## Scope and preserved behavior

- Pilot audience: 5–10 people personally known to the owner, for noncommercial use.
- Existing UZCARD receipt formats, all matching cards in the connected inbox, English interface, and Asia/Tashkent time.
- Existing expense and income categories, manual review, editing, filtering, and month insights.
- Exact integer minor-unit storage and string totals; separate currencies without conversion; explicit UTC storage and Tashkent display.
- Save transactions before notification delivery, with separate parsing, persistence, and delivery modules.
- Existing daily reminder time of 20:00 Tashkent, transaction-specific replies, receipt retention, and independent cleanup retries, all scoped per account/chat.
- No full email bodies, account balances, or credentials in source control or logs. Request only Gmail read access for ingestion and leave messages unchanged.
- Target notification delivery within five minutes during normal operation. Measure this under pilot load; outage recovery and delivery timeouts are not an exactly-once or fixed-latency guarantee.

Public registration, billing, additional banks, historical imports, shared household accounts, multiple mailboxes per user, mailbox switching, automatic categorization, configurable timezones, and a public owner dashboard are excluded.

## Proposed implementation

### Identity and access

Use Google web OAuth for sign-in and server-managed sessions with secure, HttpOnly cookies. The Worker owns session validation and derives the user identity. Vercel proxies the required same-origin routes and forwards session material; a browser-supplied user ID never grants ownership.

Require a user session for all dashboard data routes, including totals, insights, and health, even when the request includes the existing server proxy credential. Preserve same-origin write protections, request limits, uncached responses, and redirect/timeout protections. Keep administrative operations outside the website proxy.

Add authentication, onboarding, and connection-management interfaces. Preserve existing transaction response shapes where possible; adding ownership internally must not expose other users or require the browser to choose a tenant.

### Persistence and credentials

Introduce account ownership for transactions, mailbox connections, Telegram links, sync progress, notification jobs, locks, and message associations. Enforce ownership in persistence operations and relational constraints.

Deduplicate Gmail receipts by mailbox identity plus source message ID. Identify Telegram messages by chat ID plus message ID. Namespace reminders and retry jobs by their actual account/chat scope; keep update deduplication consistent with one shared bot.

Store mailbox refresh tokens encrypted with a deployment-held key. Tag credentials with their OAuth-client identity. Add a web OAuth client for onboarding while retaining legacy-client support for the owner's existing connection until it is safely reconnected. Do not assume an existing desktop-client refresh token works with a new web client.

### Gmail, Telegram, and background work

Track independent activation, cursor, pagination, connection health, and retries per mailbox. Preserve activation on reconnect.

Reuse the existing Telegram bot with expiring, single-use links generated from an authenticated session. Validate private chat, sender, and transaction ownership for every interaction. Route reminders, receipts, and cleanup only to the matching account/chat.

Keep the five-minute schedule with bounded, round-robin account processing, independent leases, checkpoints, and retries. A failing or backlogged account must not monopolize the run. Disconnect/removal stops new associated work and cancels queued work; explicitly document the limit for requests already in flight.

### Account lifecycle

Separate Gmail disconnect, Telegram disconnect, sign-out, removal of invitation access, and account deletion. Connection disconnect preserves transaction history and activation for a later reconnect. Administrative account removal invalidates sessions, disables processing, cancels pending work, removes account-owned data and credentials, and handles provider revocation without exposing tokens. Reconcile active work before claiming deletion is complete.

## Migration and rollout

1. Reconcile this scheduled scope with the root implementation agreement before feature implementation.
2. Implement and validate tickets in dependency order in local tests/isolated previews. Do not deploy a partially protected multi-user stack.
3. Rehearse migration and recovery on synthetic data. Prepare a controlled maintenance window that stops new processing and drains or fences existing work.
4. Migrate the owner's existing records into the first account without changing IDs, activation, source deduplication, or pending reply associations. Prove owner identity; do not assign old data to the first arbitrary signup.
5. Verify the private owner dashboard and integration continuity before admitting two participants.
6. Complete their real transaction flows and reminder checks, then expand to the pilot limit.

Document a schema-compatible recovery path before rollout. A frontend rollback must not restore anonymous access, and an old Worker must not resume against an incompatible multi-user database.

## Validation

- [ ] Anonymous and uninvited users cannot access dashboard data or administrative routes.
- [ ] User A cannot read, edit, classify, summarize, or observe integration health belonging to user B.
- [ ] Identical Gmail IDs in different mailboxes and identical Telegram message IDs in different chats remain independent.
- [ ] Duplicate polling, duplicate Telegram updates, reversed replies, delivery retries, and cleanup retries preserve the correct transaction associations.
- [ ] OAuth denial/replay, wrong-account callbacks, expired linking tokens, token loss, and independent connection failures are handled safely.
- [ ] Reconnection preserves activation; disconnect/deletion blocks future work and does not affect another account.
- [ ] Migration preserves history and pending interactions; interruption and recovery are rehearsed.
- [ ] Ten-user simulations show fair scheduling and measure delivery latency and resource usage.
- [ ] Existing tests and build pass, followed by owner and two-participant live acceptance checks.

## External prerequisites and sources

Sources were consulted during planning on 2026-09-30. [MU-01](tickets/MU-01-pilot-prerequisites.md) must recheck current requirements and the actual app configuration before implementation/launch; this document does not certify eligibility.

- Google's personal-use exception describes fewer than 100 users personally known to the developer. An invitation alone does not establish the exception. See [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies) and [verification exceptions](https://support.google.com/cloud/answer/13464323?hl=en).
- `gmail.readonly` is restricted. A broader public service requires reassessing verification and server-side security-assessment obligations. See [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) and [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
- Configure the web flow independently of the current desktop setup. Gmail grants in external Testing mode can expire after seven days. See [web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) and [token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).
- Vercel Hobby is restricted to personal, noncommercial use; measure usage and reassess the plan before a commercial expansion. See [Hobby plan](https://vercel.com/docs/plans/hobby).
- Account linking can use Telegram [bot deep links](https://core.telegram.org/bots/features#deep-linking); application code must still enforce single-use, expiry, and identity checks.

## Completion evidence

Not implemented or scheduled. All implementation tickets remain Backlog.
