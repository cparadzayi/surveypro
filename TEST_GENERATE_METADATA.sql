-- Test the generate_parcel_metadata function directly
SELECT jsonb_pretty(generate_parcel_metadata(63)) as generated_metadata;

-- If that works, manually update parcel 2474 with the generated metadata
UPDATE land_parcels
SET metadata = generate_parcel_metadata(63)
WHERE id = 63
RETURNING stand, jsonb_pretty(metadata) as updated_metadata;
