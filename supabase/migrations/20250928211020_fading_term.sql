/*
  # Create coordinate systems table

  1. New Tables
    - `coordinate_systems`
      - `id` (uuid, primary key)
      - `name` (text, required, unique)
      - `code` (text, required, unique)
      - `description` (text, optional)
      - `central_meridian` (numeric, optional)
      - `false_easting` (numeric, required)
      - `false_northing` (numeric, required)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `coordinate_systems` table
    - Add policy for all authenticated users to read coordinate systems

  3. Initial Data
    - Insert Zimbabwe coordinate systems
*/

CREATE TABLE IF NOT EXISTS coordinate_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  description text,
  central_meridian numeric(10,6),
  false_easting numeric(15,3) NOT NULL,
  false_northing numeric(15,3) NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE coordinate_systems ENABLE ROW LEVEL SECURITY;

-- Policy for coordinate systems
CREATE POLICY "All authenticated users can view coordinate systems"
  ON coordinate_systems
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert Zimbabwe coordinate systems
INSERT INTO coordinate_systems (name, code, description, central_meridian, false_easting, false_northing) VALUES
  ('Zimbabwe Transverse Mercator Zone 1', 'ZTM1', 'Zimbabwe TM Zone 1 - Western Zone', 27.0, 100000.0, 0.0),
  ('Zimbabwe Transverse Mercator Zone 2', 'ZTM2', 'Zimbabwe TM Zone 2 - Central Zone', 29.0, 300000.0, 0.0),
  ('Zimbabwe Transverse Mercator Zone 3', 'ZTM3', 'Zimbabwe TM Zone 3 - Eastern Zone', 31.0, 500000.0, 0.0),
  ('Zimbabwe Transverse Mercator Zone 4', 'ZTM4', 'Zimbabwe TM Zone 4 - Far Eastern Zone', 33.0, 700000.0, 0.0)
ON CONFLICT (code) DO NOTHING;