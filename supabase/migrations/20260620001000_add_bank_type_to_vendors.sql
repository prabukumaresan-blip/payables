-- Add bank_type column to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_type TEXT DEFAULT 'BANK_MUSCAT';
