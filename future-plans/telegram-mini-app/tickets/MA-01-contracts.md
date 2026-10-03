# MA-01: Scope and client contracts

- **Status:** Done
- **Proposal:** [Telegram Mini App](../PLAN.md)
- **Depends on:** None
- **Risks:** [R03](../RISKS.md#r03), [R06](../RISKS.md#r06)

## Context and objective

Define launch and client behavior for the existing public dashboard. No end-user authentication is required or to be introduced.

## Prerequisites

The owner scheduled implementation and controlled rollout on 2026-10-01; scope is reconciled with the root plan. Current Telegram documentation and read-only bot configuration were checked. Actual client launch evidence is an MA-05/MA-07 integration gate.

## Included work

- Define the supported client/version matrix and launch modes. Preserve the confirmed no-login policy and the existing browser dashboard.
- Document that FP-001 is separate. If both releases are later combined, reconcile their different data-access models in that future scope; do not add authentication dependencies here.
- Choose menu/message/profile launch modes and transaction-selector format. Inventory current dashboard/API routes, `SITE_URL` uses, deployment aliases, and recovery destinations.
- Define supported recovery and the compatibility/rollout contract; retain existing integration credentials and protections without adding visitor login.

## Excluded work

Production bot changes, feature implementation, public registration, and multi-user onboarding.

## Affected interfaces

Client bootstrap/navigation, existing public proxy contract, bot entry points, proposed release runbook, and the relationship to FP-001.

## Acceptance checks

- [x] All open decisions in the proposal have recorded outcomes or explicit blocking owners; no dependent ticket relies on an unresolved launch/client decision.
- [x] The contract preserves anonymous dashboard reads/writes and existing backend/admin/webhook protections, without requiring Telegram identity or launch credentials.
- [x] Documented launch mechanisms and actual bot configuration establish implementation feasibility; required Telegram Web launch experiments and browser fallback verification are explicitly assigned to MA-05/MA-07, without claiming they passed.
- [x] All prerequisites match the ticket index/graph, and current root-plan behavior takes precedence over stale future-plan details.

## Completion evidence

Completed 2026-10-01: [CONTRACTS.md](../CONTRACTS.md) records launch payloads, URL roles, selector/API semantics, source/configuration audit, no-login policy, browser-only client gate, and recovery. Root plan and proposal/index/risks are reconciled. Official Telegram documentation checked on this date; parent agent confirmed no Main Mini App configuration, commands menu, owner default inheritance, and Telegram Web K chat availability. No Mini App launch experiment is claimed complete. Native clients and natural receipt/live-summary observations are deferred by scope.
