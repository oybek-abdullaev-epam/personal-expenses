# Developer documentation

Start here if you are new to this codebase. It is a small single-owner app, about 1,600 lines of backend TypeScript and 2,500 lines of dashboard HTML and JS, but it has quite a few moving parts: Gmail, a Cloudflare Worker with a database and a cron, a Telegram bot, and a Vercel website.

## In one paragraph

Every five minutes a **Cloudflare Worker** searches a dedicated Gmail inbox for UZCARD bank notifications. It parses each one into an exact transaction and stores it in a **D1** (SQLite) database, together with a "notify the owner" job. That job sends a **Telegram** message asking for a category (buttons) and then a description (a reply). A public **Vercel** dashboard shows everything, with totals and a monthly view, and lets anyone edit details or add cash transactions. The dashboard talks to the Worker through a small server-side proxy that holds the secret token.

## Day-1 reading order

1. **[architecture.md](architecture.md)**: the parts, how they connect, and where the code lives. About 10 minutes.
2. **[transaction-lifecycle.md](transaction-lifecycle.md)**: one payment from email to dashboard, function by function. This is the most important page.
3. **[glossary.md](glossary.md)**: keep it open while reading the rest.
4. **[development.md](development.md)**: run `npm ci && npm test && npm run preview` and click around the synthetic dashboard.
5. Skim **[data-model.md](data-model.md)** and **[backend-api.md](backend-api.md)**.
6. Before your first deploy: **[deployment.md](deployment.md)** and **[operations.md](operations.md)**.

## Which doc answers my question?

| Question | Go to |
|---|---|
| What does the product do, and what is out of scope? | [PLAN.md](../PLAN.md) (the agreed scope) and [architecture.md](architecture.md) |
| How does an email become a transaction? | [transaction-lifecycle.md §2–4](transaction-lifecycle.md#2-polling-gmail-pollgmail-in-gmailts) |
| How does a Telegram reply find the right transaction? | [transaction-lifecycle.md §6](transaction-lifecycle.md#6-the-owner-answers-on-telegram-handleupdate-in-telegramts) |
| Why can't retries create duplicates? | [transaction-lifecycle.md §4–6](transaction-lifecycle.md#4-saving-savemessage-in-storets), [data-model.md → outbox](data-model.md#outbox-jobs-to-send-to-telegram) |
| What's in the database? How do I add a column? | [data-model.md](data-model.md) |
| What does endpoint X accept or return? | [backend-api.md](backend-api.md) |
| How is the website built? Why does my new endpoint 404? | [frontend.md](frontend.md) |
| How do I run and test it locally? | [development.md](development.md) |
| How do I deploy, and in what order? How do I roll back? | [deployment.md](deployment.md) |
| The dashboard shows an error. What now? | [operations.md](operations.md) |
| What does script X do? | [operations.md → helper scripts](operations.md#helper-scripts) |
| How was it set up originally? How do I rebuild or reconnect it? | [SETUP.md](SETUP.md) |
| What happened when? | [history.md](history.md) |
| What's planned next? | [next_steps.md](../next_steps.md), [future-plans/](../future-plans/README.md) |

Mini App deployment and browser verification are recorded in [MA-08 evidence](verification/telegram-mini-app/MA-08.md); recovery steps are in [deployment.md](deployment.md#mini-app-cutover-gates-and-recovery-rehearsal).

## Other files worth knowing

- [AGENTS.md](../AGENTS.md): rules for anyone changing the code, human or AI.
- [Document Feature Idea](../.agents/skills/document-feature-idea/SKILL.md): project Codex skill for saving future proposals with specs, backlog tickets, dependency graphs, and risks. Invoke it with `$document-feature-idea`; its read-only checker and isolated tests live beside the skill.
- [CONTEXT.md](../CONTEXT.md): the domain vocabulary.
- [`.claude/skills/`](../.claude/skills): step-by-step runbooks for deploying the backend and the website, and for UI work. An AI agent can follow them, and they are also a readable checklist for humans.

## Keeping these docs true

If you change behaviour, update the page that describes it in the same change. Deploy records go at the end of [history.md](history.md). The other pages describe how the system works *now*, not a timeline.
