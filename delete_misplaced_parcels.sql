-- Delete all land parcels for project 4 (CheshirePegging)
-- Database: surveypro_db
-- Schema: surveyor_surveyor_chitsikef
-- These parcels were digitized in the wrong location (240km south)
-- Run this to clean up and start fresh

-- Connect to database first:
-- psql -U postgres -d surveypro_db -f delete_misplaced_parcels.sql

-- First, check what will be deleted
-- SELECT id, stand, designation, ST_AsText(geom) as geometry
-- FROM surveyor_surveyor_chitsikef.land_parcels 
-- WHERE project_id = 4;

-- Delete all parcels for project 4
DELETE FROM surveyor_surveyor_chitsikef.land_parcels 
WHERE project_id = 4;

-- Verify deletion
-- SELECT COUNT(*) as remaining_parcels FROM surveyor_surveyor_chitsikef.land_parcels WHERE project_id = 4;
