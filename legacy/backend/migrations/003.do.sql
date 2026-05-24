-- Field Book Enhancement Migration
-- Add proper field book tables and indexes for cadastral surveying

-- Electronic Field Book table (main container)
CREATE TABLE IF NOT EXISTS electronic_field_books (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'ELECTRONIC FIELD BOOK',
  surveyor_name VARCHAR(255),
  surveyor_registration VARCHAR(100),
  survey_of TEXT,
  survey_date DATE,
  survey_location VARCHAR(255),
  instruments JSONB DEFAULT '[]',
  surveyor_address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id)
);

-- Field Book Pages table (for pagination and organization)
CREATE TABLE IF NOT EXISTS field_book_pages (
  id SERIAL PRIMARY KEY,
  field_book_id INTEGER REFERENCES electronic_field_books(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  page_title VARCHAR(255),
  page_type VARCHAR(50) DEFAULT 'survey_data' 
    CHECK (page_type IN ('cover', 'survey_data', 'calculations', 'sketches', 'notes')),
  entries_per_page INTEGER DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(field_book_id, page_number)
);

-- Enhanced Field Data table with better structure
CREATE TABLE IF NOT EXISTS field_book_entries (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  field_book_id INTEGER REFERENCES electronic_field_books(id) ON DELETE CASCADE,
  page_id INTEGER REFERENCES field_book_pages(id) ON DELETE CASCADE,
  entry_number INTEGER NOT NULL,
  
  -- Point identification
  point VARCHAR(50) NOT NULL,
  
  -- Zimbabwe Cadastral Coordinates P(Y,X) format
  -- Y-Coordinate (Westing): increases westwards from central meridian
  -- X-Coordinate (Southing): increases positively from Equator southwards  
  y_coordinate DOUBLE PRECISION NOT NULL, -- Westing
  x_coordinate DOUBLE PRECISION NOT NULL, -- Southing
  
  -- Monument status and details
  status CHAR(1) CHECK (status IN ('F', 'P', 'R', 'D')), -- Found, Placed, Replaced, Destroyed
  monument_type VARCHAR(100),
  monument_condition VARCHAR(50),
  
  -- Survey metadata
  calcs_page INTEGER,
  description TEXT,
  date_of_survey DATE,
  survey_method VARCHAR(50), -- GNSS, Total Station, etc.
  accuracy_class VARCHAR(10), -- Class I, II, III, etc.
  
  -- Quality indicators
  horizontal_accuracy DOUBLE PRECISION, -- in meters
  vertical_accuracy DOUBLE PRECISION,   -- in meters
  
  -- Additional surveyor notes
  notes TEXT,
  sketches JSONB, -- Store sketch data as JSON
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(project_id, point),
  UNIQUE(field_book_id, page_id, entry_number)
);

-- Calculation Sheets Enhancement
CREATE TABLE IF NOT EXISTS calculation_sheets_enhanced (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  field_book_id INTEGER REFERENCES electronic_field_books(id) ON DELETE CASCADE,
  sheet_number INTEGER NOT NULL,
  sheet_type VARCHAR(50) DEFAULT 'traverse' 
    CHECK (sheet_type IN ('traverse', 'intersection', 'resection', 'area', 'transformation')),
  calculation_data JSONB NOT NULL,
  input_points JSONB, -- References to field book entries
  output_points JSONB, -- Calculated coordinates
  precision_data JSONB, -- Accuracy and closure data
  notes TEXT,
  calculated_by INTEGER REFERENCES users(id),
  verified_by INTEGER REFERENCES users(id),
  verification_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(field_book_id, sheet_number)
);

-- Coordinate List Enhancement (Final coordinates for plotting)
CREATE TABLE IF NOT EXISTS coordinate_list_enhanced (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  field_book_id INTEGER REFERENCES electronic_field_books(id) ON DELETE CASCADE,
  
  -- Point identification
  point VARCHAR(50) NOT NULL,
  
  -- Final coordinates in Zimbabwe Cadastral System
  y_coordinate DOUBLE PRECISION NOT NULL, -- Westing
  x_coordinate DOUBLE PRECISION NOT NULL, -- Southing
  elevation DOUBLE PRECISION,
  
  -- Source information
  source_type VARCHAR(50) CHECK (source_type IN ('field', 'calculated', 'transformed')),
  field_book_page INTEGER,
  calculation_sheet INTEGER REFERENCES calculation_sheets_enhanced(id),
  
  -- Quality and status
  coordinate_status CHAR(1) CHECK (coordinate_status IN ('F', 'P', 'C')), -- Final, Preliminary, Check
  accuracy_grade VARCHAR(10), -- Survey accuracy grade
  
  -- Metadata
  computed_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(project_id, point)
);

-- Stand/Property calculations
CREATE TABLE IF NOT EXISTS stand_calculations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  field_book_id INTEGER REFERENCES electronic_field_books(id) ON DELETE CASCADE,
  
  stand_number VARCHAR(50) NOT NULL,
  property_description TEXT,
  
  -- Area calculations
  area_hectares DOUBLE PRECISION NOT NULL,
  area_square_meters DOUBLE PRECISION NOT NULL,
  perimeter DOUBLE PRECISION NOT NULL,
  
  -- Boundary coordinates (ordered)
  boundary_coordinates JSONB NOT NULL,
  
  -- Calculation metadata
  calculation_method VARCHAR(50) DEFAULT 'coordinate_geometry',
  calculation_sheet INTEGER REFERENCES calculation_sheets_enhanced(id),
  accuracy_estimate DOUBLE PRECISION,
  
  -- Legal information
  title_deed_reference VARCHAR(100),
  registration_date DATE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(project_id, stand_number)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_field_book_entries_project ON field_book_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_field_book_entries_point ON field_book_entries(point);
CREATE INDEX IF NOT EXISTS idx_field_book_entries_page ON field_book_entries(page_id);
CREATE INDEX IF NOT EXISTS idx_field_book_entries_coords ON field_book_entries(y_coordinate, x_coordinate);
CREATE INDEX IF NOT EXISTS idx_coordinate_list_enhanced_project ON coordinate_list_enhanced(project_id);
CREATE INDEX IF NOT EXISTS idx_calculation_sheets_enhanced_project ON calculation_sheets_enhanced(project_id);
CREATE INDEX IF NOT EXISTS idx_stand_calculations_project ON stand_calculations(project_id);

-- Update triggers for enhanced tables
CREATE TRIGGER update_electronic_field_books_updated_at 
  BEFORE UPDATE ON electronic_field_books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_field_book_entries_updated_at 
  BEFORE UPDATE ON field_book_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calculation_sheets_enhanced_updated_at 
  BEFORE UPDATE ON calculation_sheets_enhanced
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coordinate_list_enhanced_updated_at 
  BEFORE UPDATE ON coordinate_list_enhanced
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stand_calculations_updated_at 
  BEFORE UPDATE ON stand_calculations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-create field book structure when project is created
CREATE OR REPLACE FUNCTION auto_create_field_book()
RETURNS TRIGGER AS $$
BEGIN
  -- Create electronic field book for new project
  INSERT INTO electronic_field_books (
    project_id, 
    title, 
    surveyor_name, 
    survey_location,
    survey_date
  ) VALUES (
    NEW.id,
    'ELECTRONIC FIELD BOOK - ' || NEW.name,
    'Land Surveyor',
    NEW.description,
    CURRENT_DATE
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create field book for new projects
CREATE TRIGGER auto_create_field_book_trigger
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_field_book();

-- Function to organize field book entries into pages
CREATE OR REPLACE FUNCTION organize_field_book_pages(p_field_book_id INTEGER)
RETURNS VOID AS $$
DECLARE
  entry_count INTEGER;
  pages_needed INTEGER;
  page_num INTEGER;
BEGIN
  -- Count entries
  SELECT COUNT(*) INTO entry_count 
  FROM field_book_entries 
  WHERE field_book_id = p_field_book_id;
  
  -- Calculate pages needed (20 entries per page)
  pages_needed := CEIL(entry_count::NUMERIC / 20);
  
  -- Delete existing pages
  DELETE FROM field_book_pages WHERE field_book_id = p_field_book_id;
  
  -- Create new pages
  FOR page_num IN 1..pages_needed LOOP
    INSERT INTO field_book_pages (
      field_book_id, 
      page_number, 
      page_title,
      page_type,
      entries_per_page
    ) VALUES (
      p_field_book_id,
      page_num,
      'Page ' || page_num || ' - Survey Data',
      'survey_data',
      20
    );
  END LOOP;
  
  -- Update entries with page assignments
  UPDATE field_book_entries 
  SET page_id = p.id,
      entry_number = ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY field_book_entries.point)
  FROM field_book_pages p
  WHERE field_book_entries.field_book_id = p_field_book_id
    AND p.field_book_id = p_field_book_id
    AND p.page_number = CEIL((ROW_NUMBER() OVER (ORDER BY field_book_entries.point))::NUMERIC / 20);
END;
$$ LANGUAGE plpgsql;