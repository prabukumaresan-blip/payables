-- Create Payment History table
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

-- Add index on payable_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_payment_history_payable_id ON payment_history(payable_id);
