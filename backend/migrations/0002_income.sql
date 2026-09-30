ALTER TABLE expenses ADD COLUMN direction TEXT NOT NULL DEFAULT 'expense' CHECK(direction IN ('expense','income'));
ALTER TABLE expenses ADD COLUMN income_category TEXT CHECK(income_category IN ('Salary','Reimbursement','Other income'));
