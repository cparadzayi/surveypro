-- Undo: Remove name column from features table
BEGIN;

DROP INDEX IF EXISTS features_layer_name_idx;
DROP INDEX IF EXISTS features_name_idx;

ALTER TABLE IF EXISTS features
  DROP COLUMN IF EXISTS name;

COMMIT;
