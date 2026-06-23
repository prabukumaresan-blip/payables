-- Add swift_code column to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS swift_code TEXT;
