# QGIS Digitizing - Quick Start Guide

## 🎯 5-Minute Setup

### 1️⃣ Connect QGIS to Database (One-Time)

**Layer → Add Layer → Add PostGIS Layers**
- Click **"New"**
- Name: `SurveyPro Database`
- Host: `localhost`, Port: `5432`
- Database: `surveypro_v1`
- Username: `postgres`
- Password: (your database password)
- Test Connection → OK

### 2️⃣ Add Coordinate Points

- Connect to `SurveyPro Database`
- Expand **"public"** schema
- Select `coordinate_points`
- Add filter: `"project_id" = [YOUR_PROJECT_ID]`
- Click **"Add"**

**Enable Labels:**
- Right-click layer → Properties → Labels
- Select **"Single Labels"**
- Value: `name`
- Bold font, white buffer → OK

### 3️⃣ Add Land Parcels Layer

- Same database connection
- Select `land_parcels`
- **⚠️ IMPORTANT:** Before clicking "Add":
  - Find **"Feature id"** dropdown (bottom)
  - Select: **`id`**
- Click **"Add"**

**Apply Filter:**
- Right-click layer → Filter
- Enter: `"project_id" = [YOUR_PROJECT_ID]`
- OK

**Set Default project_id:**
- Right-click → Properties → Attributes Form
- Find `project_id` field
- Default value: `[YOUR_PROJECT_ID]`
- ☑ Apply default value on update
- Widget Type: Hidden
- Find `id` field → Widget Type: Hidden
- OK

### 4️⃣ Enable Snapping

**Press `S` or Settings → Snapping Options**
- ☑ Enable snapping
- `coordinate_points`: Type=Vertex, Tolerance=0.01m
- `land_parcels`: Type=Vertex+Segment
- ☑ Topological editing

### 5️⃣ Digitize Parcels

1. Select `land_parcels` layer
2. Click **Toggle Editing** (pencil icon)
3. Click **Add Polygon Feature** (polygon icon)
4. Click each corner point (wait for snap magnet cursor)
5. Right-click first point to close polygon
6. Enter **stand** number (e.g., "2474")
7. Click **OK**
8. Click **Save Layer Edits** (disk icon)

**✅ Done!** Return to SurveyPro and click "Refresh Parcels"

---

## ⚡ Quick Tips

- **Zoom in close** for accurate snapping
- **Check magnet cursor** before clicking
- **Save frequently** (disk icon)
- **project_id should auto-fill** (if not, check default value)
- **id should be hidden/auto** (don't enter manually)

## 🔧 Quick Fixes

**"Can't save features"**  
→ Remove layer, re-add, select `id` as Feature id

**"Parcels disappeared"**  
→ Check filter: `"project_id" = X`, verify default value set

**"Points don't snap"**  
→ Press `S`, enable snapping, tolerance 0.01m

**"project_id is NULL"**  
→ Properties → Attributes Form → project_id → Default value: X

---

📘 **Full Guide:** See `CADASTRAL_AREA_COMPUTATION_GUIDE.md`
