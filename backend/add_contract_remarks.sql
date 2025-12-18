-- Adds a nullable remarks field to contracts for the Contract Summary page.
-- PostgreSQL:
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS remarks TEXT;

-- SQLite note:
-- SQLite supports ADD COLUMN, but not IF NOT EXISTS on older versions.
-- If using SQLite and this fails, run:
--   ALTER TABLE contracts ADD COLUMN remarks TEXT;


