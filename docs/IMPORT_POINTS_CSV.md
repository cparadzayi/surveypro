# Importing a Coordinate CSV into PostgreSQL (+ optional PostGIS)

This guide shows two paths:
- A. Use the built-in seeding script (quick smoke test)
- B. Import any CSV manually with psql and map to SurveyPro tables

The coordinate system here is Zimbabwe P(Y,X):
- Y = Westing (increases west) → stored as coordinate[0]
- X = Southing (increases south) → stored as coordinate[1]

## A) Quick smoke test: seed sample project and points

1. Ensure the backend is configured to connect to your database (`app-backend/.env`):
   - DATABASE_URL=postgres://user:pass@host:5432/dbname
   - JWT_SECRET=your-secret
2. Run migrations (creates users/projects/layers/features tables):
   - npm run migrate (from app-backend)
3. Seed the sample:
   - npm run seed:sample (from app-backend)

This will:
- Create user demo@example.com (password demo1234) if missing
- Create a project "Sample Project" and layer "Sample Points"
- Insert each CSV row as a Point feature with geometry.coordinates: [Y, X]
- Properties stored: name, f_p (F/P), description, system: 'ZIM_P(Y,X)'

In the frontend Areas module, select that layer in the map search or the DB loader.

## B) Manual import with psql

Suppose you have a CSV with columns: POINT,Y,X,F_P,DESCRIPTION

Example file (UTF‑8, with header):
```
POINT,Y,X,F_P,DESCRIPTION
A1,33332.88,1860173,,KAPIRO
...etc
```

1. Create a temp table to stage CSV rows:
```sql
CREATE TEMP TABLE tmp_points (
  point TEXT,
  y DOUBLE PRECISION,
  x DOUBLE PRECISION,
  f_p TEXT,
  description TEXT
);
```

2. Import CSV using psql \copy (client‑side):
```sql
\copy tmp_points(point,y,x,f_p,description) FROM 'absolute/path/to/points.csv' WITH (FORMAT csv, HEADER true)
```

3. Insert into SurveyPro tables:
- Ensure you have a target project and layer
```sql
-- Find or create project
INSERT INTO projects (name, user_id, code, description)
SELECT 'Sample Project', 1, 'SAMPLE', 'Imported sample'  -- adjust user_id
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name='Sample Project' AND user_id=1);

-- Get project id
SELECT id FROM projects WHERE name='Sample Project' AND user_id=1;
-- Suppose it returns :project_id

-- Ensure layer
INSERT INTO layers (name, project_id, layer_type, geom_type, srid)
SELECT 'Sample Points', :project_id, 'points', 'Point', 0
WHERE NOT EXISTS (SELECT 1 FROM layers WHERE name='Sample Points' AND project_id=:project_id);

-- Get layer id
SELECT id FROM layers WHERE name='Sample Points' AND project_id=:project_id;
-- Suppose it returns :layer_id
```

- Insert features mapping to ZIM P(Y,X):
```sql
INSERT INTO features (layer_id, project_id, geometry, properties)
SELECT
  :layer_id,
  :project_id,
  jsonb_build_object('type','Point','coordinates', jsonb_build_array(y, x)),
  jsonb_build_object(
    'name', point,
    'f_p', f_p,
    'description', description,
    'system', 'ZIM_P(Y,X)'
  )
FROM tmp_points t
WHERE point IS NOT NULL AND y IS NOT NULL AND x IS NOT NULL;
```

4. Optional: compute bbox for existing features (if your DB uses it):
```sql
UPDATE features
SET bbox = jsonb_build_array(
  (geometry->'coordinates')->>0::double precision,
  (geometry->'coordinates')->>1::double precision,
  (geometry->'coordinates')->>0::double precision,
  (geometry->'coordinates')->>1::double precision
)
WHERE layer_id = :layer_id AND (geometry->>'type')='Point';
```

Notes:
- This app stores geometry as JSONB; PostGIS is optional. If you have PostGIS, you could also create a parallel `geom geometry(Point, <srid>)` and keep both.
- The map component currently renders in planar CRS.Simple using P(Y,X) directly.
- If you prefer EN inputs, convert to YX before insert (y=-e, x=-n) per ZIM convention.
