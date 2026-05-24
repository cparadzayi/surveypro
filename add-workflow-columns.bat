@echo off
echo Adding workflow_state and last_used columns to surveyor schemas...
echo.

psql -U postgres -d surveypro_db -c "ALTER TABLE surveyor_kuziva_paradzayi.survey_projects ADD COLUMN IF NOT EXISTS workflow_state JSONB DEFAULT '{\"completed_steps\": [], \"current_step\": \"project-setup\", \"step_data\": {}, \"generated_documents\": {}, \"can_finalize\": false}'::jsonb, ADD COLUMN IF NOT EXISTS last_used TIMESTAMP;"

echo.
echo Verifying columns...
psql -U postgres -d surveypro_db -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'surveyor_kuziva_paradzayi' AND table_name = 'survey_projects' AND column_name IN ('workflow_state', 'last_used') ORDER BY column_name;"

echo.
echo Checking current projects...
psql -U postgres -d surveypro_db -c "SELECT id, name, district, workflow_state->>'current_step' as current_step FROM surveyor_kuziva_paradzayi.survey_projects ORDER BY id;"

echo.
echo Done!
pause
