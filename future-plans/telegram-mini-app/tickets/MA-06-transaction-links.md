# MA-06: Transaction navigation and chat coexistence

- **Status:** Ready
- **Proposal:** [Telegram Mini App](../PLAN.md)
- **Depends on:** [MA-05](MA-05-launch.md)
- **Risks:** [R04](../RISKS.md#r04)

## Context and objective

Open the right transaction from its chat message and preserve correctness when edits and replies overlap.

## Prerequisites

MA-05 supplies working no-login launch and generic bot links; MA-01 defines selectors and supported link modes.

## Included work

- Add **View transaction** to suitable transaction messages and receipts using stable, minimally identifying selectors.
- Add bounded `GET /api/expenses/:id` and `?transaction=<UUID>` navigation under the [MA-01 contract](../CONTRACTS.md); the current proxy has no single-record GET and records may be outside loaded filters/pages.
- Navigate after validating the selector and looking up the record. Handle missing/unavailable targets neutrally and offer a return to the Ledger.
- Verify and preserve existing dashboard-edit behavior around pending category/description prompts, receipts, and cleanup; define any necessary reconciliation explicitly instead of creating side effects merely by opening a link.
- Retain optimistic versions and manual submission request IDs across network retries; update API/proxy/frontend/lifecycle documentation if affected.

## Excluded work

Link-based access grants, automatic edits on open, public sharing, replacing the chat classification flow, and production message rewrites.

## Affected interfaces

Launch parser/router, record retrieval/API allowlist if extended, Telegram message markup, existing edit/conflict handling, and synthetic association/retry fixtures.

## Acceptance checks

- [ ] A valid link selects its transaction even outside the current page/date/filter; opening twice creates no write or notification.
- [ ] Malformed or missing selectors fail safely; valid selectors open the intended public record, and opening or tampering with a link cannot mutate a record.
- [ ] Mini App edits interleaved with category callbacks and reversed description replies retain correct associations; stale prompts/conflicts have explicit safe outcomes.
- [ ] Duplicate polling/updates, receipt and cleanup retries, and network interruptions do not duplicate deterministic effects or manual entries.
- [ ] Existing manual-entry, exact-total, timezone, income, review, and daily-summary behavior passes relevant regression checks.

## Completion evidence

Not started. Record routing/association test results, Telegram Web/browser client evidence, API changes, and remaining edge cases.
