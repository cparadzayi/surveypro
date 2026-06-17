# 🔄 Complete QGIS Workflow - End to End

## 🎯 Objective
Establish a seamless workflow from project selection → coordinate points → QGIS digitization → land parcels with proper project_id linking.

---

## 📊 Current State Analysis

### ✅ What's Working
1. **Project Selection** - User selects project (e.g., project_id = 26)
2. **Coordinate Points Loading** - 542 points auto-load from `coordinate_points` table
3. **Database Schema** - Normalized tables with PostGIS geometry

### ❌ What's Missing
1. **No project_id in QGIS layer** - When digitizing, QGIS doesn't know which project
2. **Manual project_id entry** - User must manually set project_id for each polygon
3. **No validation** - Parcels can be saved with wrong or NULL project_id
4. **No filtered view** - QGIS shows ALL coordinate points, not just for selected project

---

## 🔧 Recommended Solution: Project-Scoped Views

### Strategy
Create PostgreSQL **VIEWS** that automatically filter by project and set project_id.

### Implementation

#### 1. Create Project-Specific Views (One per Project)

```sql
-- View for Avondale project (project_id = 26)
CREATE OR REPLACE VIEW coordinate_points_project_26 AS
SELECT 
    id,
    26 as project_id,  -- Fixed project_id
    name,
    geom,
    elevation,
    description,
    survey_date,
    surveyor,
    created_at,
    updated_at
FROM coordinate_points
WHERE project_id = 26;

-- Editable view for land parcels (project_id = 26)
CREATE OR REPLACE VIEW land_parcels_project_26 AS
SELECT 
    id,
    26 as project_id,  -- Fixed project_id
    stand,
    geom,
    owner,
    title_deed,
    survey_date,
    surveyor,
    notes,
    area_m2,
    area_ha,
    perimeter_m,
    created_at,
    updated_at
FROM land_parcels
WHERE project_id = 26;

-- Make the land_parcels view writable
CREATE OR REPLACE RULE land_parcels_project_26_insert AS
ON INSERT TO land_parcels_project_26
DO INSTEAD
INSERT INTO land_parcels (project_id, stand, geom, owner, title_deed, survey_date, surveyor, notes)
VALUES (26, NEW.stand, NEW.geom, NEW.owner, NEW.title_deed, NEW.survey_date, NEW.surveyor, NEW.notes)
RETURNING *;
```

#### 2. Dynamic View Creation (Better Approach)

Instead of creating views manually, create them dynamically when user selects a project:

```sql
-- Function to create project-specific views
CREATE OR REPLACE FUNCTION create_project_views(p_project_id INTEGER)
RETURNS void AS $$
BEGIN
    -- Drop existing views if they exist
    EXECUTE format('DROP VIEW IF EXISTS coordinate_points_project_%s CASCADE', p_project_id);
    EXECUTE format('DROP VIEW IF EXISTS land_parcels_project_%s CASCADE', p_project_id);
    
    -- Create coordinate points view (read-only)
    EXECUTE format('
        CREATE VIEW coordinate_points_project_%s AS
        SELECT 
            id,
            %s as project_id,
            name,
            geom,
            elevation,
            description,
            survey_date,
            surveyor,
            created_at,
            updated_at
        FROM coordinate_points
        WHERE project_id = %s
    ', p_project_id, p_project_id, p_project_id);
    
    -- Create land parcels view (writable)
    EXECUTE format('
        CREATE VIEW land_parcels_project_%s AS
        SELECT 
            id,
            %s as project_id,
            stand,
            geom,
            owner,
            title_deed,
            survey_date,
            surveyor,
            notes,
            area_m2,
            area_ha,
            perimeter_m,
            created_at,
            updated_at
        FROM land_parcels
        WHERE project_id = %s
    ', p_project_id, p_project_id, p_project_id);
    
    -- Make land_parcels view writable with INSERT rule
    EXECUTE format('
        CREATE OR REPLACE RULE land_parcels_project_%s_insert AS
        ON INSERT TO land_parcels_project_%s
        DO INSTEAD
        INSERT INTO land_parcels (project_id, stand, geom, owner, title_deed, survey_date, surveyor, notes)
        VALUES (%s, NEW.stand, NEW.geom, NEW.owner, NEW.title_deed, NEW.survey_date, NEW.surveyor, NEW.notes)
        RETURNING *
    ', p_project_id, p_project_id, p_project_id);
    
    -- Make land_parcels view writable with UPDATE rule
    EXECUTE format('
        CREATE OR REPLACE RULE land_parcels_project_%s_update AS
        ON UPDATE TO land_parcels_project_%s
        DO INSTEAD
        UPDATE land_parcels
        SET stand = NEW.stand,
            geom = NEW.geom,
            owner = NEW.owner,
            title_deed = NEW.title_deed,
            survey_date = NEW.survey_date,
            surveyor = NEW.surveyor,
            notes = NEW.notes,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.id AND project_id = %s
        RETURNING *
    ', p_project_id, p_project_id, p_project_id);
    
    -- Make land_parcels view writable with DELETE rule
    EXECUTE format('
        CREATE OR REPLACE RULE land_parcels_project_%s_delete AS
        ON DELETE TO land_parcels_project_%s
        DO INSTEAD
        DELETE FROM land_parcels
        WHERE id = OLD.id AND project_id = %s
        RETURNING *
    ', p_project_id, p_project_id, p_project_id);
    
END;
$$ LANGUAGE plpgsql;
```

---

## 🚀 Complete Workflow (Revised)

### Step 1: User Selects Project in SurveyPro
```
User Action: Select "Avondale - Survey Points" (project_id = 26)
Frontend: Calls backend to create project views
Backend: Executes create_project_views(26)
Result: Views created:
  - coordinate_points_project_26 (read-only, 542 points)
  - land_parcels_project_26 (writable, 0 parcels initially)
```

### Step 2: View Coordinate Points
```
Frontend: Auto-loads points from coordinate_points table
Display: Shows 542 points in editable table
User: Can add/edit/delete points
```

### Step 3: Export to Database (Optional)
```
User Action: Click "Export to Database"
Frontend: Calls batchCreateCoordinatePoints API
Backend: Inserts new points with project_id = 26
Result: Points saved to coordinate_points table
```

### Step 4: Open QGIS
```
User Action: Click "QGIS Connection" button
Frontend: Shows connection info with project-specific view names
User: Copies connection URI
```

### Step 5: Connect QGIS to Project-Specific Views
```
QGIS Action: Layer → Add PostGIS Layer
Connection: Use provided URI
Layers to Add:
  ✅ coordinate_points_project_26 (read-only reference)
  ✅ land_parcels_project_26 (writable for digitizing)
CRS: Set to EPSG:22291 (Zimbabwe Lo29)
```

### Step 6: Digitize Polygons in QGIS
```
QGIS Action: Toggle editing on land_parcels_project_26
User: Digitize polygons using coordinate_points as reference
User: Set "stand" attribute (e.g., "Stand 1", "Stand 2")
User: Optionally set owner, title_deed, etc.
QGIS: Auto-sets project_id = 26 (via view)
User: Save edits
Result: Polygons inserted into land_parcels table with project_id = 26
```

### Step 7: Refresh in SurveyPro
```
User Action: Click "Refresh" button
Frontend: Calls listLandParcels(26)
Backend: Queries land_parcels WHERE project_id = 26
Result: Shows newly digitized parcels with auto-calculated areas
```

### Step 8: Compute Areas (Optional)
```
User Action: Click "Compute All Areas"
Frontend: Calls batch area computation API
Backend: Validates vertices match coordinate points
Result: Shows closure errors and quality metrics
```

---

## 🔧 Backend Implementation

### 1. Add View Creation Endpoint

**File:** `app-backend/src/routes/spatial.js`

```javascript
// Create project-specific views for QGIS
app.post('/spatial/create-project-views', {
  preHandler: [app.authenticate],
  schema: {
    body: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'number' }
      }
    }
  }
}, async (request, reply) => {
  const { project_id } = request.body
  
  try {
    await app.pg.query('SELECT create_project_views($1)', [project_id])
    return { 
      ok: true, 
      message: `Views created for project ${project_id}`,
      views: {
        coordinate_points: `coordinate_points_project_${project_id}`,
        land_parcels: `land_parcels_project_${project_id}`
      }
    }
  } catch (err) {
    app.log.error(err)
    return reply.code(500).send({ ok: false, error: err.message })
  }
})
```

### 2. Update DB Connection Info Endpoint

**File:** `app-backend/src/routes/spatial.js`

```javascript
// Get QGIS connection info with project-specific views
app.get('/spatial/db-connection', {
  preHandler: [app.authenticate],
  schema: {
    querystring: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'number' }
      }
    }
  }
}, async (request, reply) => {
  const { project_id } = request.query
  
  const connectionInfo = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'surveypro_v1',
    username: process.env.DB_USER || 'postgres',
    project_id: project_id,
    views: {
      coordinate_points: `coordinate_points_project_${project_id}`,
      land_parcels: `land_parcels_project_${project_id}`
    }
  }
  
  const uri = `postgresql://${connectionInfo.username}@${connectionInfo.host}:${connectionInfo.port}/${connectionInfo.database}`
  
  return {
    ok: true,
    data: {
      ...connectionInfo,
      uri,
      instructions: [
        `1. Open QGIS`,
        `2. Layer → Add PostGIS Layer`,
        `3. Create new connection with URI: ${uri}`,
        `4. Add layers: ${connectionInfo.views.coordinate_points} (reference)`,
        `5. Add layers: ${connectionInfo.views.land_parcels} (digitize here)`,
        `6. Set CRS to EPSG:22291 (Zimbabwe Lo29)`,
        `7. Toggle editing on land_parcels layer`,
        `8. Digitize polygons, set 'stand' attribute`,
        `9. Save edits - project_id will be set automatically!`
      ]
    }
  }
})
```

---

## 🎨 Frontend Implementation

### 1. Auto-Create Views on Project Selection

**File:** `app-frontend/src/views/modules/lite/areas/AreasView.vue`

```typescript
// Project change handler (updated)
async function onProjectChange() {
  console.log('🔄 Project changed:', selectedProjectId.value)
  if (!selectedProjectId.value) return
  
  coordinatePoints.value = []
  landParcels.value = []
  batchResults.value = null
  
  console.log('📡 Creating project views and loading data...')
  
  try {
    // Create project-specific views for QGIS
    await createProjectViews(selectedProjectId.value)
    console.log('✅ Project views created')
  } catch (err) {
    console.warn('⚠️ Failed to create views (may already exist):', err)
  }
  
  // Load data
  await Promise.all([loadCoordinatePoints(), loadParcels()])
  console.log('✅ Loading complete')
}
```

### 2. Add View Creation Service

**File:** `app-frontend/src/services/spatial.ts`

```typescript
// Create project-specific views for QGIS
export async function createProjectViews(projectId: number): Promise<void> {
  const response = await api.post('/spatial/create-project-views', {
    project_id: projectId
  })
  return response.data
}

// Get DB connection info with project views
export async function getDBConnectionInfo(projectId: number): Promise<any> {
  const response = await api.get('/spatial/db-connection', {
    params: { project_id: projectId }
  })
  return response.data.data
}
```

### 3. Update QGIS Modal to Show Project Views

**File:** `app-frontend/src/views/modules/lite/areas/AreasView.vue`

```vue
<!-- QGIS Connection Modal (updated) -->
<div v-if="showQGISModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
    <h3 class="text-xl font-bold mb-4">QGIS Connection Info</h3>
    
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Connection URI</label>
        <div class="flex gap-2">
          <input 
            :value="qgisConnectionInfo?.uri" 
            readonly 
            class="flex-1 px-3 py-2 border rounded-lg bg-gray-50 font-mono text-sm"
          />
          <button 
            @click="copyToClipboard(qgisConnectionInfo?.uri)"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Copy
          </button>
        </div>
      </div>
      
      <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 class="font-semibold text-yellow-800 mb-2">⚠️ Important: Use Project-Specific Views</h4>
        <p class="text-sm text-yellow-700 mb-2">
          Use these view names in QGIS to ensure proper project linking:
        </p>
        <ul class="text-sm text-yellow-700 space-y-1">
          <li><strong>Reference Layer:</strong> <code class="bg-yellow-100 px-2 py-1 rounded">{{ qgisConnectionInfo?.views.coordinate_points }}</code></li>
          <li><strong>Digitize Layer:</strong> <code class="bg-yellow-100 px-2 py-1 rounded">{{ qgisConnectionInfo?.views.land_parcels }}</code></li>
        </ul>
      </div>
      
      <div>
        <h4 class="font-semibold mb-2">Step-by-Step Instructions</h4>
        <ol class="list-decimal list-inside space-y-2 text-sm">
          <li v-for="(instruction, i) in qgisConnectionInfo?.instructions" :key="i">
            {{ instruction }}
          </li>
        </ol>
      </div>
    </div>
    
    <button 
      @click="showQGISModal = false"
      class="mt-6 w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
    >
      Close
    </button>
  </div>
</div>
```

---

## 📋 Implementation Checklist

### Database
- [ ] Create `create_project_views()` function in PostgreSQL
- [ ] Test view creation for project 26
- [ ] Verify INSERT/UPDATE/DELETE rules work

### Backend
- [ ] Add `/spatial/create-project-views` endpoint
- [ ] Update `/spatial/db-connection` to include project_id and view names
- [ ] Test API endpoints

### Frontend
- [ ] Add `createProjectViews()` service function
- [ ] Update `onProjectChange()` to auto-create views
- [ ] Update QGIS modal to show project-specific view names
- [ ] Update `getDBConnectionInfo()` to pass project_id

### Testing
- [ ] Select project → verify views created
- [ ] Open QGIS → connect to project views
- [ ] Digitize polygon → verify project_id = 26
- [ ] Refresh SurveyPro → verify parcels appear
- [ ] Compute areas → verify calculations work

---

## 🎯 Benefits of This Approach

1. **Automatic project_id** - No manual entry needed in QGIS
2. **Filtered data** - Only see relevant coordinate points
3. **Data integrity** - Can't accidentally save to wrong project
4. **Clean workflow** - One-click setup from SurveyPro
5. **Scalable** - Works for any number of projects

---

## 🔄 Alternative: Simpler Approach (If Views Are Too Complex)

If the views approach is too complex, we can use a simpler method:

### Option B: QGIS Form with Default Value

1. In QGIS, configure the `land_parcels` layer form
2. Set `project_id` field to:
   - Widget type: Hidden
   - Default value: 26 (or use expression)
3. User digitizes without seeing project_id field
4. project_id is auto-set on save

This is simpler but requires manual QGIS configuration per project.

---

**Recommendation:** Implement the **Views approach** for a fully automated workflow.
