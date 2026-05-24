-- Undo Migration 031: Remove project-specific land parcels view

-- Drop triggers
DROP TRIGGER IF EXISTS land_parcels_project_63_insert_trigger ON land_parcels_project_63;
DROP TRIGGER IF EXISTS land_parcels_project_63_update_trigger ON land_parcels_project_63;
DROP TRIGGER IF EXISTS land_parcels_project_63_delete_trigger ON land_parcels_project_63;

-- Drop functions
DROP FUNCTION IF EXISTS land_parcels_project_63_insert();
DROP FUNCTION IF EXISTS land_parcels_project_63_update();
DROP FUNCTION IF EXISTS land_parcels_project_63_delete();

-- Drop view
DROP VIEW IF EXISTS land_parcels_project_63;
