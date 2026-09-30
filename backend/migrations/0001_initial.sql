CREATE TABLE sync_state (
 id INTEGER PRIMARY KEY CHECK(id=1), activated_at INTEGER NOT NULL,
 cursor_at INTEGER NOT NULL, window_end INTEGER, page_token TEXT,
 last_success INTEGER, error TEXT, auth_alerted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE expenses (
 id TEXT PRIMARY KEY, source_message_id TEXT NOT NULL UNIQUE,
 received_at INTEGER NOT NULL, occurred_at TEXT, merchant TEXT, card_suffix TEXT,
 amount_minor INTEGER CHECK(amount_minor > 0 AND amount_minor <= 9007199254740991), currency TEXT,
 category TEXT CHECK(category IN ('Transport','Food','Groceries','Shopping','Bills','Health','Entertainment','Other')),
 description TEXT NOT NULL DEFAULT '', review_reason TEXT, dismissed INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 0,
 CHECK(review_reason IS NOT NULL OR (occurred_at IS NOT NULL AND merchant IS NOT NULL AND card_suffix IS NOT NULL AND amount_minor IS NOT NULL AND currency IS NOT NULL))
);
CREATE INDEX expenses_time ON expenses(occurred_at DESC);
CREATE TABLE outbox (
 id TEXT PRIMARY KEY, expense_id TEXT REFERENCES expenses(id), kind TEXT NOT NULL,
 payload TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0,
 available_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, sent_at INTEGER, error TEXT
);
CREATE INDEX outbox_pending ON outbox(sent_at,available_at,lease_until);
CREATE TABLE telegram_messages (
 message_id INTEGER PRIMARY KEY, expense_id TEXT NOT NULL REFERENCES expenses(id), kind TEXT NOT NULL
);
CREATE TABLE telegram_updates (id INTEGER PRIMARY KEY, processed_at INTEGER NOT NULL);
CREATE TABLE locks (name TEXT PRIMARY KEY, token TEXT NOT NULL, until_at INTEGER NOT NULL);
