-- 1. Create Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL
);

-- Seed Categories
INSERT INTO categories (id, name, icon, color) VALUES
  ('cat-1', 'Vendor Payment', 'Building2', 'blue'),
  ('cat-2', 'Rent', 'Home', 'violet'),
  ('cat-3', 'Loan', 'Landmark', 'amber'),
  ('cat-4', 'PDC', 'Receipt', 'orange'),
  ('cat-5', 'Petty Cash', 'Wallet', 'green'),
  ('cat-6', 'Tax', 'Scale', 'rose'),
  ('cat-7', 'Other', 'MoreHorizontal', 'slate'),
  ('cat-8', 'Utility Payments', 'Zap', 'cyan')
ON CONFLICT (id) DO NOTHING;

-- 2. Create Vendors Table
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  bank_account TEXT,
  bank_name TEXT,
  account_no TEXT,
  swift_code TEXT,
  bank_type TEXT DEFAULT 'BANK_MUSCAT',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  email TEXT,
  phone TEXT,
  bank_account TEXT,
  bank_name TEXT,
  account_no TEXT,
  swift_code TEXT,
  bank_type TEXT DEFAULT 'BANK_MUSCAT',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3b. Create Landowners Table
CREATE TABLE IF NOT EXISTS landowners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  bank_account TEXT,
  bank_name TEXT,
  account_no TEXT,
  swift_code TEXT,
  bank_type TEXT DEFAULT 'BANK_MUSCAT',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Payables Table
CREATE TABLE IF NOT EXISTS payables (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  vendor_name TEXT,
  amount NUMERIC(15, 3) NOT NULL,
  currency TEXT DEFAULT 'OMR',
  due_date TEXT NOT NULL,
  payment_date TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled', 'partial')),
  paid_amount NUMERIC(15, 3),
  recurrence TEXT DEFAULT 'once' CHECK (recurrence IN ('once', 'monthly', 'quarterly', 'annual')),
  reference_no TEXT,
  bank_account TEXT,
  notes TEXT,
  attachment_url TEXT,
  month_year TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  rent_start_month TEXT,
  rent_repeat_sequence TEXT,
  rent_due_day INTEGER,
  pdc_start_date TEXT,
  pdc_no_of_cheques INTEGER
);

-- 5. Create PDCs (Post Dated Cheques) Table
CREATE TABLE IF NOT EXISTS pdcs (
  id TEXT PRIMARY KEY,
  payable_id TEXT REFERENCES payables(id) ON DELETE CASCADE,
  cheque_no TEXT NOT NULL,
  bank_name TEXT,
  cheque_date TEXT NOT NULL,
  presented_date TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'presented', 'cleared', 'bounced')),
  reminder_days INTEGER DEFAULT 3
);

-- 6. Create Loan Schedule Table
CREATE TABLE IF NOT EXISTS loan_schedule (
  id TEXT PRIMARY KEY,
  payable_id TEXT REFERENCES payables(id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL,
  principal NUMERIC(15, 3) NOT NULL,
  interest NUMERIC(15, 3) NOT NULL,
  balance_after NUMERIC(15, 3) NOT NULL
);

-- 7. Create Payment History Table
CREATE TABLE IF NOT EXISTS payment_history (
  id TEXT PRIMARY KEY,
  payable_id TEXT NOT NULL REFERENCES payables(id) ON DELETE CASCADE,
  amount NUMERIC(15, 3) NOT NULL,
  payment_date TEXT NOT NULL,
  reference_no TEXT,
  bank_account TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for payment_history lookup
CREATE INDEX IF NOT EXISTS idx_payment_history_payable_id ON payment_history(payable_id);

