-- Fix Elon's schema name (remove double prefix)
UPDATE surveyor_profiles
SET schema_name = 'surveyor_elon'
WHERE name = 'Elon Paradzayi';

-- Verify
SELECT id, name, schema_name FROM surveyor_profiles;
