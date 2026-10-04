-- Additive: preserve bank fields, manual snapshots and integration state.
ALTER TABLE expenses ADD COLUMN payer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE expenses ADD COLUMN reimbursement_expense_id TEXT REFERENCES expenses(id);
CREATE INDEX expenses_reimbursement_parent ON expenses(reimbursement_expense_id);

CREATE TRIGGER reimbursement_insert_guard BEFORE INSERT ON expenses
WHEN NEW.reimbursement_expense_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM expenses p WHERE p.id=NEW.reimbursement_expense_id
  AND NEW.direction='income' AND NEW.income_category='Reimbursement'
  AND NEW.review_reason IS NULL AND NEW.dismissed=0 AND length(trim(NEW.payer_name,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)))>0
  AND p.direction='expense' AND p.review_reason IS NULL AND p.dismissed=0
  AND p.currency=NEW.currency AND p.occurred_at<=NEW.occurred_at
  AND NEW.amount_minor<=p.amount_minor-COALESCE((SELECT SUM(c.amount_minor) FROM expenses c WHERE c.reimbursement_expense_id=p.id),0)
 ) THEN RAISE(ABORT,'reimbursement_conflict') END;
END;
CREATE TRIGGER reimbursement_update_guard BEFORE UPDATE OF reimbursement_expense_id,payer_name,direction,income_category,review_reason,dismissed,currency,occurred_at,amount_minor ON expenses
BEGIN
 -- Unlink before changing fields that would invalidate the previous relationship.
 SELECT CASE WHEN OLD.reimbursement_expense_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM expenses p WHERE p.id=OLD.reimbursement_expense_id
  AND NEW.direction='income' AND NEW.income_category='Reimbursement'
  AND NEW.review_reason IS NULL AND NEW.dismissed=0
  AND p.currency=NEW.currency AND p.occurred_at<=NEW.occurred_at
  AND NEW.amount_minor<=p.amount_minor-COALESCE((SELECT SUM(c.amount_minor) FROM expenses c WHERE c.reimbursement_expense_id=p.id AND c.id<>NEW.id),0)
 ) THEN RAISE(ABORT,'reimbursement_conflict') END;
 SELECT CASE WHEN NEW.reimbursement_expense_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM expenses p WHERE p.id=NEW.reimbursement_expense_id
  AND NEW.direction='income' AND NEW.income_category='Reimbursement'
  AND NEW.review_reason IS NULL AND NEW.dismissed=0 AND length(trim(NEW.payer_name,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)))>0
  AND p.direction='expense' AND p.review_reason IS NULL AND p.dismissed=0
  AND p.currency=NEW.currency AND p.occurred_at<=NEW.occurred_at
  AND NEW.amount_minor<=p.amount_minor-COALESCE((SELECT SUM(c.amount_minor) FROM expenses c WHERE c.reimbursement_expense_id=p.id AND c.id<>NEW.id),0)
 ) THEN RAISE(ABORT,'reimbursement_conflict') END;
 -- A parent edit must keep every child eligible and the total within capacity.
 SELECT CASE WHEN EXISTS (SELECT 1 FROM expenses c WHERE c.reimbursement_expense_id=OLD.id) AND (
  NEW.direction<>'expense' OR NEW.review_reason IS NOT NULL OR NEW.dismissed<>0
  OR EXISTS (SELECT 1 FROM expenses c WHERE c.reimbursement_expense_id=OLD.id AND (c.currency<>NEW.currency OR c.occurred_at<NEW.occurred_at))
  OR NEW.amount_minor<COALESCE((SELECT SUM(c.amount_minor) FROM expenses c WHERE c.reimbursement_expense_id=OLD.id),0)
 ) THEN RAISE(ABORT,'reimbursement_conflict') END;
END;
CREATE TRIGGER reimbursement_insert_versions AFTER INSERT ON expenses
WHEN NEW.reimbursement_expense_id IS NOT NULL
BEGIN
 UPDATE expenses SET version=version+1 WHERE id=NEW.reimbursement_expense_id;
END;
CREATE TRIGGER reimbursement_update_versions AFTER UPDATE OF reimbursement_expense_id,payer_name,description,merchant,card_suffix,amount_minor,currency,occurred_at,direction,income_category,review_reason,dismissed ON expenses
WHEN (OLD.reimbursement_expense_id IS NOT NEW.reimbursement_expense_id)
 OR ((OLD.reimbursement_expense_id IS NOT NULL OR NEW.reimbursement_expense_id IS NOT NULL) AND (
 OLD.payer_name IS NOT NEW.payer_name OR OLD.description IS NOT NEW.description
 OR OLD.merchant IS NOT NEW.merchant OR OLD.card_suffix IS NOT NEW.card_suffix
 OR OLD.amount_minor IS NOT NEW.amount_minor OR OLD.currency IS NOT NEW.currency
 OR OLD.occurred_at IS NOT NEW.occurred_at OR OLD.direction IS NOT NEW.direction
 OR OLD.income_category IS NOT NEW.income_category OR OLD.review_reason IS NOT NEW.review_reason OR OLD.dismissed IS NOT NEW.dismissed))
BEGIN
 UPDATE expenses SET version=version+1 WHERE id IN (OLD.reimbursement_expense_id,NEW.reimbursement_expense_id);
END;
