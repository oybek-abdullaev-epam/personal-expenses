# Remaining live acceptance checks

The tracker is deployed and active (activation boundary `2026-09-24T16:19:45.972Z`, which is 21:19:45.972 Asia/Tashkent). Automated tests cover transaction and notification logic with synthetic data; they do not establish native-client support. These checks are about confirming the behaviour on real, naturally arriving transactions. For the Telegram Mini App, the owner authorized identifiable disposable synthetic test records on 1 October 2026; remove only those test artifacts afterward. Naturally arriving transaction checks remain separate.

- [ ] A fresh `Platezh` (outgoing transfer) email received after the fix is parsed automatically, not as a review item.
- [ ] With two transactions pending, replying to their Telegram prompts in reverse order attaches each description to the right transaction.
- [ ] Observe the 21:00 Tashkent daily spending summary, including outstanding details and the empty-day skip rule. Deferred for the browser-only Mini App release by the owner.
- [ ] A live income (`Perevod na kartu`) transaction completes its category and description through Telegram.

The launch checklist and progress notes that used to be in this file are in [docs/history.md](docs/history.md#launch-checklist-previously-in-next_stepsmd-24-september-2026). The full acceptance procedure is in [docs/SETUP.md §6](docs/SETUP.md#6-activate-and-complete-the-live-acceptance-check).

- [ ] Optional native Telegram iOS/Android/Desktop verification, including native keyboard and resume behavior. Deferred by the owner; browser widths do not establish native-client support.
