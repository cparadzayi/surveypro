# QGIS Primary Key Configuration Fix

## Problem
When digitizing land parcels in QGIS, the `id` field is highlighted in orange and QGIS cannot save features. This is because QGIS views don't have primary keys by default.

## Solution

### 1. Apply Database Fix (Run Once)

Execute the updated SQL function:

```bash
cd c:\mataranyika\SurveyPro-nov-alpha\app-backend
node scripts/run-sql.js fix_create_project_views.sql
```

**Or using psql:**
```bash
psql -U postgres -d surveypro_v1 -f migrations/fix_create_project_views.sql
```

**Or using pgAdmin/DBeaver:** Open and execute `migrations/fix_create_project_views.sql`

### 2. Recreate Project Views

In SurveyPro:
1. Go to QGIS Export section
2. Click "Create Project Views"
3. This will recreate the views with the primary key fix

### 3. Configure QGIS Layer Primary Key

When adding the `land_parcels_project_XX` layer to QGIS:

#### Method 1: During Layer Addition
1. Layer → Add Layer → Add PostGIS Layers
2. Connect to database
3. Expand "public" schema
4. **SELECT** the `land_parcels_project_64` layer (don't add yet)
5. Look for "Feature id" or "Primary key" dropdown
6. **SELECT `id` from the dropdown**
7. Now click "Add"

#### Method 2: After Layer is Added
1. Right-click the layer → Properties
2. Go to "Source" tab
3. Look for "Feature id" or "Primary key column"
4. Set it to `id`
5. Click OK

### 4. Verify Configuration

Test by digitizing a polygon:
1. Toggle editing (pencil icon)
2. Add Polygon Feature tool
3. Draw a polygon
4. In the attribute form:
   - **Leave `id` empty** (will auto-generate)
   - **Leave `project_id` empty** (will auto-fill)
   - **Fill `stand`** (required - e.g., "2474D")
   - Fill other fields as needed
5. Click OK

The polygon should save successfully without the orange id warning.

## How It Works

### Database Changes
- Added unique partial index on `land_parcels(id)` filtered by `project_id`
- Helps QGIS recognize `id` as the unique identifier
- INSTEAD OF INSERT trigger auto-generates `id` via PostgreSQL SERIAL

### Trigger Behavior
```sql
INSERT INTO land_parcels (project_id, stand, ...) 
VALUES (64, '2474D', ...)
RETURNING * INTO NEW;  -- Returns row with auto-generated id
```

The `id` column uses PostgreSQL's SERIAL type which auto-increments:
- User leaves `id` blank in QGIS
- Trigger inserts without `id` specified
- PostgreSQL generates next `id` value
- RETURNING clause sends it back to QGIS

## Troubleshooting

### "id field still orange"
- Remove the layer from QGIS
- Re-add it following Method 1 above
- Ensure you select `id` as primary key

### "Cannot save features"
- Check QGIS message log (View → Panels → Log Messages)
- Look for PostgreSQL error messages
- Verify trigger was created: `SELECT * FROM pg_trigger WHERE tgname LIKE '%land_parcels_project_64%'`

### "Duplicate key error"
- Check if rows already exist: `SELECT * FROM land_parcels WHERE project_id = 64`
- The unique index prevents duplicate `id` values within same project

## Alternative: Use Base Table (Not Recommended)

If view editing continues to fail, you can digitize directly on the base `land_parcels` table:
1. Add `land_parcels` table to QGIS
2. Apply filter: `"project_id" = 64`
3. Toggle editing
4. **Manually set `project_id` = 64** for each feature

⚠️ **Warning:** This bypasses project isolation and requires manual `project_id` management.

## References

- PostgreSQL: Views with INSTEAD OF triggers
- QGIS: Working with database views
- PostGIS: Editable views best practices
