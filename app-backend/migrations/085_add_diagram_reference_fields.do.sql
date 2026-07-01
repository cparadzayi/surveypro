-- Migration 085: Add single-stand Diagram reference fields to survey_projects
-- in all surveyor schemas. Per the SI 727 Diagram reference grid (Deed of
-- Transfer, parent/original diagram Nos, S.R., File, G.P.). All nullable;
-- entered once per project and applied to every stand's diagram.

DO $$
DECLARE
  schema_rec RECORD;
  col TEXT;
  cols TEXT[] := ARRAY[
    'deed_of_transfer_no',
    'parent_diagram_no',
    'parent_diagram_annexed_to',
    'original_title_diagram_no',
    'sr_no',
    'file_no',
    'gp_no'
  ];
BEGIN
  -- Every surveyor schema
  FOR schema_rec IN
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    FOREACH col IN ARRAY cols LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = schema_rec.schema_name
          AND table_name = 'survey_projects'
          AND column_name = col
      ) THEN
        EXECUTE format(
          'ALTER TABLE %I.survey_projects ADD COLUMN %I VARCHAR(100)',
          schema_rec.schema_name, col
        );
        RAISE NOTICE 'Added % to %.survey_projects', col, schema_rec.schema_name;
      END IF;
    END LOOP;
  END LOOP;

  -- public schema too, if survey_projects exists there
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'survey_projects'
  ) THEN
    FOREACH col IN ARRAY cols LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'survey_projects'
          AND column_name = col
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.survey_projects ADD COLUMN %I VARCHAR(100)', col
        );
        RAISE NOTICE 'Added % to public.survey_projects', col;
      END IF;
    END LOOP;
  END IF;
END;
$$;
