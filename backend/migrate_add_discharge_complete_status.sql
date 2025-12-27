-- Add DISCHARGE_COMPLETE to the cargostatus enum
-- Adding both the value format and name format for compatibility
ALTER TYPE cargostatus ADD VALUE IF NOT EXISTS 'Discharge Complete';
ALTER TYPE cargostatus ADD VALUE IF NOT EXISTS 'DISCHARGE_COMPLETE';

