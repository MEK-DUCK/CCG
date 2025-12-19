-- Add nullable additives_required flag to contracts.
-- Intended for use when a contract includes product "JET A-1".

ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS additives_required BOOLEAN;


