# MA-04: Telegram interface adaptation

- **Status:** Ready
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

- [ ] All existing screens work at mobile/desktop sizes, with visible focused inputs and reachable Save/Cancel controls when keyboards are open.
- [ ] Theme changes, screen resize, Back, close/reopen, and capability gaps behave consistently on MA-01's required clients.
- [ ] SDK failure or absent launch context retains ordinary dashboard use without a sign-in prompt; presentation/routing data never changes integration ownership.
- [ ] Network failure and conflict states preserve appropriate input; an uncertain save is not silently repeated with a new request ID.
- [ ] Synthetic preview and Telegram Web/browser visual evidence cover the required matrix; native-client checks remain deferred; automated checks verify affected behavior.

## Completion evidence

Not started. Record change references, synthetic screenshots, real-client versions, relevant checks, and unsupported cases.
