/*
  # Create survey beacons table

  1. New Tables
    - `survey_beacons`
      - `id` (uuid, primary key)
      - `project_id` (uuid, references survey_projects)
      - `beacon_name` (text, required)
      - `beacon_full_name` (text, optional)
      - `beacon_type` (text, required)
      - `y_coordinate` (numeric, required)
      - `x_coordinate` (numeric, required)
      - `elevation` (numeric, optional)
      - `geometry` (geometry, auto-generated)
      - `beacon_specification` (text, required)
      - `centre_mark_type` (text, optional)
      - `centre_mark_diameter` (numeric, optional)
      - `centre_mark_depth` (numeric, optional)
      - `has_cairn` (boolean, default false)
      - `has_mound` (boolean, default false)
      - `has_trenches` (boolean, default false)
      - `beacon_status` (text, required)
      - `condition_when_found` (text, optional)
      - `is_established_beacon` (boolean, default false)
      - `accuracy_class` (text, optional)
      - `survey_method` (text, optional)
      - `surveyed_date` (date, optional)
      - `surveyed_by` (text, optional)
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `survey_beacons` table
    - Add policies for users to manage beacons in their projects
    - Add policies for admin/assistant roles
*/

CREATE TABLE IF NOT EXISTS survey_beacons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  beacon_name text NOT NULL,
  beacon_full_name text,
  beacon_type text NOT NULL CHECK (beacon_type IN ('corner', 'indicatory', 'reference_mark', 'witness')),
  y_coordinate numeric(15,3) NOT NULL,
  x_coordinate numeric(15,3) NOT NULL,
  elevation numeric(10,3),
  geometry geometry,
  beacon_specification text NOT NULL,
  centre_mark_type text,
  centre_mark_diameter numeric(8,2),
  centre_mark_depth numeric(8,2),
  has_cairn boolean DEFAULT false,
  has_mound boolean DEFAULT false,
  has_trenches boolean DEFAULT false,
  beacon_status text NOT NULL CHECK (beacon_status IN ('found', 'placed', 'replaced', 'missing', 'damaged')),
  condition_when_found text,
  is_established_beacon boolean DEFAULT false,
  accuracy_class text CHECK (accuracy_class IN ('A', 'B', 'C')),
  survey_method text,
  surveyed_date date,
  surveyed_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, beacon_name)
);

-- Enable RLS
ALTER TABLE survey_beacons ENABLE ROW LEVEL SECURITY;

-- Policies for survey beacons
CREATE POLICY "Users can create beacons for their projects"
  ON survey_beacons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_beacons.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can view beacons for their projects"
  ON survey_beacons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_beacons.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update beacons for their projects"
  ON survey_beacons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_beacons.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete beacons for their projects"
  ON survey_beacons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_beacons.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Admin and staff can view all beacons"
  ON survey_beacons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

CREATE POLICY "Admin and staff can update all beacons"
  ON survey_beacons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_survey_beacons_project_id ON survey_beacons(project_id);
CREATE INDEX IF NOT EXISTS idx_survey_beacons_beacon_type ON survey_beacons(beacon_type);
CREATE INDEX IF NOT EXISTS idx_survey_beacons_beacon_status ON survey_beacons(beacon_status);

-- Create updated_at trigger
CREATE TRIGGER update_survey_beacons_updated_at
    BEFORE UPDATE ON survey_beacons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();