BEGIN;

-- Add params JSONB to layers to store projection metadata (e.g., central meridian, EPSG, proj4)
ALTER TABLE IF EXISTS layers
  ADD COLUMN IF NOT EXISTS params JSONB;

COMMIT;
