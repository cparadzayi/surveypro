-- Migration 111: retire the parent_area column added by migration 110.
--
-- "Original Area of Parent Property (m²)" has been removed from Project Setup:
-- the parent's area follows from the parent property's geometry, so it must not
-- be typed into the project record. Migration 110 added the column and taught
-- create_surveyor_schema() about it; this migration removes both so existing
-- tables and schemas registered afterwards agree with the form again. Applied
-- migrations are never edited, so the uninstall is a new numbered migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.remove_parent_area_from_schema(p_schema_name VARCHAR)
RETURNS VOID AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = p_schema_name AND table_name = 'survey_projects'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.survey_projects DROP COLUMN IF EXISTS parent_area',
      p_schema_name
    );
    RAISE NOTICE 'remove_parent_area_from_schema: dropped parent_area on %.survey_projects', p_schema_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_schema_name VARCHAR;
  v_count INTEGER := 0;
BEGIN
  FOR v_schema_name IN
    SELECT t.table_schema
    FROM information_schema.tables t
    WHERE t.table_schema LIKE 'surveyor%'
      AND t.table_name = 'survey_projects'
  LOOP
    PERFORM public.remove_parent_area_from_schema(v_schema_name);
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.remove_parent_area_from_schema('public');

  RAISE NOTICE 'Migration 111: dropped parent_area on % schema(s) + public', v_count;
END $$;

-- Patch the live generator from its deployed definition, as migration 110 did.
-- Only the exact fragment inserted by 110 is removed; an unexpected shape is
-- reported rather than silently leaving a column the form no longer supplies.
DO $$
DECLARE
  v_def      TEXT;
  v_anchor   CONSTANT TEXT := E'parent_area NUMERIC(14,2),\n\n      ';
  v_occurrences INTEGER;
BEGIN
  v_def := pg_get_functiondef('public.create_surveyor_schema(character varying)'::regprocedure);
  v_occurrences := (length(v_def) - length(replace(v_def, 'parent_area', ''))) / length('parent_area');

  IF v_occurrences = 0 THEN
    RAISE NOTICE 'Migration 111: create_surveyor_schema() does not create parent_area';
  ELSIF v_occurrences <> 1 OR position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Migration 111: unexpected parent_area definition in create_surveyor_schema(); not patching';
  ELSE
    EXECUTE replace(v_def, v_anchor, '');
    RAISE NOTICE 'Migration 111: create_surveyor_schema() no longer creates parent_area';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.add_parent_area_to_schema(VARCHAR);
DROP FUNCTION IF EXISTS public.remove_parent_area_from_schema(VARCHAR);

COMMIT;
