# MU-10: Onboarding and account interface

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-05](MU-05-private-api-proxy.md), [MU-06](MU-06-gmail-integration.md), [MU-07](MU-07-telegram-linking.md)
- **Risks:** [R10](../RISKS.md#r10)

## Context and objective

The existing interface opens directly to a public ledger. Participants need a clear route through authentication and connection setup, followed by the same ledger experience restricted to their account.

## Prerequisites

MU-05 provides private data routes, MU-06 provides Gmail setup/status/activation, and MU-07 provides Telegram link/confirmation. Use the existing frontend and authentication from MU-04.

## Included work

- Add signed-out, invited-but-unconfigured, connecting, ready-to-activate, active, and reconnect-required views using actual server state.
- Guide users through Google sign-in, Gmail consent, Telegram connection/confirmation, and explicit Start tracking. Explain that Gmail access is read-only but mailbox-wide, while ingestion selects matching UZCARD receipts.
- Display the sign-in account and connected mailbox distinctly, show connection health, and allow retry/reconnect/sign-out without losing activation or history.
- Keep the ledger, month view, income/spending categories, reviews, filters, and edits private and compatible with existing behavior.
- Make account-state transitions usable on mobile and with keyboard/focus navigation. Leave disconnect/removal orchestration and its UI wiring to MU-11.

## Excluded work

- Account deletion policy, lifecycle job cancellation, new financial features, public sharing, additional languages, branding redesign, and external invitations/messages.

## Affected interfaces

Existing website page/client and proxy routes, authenticated session/account status, connection start/status/confirmation/reconnect, activation, and sign-out. Never render backend secrets or refresh tokens.

## Acceptance checks

- [ ] A synthetic invited participant completes every onboarding state and sees only their own empty/new account; sign-in alone does not activate tracking.
- [ ] Denied Gmail consent, interrupted setup, expired Telegram link, unconfirmed chat, and reconnect-required states offer the correct safe next step.
- [ ] Connecting the same account twice or refreshing a page does not reset activation or create duplicate connections.
- [ ] Two browser sessions show distinct account data; signing out clears user-specific display state and expired sessions cannot continue editing.
- [ ] Ledger, review, totals, and month views retain existing behavior with exact money and Tashkent dates.
- [ ] Browser checks cover mobile width and keyboard operation using synthetic data and mocked integrations; no production accounts or transactions are modified.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
