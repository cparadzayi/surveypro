-- Find parcels in the correct schema: surveyor_surveyor_kuda

-- Step 1: List all projects in surveyor_surveyor_kuda schema
SELECT 
  id,
  name,
  created_at
FROM surveyor_surveyor_kuda.survey_projects
ORDER BY id DESC
LIMIT 10;

-- Step 2: List all parcels in surveyor_surveyor_kuda schema
SELECT 
  id,
  project_id,
  stand,
  designation,
  ST_NPoints(geom) as vertices,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count
FROM surveyor_surveyor_kuda.land_parcels
ORDER BY id DESC
LIMIT 20;

-- Step 3: Search for Outside Figure parcel
SELECT 
  id,
  project_id,
  stand,
  designation,
  ST_NPoints(geom) as vertices,
  jsonb_array_length(COALESCE(metadata->'residuals'->'edges', '[]'::jsonb)) as edge_count,
  metadata->'residuals'->'edges' IS NOT NULL as has_edges
FROM surveyor_surveyor_kuda.land_parcels
WHERE stand ILIKE '%outside%' 
   OR stand ILIKE '%figure%'
   OR designation ILIKE '%outside%'
   OR designation ILIKE '%figure%'
ORDER BY id DESC;

-- Step 4: Count parcels per project
SELECT 
  project_id,
  COUNT(*) as parcel_count,
  string_agg(DISTINCT stand, ', ' ORDER BY stand) as sample_stands
FROM surveyor_surveyor_kuda.land_parcels
GROUP BY project_id
ORDER BY project_id DESC;
