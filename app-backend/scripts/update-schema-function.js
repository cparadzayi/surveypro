import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const sql = `
CREATE OR REPLACE FUNCTION create_surveyor_schema(p_username VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_schema_name VARCHAR;
BEGIN
  v_schema_name := generate_schema_name(p_username);
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.survey_projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      client_name VARCHAR(255),
      survey_type VARCHAR(100),
      survey_date DATE,
      district VARCHAR(100),
      central_meridian VARCHAR(10),
      working_directory TEXT,
      status VARCHAR(50) DEFAULT ''active'',
      metadata JSONB,
      workflow_state JSONB DEFAULT ''{"completed_steps": [], "current_step": "project-setup", "step_data": {}, "generated_documents": {}, "can_finalize": false}''::jsonb,
      last_used TIMESTAMP,
      datum VARCHAR(50),
      instruments TEXT,
      designation TEXT,
      township VARCHAR(255),
      whole_portion TEXT DEFAULT ''the whole'' CHECK (whole_portion IN (''the whole'', ''the remainder'', ''a portion'')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_projects_name ON %I.survey_projects(name)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_projects_date ON %I.survey_projects(survey_date)', v_schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_projects_status ON %I.survey_projects(status)', v_schema_name);
  RETURN v_schema_name;
END;
$$ LANGUAGE plpgsql;
`

try {
  await pool.query(sql)
  console.log('✅ create_surveyor_schema function updated successfully')
  console.log('   New schemas will now include: datum, instruments, designation, township, whole_portion')
} catch (e) {
  console.error('❌ Error:', e.message)
} finally {
  await pool.end()
}
