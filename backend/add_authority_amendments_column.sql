-- Migration: Add authority_amendments column to contracts table
-- This column stores JSON array of mid-contract min/max quantity adjustments

-- Add the column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contracts' AND column_name = 'authority_amendments'
    ) THEN
        ALTER TABLE contracts ADD COLUMN authority_amendments TEXT;
        RAISE NOTICE 'Added authority_amendments column to contracts table';
    ELSE
        RAISE NOTICE 'authority_amendments column already exists';
    END IF;
END $$;

