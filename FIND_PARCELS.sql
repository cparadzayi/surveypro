-- Find all parcels and projects to identify the correct data

-- Step 1: List all projects
SELECT 
  id,
  name,
  location,
  created_at
FROM survey_projects
ORDER BY id DESC
LIMIT 10;

-- Step 2: List all parcels (all projects)
SELECT 
  id,
  project_id,
  stand,
  designation,
  ST_NPoints(geom) as vertices,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count
FROM land_parcels
ORDER BY id DESC
LIMIT 20;

-- Step 3: Search for any parcel with "outside" or "figure" in the name
SELECT 
  id,
  project_id,
  stand,
  designation,
  ST_NPoints(geom) as vertices,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count
FROM land_parcels
WHERE stand ILIKE '%outside%' 
   OR stand ILIKE '%figure%'
   OR designation ILIKE '%outside%'
   OR designation ILIKE '%figure%'
ORDER BY id DESC;

-- Step 4: Check if there's a schema prefix issue
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE tablename = 'land_parcels';

-- Step 5: Count parcels per project
SELECT 
  project_id,
  COUNT(*) as parcel_count,
  string_agg(DISTINCT stand, ', ') as sample_stands
FROM land_parcels
GROUP BY project_id
ORDER BY project_id DESC;
