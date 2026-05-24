# SurveyPro QGIS Area Computation
## Quick Start Guide

**Version:** 1.0 | **Module:** Lite → Areas

---

## Overview

This guide shows you how to compute land parcel areas using SurveyPro's QGIS integration workflow.

**What You'll Do:**
1. Export coordinate points from SurveyPro
2. Digitize parcel boundaries in QGIS
3. Automatically compute areas with closure errors
4. Generate reports

**Time Required:** 30-60 minutes for first project

---

## Prerequisites

### Software
- ✅ SurveyPro (running)
- ✅ QGIS 3.x ([qgis.org](https://qgis.org))
- ✅ PostgreSQL with PostGIS
- ✅ Database credentials

### Data
- Survey project with coordinate points entered
- Points must have: Name, Y (Northing), X (Easting)

---

## Workflow Steps

### STEP 1: Select Project in SurveyPro

1. Open **Lite → Areas**
2. Select project from dropdown (e.g., "Avondale - Survey Points")
3. Review coordinate points table (542 points loaded)
4. Edit/add points if needed

---

### STEP 2: Create Database Views

**Why:** Ensures QGIS only shows your project's data and auto-sets project_id.

**In pgAdmin:**
```sql
SELECT create_project_views(26);
```
*Replace 26 with your project ID*

**Verify:**
```sql
SELECT viewname FROM pg_views WHERE viewname LIKE '%_project_26';
```

Should show:
- `coordinate_points_project_26`
- `land_parcels_project_26`

---

### STEP 3: Get QGIS Connection Info

1. Click **📡 QGIS Connection** button in SurveyPro
2. Copy connection URI
3. Note view names:
   - Reference: `coordinate_points_project_26`
   - Digitize: `land_parcels_project_26`

---

### STEP 4: Connect QGIS to Database

1. Open QGIS
2. **Layer → Add PostGIS Layers**
3. Click **New** connection
4. Enter details:
   - Name: `SurveyPro`
   - Host: `localhost`
   - Port: `5432`
   - Database: `surveypro_v1`
   - Username: `postgres`
   - Password: (your password)
5. Click **Test Connection** → Should succeed
6. Click **OK**

---

### STEP 5: Load Project Layers

1. In PostGIS dialog, select **SurveyPro** connection
2. Click **Connect**
3. Find and check:
   - ☑️ `coordinate_points_project_26`
   - ☑️ `land_parcels_project_26`
4. Click **Add**
5. **Set CRS to EPSG:22291** (Zimbabwe Lo29)

**⚠️ Important:** Use project views, NOT base tables!

---

### STEP 6: Configure QGIS Layers

**Style Coordinate Points:**
- Symbol: Red circles, 3mm
- Labels: Show `name` field, 8pt font

**Style Land Parcels:**
- Fill: Transparent or light yellow (50% opacity)
- Outline: Black, 0.5mm

**Enable Snapping:**
- **Project → Snapping Options**
- Mode: All Layers
- Type: Vertex
- Tolerance: 0.5 meters

---

### STEP 7: Digitize Parcels

1. Select `land_parcels_project_26` layer
2. Click **Toggle Editing** (pencil icon)
3. Click **Add Polygon Feature**
4. Click on coordinate points to draw boundary
5. Right-click to finish polygon
6. Enter attributes:
   - **stand**: "Stand 1" (required)
   - **owner**: Property owner (optional)
   - **notes**: Additional info (optional)
7. Click **OK**
8. Repeat for all parcels
9. Click **Save Layer Edits** (Ctrl+S)
10. Click **Toggle Editing** to stop

**💡 Tips:**
- Zoom in for precision (1:500 scale)
- Snap to coordinate points exactly
- Follow survey point order
- Save every 5-10 parcels

---

### STEP 8: View Results in SurveyPro

1. Return to SurveyPro
2. Scroll to **Land Parcels** section
3. Click **🔄 Refresh**
4. View parcels with auto-calculated areas:
   - Area (m²)
   - Area (ha)
   - Perimeter (m)

**✅ Areas are automatically computed by PostGIS!**

---

### STEP 9: Compute Closure Errors

1. Click **🧮 Compute All Areas**
2. System validates vertices match coordinate list
3. View results:
   - **< 0.05m**: ✅ Excellent (cadastral grade)
   - **< 0.50m**: ⚠️ Acceptable
   - **≥ 0.50m**: ❌ Review required
4. Export to CSV or PDF

---

## Troubleshooting

### Issue: Cannot connect to database
**Solution:** 
- Check PostgreSQL service is running
- Verify credentials: `postgres` / your password
- Try `127.0.0.1` instead of `localhost`

### Issue: No coordinate points visible
**Solution:**
- Right-click layer → Zoom to Layer
- Check CRS is EPSG:22291
- Verify using project view, not base table

### Issue: Cannot edit land parcels
**Solution:**
- Must use `land_parcels_project_26` view
- Check database permissions
- Reload layer and try again

### Issue: Parcels not in SurveyPro after digitizing
**Solution:**
- Verify you saved edits in QGIS (Ctrl+S)
- Check you digitized in correct view
- Run SQL to verify project_id:
  ```sql
  SELECT id, project_id, stand 
  FROM land_parcels 
  ORDER BY id DESC LIMIT 10;
  ```

### Issue: High closure errors
**Solution:**
- Enable snapping in QGIS (0.5m tolerance)
- Snap vertices exactly to coordinate points
- Check coordinate values are correct
- Verify CRS is EPSG:22291

---

## Best Practices

### Data Quality
- ✅ Use systematic point names (P1, P2, P3)
- ✅ Verify coordinates before exporting
- ✅ Add descriptions for beacon conditions
- ✅ Regular backups (export to CSV)

### Digitizing
- ✅ Work at 1:500 scale for precision
- ✅ Always enable vertex snapping
- ✅ Follow survey point order
- ✅ Close polygons properly
- ✅ Save frequently (every 5-10 parcels)

### Quality Control
- ✅ Visual inspection before finalizing
- ✅ Target < 0.05m closure error
- ✅ Verify areas match expectations
- ✅ Cross-check QGIS vs SurveyPro areas
- ✅ Document issues in notes field

---

## Reference

### Zimbabwe CRS (EPSG Codes)

| Code | Name | Central Meridian | Area |
|------|------|------------------|------|
| 22285 | Lo25 | 25°E | Western |
| 22287 | Lo27 | 27°E | West-Central |
| **22289** | **Lo29** | **29°E** | **Harare** |
| 22291 | Lo31 | 31°E | East-Central |
| 22293 | Lo33 | 33°E | Eastern |

### Area Conversions

- **Hectares** = m² ÷ 10,000
- **Acres** = m² ÷ 4,046.86

### Closure Error Standards

| Survey Type | Max Error |
|-------------|-----------|
| Cadastral (Urban) | 0.05m |
| Cadastral (Rural) | 0.10m |
| General Boundary | 0.50m |

### QGIS Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle Editing | Ctrl+E |
| Save Edits | Ctrl+S |
| Undo | Ctrl+Z |
| Pan | Space + Drag |
| Zoom In | Ctrl + Scroll Up |
| Zoom Out | Ctrl + Scroll Down |

---

## Support

**Documentation:** See `COMPLETE_QGIS_WORKFLOW.md` for detailed technical guide

**Database Issues:** Contact database administrator

**QGIS Help:** [docs.qgis.org](https://docs.qgis.org)

---

*End of Quick Start Guide*
