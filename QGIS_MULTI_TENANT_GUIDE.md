# QGIS Integration Guide - Multi-Tenant Architecture

## 📚 Table of Contents

1. [Overview](#overview)
2. [Understanding Multi-Tenancy](#understanding-multi-tenancy)
3. [Setup Instructions](#setup-instructions)
4. [Digitizing Workflow](#digitizing-workflow)
5. [Viewing Calculated Areas](#viewing-calculated-areas)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## Overview

SurveyPro uses a **multi-tenant architecture** where each surveyor has their own PostgreSQL schema with completely isolated data. This guide explains how to connect QGIS to your personal schema and digitize land parcels.

### Key Concepts

- **Your Schema:** `surveyor_[your_username]` (e.g., `surveyor_john_doe`)
- **Digitizing Layer:** `land_parcels_qgis` (allows INSERT/UPDATE)
- **Viewing Layer:** `land_parcels` (read-only, shows calculated areas)
- **Area Calculation:** Automatic via PostgreSQL GENERATED ALWAYS columns

---

## Understanding Multi-Tenancy

### What is Multi-Tenancy?

Multi-tenancy means each surveyor has their own dedicated "space" (schema) in the database. Think of it like GitHub repositories - each user has their own repos, and data is isolated.

### Your Database Structure

```
surveypro_v1 (database)
├── public (shared)
│   ├── users
│   ├── surveyor_profiles
│   └── control_points_national
├── surveyor_john_doe (YOUR schema)
│   ├── survey_projects
│   ├── coordinate_points
│   ├── land_parcels
│   └── land_parcels_qgis (view)
└── surveyor_jane_smith (someone else's schema)
    └── (their data - you can't see this)
```

### Why Multi-Tenancy?

✅ **Data Isolation:** Your projects are completely separate from others  
✅ **Easy Backup:** Export just your schema  
✅ **Clear Ownership:** No confusion about data belonging  
✅ **Scalability:** Each surveyor has dedicated resources

---

## Setup Instructions

### Prerequisites

- ✅ QGIS Desktop installed (version 3.x or higher)
- ✅ SurveyPro account created
- ✅ Surveyor profile completed
- ✅ At least one project created in SurveyPro app

### Step 1: Get Your Connection Details

1. **Open SurveyPro App**
2. **Navigate to:** Settings → QGIS Integration
3. **Copy the following:**
   - Schema Name: `surveyor_[your_username]`
   - Host: `localhost` (or server IP)
   - Port: `5432`
   - Database: `surveypro_v1`
   - Username: (from settings)

### Step 2: Create QGIS Database Connection

1. **Open QGIS Desktop**
2. **Menu:** Layer → Add Layer → Add PostGIS Layers
3. **Click:** "New" button (to create new connection)
4. **Fill in the form:**
   ```
   Name: SurveyPro - [Your Name]
   Host: localhost
   Port: 5432
   Database: surveypro_v1
   ```
5. **Authentication:**
   - Username: [from app]
   - Password: [from app]
   - ☑️ Store password (optional but convenient)
6. **Click:** "Test Connection"
7. **Should see:** "Connection to localhost was successful"
8. **Click:** "OK"

### Step 3: Add Your Schema to Browser Panel

1. **In QGIS Browser Panel** (left side)
2. **Expand:** PostGIS → Your Connection
3. **Find your schema:** `surveyor_[your_username]`
4. **You should see:**
   - `survey_projects`
   - `coordinate_points`
   - `land_parcels`
   - `land_parcels_qgis` ⭐ (this is what we'll use)

### Step 4: Add Digitizing Layer

1. **Expand:** `surveyor_[your_username]` schema
2. **Find:** `land_parcels_qgis` (it has a table icon)
3. **Double-click** or **drag** to map canvas
4. **Layer should appear** in Layers Panel
5. **Rename layer** (right-click → Rename): "Land Parcels (Edit)"

### Step 5: Configure Layer for Editing

1. **Right-click** `land_parcels_qgis` layer
2. **Properties** → **Attributes Form**
3. **For each field, set:**
   - `id`: Hidden (auto-generated)
   - `project_id`: Edit Widget → "Value Relation" (link to survey_projects)
   - `stand`: Edit Widget → "Text Edit"
   - `designation`: Edit Widget → "Text Edit"
   - `geom`: Hidden (drawn, not typed)
   - `status`: Edit Widget → "Value Map" (draft/finalized/approved)
   - `metadata`: Hidden (advanced use only)
4. **Click:** "OK"

---

## Digitizing Workflow

### Before You Start

1. ✅ **Project exists** in SurveyPro app
2. ✅ **Coordinate points loaded** (if needed as reference)
3. ✅ **Background imagery loaded** (Google Satellite, etc.)
4. ✅ `land_parcels_qgis` layer added to QGIS

### Method 1: Digitize New Parcel

1. **Select** `land_parcels_qgis` layer
2. **Toggle Editing** (pencil icon in toolbar)
3. **Add Polygon Feature** (icon with polygon)
4. **Click map** to add vertices:
   - Left-click: Add vertex
   - Right-click: Finish polygon
5. **Fill in attributes:**
   ```
   project_id: [Select your project]
   stand: "Stand 123" (or parcel identifier)
   designation: "Residential Plot" (optional)
   status: "draft"
   ```
6. **Click:** "OK"
7. **Save Edits** (save icon in toolbar)
8. **✅ Done!** Area auto-calculated by PostgreSQL

### Method 2: Import from CAD/Shapefile

1. **Import data** to temporary layer
2. **Select features** to convert
3. **Edit → Copy Features**
4. **Select** `land_parcels_qgis` layer
5. **Toggle Editing**
6. **Edit → Paste Features**
7. **Fill in attributes** (project_id, stand, etc.)
8. **Save Edits**

### Method 3: Digitize from Coordinate Points

1. **Load** `coordinate_points` layer
2. **Enable snapping** (Settings → Snapping)
3. **Digitize polygon** snapping to coordinate points
4. **Save with attributes**

---

## Viewing Calculated Areas

### Why Two Layers?

- `land_parcels_qgis`: For **digitizing** (excludes calculated columns)
- `land_parcels`: For **viewing** (includes area_m2, area_ha, perimeter_m)

### Add Area Viewing Layer

1. **Expand** your schema in Browser Panel
2. **Find** `land_parcels` table (NOT the _qgis view)
3. **Drag** to map canvas
4. **Rename** to "Land Parcels (Areas)"
5. **Set as read-only:**
   - Right-click → Properties
   - Attributes Form → Make all fields "Read-only"
   - Click "OK"

### View Areas in Attribute Table

1. **Right-click** `land_parcels` layer
2. **Open Attribute Table**
3. **You'll see columns:**
   ```
   id | stand | designation | area_m2 | area_ha | perimeter_m
   1  | 123   | Plot A      | 1250.45 | 0.1250  | 145.32
   ```
4. **Areas are auto-calculated** - no manual entry needed!

### Label Parcels with Areas

1. **Right-click** `land_parcels` layer
2. **Properties** → **Labels** → "Single Labels"
3. **Label with:** 
   ```
   "Stand: " || "stand" || '\n' || 
   "Area: " || round("area_ha", 4) || " ha"
   ```
4. **Style** as desired
5. **Click:** "OK"
6. **Map now shows** stand numbers and areas on parcels

---

## Troubleshooting

### Error: "Cannot insert into column 'area_m2'"

**Problem:** You're trying to edit `land_parcels` directly (it has GENERATED ALWAYS columns)

**Solution:** Use `land_parcels_qgis` view instead

```
❌ WRONG: Editing land_parcels (has generated columns)
✅ CORRECT: Editing land_parcels_qgis (excludes generated columns)
```

### Error: "Foreign key constraint violation on project_id"

**Problem:** Project doesn't exist in your surveyor schema

**Solution:** 
1. Open SurveyPro app
2. Create project first
3. Note the project ID or name
4. Use that project ID when digitizing

### Error: "Schema not found" or "Can't see surveyor_* schema"

**Problem:** Schema doesn't exist or connection using wrong schema

**Solution:**
1. Check your surveyor profile in SurveyPro app
2. Verify schema was created (Settings → Database Info)
3. Refresh QGIS connection (right-click → Refresh)
4. Contact admin if schema doesn't exist

### Can't See Any Data

**Checklist:**
- ✅ Connected to correct database? (`surveypro_v1`)
- ✅ Looking at correct schema? (`surveyor_[your_username]`)
- ✅ Projects created in SurveyPro app first?
- ✅ QGIS layer added from correct schema?

**Verify:**
```sql
-- In QGIS DB Manager (Database → DB Manager)
-- Or in psql:
SET search_path = surveyor_YOUR_USERNAME, public;

SELECT COUNT(*) FROM survey_projects;
-- Should return number > 0

SELECT COUNT(*) FROM land_parcels;
-- Returns number of parcels you've created
```

### Slow Performance

**Tips:**
- Limit features loaded (Layer Properties → Filter)
- Add spatial index (usually automatic)
- Simplify geometry if very complex
- Use background imagery with pyramid tiles

### Data Not Syncing with App

**Solution:**
1. **Save edits in QGIS** (save icon)
2. **Refresh app** (F5 in browser)
3. **Check console logs** for errors
4. **Verify project_id** is correct

---

## Best Practices

### Before Digitizing

1. ✅ **Create project** in SurveyPro app first
2. ✅ **Load coordinate points** as reference layer
3. ✅ **Enable snapping** for accuracy
4. ✅ **Set up proper projection** (EPSG:22291 for Zimbabwe)

### While Digitizing

1. ✅ **Fill all required attributes** (project_id, stand)
2. ✅ **Use consistent naming** (Stand 1, Stand 2, etc.)
3. ✅ **Save frequently** (Ctrl+S)
4. ✅ **Check topology** (no overlaps, no gaps)

### After Digitizing

1. ✅ **Review in attribute table**
2. ✅ **Check calculated areas** in `land_parcels` layer
3. ✅ **Verify in SurveyPro app**
4. ✅ **Run validation** (if available)

### Naming Conventions

```
✅ GOOD:
- Stand 123
- Plot 456-A
- ERF 789

❌ AVOID:
- stand123 (inconsistent case)
- Plot A (too vague)
- test (not descriptive)
```

### Data Quality Checks

```sql
-- In QGIS DB Manager or psql:

-- 1. Check for missing project_id
SELECT id, stand 
FROM land_parcels 
WHERE project_id IS NULL;

-- 2. Check for very small areas (< 1 m²)
SELECT id, stand, area_m2 
FROM land_parcels 
WHERE area_m2 < 1;

-- 3. Check for very large areas (> 100 ha)
SELECT id, stand, area_ha 
FROM land_parcels 
WHERE area_ha > 100;

-- 4. Find parcels without stand designation
SELECT id 
FROM land_parcels 
WHERE stand IS NULL OR stand = '';
```

---

## Advanced Tips

### Create Project-Specific Filter

```sql
-- In Layer Properties → Source → Query Builder:
"project_id" = 5  -- Replace 5 with your project ID

-- Now layer only shows parcels from that project
```

### Custom Styling by Status

1. Right-click layer → Properties → Symbology
2. Change from "Single Symbol" to "Categorized"
3. Column: `status`
4. Add values:
   - draft: Yellow
   - finalized: Green
   - approved: Blue
5. Click "OK"

### Batch Update Status

```sql
-- In QGIS DB Manager:
UPDATE land_parcels 
SET status = 'finalized' 
WHERE project_id = 5 AND status = 'draft';
```

### Export to Shapefile

1. Right-click `land_parcels` layer
2. Export → Save Features As
3. Format: ESRI Shapefile
4. CRS: EPSG:22291 (or WGS84 for GPS)
5. ✅ Include calculated area columns!

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle Editing | Ctrl + E |
| Save Edits | Ctrl + S |
| Add Feature | Ctrl + . (period) |
| Delete Feature | Delete |
| Pan Map | Space + Drag |
| Zoom In | Ctrl + Mouse Wheel |
| Fit to Layer | Ctrl + Shift + F |
| Open Attribute Table | F6 |

---

## FAQ

### Q: Can I use my own coordinate system?

**A:** The database uses EPSG:22291 (Cape Lo 31). QGIS will transform on-the-fly if you use different CRS in map canvas. For best accuracy, match the database CRS.

### Q: Can I see other surveyors' data?

**A:** No. Multi-tenancy ensures complete isolation. You only see your schema's data.

### Q: What if I digitize in wrong project?

**A:** You can update the `project_id` in QGIS attribute table (while editing) or via SQL:
```sql
UPDATE land_parcels 
SET project_id = 10  -- correct project
WHERE id = 123;      -- parcel ID
```

### Q: Can I use QGIS mobile?

**A:** Yes! QField (mobile version) can connect to PostGIS. Same connection details apply.

### Q: How accurate are calculated areas?

**A:** PostGIS ST_Area() is highly accurate for planar coordinates. For geodetic accuracy over large areas, transform to appropriate geographic CRS first.

### Q: Can I edit directly in SurveyPro app?

**A:** Yes! The app has a built-in digitizing tool. QGIS is optional for users who prefer desktop GIS.

---

## Support

### Documentation

- Main Analysis: `LAND_PARCEL_COMPREHENSIVE_ANALYSIS.md`
- Quick Fix: `QUICK_FIX_GUIDE.md`
- API Docs: `/api/docs` (when backend running)

### Getting Help

1. Check this guide first
2. Review error messages carefully
3. Verify database connection
4. Check SurveyPro app for data consistency
5. Contact support with:
   - Error message (full text)
   - Screenshot of issue
   - Steps to reproduce
   - Your schema name

### Reporting Issues

Include:
- QGIS version
- PostgreSQL version
- Operating system
- Error logs (Layer → Properties → Log Messages)
- SQL query that failed (if applicable)

---

## Appendix: SQL Reference

### Useful Queries

```sql
-- Set working schema
SET search_path = surveyor_YOUR_USERNAME, public;

-- List all projects
SELECT id, name, created_at 
FROM survey_projects 
ORDER BY created_at DESC;

-- List all parcels with areas
SELECT 
  id,
  stand,
  designation,
  ROUND(area_m2::numeric, 2) as area_m2,
  ROUND(area_ha::numeric, 4) as area_ha,
  ROUND(perimeter_m::numeric, 2) as perimeter_m
FROM land_parcels
ORDER BY created_at DESC;

-- Find parcels in specific project
SELECT stand, area_ha 
FROM land_parcels 
WHERE project_id = 5;

-- Calculate total area by project
SELECT 
  sp.name as project,
  COUNT(lp.id) as parcel_count,
  ROUND(SUM(lp.area_ha)::numeric, 4) as total_area_ha
FROM land_parcels lp
JOIN survey_projects sp ON lp.project_id = sp.id
GROUP BY sp.name;

-- Find overlapping parcels (topology check)
SELECT a.stand as parcel_a, b.stand as parcel_b
FROM land_parcels a, land_parcels b
WHERE a.id < b.id 
  AND ST_Overlaps(a.geom, b.geom);
```

---

**Document Version:** 1.0  
**Last Updated:** December 9, 2024  
**For:** SurveyPro Users  
**Platform:** QGIS 3.x + PostgreSQL/PostGIS  
**Architecture:** Multi-Tenant (Schema-per-Surveyor)
