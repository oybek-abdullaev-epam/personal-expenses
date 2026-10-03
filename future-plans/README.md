# Future plans

Ideas and proposals for later work. Saving an idea or marking it planned does not schedule implementation, authorize a deployment, or change current application behavior. The root [PLAN.md](../PLAN.md) remains the current implementation agreement; [README.md](../README.md) describes what is implemented.

## Idea index

| ID | Idea | Status | Description | Planning material |
| --- | --- | --- | --- | --- |
| FP-001 | [Private multi-user pilot](multi-user-pilot/PLAN.md) | Planned / not scheduled | Private accounts for 5–10 friends or family using UZCARD emails, Gmail, and Telegram; preserve the owner's history. | [Tickets and dependencies](multi-user-pilot/TICKETS.md) · [Risks](multi-user-pilot/RISKS.md) |
| FP-002 | [Telegram Mini App](telegram-mini-app/PLAN.md) | Done — 3 October 2026 | Open the existing tracker inside Telegram; no login, bot launch buttons, and transaction links under the existing public-access policy. | [Tickets and dependencies](telegram-mini-app/TICKETS.md) · [Risks](telegram-mini-app/RISKS.md) · [Contracts](telegram-mini-app/CONTRACTS.md) |
| FP-003 | [Expense reimbursements](expense-reimbursements/PLAN.md) | In progress — implementation authorized 3 October 2026 | Link named repayments to an earlier expense and show personal spending after reimbursement. | [Tickets and dependencies](expense-reimbursements/TICKETS.md) · [Risks](expense-reimbursements/RISKS.md) |

## Idea inbox

Add short ideas here before turning them into proposals. No additional ideas have been recorded yet.

Suggested entry: `- Idea title — problem to solve; who benefits; next question to investigate.`

## Adding a proposal

1. Choose a descriptive folder name and the next unused `FP-NNN` identifier.
2. Copy [_idea-template.md](_idea-template.md) into that folder as `PLAN.md`, replacing its placeholders.
3. Add a row to the idea index. Start at **Idea** until the intended behavior is clear.
4. When useful, add `TICKETS.md`, `RISKS.md`, and individual files in `tickets/` using [_ticket-template.md](_ticket-template.md).
5. Give tickets stable IDs, link prerequisites, and show prerequisite → dependent edges in a Mermaid graph. Keep the graph, index, and ticket files consistent.
6. Before implementing a proposal, explicitly schedule the work and reconcile its accepted scope with the root implementation agreement. Saving this backlog does not perform that promotion.

Use **Idea**, **Planned / not scheduled**, **Scheduled**, **In progress**, **Done**, or **Dropped** for proposals. Use **Backlog**, **Ready**, **In progress**, **Blocked**, or **Done** for tickets. Record completion evidence before marking work done; uncompleted acceptance checks remain unchecked.

Keep examples synthetic or redacted. Do not put credentials, full emails, account balances, private user identifiers, or production exports in this folder.
