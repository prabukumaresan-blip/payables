-- 1. Create Companies Table
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  subtitle TEXT,
  tax_number TEXT,
  cr_number TEXT,
  logo_url TEXT,
  color TEXT,
  zoho_organization_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial companies
INSERT INTO companies (id, name, short_name, subtitle, tax_number, cr_number, color, zoho_organization_id, is_active) VALUES
  ('comp-1', 'BRIGHT FLOWERS TRADING LLC', 'Bright Flowers', 'Trading LLC', 'OM1100234567', '1249823', 'indigo', '771750431', true),
  ('comp-2', 'DESERT BLOOM LOGISTICS LLC', 'Desert Bloom', 'Logistics LLC', 'OM1100987654', '1388412', 'emerald', '1234567890', true),
  ('comp-3', 'GULF PETALS ENTERPRISES SPC', 'Gulf Petals', 'Enterprises SPC', 'OM1100554433', '1499201', 'violet', '789456123', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Create Company Bank Accounts Table
CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  swift_code TEXT,
  account_title TEXT,
  currency TEXT DEFAULT 'OMR',
  is_default BOOLEAN DEFAULT false
);

-- Seed initial company bank accounts
INSERT INTO company_bank_accounts (id, company_id, bank_name, account_number, swift_code, account_title, is_default) VALUES
  ('acc-1', 'comp-1', 'Bank Muscat', '0371024323360013', 'BMUSOMRX', 'Main Operations Account', true),
  ('acc-2', 'comp-1', 'Bank Dhofar', '0492018471200021', 'BKDHOMRX', 'Secondary Operations', false),
  ('acc-3', 'comp-2', 'National Bank of Oman', '0183049281720031', 'NBOKOMRX', 'Corporate Treasury Account', true),
  ('acc-4', 'comp-2', 'Bank Muscat', '0315098234120044', 'BMUSOMRX', 'Payroll & Fleet Account', false),
  ('acc-5', 'comp-3', 'Sohar International', '0250017482910055', 'BKSHOMRX', 'Main Commercial Account', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Alter existing tables to add missing columns

-- Add to payables
ALTER TABLE payables ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS debit_bank_account_id TEXT REFERENCES company_bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS zoho_bill_id TEXT;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS zoho_bill_number TEXT;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS zoho_contact_id TEXT;

-- Update existing payables to belong to default company if null
UPDATE payables SET company_id = 'comp-1' WHERE company_id IS NULL;

-- Add to payment_history
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS zoho_payment_id TEXT;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS zoho_synced_at TEXT;

-- Update existing payment_history to belong to default company if null
UPDATE payment_history SET company_id = 'comp-1' WHERE company_id IS NULL;

-- Add to vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS zoho_contact_id TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS zoho_last_synced_at TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS outstanding_payable_amount NUMERIC(15, 3) DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS unused_credits_payable_amount NUMERIC(15, 3) DEFAULT 0;

-- Update existing vendors to belong to default company if null
UPDATE vendors SET company_id = 'comp-1' WHERE company_id IS NULL;

-- Add to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS swift_code TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_no TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_type TEXT;

-- Update existing employees to belong to default company if null
UPDATE employees SET company_id = 'comp-1' WHERE company_id IS NULL;

-- Add to landowners
ALTER TABLE landowners ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE landowners ADD COLUMN IF NOT EXISTS bank_account TEXT;

-- Update existing landowners to belong to default company if null
UPDATE landowners SET company_id = 'comp-1' WHERE company_id IS NULL;

-- 4. Disable RLS for new tables to allow public anonymous read and write operations (for dev)
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_bank_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history DISABLE ROW LEVEL SECURITY;
