-- Schema adjustments for Zimbabwe compute features
BEGIN;

-- Add bbox (JSONB) and updated_at to features if missing
ALTER TABLE IF EXISTS features
  ADD COLUMN IF NOT EXISTS bbox JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Add updated_at to layers if missing
ALTER TABLE IF EXISTS layers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

COMMIT;
