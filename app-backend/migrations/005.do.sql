-- Optional PostGIS enablement and geometry column
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS postgis';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PostGIS not available: %', SQLERRM;
  END;

  BEGIN
    EXECUTE 'ALTER TABLE features ADD COLUMN IF NOT EXISTS geom geometry';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not add geometry column: %', SQLERRM;
  END;

  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS features_geom_gix ON features USING GIST (geom)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create GIST index: %', SQLERRM;
  END;
END$$;
