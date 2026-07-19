-- Ensure coordinate_points has status + description columns in EVERY surveyor schema.
--
-- Background: 079_add_status_to_coordinate_points.sql intended to add these but was
-- never applied — the migrate runner only picks up *.do.sql files (that one was plain
-- .sql), and it also carried a hardcoded COMMENT on a specific schema that may not
-- exist. This migration re-does the intent idempotently and safely.
--
-- status = point type (F=Fixed, P=Peg, etc.), used by Found Beacons + Coordinate List.

DO $$
DECLARE
  v_schema_name TEXT;
BEGIN
  FOR v_schema_name IN
    SELECT schema_name FROM surveyor_profiles WHERE schema_name IS NOT NULL
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I.coordinate_points ADD COLUMN IF NOT EXISTS status VARCHAR(10)', v_schema_name);
    EXECUTE format('ALTER TABLE IF EXISTS %I.coordinate_points ADD COLUMN IF NOT EXISTS description TEXT', v_schema_name);
    RAISE NOTICE 'Ensured status/description on %.coordinate_points', v_schema_name;
  END LOOP;
END $$;

-- Patch the public-schema table too, if one exists.
ALTER TABLE IF EXISTS public.coordinate_points ADD COLUMN IF NOT EXISTS status VARCHAR(10);
ALTER TABLE IF EXISTS public.coordinate_points ADD COLUMN IF NOT EXISTS description TEXT;
