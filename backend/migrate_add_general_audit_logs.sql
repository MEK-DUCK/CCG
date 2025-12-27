-- Migration: Add general_audit_logs table for tracking all entity changes
-- Covers: customers, products, load_ports, inspectors, users

CREATE TABLE IF NOT EXISTS general_audit_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,  -- CUSTOMER, PRODUCT, LOAD_PORT, INSPECTOR, USER
    entity_id INTEGER,
    entity_name VARCHAR(255),
    action VARCHAR(50) NOT NULL,  -- CREATE, UPDATE, DELETE
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    description TEXT,
    entity_snapshot TEXT,  -- JSON snapshot for deleted entities
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id INTEGER REFERENCES users(id),
    user_initials VARCHAR(4)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_general_audit_logs_entity_type ON general_audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_general_audit_logs_entity_id ON general_audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_general_audit_logs_created_at ON general_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_general_audit_logs_user_initials ON general_audit_logs(user_initials);

