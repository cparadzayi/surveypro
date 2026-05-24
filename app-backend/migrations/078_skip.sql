-- Skip migration 078.do.sql (has errors, fixed in 078_fix_view.sql)
-- This file marks 078.do.sql as applied without running it

-- The issue: 078.do.sql references cp.y and cp.x which don't exist
-- The fix: 078_fix_view.sql uses ST_Y(geom) and ST_X(geom) instead

SELECT 'Migration 078.do.sql skipped - using 078_fix_view.sql instead' as status;
