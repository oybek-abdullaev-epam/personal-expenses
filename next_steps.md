# Remaining live acceptance checks

The tracker is deployed and active (activation boundary `2026-09-24T16:19:45.972Z`, which is 21:19:45.972 Asia/Tashkent). Automated tests cover transaction and notification logic with synthetic data; they do not establish native-client support. These checks are about confirming the behaviour on real, naturally arriving transactions. For the Telegram Mini App, the owner authorized identifiable disposable synthetic test records on 1 October 2026; remove only those test artifacts afterward. Naturally arriving transaction checks remain separate.

- [ ] A fresh `Platezh` (outgoing transfer) email received after the fix is parsed automatically, not as a review item.
- [ ] With two transactions pending, replying to their Telegram prompts in reverse order attaches each description to the right transaction.
- [ ] Observe the 21:00 Tashkent daily spending summary, including outstanding details and the empty-day skip rule. Deferred for the browser-only Mini App release by the owner.
- [ ] A live income (`Perevod na kartu`) transaction completes its category and description through Telegram.
- [ ] A fresh `Popolnenie scheta` (account top-up) email received after the 6 October 2026 fix is parsed automatically as income, not as a review item.

The launch checklist and progress notes that used to be in this file are in [docs/history.md](docs/history.md#launch-checklist-previously-in-next_stepsmd-24-september-2026). The full acceptance procedure is in [docs/SETUP.md §6](docs/SETUP.md#6-activate-and-complete-the-live-acceptance-check).

- [ ] Optional native Telegram iOS/Android/Desktop verification, including native keyboard and resume behavior. Deferred by the owner; browser widths do not establish native-client support.

## FP-003 reimbursement release gates

FP-003 was deployed on 6 October 2026 (see [history](docs/history.md)); the read-only hosted checks passed.

- [ ] Authorize a precise scope for disposable synthetic live records/messages, then run actual Telegram Web reimbursement picker/completion/navigation checks against the live deployment, recording the observed client and capabilities. Local browser and mocked SDK evidence do not satisfy this gate. Prior FP-002 live-test permission does not authorize FP-003 writes.
- [ ] Observe the first natural reimbursement receipt, the 21:00 summary and the pending legacy reimbursements being named and linked in production; clean up only tracked synthetic artifacts.
