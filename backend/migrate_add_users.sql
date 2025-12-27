-- Migration: Add Users table and update audit logs with user tracking
-- Run this script manually in your PostgreSQL database

-- Create UserRole enum
DO $$ BEGIN
    CREATE TYPE userrole AS ENUM ('admin', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create UserStatus enum
DO $$ BEGIN
    CREATE TYPE userstatus AS ENUM ('pending', 'active', 'inactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    initials VARCHAR(4) UNIQUE NOT NULL,
    role userrole NOT NULL DEFAULT 'user',
    status userstatus NOT NULL DEFAULT 'pending',
    invite_token VARCHAR(255) UNIQUE,
    invite_token_expires TIMESTAMP WITH TIME ZONE,
    password_reset_token VARCHAR(255) UNIQUE,
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_by_id INTEGER REFERENCES users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_initials ON users(initials);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Add user tracking columns to audit log tables
ALTER TABLE cargo_audit_logs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE cargo_audit_logs ADD COLUMN IF NOT EXISTS user_initials VARCHAR(4);

ALTER TABLE monthly_plan_audit_logs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE monthly_plan_audit_logs ADD COLUMN IF NOT EXISTS user_initials VARCHAR(4);

ALTER TABLE quarterly_plan_audit_logs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE quarterly_plan_audit_logs ADD COLUMN IF NOT EXISTS user_initials VARCHAR(4);

ALTER TABLE contract_audit_logs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE contract_audit_logs ADD COLUMN IF NOT EXISTS user_initials VARCHAR(4);

-- Create indexes for user tracking in audit logs
CREATE INDEX IF NOT EXISTS idx_cargo_audit_user_initials ON cargo_audit_logs(user_initials);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_audit_user_initials ON monthly_plan_audit_logs(user_initials);
CREATE INDEX IF NOT EXISTS idx_quarterly_plan_audit_user_initials ON quarterly_plan_audit_logs(user_initials);
CREATE INDEX IF NOT EXISTS idx_contract_audit_user_initials ON contract_audit_logs(user_initials);

-- Insert default admin user (password will need to be set via invite link)
-- The admin can then create other users
INSERT INTO users (email, full_name, initials, role, status, invite_token, invite_token_expires)
VALUES (
    'admin@oillifting.local',
    'System Administrator',
    'ADM',
    'admin',
    'pending',
    'initial-admin-setup-token',
    NOW() + INTERVAL '30 days'
) ON CONFLICT (email) DO NOTHING;

-- Print success message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'Default admin user created with email: admin@oillifting.local';
    RAISE NOTICE 'Set password at: /set-password?token=initial-admin-setup-token';
END $$;

