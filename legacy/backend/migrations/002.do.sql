-- Add zone and central_meridian to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS zone VARCHAR(10);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS central_meridian DOUBLE PRECISION;

-- Field Data table
CREATE TABLE IF NOT EXISTS field_data (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  point TEXT NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  status CHAR(1) CHECK (status IN ('F', 'P')),
  calcs_page INTEGER,
  description TEXT,
  date_of_survey DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_field_data_project_id ON field_data(project_id);
CREATE INDEX IF NOT EXISTS idx_field_data_point ON field_data(point);

-- Calculation Sheets table
CREATE TABLE IF NOT EXISTS calculation_sheets (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  sheet_number INTEGER NOT NULL,
  calculations JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Coordinate List table
CREATE TABLE IF NOT EXISTS coordinate_list (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  point TEXT NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  field_book_page INTEGER,
  calculation_sheet INTEGER,
  status CHAR(1) CHECK (status IN ('F', 'P')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Area Calculations table
CREATE TABLE IF NOT EXISTS area_calculations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  stand_number TEXT NOT NULL,
  area DOUBLE PRECISION NOT NULL,
  perimeter DOUBLE PRECISION NOT NULL,
  coordinates JSONB NOT NULL,
  calculation_sheet INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at for field_data
CREATE TRIGGER update_field_data_updated_at BEFORE UPDATE ON field_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at for calculation_sheets
CREATE TRIGGER update_calculation_sheets_updated_at BEFORE UPDATE ON calculation_sheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at for coordinate_list
CREATE TRIGGER update_coordinate_list_updated_at BEFORE UPDATE ON coordinate_list
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at for area_calculations
CREATE TRIGGER update_area_calculations_updated_at BEFORE UPDATE ON area_calculations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
