-- Migration 105: give every surveyor schema the ten Diagram reference columns
--
-- Project Setup captures an "Immediate Parent Diagram" block (parent diagram No.,
-- type of deed or title, deed / certificate No.) plus the original-title, S.R.,
-- File, G.P. and compilation references. Migrations 085, 087 and 088 added those
-- columns to the surveyor schemas that EXISTED when they ran, but never taught
-- create_surveyor_schema() about them, so every schema born afterwards lacks them
-- (the same drift migration 093 fixed for parent_property / whole_portion).
--
-- The effect is silent: SurveyProject.update skips columns that do not exist, so
-- the values typed into Project Setup were never saved, and the figure
-- description's "Vide diagram S.G. No. ... annexed to ... No. ..." line printed
-- its dotted blanks on every general plan.
--
-- Two halves, following 093:
--  - backfill every surveyor schema (and public) with the ten columns, idempotently;
--  - patch the LIVE create_surveyor_schema() so new schemas are born complete. It
--    is patched from its deployed text rather than re-declared, so nothing a later
--    migration put in it is overwritten.

BEGIN;

CREATE OR REPLACE FUNCTION public.add_diagram_reference_columns_to_schema(p_schema_name VARCHAR)
RETURNS VOID AS $$
DECLARE
  col TEXT;
  cols TEXT[] := ARRAY[
    'deed_of_transfer_no',
    'parent_diagram_no',
    'parent_diagram_annexed_to',
    'original_title_diagram_no',
    'original_title_annexed_to',
    'original_title_deed_no',
    'sr_no',
    'file_no',
    'gp_no',
    'compilation'
  ];
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = p_schema_name AND table_name = 'survey_projects'
  ) THEN
    FOREACH col IN ARRAY cols LOOP
      EXECUTE format(
        'ALTER TABLE %I.survey_projects ADD COLUMN IF NOT EXISTS %I VARCHAR(100)',
        p_schema_name, col
      );
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.add_diagram_reference_columns_to_schema(VARCHAR) IS
  'Ensures a schema''s survey_projects has the ten Diagram reference columns (migration 105).';

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
    PERFORM public.add_diagram_reference_columns_to_schema(v_schema_name);
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.add_diagram_reference_columns_to_schema('public');

  RAISE NOTICE 'Migration 105: ensured diagram reference columns on % schema(s) + public', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- The generator: add the columns to survey_projects in the deployed
-- create_surveyor_schema(), right after instrument_rover_serial (which occurs
-- once, in that CREATE TABLE). Skipped if already present; refuses to guess if
-- the anchor is not found exactly once.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def    TEXT;
  v_anchor CONSTANT TEXT := 'instrument_rover_serial VARCHAR(100),';
  v_cols   CONSTANT TEXT := E'instrument_rover_serial VARCHAR(100),\n\n      deed_of_transfer_no VARCHAR(100),\n\n      parent_diagram_no VARCHAR(100),\n\n      parent_diagram_annexed_to VARCHAR(100),\n\n      original_title_diagram_no VARCHAR(100),\n\n      original_title_annexed_to VARCHAR(100),\n\n      original_title_deed_no VARCHAR(100),\n\n      sr_no VARCHAR(100),\n\n      file_no VARCHAR(100),\n\n      gp_no VARCHAR(100),\n\n      compilation VARCHAR(100),';
BEGIN
  v_def := pg_get_functiondef('public.create_surveyor_schema(character varying)'::regprocedure);

  IF position('parent_diagram_no' IN v_def) > 0 THEN
    RAISE NOTICE 'Migration 105: create_surveyor_schema() already creates the diagram reference columns';
  ELSIF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Migration 105: expected exactly one "%" in create_surveyor_schema(); not patching', v_anchor;
  ELSE
    EXECUTE replace(v_def, v_anchor, v_cols);
    RAISE NOTICE 'Migration 105: create_surveyor_schema() now creates the diagram reference columns';
  END IF;
END $$;

COMMIT;
