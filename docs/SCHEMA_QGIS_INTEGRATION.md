# QGIS Integration with Schema-per-Surveyor Architecture

## 🎯 Overview

This document clarifies how QGIS integration works with the schema-per-surveyor multi-tenancy architecture and why we **DO NOT use project-specific views**.

---

## 🏗️ Architecture Decision

### ❌ What We DON'T Use: Project-Specific Views

We explicitly **DO NOT** create project-specific views like:
- ❌ `land_parcels_project_66`
- ❌ `coordinate_points_project_66`
- ❌ `CREATE VIEW ... WHERE project_id = 66`

**Why not?**
1. **Views with `INSTEAD OF` triggers are unreliable** in QGIS
2. **Primary key detection fails** with views
3. **QGIS save button gets disabled** unexpectedly
4. **Extra complexity** without real benefits
5. **Maintenance nightmare** (one view per project)

### ✅ What We DO Use: Base Tables + Filters

We use **base tables** with **QGIS layer filters**:

```
✅ Table: land_parcels
   Filter: "project_id" = 66
   
✅ Table: coordinate_points
   Filter: "project_id" = 66
```

**Why this works better:**
1. ✅ **Direct table access** - QGIS edits work perfectly
2. ✅ **Primary key auto-detected** - `id` column recognized
3. ✅ **Save button works** reliably
4. ✅ **Simple and maintainable** - no extra database objects
5. ✅ **Filtering is fast** - PostgreSQL optimizes indexed filters

---

## 📊 Before vs After Schema-per-Surveyor

### Before: Single Public Schema

```
Database: surveypro_v1
└── public schema
    ├── users (all users)
    ├── surveyor_profiles (all surveyors)
    ├── survey_projects (all projects from all surveyors)
    ├── coordinate_points (all points from all surveyors)
    └── land_parcels (all parcels from all surveyors)
```

**QGIS Workflow (Before):**
1. Connect to database
2. Select **public** schema
3. Add **land_parcels** table
4. Apply filter: `"project_id" = 66`
5. **Problem:** Sees ALL surveyors' data (filtered at query time)

### After: Schema-per-Surveyor

```
Database: surveypro_v1
├── public schema
│   ├── users (all users)
│   ├── surveyor_profiles (all surveyors)
│   ├── districts (shared reference data)
│   └── control_points_national (shared reference data)
│
├── surveyor_john_doe schema
│   ├── survey_projects (ONLY John's projects)
│   ├── coordinate_points (ONLY John's points)
│   └── land_parcels (ONLY John's parcels)
│
└── surveyor_jane_smith schema
    ├── survey_projects (ONLY Jane's projects)
    ├── coordinate_points (ONLY Jane's points)
    └── land_parcels (ONLY Jane's parcels)
```

**QGIS Workflow (After):**
1. Connect to database
2. Select **surveyor_john_doe** schema
3. Add **land_parcels** table
4. Apply filter: `"project_id" = 66`
5. **Benefit:** Only sees John's data (physically isolated)

---

## 🎯 Two Levels of Filtering

With schema-per-surveyor, we have **two levels of data isolation**:

### Level 1: Schema Isolation (Surveyor Level)

```sql
-- Each surveyor's data is in their own schema
SET search_path = surveyor_john_doe, public;
```

- **Physical separation** - John cannot access Jane's schema
- **Database-level security** - PostgreSQL enforces permissions
- **GitHub-like repository** - Each surveyor has their "workspace"

### Level 2: Project Filtering (Project Level)

```sql
-- Within a surveyor's schema, filter by project
SELECT * FROM land_parcels WHERE project_id = 66;
```

- **Query-level filtering** - Focus on specific project
- **QGIS layer filter** - Simple and fast
- **No extra views needed** - Just a WHERE clause

---

## 📋 Complete QGIS Workflow

### Step 1: Get Connection Info from SurveyPro

In SurveyPro:
1. Navigate to **Area Computation** module
2. Click **"QGIS Connection Info"**
3. Note the **schema name** (e.g., `surveyor_john_doe`)
4. Copy connection details

### Step 2: Connect QGIS to Database

In QGIS:
1. **Layer** → **Add Layer** → **Add PostGIS Layers**
2. Click **"New"** to create connection
3. **Name:** `SurveyPro - John Doe`
4. **Host:** `localhost` (or from connection info)
5. **Port:** `5432`
6. **Database:** `surveypro_v1`
7. **Username:** `postgres`
8. **Password:** (your database password)
9. Click **"Test Connection"** → Should see "✓ Connection successful"
10. Click **"OK"**

### Step 3: Add Coordinate Points Layer (Reference)

1. Click **"Connect"** on your new connection
2. **Expand** the schema: `surveyor_john_doe`
3. Find table: **coordinate_points**
4. Select it and click **"Add"**
5. **Right-click** layer → **Filter...**
6. Enter: `"project_id" = 66` (replace 66 with your project ID)
7. Click **OK**
8. **Right-click** layer → **Properties** → **Labels**
9. Enable labels, use field: **name**

### Step 4: Add Land Parcels Layer (Digitization)

1. In the same connection, find table: **land_parcels**
2. Select it and click **"Add"**
3. ⚠️ **CRITICAL:** When adding, QGIS will ask for **Feature id**
   - Select: **id** (the primary key column)
   - This ensures QGIS can edit the layer
4. **Right-click** layer → **Filter...**
5. Enter: `"project_id" = 66`
6. Click **OK**
7. **Right-click** layer → **Properties** → **Attributes Form**
8. Set default value for `project_id` field: `66`

### Step 5: Configure Snapping

1. **Settings** → **Snapping Options**
2. Enable snapping for **coordinate_points** layer
3. Set tolerance: **0.01 meters**
4. Snap to: **Vertex**

### Step 6: Digitize Parcels

1. Select **land_parcels** layer
2. Click **Toggle Editing** (pencil icon)
3. Click **Add Polygon Feature** tool
4. Click to create vertices (snap to coordinate points)
5. Right-click to finish polygon
6. Enter **stand** name in the dialog
7. Click **Save Edits** (disk icon)
8. ✅ **Success:** Parcel saved directly to base table

### Step 7: Verify in SurveyPro

1. Return to SurveyPro
2. Click **"Refresh Parcels"** button
3. Your digitized parcels appear with computed areas

---

## 🔒 Security & Isolation

### Schema-Level Security

Each surveyor's schema is isolated:

```sql
-- Grant access to surveyor's own schema
GRANT ALL ON SCHEMA surveyor_john_doe TO john_doe;
GRANT ALL ON ALL TABLES IN SCHEMA surveyor_john_doe TO john_doe;

-- Deny access to other surveyors' schemas
-- (John cannot access surveyor_jane_smith schema)
```

### Shared Data Access

All surveyors can read shared reference data:

```sql
-- Everyone can read from public schema
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT ON public.districts TO PUBLIC;
GRANT SELECT ON public.control_points_national TO PUBLIC;
```

---

## 📊 Comparison Table

| Aspect | Project-Specific Views ❌ | Base Tables + Filters ✅ |
|--------|---------------------------|--------------------------|
| **QGIS Editing** | Unreliable, often fails | Works perfectly |
| **Primary Key** | Not detected | Auto-detected |
| **Save Button** | Often disabled | Always works |
| **Database Objects** | 1 view per project | No extra objects |
| **Maintenance** | High (100s of views) | Low (just filters) |
| **Performance** | Same as base table | Same |
| **Complexity** | High (triggers, views) | Low (simple filter) |
| **Recommended?** | ❌ NO | ✅ YES |

---

## 🎯 Key Takeaways

### ✅ DO This:

1. **Use base tables:** `land_parcels`, `coordinate_points`
2. **Apply QGIS layer filters:** `"project_id" = X`
3. **Select correct schema:** `surveyor_john_doe` (not public)
4. **Set primary key:** Select `id` when adding layer
5. **Set default values:** Set `project_id` default in QGIS form

### ❌ DON'T Do This:

1. **Don't create project views:** No `land_parcels_project_66`
2. **Don't use `INSTEAD OF` triggers:** They break QGIS editing
3. **Don't skip primary key selection:** QGIS needs it to edit
4. **Don't use public schema:** Use surveyor-specific schema
5. **Don't forget layer filters:** Always filter by project_id

---

## 🐛 Troubleshooting

### Issue: Can't see surveyor schema in QGIS

**Solution:**
- Schema may not be created yet
- Check: `SELECT schema_name FROM surveyor_profiles WHERE user_id = X;`
- If NULL, run: `SELECT create_surveyor_schema('user@email.com');`

### Issue: Save button disabled in QGIS

**Solution:**
- You didn't select `id` as primary key when adding layer
- Remove layer and re-add, this time selecting `id` as Feature id

### Issue: NULL project_id after saving parcel

**Solution:**
- Set default value for `project_id` in QGIS Attributes Form
- Or use the smart trigger: `land_parcels_project_id_trigger.sql`

### Issue: Can see other surveyors' data

**Solution:**
- You're connected to `public` schema instead of your surveyor schema
- Reconnect and select the correct schema: `surveyor_your_name`

---

## 📚 Related Documentation

- **MULTI_TENANCY_DESIGN.md** - Complete schema-per-surveyor architecture
- **CADASTRAL_AREA_COMPUTATION_GUIDE.md** - Full QGIS workflow guide
- **QGIS_INTEGRATION_SUMMARY.md** - Original QGIS integration decisions
- **040_schema_per_surveyor.sql** - Database migration script

---

## ✨ Summary

**Schema-per-surveyor provides surveyor-level isolation.**  
**Base tables + filters provide project-level filtering.**  
**Together, they create secure, maintainable, and reliable QGIS integration.** ✅

No project-specific views needed! 🎉
