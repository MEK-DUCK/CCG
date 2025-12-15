-- SQL script to add unique constraint on monthly_plan_id in cargos table
-- 
-- IMPORTANT: This constraint will FAIL if duplicate cargos exist.
-- Run the cleanup script first (see below) if you have duplicates.
--
-- To apply this constraint:
--   1. First, clean up any duplicate cargos (see cleanup script below)
--   2. Then run: psql -U postgres -d oil_lifting -f add_unique_constraint_monthly_plan.sql
--
-- OR manually:
--   ALTER TABLE cargos ADD CONSTRAINT cargos_monthly_plan_id_unique UNIQUE (monthly_plan_id);

-- Check for duplicates first (this query should return 0 rows)
SELECT monthly_plan_id, COUNT(*) as cargo_count
FROM cargos
GROUP BY monthly_plan_id
HAVING COUNT(*) > 1;

-- If no duplicates, add the constraint:
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'cargos_monthly_plan_id_unique'
    ) THEN
        ALTER TABLE cargos 
        ADD CONSTRAINT cargos_monthly_plan_id_unique 
        UNIQUE (monthly_plan_id);
        RAISE NOTICE 'Unique constraint added successfully';
    ELSE
        RAISE NOTICE 'Constraint already exists';
    END IF;
END $$;

