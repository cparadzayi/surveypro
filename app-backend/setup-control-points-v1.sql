-- Setup control_points table in surveypro_v1 database
-- Run with: psql -U postgres -d surveypro_v1 -f setup-control-points-v1.sql

BEGIN;

-- Create table
CREATE TABLE IF NOT EXISTS control_points (
  id SERIAL PRIMARY KEY,
  
  -- Monument Identification
  monu_num VARCHAR(20) NOT NULL UNIQUE,
  monu_name VARCHAR(100), -- Nullable for TSM records
  type VARCHAR(10) NOT NULL CHECK (type IN ('PRIM', 'SEC', 'TERT', 'QUART', 'TSM')),
  
  -- Map References
  comp_sheet VARCHAR(20),
  topo VARCHAR(20),
  
  -- Coordinate System
  gauss_lo INTEGER CHECK (gauss_lo IN (27, 29, 31, 33)),
  y_gauss NUMERIC(15, 3),
  x_gauss NUMERIC(15, 3),
  
  -- Heights
  msl_hgt NUMERIC(10, 3),
  ped_hgt NUMERIC(10, 3),
  pill_hgt NUMERIC(10, 3),
  top_signal NUMERIC(10, 3),
  bot_signal NUMERIC(10, 3),
  
  -- Administrative
  last_insp DATE,
  deg_sqr VARCHAR(10),
  remark TEXT,
  area_nm VARCHAR(100),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_control_points_monu_num ON control_points(monu_num);
CREATE INDEX IF NOT EXISTS idx_control_points_monu_name ON control_points(monu_name);
CREATE INDEX IF NOT EXISTS idx_control_points_type ON control_points(type);
CREATE INDEX IF NOT EXISTS idx_control_points_area_nm ON control_points(area_nm);
CREATE INDEX IF NOT EXISTS idx_control_points_gauss_lo ON control_points(gauss_lo);
CREATE INDEX IF NOT EXISTS idx_control_points_deg_sqr ON control_points(deg_sqr);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_control_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_control_points_updated_at ON control_points;

CREATE TRIGGER trigger_update_control_points_updated_at
  BEFORE UPDATE ON control_points
  FOR EACH ROW
  EXECUTE FUNCTION update_control_points_updated_at();

COMMIT;

-- Verify table was created
SELECT 
  table_name, 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'control_points' 
ORDER BY ordinal_position;
