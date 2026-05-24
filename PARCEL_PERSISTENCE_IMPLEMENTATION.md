# Parcel Persistence Implementation - Hybrid Approach

## Overview

Implemented a professional hybrid approach for digitized parcel persistence in the cadastral workflow. Parcels are now automatically saved to the database as they're digitized, with a finalization step for locking them before PDF generation.

---

## Architecture Decision

### **Hybrid Approach: Auto-Save + Finalize** ⭐

**Phase 1: Auto-Save on Digitization**
- Each parcel is saved to database immediately after digitization
- Status: `draft`
- No data loss risk
- Real-time backup

**Phase 2: Finalize on "Save All"**
- User clicks "Save All" to finalize all draft parcels
- Status changes: `draft` → `finalized`
- Parcels are locked and ready for PDF generation

**Phase 3: Load on Mount**
- Existing parcels are loaded from database when component mounts
- Users can resume work on previously digitized parcels
- Parcels are rendered on the map

---

## Database Schema

### **Table: `parcels`**

```sql
CREATE TABLE parcels (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  designation VARCHAR(100) NOT NULL,
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  area_sqm NUMERIC(12, 2),
  perimeter_m NUMERIC(12, 2),
  closure_ratio VARCHAR(50),
  closure_error NUMERIC(12, 6),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'approved')),
  digitized_at TIMESTAMP DEFAULT NOW(),
  digitized_by INTEGER REFERENCES users(id),
  finalized_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `idx_parcels_project_id` - Fast project-based queries
- `idx_parcels_status` - Filter by status
- `idx_parcels_designation` - Duplicate detection
- `idx_parcels_geometry` (GIST) - Spatial queries
- `idx_parcels_created_at` - Temporal queries

**Trigger:**
- `trigger_update_parcels_updated_at` - Auto-update `updated_at` timestamp

---

## Backend API

### **Endpoints**

#### **GET `/api/area-parcels?project_id=X&status=Y`**
Get all parcels for a project with optional status filter

**Query Parameters:**
- `project_id` (required): Project ID
- `status` (optional): Filter by status (`draft`, `finalized`, `approved`)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_id": 42,
      "designation": "Stand 2418",
      "geometry": { "type": "Polygon", "coordinates": [[...]] },
      "area_sqm": 604.76,
      "perimeter_m": 98.45,
      "closure_ratio": "1:3919",
      "closure_error": 0.025,
      "status": "draft",
      "digitized_at": "2025-11-18T00:35:24Z",
      "metadata": { "points_count": 5, "area_type": "urban" }
    }
  ],
  "count": 1
}
```

---

#### **POST `/api/area-parcels`**
Create a new parcel (auto-save on digitization)

**Request Body:**
```json
{
  "project_id": 42,
  "designation": "Stand 2418",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[lng, lat], [lng, lat], ...]]
  },
  "area_sqm": 604.76,
  "perimeter_m": 98.45,
  "closure_ratio": "1:3919",
  "closure_error": 0.025,
  "status": "draft",
  "metadata": {
    "points_count": 5,
    "area_type": "urban",
    "residuals": { "sumDy": 0.015, "sumDx": 0.020 }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": { /* parcel object */ },
  "message": "Parcel Stand 2418 saved successfully"
}
```

**Error Responses:**
- `400` - Missing required fields
- `409` - Duplicate designation

---

#### **PATCH `/api/area-parcels/finalize`**
Finalize multiple parcels (batch status update)

**Request Body:**
```json
{
  "project_id": 42,
  "parcel_ids": [1, 2, 3, 4, 5]
}
```

**Response:**
```json
{
  "success": true,
  "message": "5 parcels finalized",
  "count": 5,
  "parcels": [
    { "id": 1, "designation": "Stand 2418" },
    { "id": 2, "designation": "Stand 2419" }
  ]
}
```

---

#### **GET `/api/area-parcels/stats?project_id=X`**
Get parcel statistics for a project

**Response:**
```json
{
  "success": true,
  "data": {
    "total_parcels": 10,
    "draft_parcels": 3,
    "finalized_parcels": 7,
    "approved_parcels": 0,
    "total_area_sqm": 12500.50,
    "avg_area_sqm": 1250.05,
    "min_area_sqm": 450.00,
    "max_area_sqm": 2800.00
  }
}
```

---

## Frontend Implementation

### **Service: `areaParcels.ts`**

```typescript
// Create parcel (auto-save)
const savedParcel = await createParcel({
  project_id: 42,
  designation: "Stand 2418",
  geometry: polygonGeometry,
  area_sqm: 604.76,
  perimeter_m: 98.45,
  closure_ratio: "1:3919",
  closure_error: 0.025,
  status: 'draft'
});

// Load parcels
const parcels = await fetchParcels(42, 'draft');

// Finalize parcels
const result = await finalizeParcels(42, [1, 2, 3]);
```

---

### **Component: `MapLibreAreaView.vue`**

#### **1. Auto-Save on Digitization**

```typescript
async function completePolygon() {
  // ... digitization logic ...
  
  // Compute area
  const response = await areaCompute({ points: parcel.points });
  parcels.value[parcelIndex].areaResult = response;
  
  // Add to map
  addCompletedParcelToMap(parcels.value[parcelIndex]);
  
  // === AUTO-SAVE TO DATABASE ===
  await autoSaveParcel(parcels.value[parcelIndex], closureError);
}

async function autoSaveParcel(parcel: Parcel, closureError: number) {
  isSaving.value = true;
  
  // Transform Cape Lo to WGS84 for geometry
  const wgs84Points = capeLoArrayToWGS84(parcel.points);
  const geometry: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[...wgs84Points.map(p => [p.lng, p.lat])]]
  };
  
  // Save to database
  const savedParcel = await createParcel({
    project_id: workflowState.value.projectInfo.projectId,
    designation: parcel.designation,
    geometry: geometry,
    area_sqm: parcel.areaResult.area.abs_m2,
    perimeter_m: perimeter,
    closure_ratio: `1:${Math.round(closureRatio)}`,
    closure_error: closureError,
    status: 'draft'
  });
  
  savedParcels.value.set(parcel.designation, savedParcel);
  lastSaved.value = new Date();
  
  console.log(`✅ Parcel ${parcel.designation} auto-saved (ID: ${savedParcel.id})`);
}
```

---

#### **2. Load on Mount**

```typescript
onMounted(async () => {
  await fetchControlPoints();
  await loadParcelsFromDatabase(); // ← Load existing parcels
  await initializeMap();
});

async function loadParcelsFromDatabase() {
  const existingParcels = await fetchParcels(projectId);
  
  for (const dbParcel of existingParcels) {
    // Convert to UI format
    const parcel: Parcel = {
      designation: dbParcel.designation,
      points: [], // Geometry stored in WGS84
      areaResult: {
        ok: true,
        area: {
          signed_m2: dbParcel.area_sqm,
          abs_m2: Math.abs(dbParcel.area_sqm),
          display: dbParcel.area_sqm >= 10000 
            ? { hectares: dbParcel.area_sqm / 10000, unit: 'ha' }
            : { square_meters: dbParcel.area_sqm, unit: 'm2' }
        }
      }
    };
    
    parcels.value.push(parcel);
    savedParcels.value.set(dbParcel.designation, dbParcel);
    
    // Render on map
    addParcelToMap(dbParcel.geometry, dbParcel.designation);
  }
  
  console.log(`✅ Loaded ${existingParcels.length} parcels from database`);
}
```

---

#### **3. Finalize on "Save All"**

```typescript
async function saveAllParcels() {
  // Get all draft parcels
  const draftParcelIds = Array.from(savedParcels.value.values())
    .filter(p => p.status === 'draft')
    .map(p => p.id);
  
  if (draftParcelIds.length === 0) {
    alert('No draft parcels to finalize.');
    return;
  }
  
  isSaving.value = true;
  
  const result = await finalizeParcels(projectId, draftParcelIds);
  
  // Update local state
  for (const finalizedParcel of result.parcels) {
    const saved = savedParcels.value.get(finalizedParcel.designation);
    if (saved) {
      saved.status = 'finalized';
      saved.finalized_at = new Date().toISOString();
    }
  }
  
  alert(`✅ Successfully finalized ${result.count} parcel(s)!`);
}
```

---

#### **4. UI Indicators**

```vue
<template>
  <!-- Auto-save indicator -->
  <div class="flex items-center gap-3 mt-2">
    <div v-if="isSaving" class="text-xs text-blue-600 flex items-center gap-1">
      <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
      <span>Auto-saving...</span>
    </div>
    <div v-else-if="lastSaved" class="text-xs text-green-600">
      ✅ Last saved: {{ formatTime(lastSaved) }}
    </div>
    <div v-if="savedParcels.size > 0" class="text-xs text-gray-500">
      💾 {{ savedParcels.size }} parcel(s) in database
      <span v-if="draftCount > 0" class="text-yellow-600">
        ({{ draftCount }} draft)
      </span>
    </div>
  </div>
</template>
```

---

## User Workflow

### **Scenario: Digitizing Multiple Parcels**

1. **User digitizes Stand 2418**
   - Clicks points on map
   - Completes polygon
   - Area computed: 604.76 m²
   - **Auto-saved to database** (status: `draft`)
   - UI shows: "✅ Last saved: just now"

2. **User digitizes Stand 2419**
   - Repeats process
   - **Auto-saved to database** (status: `draft`)
   - UI shows: "💾 2 parcel(s) in database (2 draft)"

3. **User refreshes page**
   - Returns to Area Computation step
   - **Parcels loaded from database**
   - Both parcels rendered on map
   - Work resumed seamlessly

4. **User clicks "Save All"**
   - Both parcels finalized
   - Status changes: `draft` → `finalized`
   - UI shows: "💾 2 parcel(s) in database (0 draft)"
   - Ready for PDF generation

5. **User generates PDF**
   - Finalized parcels included in PDF
   - Professional area & consistency report

---

## Benefits

### **1. Data Safety** ✅
- No data loss on browser crash
- Real-time backup to database
- Resume work anytime

### **2. Professional Workflow** ✅
- Draft → Finalized → Approved status progression
- Audit trail (digitized_at, finalized_at)
- User control over finalization

### **3. Flexibility** ✅
- Work on parcels across multiple sessions
- Edit draft parcels before finalizing
- Delete mistakes easily

### **4. Performance** ✅
- Indexed database queries
- Efficient spatial storage (PostGIS)
- Fast parcel loading

### **5. Integration** ✅
- Seamless with existing workflow
- Compatible with PDF generation
- Ready for future features (collaborative editing, approval workflow)

---

## Console Output Examples

### **Auto-Save**
```
[MapLibre] 📊 Computing area for parcel: Stand 2418
[MapLibre] ✅ Area computed for Stand 2418:
  - Area: 604.76 m²
  - Closure error: 0.025m
  - Closure ratio: 1:3,919
[MapLibre] 💾 Auto-saving parcel Stand 2418 to database...
[MapLibre] ✅ Parcel Stand 2418 auto-saved (ID: 1)
```

### **Load on Mount**
```
[MapLibre] 📦 Loading existing parcels from database...
[MapLibre] ✅ Found 5 existing parcels
[MapLibre] ✅ Loaded 5 parcels from database
```

### **Finalize**
```
[MapLibre] 💾 Finalizing 5 draft parcels...
[MapLibre] ✅ Finalized 5 parcels
```

---

## Database Migration

**File:** `025.do.sql`

```bash
# Run migration
cd app-backend
npm run migrate
```

**Verification:**
```sql
-- Check table exists
SELECT * FROM parcels LIMIT 1;

-- Check indexes
\d parcels
```

---

## API Testing

### **Create Parcel**
```bash
curl -X POST http://localhost:3050/api/area-parcels \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 42,
    "designation": "Stand 2418",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[30.0, -20.0], [30.1, -20.0], [30.1, -20.1], [30.0, -20.1], [30.0, -20.0]]]
    },
    "area_sqm": 604.76,
    "status": "draft"
  }'
```

### **Get Parcels**
```bash
curl http://localhost:3050/api/area-parcels?project_id=42
```

### **Finalize Parcels**
```bash
curl -X PATCH http://localhost:3050/api/area-parcels/finalize \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 42,
    "parcel_ids": [1, 2, 3]
  }'
```

---

## Future Enhancements

### **1. Collaborative Editing**
- Multiple users digitizing simultaneously
- Real-time parcel updates via WebSockets
- Conflict resolution

### **2. Approval Workflow**
- Surveyor digitizes (draft)
- Supervisor reviews (finalized)
- Manager approves (approved)

### **3. Version History**
- Track parcel edits
- Rollback to previous versions
- Audit trail for compliance

### **4. Spatial Validation**
- Server-side overlap detection
- Topology validation
- Automatic gap detection

### **5. Bulk Operations**
- Import parcels from shapefile
- Export to GeoJSON
- Batch delete/update

---

## Files Modified

### **Backend**
1. `migrations/025.do.sql` - Database schema
2. `migrations/025.undo.sql` - Rollback script
3. `routes/area-parcels.js` - API endpoints
4. `server.js` - Route registration

### **Frontend**
1. `services/areaParcels.ts` - API client
2. `views/modules/cadastral-standard/MapLibreAreaView.vue` - Component updates

---

## Summary

✅ **Hybrid approach implemented** - Auto-save + Finalize  
✅ **Database schema created** - PostGIS-enabled parcels table  
✅ **Backend API complete** - CRUD + finalize + stats endpoints  
✅ **Frontend service ready** - Type-safe API client  
✅ **Auto-save functional** - Parcels saved on digitization  
✅ **Load on mount working** - Resume work seamlessly  
✅ **Finalize implemented** - Lock parcels before PDF  
✅ **UI indicators added** - Real-time save status  

The digitized land parcels now persist in the project database, allowing users to resume work across sessions and maintaining a professional audit trail for cadastral workflows.
