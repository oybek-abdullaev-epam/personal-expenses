# MU-03: Credential storage

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-02](MU-02-user-ownership.md)
- **Risks:** [R04](../RISKS.md#r04)

## Context and objective

The current deployment stores a single refresh token in an environment secret. Multiple mailbox connections require encrypted token storage and an explicit association with the OAuth client that issued each grant.

## Prerequisites

MU-02 provides mailbox ownership and connection persistence. The MU-01 contract specifies the legacy and web OAuth-client roles.

## Included work

- Implement authenticated encryption of per-mailbox refresh tokens using deployment-held key material, with a key/version identifier and connection identity binding.
- Keep client secrets and encryption keys out of D1 rows and browsers. Select the correct configured OAuth client for each stored grant.
- Retain the owner's existing client compatibility while supporting newly issued web-client grants; preserve a valid stored refresh token if a later provider response omits a replacement.
- Provide secret-safe errors and document key rotation/recovery and credential replacement procedures using synthetic tokens. A provider revocation must not be assumed to affect only one client or token.

## Excluded work

- Google consent UI, session authentication, mailbox polling, live token import/rotation/revocation, and production secret changes.

## Affected interfaces

A credential-storage module consumed by Gmail connection and token-refresh code; connection records from MU-02; deployment secret configuration and example variable names only.

## Acceptance checks

- [ ] A synthetic token round-trips only with the correct key and connection identity; ciphertext tampering, wrong keys, and swapped records fail closed.
- [ ] Persisted values and captured logs/responses contain no plaintext synthetic token; tests demonstrate that user-facing responses never expose credential material.
- [ ] Legacy and web grants use their matching client configurations; an unknown client/key identifier produces an actionable, redacted error.
- [ ] Replacement and missing-refresh-token cases preserve the correct usable credential without overwriting another user's data.
- [ ] A rehearsable key recovery/rotation procedure exists and clearly separates local test evidence from future production work.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
