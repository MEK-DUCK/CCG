-- Migration: Add version columns for optimistic locking
-- This prevents lost updates when multiple users edit the same record concurrently

-- Add version column to cargos table
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Add version column to monthly_plans table
ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Add version column to quarterly_plans table
ALTER TABLE quarterly_plans ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Create index for better performance on version checks
CREATE INDEX IF NOT EXISTS idx_cargos_version ON cargos(id, version);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_version ON monthly_plans(id, version);
CREATE INDEX IF NOT EXISTS idx_quarterly_plans_version ON quarterly_plans(id, version);

