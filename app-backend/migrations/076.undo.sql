-- Migration 076 UNDO: Revert Outside Figure Metadata Update
-- This removes the beacon names from metadata.residuals.edges

BEGIN;

-- Remove beacon id/name from edges in Outside Figure parcels
UPDATE land_parcels
SET metadata = jsonb_set(
  metadata,
  '{residuals,edges}',
  '[]'::JSONB
)
WHERE stand ILIKE '%outside figure%'
   OR designation ILIKE '%outside figure%'
   OR (metadata->>'isOutsideFigure')::BOOLEAN = TRUE;

COMMIT;
