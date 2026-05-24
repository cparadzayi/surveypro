# Cadastral Area Computation Guide
## Complete Workflow: From Coordinates to Area Reports

This guide walks you through the entire process of computing land parcel areas in SurveyPro using QGIS for digitization.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Workflow Steps](#workflow-steps)
4. [QGIS Setup (One-Time)](#qgis-setup-one-time)
5. [Step-by-Step Area Computation](#step-by-step-area-computation)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## Overview

**What you'll do:**
1. Import survey coordinates into SurveyPro
2. Export coordinates to PostgreSQL database
3. Connect QGIS to the database
4. Digitize land parcels in QGIS by snapping to coordinate points
5. Return to SurveyPro to view computed areas and generate reports

**Time required:** 
- First time: ~30 minutes (includes QGIS setup)
- Subsequent times: ~10-15 minutes

---

## Prerequisites

### Software Required

✅ **SurveyPro** - Running and logged in  
✅ **QGIS Desktop** (Version 3.x) - [Download here](https://qgis.org/en/site/forusers/download.html)  
✅ **PostgreSQL Database** - Backend must be running  
✅ **Web Browser** - For SurveyPro interface

### Files You'll Need

📄 **CSV file** with survey coordinates:
```csv
Point,Y,X,Description,F/P
2474A,96793.172,2247549.003,Found beacon,F
2474C,96839.759,2247520.021,Found beacon,F
2474D,96823.366,2247564.919,Placed beacon,P
```

Required columns: `Point`, `Y`, `X`  
Optional columns: `Description`, `F/P`, `Status`, `Date`

---

## Workflow Steps

```
┌─────────────────────────────────────────────────────────────────┐
│                    SURVEYPRO CADASTRAL WORKFLOW                 │
└─────────────────────────────────────────────────────────────────┘

Step 1: IMPORT CSV                    [SurveyPro]
   │   • Select project
   │   • Upload coordinate CSV file
   │   • Review imported points
   │
Step 2: GENERATE DOCUMENTS            [SurveyPro]
   │   • Field Book
   │   • Calculations Part 1
   │   • Coordinate List
   │
Step 3: EXPORT TO DATABASE            [SurveyPro]
   │   • Export coordinate points to PostgreSQL
   │   • Get QGIS connection info
   │
Step 4: DIGITIZE PARCELS              [QGIS]
   │   • Connect to database
   │   • Snap to coordinate points
   │   • Draw parcel boundaries
   │   • Enter stand designations
   │
Step 5: AREA COMPUTATION              [SurveyPro]
   │   • Refresh parcels
   │   • View computed areas
   │   • Review closure errors
   │
Step 6: GENERATE REPORTS              [SurveyPro]
   │   • Area computation report
   │   • Report on Survey
   │   • DSG Certificate
   │
└─────────────────────────────────────────────────────────────────┘
```

---

## QGIS Setup (One-Time)

### 📥 Install QGIS

1. Download QGIS from https://qgis.org/en/site/forusers/download.html
2. Install with default options
3. Launch QGIS Desktop

### 🔌 Configure Database Connection

**Do this once, reuse for all projects:**

1. Open QGIS
2. **Layer** → **Add Layer** → **Add PostGIS Layers...**
3. Click **"New"** to create a connection
4. Enter connection details:
   - **Name:** `SurveyPro Database`
   - **Host:** `localhost` (or your database server)
   - **Port:** `5432`
   - **Database:** `surveypro_v1`
   - **Username:** `postgres` (or your database user)
   - **Password:** (enter your database password)
   - ☑ Check **"Store"** to save password
5. Click **"Test Connection"**
   - Should show: ✅ "Connection successful"
6. Click **"OK"**

Your database connection is now saved for future use!

---

## Step-by-Step Area Computation

### 🚀 STEP 1: Start in SurveyPro

#### 1.1 Select Your Project

1. Navigate to **Cadastral Standard** module
2. **Select Surveyor** from dropdown
3. **Select Project** or create new:
   - Click **"+ New Project"**
   - Enter project name (e.g., "Shabani Subdivision")
   - Select survey type: `Subdivision` / `Cadastral` / etc.
   - Enter client name, district
   - Click **"Create"**

#### 1.2 Import Coordinate CSV

1. Click **"Import Coordinates"** or **"Choose CSV File"**
2. Select your CSV file
3. Review the preview:
   - Check column mapping is correct
   - Verify coordinate values look reasonable
4. Click **"Import"**
5. **Success:** You'll see a summary like:
   ```
   ✅ 542 points imported successfully
   📊 Breakdown:
      - Found beacons: 235
      - Placed beacons: 307
   ```

#### 1.3 Review Imported Data

1. Scroll through the coordinate table
2. Check for any obvious errors
3. Edit points if needed (click pencil icon)
4. Continue to next step

---

### 📄 STEP 2: Generate Standard Documents

This creates the required cadastral documents.

#### 2.1 Field Book

1. Click **"Generate Field Book"**
2. Preview opens in modal
3. Review pages (27 points per page)
4. Click **"Save to Project"**
   - Saved to: `Documents/SurveyPro/Projects/[ProjectName]/output/field-book/`
5. Click **"Continue"** or navigate to next step

#### 2.2 Calculations Part 1

1. Click **"Generate Calculations"**
2. System performs:
   - GPS point adjustments
   - Coordinate transformations
   - Duplicate analysis
3. Review calculation results
4. Click **"Continue"**

#### 2.3 Coordinate List

1. Click **"Generate Coordinate List"**
2. Preview the document:
   - Starts at page 100
   - Groups: TRIG BEACONS, WORKING STATIONS, FOUND BEACONS, PLACED BEACONS
   - Cross-references to Field Book and Calculations
3. Click **"Save to Project"**
4. Click **"Continue to Area Computation"**

---

### 🗺️ STEP 3: Export to Database & Connect QGIS

#### 3.1 Export Coordinate Points

1. You're now on **"Area Computation"** step
2. Click **"Export to PostGIS Database"**
3. **Success message:**
   ```
   ✅ 542 coordinate points exported to database
   📍 Table: coordinate_points
   🆔 Project ID: 64
   ```

#### 3.2 Get QGIS Connection Instructions

1. Click **"QGIS Connection Info"** button
2. A panel expands with:
   - Database connection details
   - **Copy** button for connection URI
   - Step-by-step instructions
3. Keep this panel open (you'll reference it)

#### 3.3 Open QGIS

1. Launch **QGIS Desktop**
2. Create a **New Empty Project** (or use existing)
3. Set Project CRS:
   - Bottom right corner → Click **EPSG:XXXX**
   - Search: `22291` (Hartebeesthoek94 / Lo31)
   - Select: **EPSG:22291 - Hartebeesthoek94 / Lo31**
   - Click **OK**

---

### 🎯 STEP 4: Add Layers in QGIS

#### 4.1 Add Coordinate Points (Reference Layer)

1. **Layer** → **Add Layer** → **Add PostGIS Layers...**
2. Select your saved connection: **"SurveyPro Database"**
3. Click **"Connect"**
4. Expand **"public"** schema
5. Find and **select**: `coordinate_points`
6. **Important:** Check the filter option:
   - In the dialog, you may see "Set Filter"
   - Enter: `"project_id" = 64` (use your project ID)
   - This shows only your project's points
7. Click **"Add"**
8. Layer appears on map as orange points

#### 4.2 Configure Point Labels

Make point names visible:

1. Right-click `coordinate_points` layer → **Properties**
2. **Labels** tab (left sidebar)
3. Change dropdown from "No Labels" to **"Single Labels"**
4. **Value:** Select `name` from dropdown
5. **Text** tab:
   - Font: Bold, Size 10
   - Color: Black
6. **Buffer** tab:
   - ☑ Check "Draw text buffer"
   - Size: 1mm
   - Color: White
7. Click **OK**

Now you can see point names like "2474A", "2474C", etc.

#### 4.3 Add Land Parcels (Digitizing Layer)

1. **Layer** → **Add Layer** → **Add PostGIS Layers...**
2. Select connection: **"SurveyPro Database"**
3. Click **"Connect"**
4. Expand **"public"** schema
5. Find and **select**: `land_parcels`
6. **CRITICAL:** Before clicking "Add":
   - Look at bottom of dialog for **"Feature id"** or **"Primary key"** dropdown
   - **Select: `id`** from the dropdown
   - This is essential for saving features!
7. Click **"Add"**
8. Layer appears (probably empty at first - that's OK!)

#### 4.4 Apply Filter to Land Parcels

1. Right-click `land_parcels` layer → **Filter...**
2. In the filter expression box, enter:
   ```sql
   "project_id" = 64
   ```
   (Replace 64 with your actual project ID)
3. Click **"OK"**

This ensures you only see/edit parcels for your project.

#### 4.5 Set Default Value for project_id

**Critical step to avoid NULL project_id:**

1. Right-click `land_parcels` layer → **Properties**
2. **Attributes Form** tab (left sidebar)
3. Scroll to find **`project_id`** field
4. Click on the field to expand settings
5. In the **Defaults** section:
   - **Default value:** Enter `64` (your project ID)
   - ☑ Check **"Apply default value on update"**
6. **Widget Type:** Set to "Hidden" (optional - hides it from form)
7. Find **`id`** field and configure:
   - **Widget Type:** "Hidden" (it auto-increments)
8. Click **OK**

Now when you digitize, `project_id` automatically sets to 64!

---

### ✏️ STEP 5: Digitize Parcels in QGIS

#### 5.1 Enable Snapping

**This ensures you snap exactly to coordinate points:**

1. **Settings** → **Snapping Options** (or press `S`)
2. Click **magnet icon** to enable snapping
3. Set snapping options:
   - **Mode:** Active Layer → Change to **"All Layers"**
   - Find `coordinate_points` row:
     - ☑ Enable (check the checkbox)
     - **Type:** Vertex
     - **Tolerance:** `0.01` meters
     - **Units:** meters
   - Find `land_parcels` row:
     - ☑ Enable
     - **Type:** Vertex and Segment
4. **Snapping Mode:** Vertex (top toolbar icon)
5. **Topology:** ☑ Enable topological editing (prevents gaps/overlaps)

#### 5.2 Start Editing Land Parcels

1. **Select** the `land_parcels` layer in Layers panel
2. Click **Toggle Editing** button (pencil icon) in toolbar
   - Layer name turns to orange/yellow indicating edit mode
3. Click **Add Polygon Feature** button (polygon icon)

#### 5.3 Digitize Your First Parcel

**Example: Stand 2474**

1. **Zoom** to your first parcel area (use mouse wheel)
2. **Click** on first corner point (e.g., 2474A)
   - When you hover near a coordinate point, you'll see it "snap" (magnet cursor)
   - **Click** when the snap indicator appears
3. **Click** on second corner point (e.g., 2474B)
   - Again, wait for snap indicator
4. **Click** on third corner point (e.g., 2474C)
5. Continue clicking all corners **in order** (clockwise or counter-clockwise)
6. **Right-click** on the **first point** to close the polygon
   - Or press `Esc` then left-click first point

#### 5.4 Enter Parcel Attributes

A form appears:

| Field | What to Enter | Example |
|-------|---------------|---------|
| `id` | **Leave EMPTY** (auto-fills) | - |
| `project_id` | **Should show 64** (auto-filled) | 64 |
| `stand` | **Required:** Stand designation | 2474 |
| `designation` | Optional: Full designation | Stand 2474 |
| `owner` | Optional: Owner name | John Doe |
| `title_deed` | Optional: Deed number | TD/123/2025 |
| `survey_date` | Optional: Survey date | 2025-12-03 |
| `surveyor` | Optional: Your name | M. Surveyor |
| `notes` | Optional: Any notes | - |

**Important:**
- ✅ `id` should be **empty** or **grayed out**
- ✅ `project_id` should show **64** automatically
- ✅ `stand` is **required** - enter the stand number

Click **"OK"**

The polygon appears on the map!

#### 5.5 Digitize Remaining Parcels

Repeat steps 5.3 and 5.4 for each parcel:
- Stand 2475
- Stand 2476
- Stand 2477
- etc.

**Tips:**
- Work systematically (don't jump around)
- Double-check you're snapping to correct points
- Use QGIS **Identify** tool (i icon) to verify point names
- Zoom in close when snapping

#### 5.6 Save Your Edits

**After digitizing each parcel OR after finishing all:**

1. Click **Save Layer Edits** button (disk icon)
2. **Success:** No error message = saved successfully
3. Click **Toggle Editing** to exit edit mode (optional - you can keep editing)

---

### 🔄 STEP 6: Return to SurveyPro for Area Computation

#### 6.1 Refresh Parcels in SurveyPro

1. Go back to your **SurveyPro browser tab**
2. Still on "Area Computation" step
3. Click **"Refresh Parcels"** button
4. **Success message:**
   ```
   ✅ Found 10 land parcels for project 64
   📊 Parcels loaded successfully
   ```

#### 6.2 Review Computed Areas

A table appears showing:

| Stand | Area (m²) | Area (ha) | Closure Error | Status |
|-------|-----------|-----------|---------------|--------|
| 2474 | 12,547.89 | 1.2548 | 0.023m | ✅ Excellent |
| 2475 | 8,965.12 | 0.8965 | 0.045m | ✅ Good |
| 2476 | 15,234.56 | 1.5235 | 0.089m | ⚠️ Acceptable |

**Understanding Closure Errors:**
- **< 0.05m:** ✅ Excellent quality
- **0.05m - 0.50m:** ✅ Good/Acceptable
- **> 0.50m:** ⚠️ Review required

#### 6.3 Export Results (Optional)

1. Click **"Export to CSV"** - download spreadsheet
2. Click **"Generate PDF Report"** - formatted area computation report

#### 6.4 Continue to Report on Survey

1. Click **"Continue to Report on Survey"**
2. Parcel data auto-populates:
   - Stand designations
   - Areas
   - Survey dates
3. Fill in remaining fields:
   - Purpose of survey
   - Survey basis
   - Found/placed beacons
4. Click **"Generate Report"**

---

## 🔧 Troubleshooting

### Issue: "Cannot save features" or "Save button disabled"

**Cause:** QGIS doesn't recognize `id` as primary key

**Fix:**
1. Remove `land_parcels` layer
2. Re-add it
3. **Before clicking "Add":** Select `id` in "Feature id" dropdown at bottom
4. Click "Add"

---

### Issue: "Digitized parcels disappeared after saving"

**Cause:** `project_id` is NULL

**Fix:**
1. Right-click layer → Properties → Attributes Form
2. Find `project_id` field
3. Set Default value: `64`
4. Check "Apply default value on update"
5. Re-digitize the parcels

**Or run this SQL:**
```sql
UPDATE land_parcels 
SET project_id = 64 
WHERE project_id IS NULL;
```

---

### Issue: "project_id shows NULL in form"

**Cause:** Default value not configured

**Fix:**
1. Right-click `land_parcels` → Properties → Attributes Form
2. Find `project_id`, set Default: `64`
3. Click OK
4. Restart editing

---

### Issue: "Points don't snap in QGIS"

**Cause:** Snapping not enabled

**Fix:**
1. Press `S` or Settings → Snapping Options
2. Enable snapping for `coordinate_points` layer
3. Set tolerance: 0.01 meters
4. Try digitizing again

---

### Issue: "Wrong coordinate system / points in wrong location"

**Cause:** SRID mismatch

**Fix:**
1. Check project CRS (bottom right): Should be EPSG:22291
2. Right-click `coordinate_points` → Properties → Source
3. Check "Assigned CRS": Should be EPSG:22291
4. If wrong, change both to 22291

---

### Issue: "Parcels don't appear after refresh in SurveyPro"

**Checks:**
1. In QGIS: Did you **Save Layer Edits** (disk icon)?
2. In database, run:
   ```sql
   SELECT COUNT(*) FROM land_parcels WHERE project_id = 64;
   ```
   Should return number > 0
3. Check QGIS Log Messages (View → Panels → Log Messages) for errors

---

## ✨ Best Practices

### Before You Start

✅ **Verify CSV data:** Check coordinates are in correct format (Cape Lo 31)  
✅ **Create project first:** Don't skip project selection  
✅ **Review imported points:** Catch errors early  
✅ **Save documents:** Generate Field Book & Coordinate List before QGIS

### During Digitizing

✅ **Work systematically:** Digitize parcels in order  
✅ **Zoom in close:** Easier to see snap indicators  
✅ **Verify snapping:** Make sure magnet cursor appears before clicking  
✅ **Check point names:** Use Identify tool to confirm correct points  
✅ **Save frequently:** Click "Save Layer Edits" every few parcels  
✅ **Don't skip corners:** Include all boundary points

### Quality Control

✅ **Review closure errors:** Check table in SurveyPro  
✅ **Investigate high errors:** > 0.50m may indicate digitizing mistakes  
✅ **Visual inspection:** In QGIS, do parcels look correct?  
✅ **Check for gaps/overlaps:** Use QGIS topology tools  
✅ **Compare to sketch:** Match with field sketch/plan

### After Completion

✅ **Generate all reports:** Don't leave gaps in documentation  
✅ **Save to project folder:** Keep organized  
✅ **Backup database:** PostgreSQL backup recommended  
✅ **Export to PDF/DWG:** For clients and DSG submission

---

## 📞 Need Help?

### Quick Checks

1. **Database running?** Check PostgreSQL service
2. **SurveyPro backend running?** Check `npm run dev` in backend folder
3. **QGIS connected?** Test connection in PostGIS dialog
4. **Check logs:**
   - QGIS: View → Panels → Log Messages
   - SurveyPro: Browser console (F12)
   - Backend: Terminal running `npm run dev`

### Common Error Messages

**"Connection refused"**
→ Database not running or wrong host/port

**"Authentication failed"**
→ Wrong username/password

**"Table does not exist"**
→ Run migrations: `npm run migrate`

**"Geometry type mismatch"**
→ Check you're digitizing polygons, not lines/points

---

## 🎓 Summary Checklist

### SurveyPro Steps
- [ ] Import CSV coordinates
- [ ] Generate Field Book
- [ ] Generate Calculations Part 1
- [ ] Generate Coordinate List
- [ ] Export to PostGIS database
- [ ] Get QGIS connection info

### QGIS Steps
- [ ] Connect to SurveyPro database
- [ ] Add coordinate_points layer with filter
- [ ] Configure point labels
- [ ] Add land_parcels layer with primary key
- [ ] Set project_id default value
- [ ] Enable snapping (0.01m tolerance)
- [ ] Toggle editing mode
- [ ] Digitize parcels (snap to points)
- [ ] Enter stand designations
- [ ] Save layer edits

### Back to SurveyPro
- [ ] Refresh parcels
- [ ] Review computed areas
- [ ] Check closure errors
- [ ] Export CSV/PDF reports
- [ ] Continue to Report on Survey
- [ ] Generate final documents

---

## 🎯 Success Criteria

You've successfully completed area computation when:

✅ All parcels digitized without errors  
✅ All parcels have `project_id = 64` (not NULL)  
✅ Closure errors < 0.50m (preferably < 0.05m)  
✅ Stand designations correctly entered  
✅ Areas computed and displayed in SurveyPro  
✅ PDF report generated  
✅ Documents saved to project folder  

**Congratulations! Your cadastral area computation is complete!** 🎉

---

*Document Version: 1.0*  
*Last Updated: December 2025*  
*For SurveyPro Cadastral Standard Module*
