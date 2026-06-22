-- Extend employees table with bank details
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_no TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS swift_code TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_type TEXT DEFAULT 'BANK_MUSCAT';

-- Create landowners table
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
