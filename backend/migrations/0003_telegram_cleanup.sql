ALTER TABLE telegram_messages ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_messages ADD COLUMN cleanup_status TEXT;
CREATE INDEX telegram_messages_expense ON telegram_messages(expense_id,kind);
