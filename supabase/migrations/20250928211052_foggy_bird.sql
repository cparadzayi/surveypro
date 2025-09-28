/*
  # Create survey calculations table

  1. New Tables
    - `survey_calculations`
      - `id` (uuid, primary key)
      - `project_id` (uuid, references survey_projects)
      - `calculation_type` (text, required)
      - `calculation_method` (text, optional)
      - `input_parameters` (jsonb, required)
      - `results` (jsonb, required)
      - `accuracy_achieved` (text, optional)
      - `within_tolerance` (boolean, optional)
      - `error_values` (jsonb, optional)
      - `calculated_by` (text, optional)
      - `calculated_at` (timestamptz, default now())
      - `verified_by` (text, optional)
      - `verified_at` (timestamptz, optional)
      - `field_book_page` (text, optional)
      - `computation_reference` (text, optional)

  2. Security
    - Enable RLS on `survey_calculations` table
    - Add policies for users to manage calculations in their projects
    - Add policies for admin/assistant roles
*/

CREATE TABLE IF NOT EXISTS survey_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  calculation_type text NOT NULL CHECK (calculation_type IN ('coordinate_calculation', 'bearing_distance', 'area_calculation', 'traverse_adjustment', 'alignment_check')),
  calculation_method text,
  input_parameters jsonb NOT NULL,
  results jsonb NOT NULL,
  accuracy_achieved text,
  within_tolerance boolean,
  error_values jsonb,
  calculated_by text,
  calculated_at timestamptz DEFAULT now(),
  verified_by text,
  verified_at timestamptz,
  field_book_page text,
  computation_reference text
);

-- Enable RLS
ALTER TABLE survey_calculations ENABLE ROW LEVEL SECURITY;

-- Policies for survey calculations
CREATE POLICY "Users can create calculations for their projects"
  ON survey_calculations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_calculations.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can view calculations for their projects"
  ON survey_calculations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_calculations.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update calculations for their projects"
  ON survey_calculations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_calculations.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete calculations for their projects"
  ON survey_calculations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_calculations.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Admin and staff can view all calculations"
  ON survey_calculations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

CREATE POLICY "Admin and staff can update all calculations"
  ON survey_calculations
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
CREATE INDEX IF NOT EXISTS idx_survey_calculations_project_id ON survey_calculations(project_id);
CREATE INDEX IF NOT EXISTS idx_survey_calculations_type ON survey_calculations(calculation_type);
CREATE INDEX IF NOT EXISTS idx_survey_calculations_calculated_at ON survey_calculations(calculated_at);