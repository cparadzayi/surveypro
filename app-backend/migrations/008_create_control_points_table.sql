-- Migration: Create control_points table for Zimbabwe control point database
-- Created: 2025-10-25

CREATE TABLE IF NOT EXISTS control_points (
  id SERIAL PRIMARY KEY,
  
  -- Monument Identification
  monu_num VARCHAR(20) NOT NULL UNIQUE,
  monu_name VARCHAR(100) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('PRIM', 'SEC', 'TERT', 'QUART')),
  
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
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_control_points_monu_num ON control_points(monu_num);
CREATE INDEX IF NOT EXISTS idx_control_points_monu_name ON control_points(monu_name);
CREATE INDEX IF NOT EXISTS idx_control_points_type ON control_points(type);
CREATE INDEX IF NOT EXISTS idx_control_points_area_nm ON control_points(area_nm);
CREATE INDEX IF NOT EXISTS idx_control_points_gauss_lo ON control_points(gauss_lo);
CREATE INDEX IF NOT EXISTS idx_control_points_deg_sqr ON control_points(deg_sqr);

-- Spatial index for coordinate searches (if PostGIS is available)
-- CREATE INDEX idx_control_points_coords ON control_points USING GIST(
--   ST_SetSRID(ST_MakePoint(y_gauss, x_gauss), 4148)
-- );

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

-- Comments for documentation
COMMENT ON TABLE control_points IS 'Zimbabwe national control point database';
COMMENT ON COLUMN control_points.monu_num IS 'Monument number (unique identifier)';
COMMENT ON COLUMN control_points.monu_name IS 'Monument name';
COMMENT ON COLUMN control_points.type IS 'Monument type: PRIM (Primary), SEC (Secondary), TERT (Tertiary), QUART (Quaternary)';
COMMENT ON COLUMN control_points.comp_sheet IS 'Computation sheet reference';
COMMENT ON COLUMN control_points.topo IS 'Topographic map reference';
COMMENT ON COLUMN control_points.gauss_lo IS 'Gauss-Conformal longitude zone (27, 29, 31, 33)';
COMMENT ON COLUMN control_points.y_gauss IS 'Y coordinate (Gauss-Conformal, Westing)';
COMMENT ON COLUMN control_points.x_gauss IS 'X coordinate (Gauss-Conformal, Southing)';
COMMENT ON COLUMN control_points.msl_hgt IS 'Mean sea level height (meters)';
COMMENT ON COLUMN control_points.ped_hgt IS 'Pedestal height (meters)';
COMMENT ON COLUMN control_points.pill_hgt IS 'Pillar height (meters)';
COMMENT ON COLUMN control_points.top_signal IS 'Top of signal height (meters)';
COMMENT ON COLUMN control_points.bot_signal IS 'Bottom of signal height (meters)';
COMMENT ON COLUMN control_points.last_insp IS 'Last inspection date';
COMMENT ON COLUMN control_points.deg_sqr IS 'Degree square reference';
COMMENT ON COLUMN control_points.area_nm IS 'Area name / locality';
