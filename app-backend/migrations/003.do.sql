BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

ALTER TABLE features
  ADD COLUMN IF NOT EXISTS project_id INTEGER;

COMMIT;-- Safety migration to ensure projects table has expected columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='code'
  ) THEN
    ALTER TABLE projects ADD COLUMN code VARCHAR(50) UNIQUE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='description'
  ) THEN
    ALTER TABLE projects ADD COLUMN description TEXT;
  END IF;
END$$;
