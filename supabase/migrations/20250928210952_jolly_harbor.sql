/*
  # Create survey projects table

  1. New Tables
    - `survey_projects`
      - `id` (uuid, primary key)
      - `project_name` (text, required)
      - `project_type` (text, required)
      - `district` (text, required)
      - `coordinate_system_id` (uuid, optional)
      - `surveyor_name` (text, required)
      - `surveyor_registration` (text, required)
      - `field_work_start_date` (date, required)
      - `field_work_end_date` (date, optional)
      - `survey_purpose` (text, required)
      - `parent_diagram_number` (text, optional)
      - `parent_deed_type` (text, optional)
      - `parent_deed_number` (text, optional)
      - `original_title_deed_type` (text, optional)
      - `original_title_deed_number` (text, optional)
      - `original_diagram_number` (text, optional)
      - `bounds_geometry` (geometry, optional)
      - `min_y` (numeric, optional)
      - `max_y` (numeric, optional)
      - `min_x` (numeric, optional)
      - `max_x` (numeric, optional)
      - `status` (text, default 'draft')
      - `is_based_on_trigonometrical` (boolean, default false)
      - `created_by` (uuid, references auth.users)
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())
      - `notes` (text, optional)

  2. Security
    - Enable RLS on `survey_projects` table
    - Add policies for authenticated users to manage their own projects
    - Add policies for admin/assistant roles to view all projects
*/

CREATE TABLE IF NOT EXISTS survey_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL,
  project_type text NOT NULL CHECK (project_type IN ('cadastral', 'engineering', 'mining', 'township', 'subdivision')),
  district text NOT NULL,
  coordinate_system_id uuid,
  surveyor_name text NOT NULL,
  surveyor_registration text NOT NULL,
  field_work_start_date date NOT NULL,
  field_work_end_date date,
  survey_purpose text NOT NULL,
  parent_diagram_number text,
  parent_deed_type text,
  parent_deed_number text,
  original_title_deed_type text,
  original_title_deed_number text,
  original_diagram_number text,
  bounds_geometry geometry,
  min_y numeric(15,3),
  max_y numeric(15,3),
  min_x numeric(15,3),
  max_x numeric(15,3),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'field_complete', 'calculations_complete', 'diagram_submitted', 'approved', 'registered')),
  is_based_on_trigonometrical boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  notes text
);

-- Enable RLS
ALTER TABLE survey_projects ENABLE ROW LEVEL SECURITY;

-- Policies for survey projects
CREATE POLICY "Users can create their own projects"
  ON survey_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view their own projects"
  ON survey_projects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can update their own projects"
  ON survey_projects
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Admin and staff can view all projects"
  ON survey_projects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

CREATE POLICY "Admin and staff can update all projects"
  ON survey_projects
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_survey_projects_created_by ON survey_projects(created_by);
CREATE INDEX IF NOT EXISTS idx_survey_projects_status ON survey_projects(status);
CREATE INDEX IF NOT EXISTS idx_survey_projects_district ON survey_projects(district);
CREATE INDEX IF NOT EXISTS idx_survey_projects_project_type ON survey_projects(project_type);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_survey_projects_updated_at
    BEFORE UPDATE ON survey_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();