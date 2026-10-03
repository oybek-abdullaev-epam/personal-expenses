# MA-04: Telegram interface adaptation

- **Status:** Done
- **Proposal:** [Telegram Mini App](../PLAN.md)
- **Depends on:** [MA-01](MA-01-contracts.md)
- **Risks:** [R03](../RISKS.md#r03)

## Context and objective

Make the existing dashboard usable inside the supported Telegram clients while keeping its business logic shared.

## Prerequisites

MA-01 supplies [client support, startup, and browser-fallback contracts](../CONTRACTS.md). Use the existing synthetic data preview; integration occurs in MA-05.

## Included work

- Add the Telegram startup adapter and narrowly scoped SDK/CSP changes, with capability checks and safe failure states.
- Adapt themes, viewport/insets, keyboard-open forms, and Back/close behavior. Retain accessible in-page navigation when Telegram controls are unavailable.
- Preserve Ledger, Month, manual transactions, review/edit forms, filters, totals, and health using existing components and money/time conversions.
- Retain the full public browser dashboard and implement loading/network-error states without login or identity requirements. Retain input during recoverable errors and require deliberate handling of ambiguous writes or conflicts.
- Document the frontend integration and synthetic preview behavior.

## Excluded work

Adding end-user authentication, changing transaction rules, implementing offline sync, and configuring the production bot.

## Affected interfaces

`website/worker/page.html`, `website/worker/client.js`, page CSP, synthetic preview/test fixtures, and frontend docs.

## Acceptance checks

- [x] All existing screens work at mobile/desktop sizes, with visible focused inputs and reachable Save/Cancel controls when keyboards are open.
- [x] Theme changes, screen resize, Back, close/reopen, and capability gaps behave consistently on MA-01's required clients.
- [x] SDK failure or absent launch context retains ordinary dashboard use without a sign-in prompt; presentation/routing data never changes integration ownership.
- [x] Network failure and conflict states preserve appropriate input; an uncertain save is not silently repeated with a new request ID.
- [x] Synthetic preview and Telegram Web/browser visual evidence cover the required matrix; native-client checks remain deferred; automated checks verify affected behavior.

## Completion evidence

Verified 2026-10-02: [MA-04 evidence](../../../docs/verification/telegram-mini-app/MA-04.md). All 60 tests and full build pass; independent review is clear after adding a bounded request timeout. Ordinary-browser synthetic create/Month/draft controls and real Telegram Web K launch, Back, inline discard, close/reopen passed. Native clients and native keyboard behavior remain deferred by scope. Conflict draft retention is implemented; bounded latest-record review follows in MA-06.
