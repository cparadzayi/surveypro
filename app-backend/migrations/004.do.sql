BEGIN;

-- Drop and recreate FK for features.layer_id to ensure it targets current public.layers(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name='features' AND constraint_type='FOREIGN KEY' AND constraint_name='features_layer_id_fkey'
  ) THEN
    ALTER TABLE features DROP CONSTRAINT features_layer_id_fkey;
  END IF;
END$$;

ALTER TABLE features
  ADD CONSTRAINT features_layer_id_fkey FOREIGN KEY (layer_id)
  REFERENCES public.layers(id) ON DELETE CASCADE;

-- Ensure features.project_id FK to projects(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name='features' AND constraint_type='FOREIGN KEY' AND constraint_name='features_project_id_fkey'
  ) THEN
    ALTER TABLE features
      ADD CONSTRAINT features_project_id_fkey FOREIGN KEY (project_id)
      REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END$$;

COMMIT;
