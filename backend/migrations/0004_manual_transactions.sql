-- Rebuild dependent tables in the migration transaction to preserve foreign keys.
CREATE TABLE expenses_manual (
 source TEXT NOT NULL DEFAULT 'email' CHECK(source IN ('email','manual')),
 manual_request TEXT,
 id TEXT PRIMARY KEY, source_message_id TEXT UNIQUE,
 received_at INTEGER NOT NULL, occurred_at TEXT, merchant TEXT, card_suffix TEXT,
 amount_minor INTEGER CHECK(amount_minor > 0 AND amount_minor <= 9007199254740991), currency TEXT,
 category TEXT CHECK(category IN ('Transport','Food','Groceries','Shopping','Bills','Health','Entertainment','Other')),
 description TEXT NOT NULL DEFAULT '', review_reason TEXT, dismissed INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 0,
 direction TEXT NOT NULL DEFAULT 'expense' CHECK(direction IN ('expense','income')),
 income_category TEXT CHECK(income_category IN ('Salary','Reimbursement','Other income')),
 CHECK(review_reason IS NOT NULL OR (occurred_at IS NOT NULL AND merchant IS NOT NULL AND (source='manual' OR card_suffix IS NOT NULL) AND amount_minor IS NOT NULL AND currency IS NOT NULL)),
 CHECK((source='email' AND source_message_id IS NOT NULL) OR (source='manual' AND source_message_id IS NULL AND manual_request IS NOT NULL))
);
INSERT INTO expenses_manual (id,source_message_id,received_at,occurred_at,merchant,card_suffix,amount_minor,currency,category,description,review_reason,dismissed,version,direction,income_category) SELECT id,source_message_id,received_at,occurred_at,merchant,card_suffix,amount_minor,currency,category,description,review_reason,dismissed,version,direction,income_category FROM expenses;
CREATE TABLE outbox_manual (
 id TEXT PRIMARY KEY, expense_id TEXT REFERENCES expenses_manual(id), kind TEXT NOT NULL,
 payload TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0,
 available_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, sent_at INTEGER, error TEXT
);
INSERT INTO outbox_manual SELECT * FROM outbox;
CREATE TABLE telegram_messages_manual (
 message_id INTEGER PRIMARY KEY, expense_id TEXT NOT NULL REFERENCES expenses_manual(id), kind TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT 0, cleanup_status TEXT
);
INSERT INTO telegram_messages_manual SELECT * FROM telegram_messages;
DROP TABLE outbox;
DROP TABLE telegram_messages;
DROP TABLE expenses;
ALTER TABLE expenses_manual RENAME TO expenses;
CREATE INDEX expenses_time ON expenses(occurred_at DESC);
ALTER TABLE outbox_manual RENAME TO outbox;
ALTER TABLE telegram_messages_manual RENAME TO telegram_messages;
CREATE INDEX outbox_pending ON outbox(sent_at,available_at,lease_until);
CREATE INDEX telegram_messages_expense ON telegram_messages(expense_id,kind);
