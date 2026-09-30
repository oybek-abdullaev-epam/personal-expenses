# Remaining live acceptance checks

The tracker is deployed and active (activation boundary `2026-09-24T16:19:45.972Z`, which is 21:19:45.972 Asia/Tashkent). Automated tests cover all of the checks below with synthetic data. These checks are about confirming the behaviour on real, naturally arriving transactions. **Never create an artificial production transaction to test.**

- [ ] A fresh `Platezh` (outgoing transfer) email received after the fix is parsed automatically, not as a review item.
- [ ] A description edited on the dashboard persists after a refresh.
- [ ] With two transactions pending, replying to their Telegram prompts in reverse order attaches each description to the right transaction.
- [ ] With an item left incomplete through 20:00 Tashkent time, exactly one reminder arrives. When everything is complete, no reminder arrives the next day.
- [ ] A live income (`Perevod na kartu`) transaction completes its category and description through Telegram.

The launch checklist and progress notes that used to be in this file are in [docs/history.md](docs/history.md#launch-checklist-previously-in-next_stepsmd-24-september-2026). The full acceptance procedure is in [docs/SETUP.md §6](docs/SETUP.md#6-activate-and-complete-the-live-acceptance-check).
