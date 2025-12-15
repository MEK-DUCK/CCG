-- Find duplicate cargos (multiple cargos with same monthly_plan_id)
-- Run this to see which monthly plans have duplicate cargos

SELECT 
    mp.id as monthly_plan_id,
    mp.month,
    mp.year,
    mp.month_quantity as plan_quantity,
    COUNT(c.id) as cargo_count,
    SUM(c.cargo_quantity) as total_cargo_quantity,
    STRING_AGG(c.cargo_id, ', ' ORDER BY c.created_at) as cargo_ids,
    STRING_AGG(c.id::text, ', ' ORDER BY c.created_at) as cargo_database_ids
FROM monthly_plans mp
LEFT JOIN cargos c ON c.monthly_plan_id = mp.id
GROUP BY mp.id, mp.month, mp.year, mp.month_quantity
HAVING COUNT(c.id) > 1
ORDER BY mp.year, mp.month;

