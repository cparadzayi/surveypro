-- Add name column to features table for easier QGIS labeling
BEGIN;

-- Add name column (nullable, will be populated from properties->>'name')
ALTER TABLE IF EXISTS features
  ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Populate existing records
UPDATE features
SET name = properties->>'name'
WHERE properties IS NOT NULL AND properties->>'name' IS NOT NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS features_name_idx ON features(name);

-- Create index for layer_id + name combination (for duplicate detection)
CREATE INDEX IF NOT EXISTS features_layer_name_idx ON features(layer_id, name);

COMMIT;
