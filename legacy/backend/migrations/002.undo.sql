-- Drop triggers
DROP TRIGGER IF EXISTS update_area_calculations_updated_at ON area_calculations;
DROP TRIGGER IF EXISTS update_coordinate_list_updated_at ON coordinate_list;
DROP TRIGGER IF EXISTS update_calculation_sheets_updated_at ON calculation_sheets;
DROP TRIGGER IF EXISTS update_field_data_updated_at ON field_data;

-- Drop tables
DROP TABLE IF EXISTS area_calculations;
DROP TABLE IF EXISTS coordinate_list;
DROP TABLE IF EXISTS calculation_sheets;
DROP TABLE IF EXISTS field_data;

-- Remove columns from projects table
ALTER TABLE projects DROP COLUMN IF EXISTS central_meridian;
ALTER TABLE projects DROP COLUMN IF EXISTS zone;
