-- Migration: Change eta_discharge_port from TIMESTAMP to VARCHAR
-- This allows free text input like "Dec 20", "20/12", etc.

ALTER TABLE cargos 
ALTER COLUMN eta_discharge_port TYPE VARCHAR 
USING CASE 
    WHEN eta_discharge_port IS NOT NULL 
    THEN to_char(eta_discharge_port, 'DD Mon YYYY')
    ELSE NULL
END;

