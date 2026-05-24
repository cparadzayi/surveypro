-- Create surveyors table
CREATE TABLE IF NOT EXISTS surveyors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  license_number VARCHAR(100) UNIQUE NOT NULL,
  firm VARCHAR(255),
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  user_id INTEGER REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create survey_projects table (separate from general projects)
CREATE TABLE IF NOT EXISTS survey_projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  surveyor_id INTEGER NOT NULL REFERENCES surveyors(id),
  project_id INTEGER REFERENCES projects(id),
  client_name VARCHAR(255),
  location TEXT,
  survey_type VARCHAR(100),
  survey_date DATE,
  instruments TEXT,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_surveyors_license ON surveyors(license_number);
CREATE INDEX IF NOT EXISTS idx_surveyors_user_id ON surveyors(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_projects_surveyor ON survey_projects(surveyor_id);
CREATE INDEX IF NOT EXISTS idx_survey_projects_project ON survey_projects(project_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_surveyors_updated_at ON surveyors;
CREATE TRIGGER update_surveyors_updated_at BEFORE UPDATE ON surveyors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_survey_projects_updated_at ON survey_projects;
CREATE TRIGGER update_survey_projects_updated_at BEFORE UPDATE ON survey_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
