# MU-05: Private backend and website proxy

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-04](MU-04-authentication-invitations.md)
- **Risks:** [R01](../RISKS.md#r01), [R11](../RISKS.md#r11)

## Context and objective

The website currently forwards one shared backend credential for anonymous reads and writes. Protect every user-facing data path using the session identity, including aggregates and integration health.

## Prerequisites

MU-04 supplies verified sessions and a trusted account resolver; MU-02 supplies scoped persistence. Use the existing route list as an inventory, including review resolution and month insights.

## Included work

- Require a valid user session on all dashboard data operations, even when the caller presents the proxy credential. Derive ownership server-side and scope all reads, edits, search, totals, insights, and health.
- Update the website proxy to forward the required session material without trusting browser-supplied ownership headers or exposing backend secrets.
- Preserve existing response shapes, exact totals, conflict handling, request/body limits, same-origin writes, no-store responses, and timeout/redirect handling.
- Keep administrative routes unavailable through the website. Ensure login/public information routes expose no account data and the dashboard enters an authenticated state.
- Document fail-closed release ordering so a partially upgraded proxy cannot fall back to global data access.

## Excluded work

- Connection management, full onboarding UI, database production migration, changing financial calculations, and public sharing of the owner's data.

## Affected interfaces

`backend/src/api.ts`, Worker request routing, the Vercel adapter/proxy, and the existing expenses, totals, insights, and health responses. Session/proxy handling follows the MU-01 contract.

## Acceptance checks

- [ ] Anonymous requests and requests carrying only the shared proxy credential receive no transaction, totals, insights, or account-health data.
- [ ] User A cannot read or edit user B's record by ID, search/filter, review actions, or forged ownership fields; error responses do not disclose B's record existence.
- [ ] Aggregates and connection errors contain only the signed-in user's data, including empty-account cases.
- [ ] Administrative routes remain blocked through the proxy; CSRF, body limits, conflict responses, redirect protection, and secret isolation retain regression coverage.
- [ ] Relevant API and website tests pass with two users and existing response/money contracts preserved.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
