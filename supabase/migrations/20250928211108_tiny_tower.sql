/*
  # Create survey diagrams table

  1. New Tables
    - `survey_diagrams`
      - `id` (uuid, primary key)
      - `project_id` (uuid, references survey_projects)
      - `diagram_number` (text, optional)
      - `diagram_type` (text, required)
      - `land_designation` (text, required)
      - `paper_size` (text, required)
      - `scale_denominator` (integer, required)
      - `figure_area_sqmm` (numeric, optional)
      - `coordinates_required` (boolean, default false)
      - `coordinates_based_on_trigonometrical` (boolean, default false)
      - `coordinate_origin_y` (numeric, optional)
      - `coordinate_origin_x` (numeric, optional)
      - `coordinate_reduction_constant_y` (numeric, optional)
      - `coordinate_reduction_constant_x` (numeric, optional)
      - `total_area_sqm` (numeric, required)
      - `area_display_format` (text, optional)
      - `area_formatted` (text, optional)
      - `submission_date` (date, optional)
      - `approval_date` (date, optional)
      - `approved_by` (text, optional)
      - `approval_status` (text, default 'draft')
      - `deed_type` (text, optional)
      - `deed_number` (text, optional)
      - `certificate_type` (text, optional)
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `survey_diagrams` table
    - Add policies for users to manage diagrams in their projects
    - Add policies for admin/assistant roles
*/

CREATE TABLE IF NOT EXISTS survey_diagrams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  diagram_number text,
  diagram_type text NOT NULL CHECK (diagram_type IN ('subdivisional', 'consolidated', 'servitude', 'building_location', 'land_share')),
  land_designation text NOT NULL,
  paper_size text NOT NULL CHECK (paper_size IN ('297x210', '297x385')),
  scale_denominator integer NOT NULL,
  figure_area_sqmm numeric(10,2),
  coordinates_required boolean DEFAULT false,
  coordinates_based_on_trigonometrical boolean DEFAULT false,
  coordinate_origin_y numeric(15,3),
  coordinate_origin_x numeric(15,3),
  coordinate_reduction_constant_y numeric(15,3),
  coordinate_reduction_constant_x numeric(15,3),
  total_area_sqm numeric(15,2) NOT NULL,
  area_display_format text CHECK (area_display_format IN ('square_metres', 'hectares')),
  area_formatted text,
  submission_date date,
  approval_date date,
  approved_by text,
  approval_status text DEFAULT 'draft' CHECK (approval_status IN ('draft', 'submitted', 'approved', 'rejected', 'amended')),
  deed_type text,
  deed_number text,
  certificate_type text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE survey_diagrams ENABLE ROW LEVEL SECURITY;

-- Policies for survey diagrams
CREATE POLICY "Users can create diagrams for their projects"
  ON survey_diagrams
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_diagrams.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can view diagrams for their projects"
  ON survey_diagrams
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_diagrams.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update diagrams for their projects"
  ON survey_diagrams
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_diagrams.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete diagrams for their projects"
  ON survey_diagrams
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_projects
      WHERE survey_projects.id = survey_diagrams.project_id
      AND survey_projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Admin and staff can view all diagrams"
  ON survey_diagrams
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

CREATE POLICY "Admin and staff can update all diagrams"
  ON survey_diagrams
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
CREATE INDEX IF NOT EXISTS idx_survey_diagrams_project_id ON survey_diagrams(project_id);
CREATE INDEX IF NOT EXISTS idx_survey_diagrams_approval_status ON survey_diagrams(approval_status);
CREATE INDEX IF NOT EXISTS idx_survey_diagrams_diagram_type ON survey_diagrams(diagram_type);

-- Create updated_at trigger
CREATE TRIGGER update_survey_diagrams_updated_at
    BEFORE UPDATE ON survey_diagrams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();