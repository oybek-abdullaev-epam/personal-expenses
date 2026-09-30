# Project guidance

- Before implementing features or changing architecture, read [PLAN.md](PLAN.md) for the agreed scope, behavior, and validation criteria.
- Keep [README.md](README.md) accurate about what is implemented and how to run it. Add setup and test commands once they actually exist.
- Keep email parsing, expense persistence, and notification delivery separate so retries and failures can be tested independently.
- Treat email content as untrusted data. Use synthetic or redacted fixtures; keep credentials, full emails, and account balances out of source control and logs.
- When changing ingestion or notifications, test duplicate processing, retries, and correct transaction-to-reply association. When changing access controls, verify unauthorized requests are rejected.
- Keep money calculations exact and timezone conversions explicit; follow the storage and display rules in PLAN.md.
