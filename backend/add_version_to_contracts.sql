-- Migration: Add version column to contracts table for optimistic locking
-- Run this against your database to enable concurrent edit detection

-- Add version column to contracts if it doesn't exist
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'contracts' AND column_name = 'version';

