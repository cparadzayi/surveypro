# QGIS Direct Table Access with Vertex Labeling

## Executive Summary

**Decision:** Use `land_parcels` table directly in QGIS, not `land_parcels_qgis` view.

**Rationale:** 
- Modern QGIS (3.x+) handles generated columns correctly
- Simpler architecture (one table vs table + view)
- Better metadata preservation for shared beacon tracking
- Reduced maintenance overhead with schema-per-surveyor

## Architecture Changes

### Before (View-Based)
```
QGIS → land_parcels_qgis (view) → land_parcels (table)
                ↓
         View rules handle INSERT/UPDATE
         (Complex, error-prone)
```

### After (Direct Access)
```
QGIS → land_parcels (table)
         ↓
    Trigger auto-calculates area
    (Simple, reliable)
```

## Migrations

### Migration 056: Vertex Labeling
**Purpose:** Store actual beacon identifiers for shared beacons

**What it adds:**
- `metadata.vertices` JSONB structure
- `extract_vertices_from_geometry()` function
- `update_parcel_vertices()` function

**Example:**
```json
{
  "vertices": [
    {"id": "1463A", "y": 18862.52, "x": 2268555.01, "order": 1},
    {"id": "1462A", "y": 18875.14, "x": 2268541.39, "order": 2},
    {"id": "1463C", "y": 18849.88, "x": 2268541.39, "order": 3},
    {"id": "1464C", "y": 18837.26, "x": 2268555.01, "order": 4}
  ]
}
```

### Migration 057: Remove View
**Purpose:** Simplify QGIS integration by removing `land_parcels_qgis` view

**What it does:**
- Drops `land_parcels_qgis` views from all surveyor schemas
- Drops `create_land_parcels_qgis_view()` function
- Updates table comments with direct usage instructions

## Complete Workflow

### 1. Setup QGIS Connection

```
Layer → Add Layer → Add PostGIS Layers...

Connection Settings:
- Name: SurveyPro - [Surveyor Name]
- Host: localhost
- Port: 5432
- Database: surveypro_db
- SSL mode: prefer
- Authentication: Basic
- Username: [surveyor username]
- Password: [surveyor password]

Test Connection → OK
```

### 2. Add Land Parcels Layer

```
Schema: surveyor_surveyor_kuda (or your schema)
Table: land_parcels ✓ (NOT land_parcels_qgis)
Geometry column: geom
SRID: 22291 (Cape Lo 31)
Primary key: id
```

### 3. Configure Layer

**Layer Properties → Fields:**
- `id`: Hidden (auto-generated)
- `project_id`: Integer (required)
- `stand`: Text (required) - Parcel number
- `designation`: Text (required) - Usually same as stand
- `geom`: Geometry (required) - Polygon
- `metadata`: JSONB (optional) - For vertex labels
- `status`: Text (optional) - draft/finalized/approved
- `area_m2`: Read-only (auto-calculated)
- `area_ha`: Read-only (auto-calculated)
- `perimeter_m`: Read-only (auto-calculated)

**Layer Properties → Attributes Form:**
- Set `area_m2`, `area_ha`, `perimeter_m` as "Not editable"
- Set `metadata` widget type to "Text Edit" (multiline)

### 4. Digitize Parcels

1. **Enable Editing** (pencil icon or `Ctrl+E`)
2. **Add Polygon Feature** (Add Polygon Feature tool)
3. **Click vertices** to define parcel boundary
4. **Right-click** to finish polygon
5. **Fill in attributes:**
   - `project_id`: Your project ID (e.g., 123)
   - `stand`: Parcel number (e.g., "1463")
   - `designation`: Same as stand (e.g., "1463")
   - `metadata`: Leave empty for now (will add vertices later)
6. **Save Edits** (Save Layer Edits or `Ctrl+S`)
7. **Refresh Layer** (F5) to see calculated areas

### 5. Add Vertex Labels (Shared Beacons)

After digitizing, you have three options:

#### Option A: SQL Function (Recommended)
```sql
-- Connect to database via pgAdmin or psql
SET search_path = surveyor_surveyor_kuda, public;

-- Update parcel 1463 with shared beacon labels
SELECT update_parcel_vertices(
  (SELECT id FROM land_parcels WHERE stand = '1463'),
  ARRAY['1463A', '1462A', '1463C', '1464C']
);
```

#### Option B: Manual JSONB Entry in QGIS
In QGIS attribute form, edit `metadata` field:
```json
{
  "vertices": [
    {"id":"1463A","y":18862.52,"x":2268555.01,"order":1},
    {"id":"1462A","y":18875.14,"x":2268541.39,"order":2},
    {"id":"1463C","y":18849.88,"x":2268541.39,"order":3},
    {"id":"1464C","y":18837.26,"x":2268555.01,"order":4}
  ]
}
```

#### Option C: Frontend Tool (Future Enhancement)
A future UI tool could allow clicking vertices to label them interactively.

### 6. Generate PDF

In SurveyPro frontend:
1. Navigate to Area Computation module
2. Click "📄 PDF" button
3. PDF will use actual beacon labels from `metadata.vertices`
4. Output shows: `1463A → 1462A → 1463C → 1464C → 1463A`

## Benefits

### 🎯 Simplicity
- **One table** instead of table + view
- **Direct access** - no view rules to debug
- **Clear workflow** - digitize, save, refresh

### 🚀 Performance
- **No view overhead** - direct table queries
- **Faster writes** - no rule processing
- **Better indexing** - direct table indexes

### 🔒 Reliability
- **No rule failures** - direct INSERT/UPDATE
- **Metadata preserved** - JSONB stored correctly
- **Trigger consistency** - area always calculated

### 🏗️ Architecture
- **Schema-per-surveyor friendly** - no view per schema
- **Easier maintenance** - one table to manage
- **Future-proof** - QGIS 3.x+ native support

## Troubleshooting

### Issue: QGIS shows error "cannot insert into generated column"
**Solution:** You're using QGIS 2.x. Upgrade to QGIS 3.x+.

### Issue: Areas not showing after save
**Solution:** Refresh layer (F5) to reload calculated values.

### Issue: Vertex labels not appearing in PDF
**Solution:** Ensure `metadata.vertices` is populated. Use `update_parcel_vertices()` function.

### Issue: QGIS can't connect to database
**Solution:** Check connection settings, ensure user has access to surveyor schema.

### Issue: Metadata field shows error
**Solution:** Ensure JSON is valid. Use online JSON validator before pasting.

## Migration Commands

```bash
# Run migrations
cd app-backend
npm run migrate

# This will run:
# - Migration 056: Add vertex labeling support
# - Migration 057: Remove land_parcels_qgis view

# Verify migrations
npm run migrate:status

# Rollback if needed (not recommended)
npm run migrate:undo
```

## Testing Checklist

After migration:

- [ ] QGIS 3.x+ installed
- [ ] Can connect to `land_parcels` table
- [ ] Can digitize new polygon
- [ ] Areas auto-calculate after save + refresh
- [ ] Can edit `metadata` field with JSONB
- [ ] `update_parcel_vertices()` function works
- [ ] PDF generation uses vertex labels
- [ ] Shared beacons display correctly (e.g., 1463A, 1462A)

## Related Documentation

- `migrations/056.README.md` - Vertex labeling details
- `migrations/057.README.md` - View removal details
- `MULTI_TENANCY_DESIGN.md` - Schema-per-surveyor architecture
- `AUTOMATIC_AREA_CALCULATION.md` - Trigger-based area calculation

## Support

If you encounter issues:
1. Check QGIS version (must be 3.x+)
2. Verify database connection
3. Check surveyor schema permissions
4. Review migration logs
5. Test with simple polygon first

## Future Enhancements

1. **Vertex Labeling UI**: Interactive tool to label vertices in frontend
2. **Topology Validation**: Check for gaps/overlaps between parcels
3. **Batch Vertex Update**: Update multiple parcels at once
4. **QGIS Plugin**: Custom plugin for SurveyPro integration
5. **Beacon Library**: Reusable beacon definitions across parcels
