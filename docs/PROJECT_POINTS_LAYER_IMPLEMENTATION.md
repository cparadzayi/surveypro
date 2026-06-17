# Project Points Layer - Automatic Database Storage

## Overview
When generating a Coordinate List in the Cadastral Standard workflow, the system now automatically creates a spatial points layer in the database, making all survey points available across the entire application.

---

## Implementation

### **1. Service: `projectPoints.ts`**

**Location**: `app-frontend/src/services/projectPoints.ts`

**Key Function**: `createProjectPointsLayer()`

```typescript
export async function createProjectPointsLayer(
  surveyProject: SurveyProject,
  adjustedCoordinates: AdjustedCoordinate[]
): Promise<ProjectPointsLayerResult>
```

**What it does**:
1. Creates a spatial project (or reuses existing)
2. Creates a points layer with proper SRID based on central meridian
3. Imports all adjusted coordinates as GeoJSON features
4. Preserves all coordinate list attributes in feature properties

---

### **2. Integration: Coordinate List Generation**

**Location**: `CadastralStandardView.vue` → `generateCoordinateList()`

**Flow**:
```
1. Generate Coordinate List PDF
   ↓
2. Display PDF in new window
   ↓
3. Create spatial project
   ↓
4. Create points layer (with SRID)
   ↓
5. Import all points as features
   ↓
6. Show success notification
```

**Code**:
```typescript
// After PDF generation
const { createProjectPointsLayer } = await import('../../../services/projectPoints')

const layerResult = await createProjectPointsLayer(
  selectedProject.value,
  adjustedCoordinates
)

console.log(`✅ Points layer created!`)
console.log(`   - Layer ID: ${layerResult.layer.id}`)
console.log(`   - Features: ${layerResult.featuresCreated}`)
```

---

## Database Schema

### **Spatial Project**
```sql
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  description TEXT,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP
);
```

**Example**:
```json
{
  "id": 12,
  "name": "Elon Estates Gwelo - Survey Points",
  "code": "EEG-2025",
  "description": "Coordinate points from Elon Estates Gwelo\nClient: Elon Musk\nDistrict: Gwelo"
}
```

---

### **Points Layer**
```sql
CREATE TABLE layers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  layer_type VARCHAR(50),           -- 'survey_points'
  geom_type VARCHAR(50),             -- 'Point'
  srid INTEGER DEFAULT 4326,         -- EPSG code (22289 for Cape/Lo29)
  project_id INTEGER NOT NULL,
  params JSONB,                      -- Additional metadata
  created_at TIMESTAMP
);
```

**Example**:
```json
{
  "id": 45,
  "name": "Elon Estates Gwelo - Coordinate List Points",
  "layer_type": "survey_points",
  "geom_type": "Point",
  "srid": 22289,
  "project_id": 12,
  "params": {
    "survey_project_id": 5,
    "survey_date": "2025-10-27",
    "surveyor_id": 3,
    "central_meridian": "Lo29",
    "source": "coordinate_list"
  }
}
```

---

### **Point Features**
```sql
CREATE TABLE features (
  id SERIAL PRIMARY KEY,
  geometry JSONB,                    -- GeoJSON Point
  properties JSONB,                  -- All attributes
  layer_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  bbox NUMERIC[],
  created_at TIMESTAMP
);
```

**Example Feature**:
```json
{
  "id": 1234,
  "layer_id": 45,
  "project_id": 12,
  "geometry": {
    "type": "Point",
    "coordinates": [96751.29, -2247626.76]
  },
  "properties": {
    "name": "2342C",
    "beacon": "2342C",
    "point_name": "2342C",
    "status": "P",
    "fp_indicator": "P",
    "description": "Corner peg",
    "monument_type": "Corner peg",
    "survey_date": "2025-10-27",
    "date_of_survey": "2025-10-27",
    "field_book_page": "E1",
    "calculations_page": 115,
    "fb_reference": "E1",
    "calcs_reference": "115",
    "y_coordinate": "96751.29",
    "x_coordinate": "-2247626.76",
    "northing": "96751.29",
    "easting": "-2247626.76",
    "is_duplicate": false,
    "observation_count": 1,
    "adjustment_method": "single",
    "within_tolerance": true,
    "max_residual_y": null,
    "max_residual_x": null,
    "source": "coordinate_list",
    "source_document": "Coordinate List (Cadastral Standard Workflow)",
    "created_at": "2025-10-30T21:30:00Z"
  },
  "bbox": [96751.29, -2247626.76, 96751.29, -2247626.76]
}
```

---

## Feature Properties Schema

### **Primary Identifiers**
| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Point identifier (e.g., "2342C") |
| `beacon` | string | Beacon identifier |
| `point_name` | string | Point name |

### **Status & Classification**
| Property | Type | Description |
|----------|------|-------------|
| `status` | string | Point status (F=Fixed, P=Peg, etc.) |
| `fp_indicator` | string | F/P indicator |

### **Description**
| Property | Type | Description |
|----------|------|-------------|
| `description` | string | Monument description |
| `monument_type` | string | Type of monument |

### **Survey Metadata**
| Property | Type | Description |
|----------|------|-------------|
| `survey_date` | string | Survey date (ISO format) |
| `date_of_survey` | string | Date of survey |

### **Document References**
| Property | Type | Description |
|----------|------|-------------|
| `field_book_page` | string | Field Book page (e.g., "E1") |
| `calculations_page` | number | Calculations Part 1 page |
| `fb_reference` | string | Field Book reference |
| `calcs_reference` | string | Calculations reference |

### **Coordinate Values**
| Property | Type | Description |
|----------|------|-------------|
| `y_coordinate` | string | Y coordinate (2 decimals) |
| `x_coordinate` | string | X coordinate (2 decimals) |
| `northing` | string | Northing value |
| `easting` | string | Easting value |

### **Adjustment Metadata**
| Property | Type | Description |
|----------|------|-------------|
| `is_duplicate` | boolean | Was adjusted from duplicates |
| `observation_count` | number | Number of observations |
| `adjustment_method` | string | mean\|gps\|single\|computed |
| `within_tolerance` | boolean | Within survey tolerance |
| `max_residual_y` | string | Max Y residual (meters) |
| `max_residual_x` | string | Max X residual (meters) |

### **Source Information**
| Property | Type | Description |
|----------|------|-------------|
| `source` | string | Data source ("coordinate_list") |
| `source_document` | string | Source document name |
| `created_at` | string | Import timestamp (ISO) |

---

## SRID Mapping

The system automatically determines the correct SRID based on the project's central meridian:

**Datum**: Cape (Clarke 1880 Modified ellipsoid)  
**Projection**: Gauss Conform (Transverse Mercator)

| Central Meridian | EPSG Code | Full Name | Coverage |
|------------------|-----------|-----------|----------|
| Lo25 | 22285 | Cape / Lo25 | Western Zimbabwe |
| Lo27 | 22287 | Cape / Lo27 | |
| Lo29 | 22289 | Cape / Lo29 | Central (Harare, Bulawayo) |
| Lo31 | 22291 | Cape / Lo31 | Eastern Zimbabwe |
| Lo33 | 22293 | Cape / Lo33 | Far Eastern |

**Default**: Lo29 (EPSG:22289) if not specified

**Technical Details**:
- **Ellipsoid**: Clarke 1880 (modified for southern Africa)
- **Projection**: Transverse Mercator (Gauss-Schreiber)
- **False Easting**: 0 meters
- **False Northing**: 0 meters
- **Scale Factor**: 1.0 at central meridian
- **Units**: Meters
- **Coordinate Order**: Y (Northing/Westing), X (Easting/Southing)

---

## Usage Across Application

### **1. Areas2View - Point Selection**

The points layer is immediately available in the layer selector:

```vue
<LayerSelect v-model="layerId" />
```

Users can:
- Select the project's points layer
- Search for points by name/beacon
- Click to add points to area calculations
- View all coordinate list attributes

### **2. Map Visualization**

Points can be displayed on maps with:
- Correct SRID transformation
- WGS84 basemap overlay
- Labeled markers
- Attribute popups

### **3. Spatial Queries**

Points can be queried via API:

```http
GET /spatial/layers/:layerId/search?q=2342
GET /spatial/layers/:layerId/features?search=corner
GET /spatial/layers/:layerId/geojson
```

### **4. Future Enhancements**

- **Parcel Digitization**: Use points to create parcel boundaries
- **Quality Control**: Validate point spacing and closure
- **Export**: Generate shapefiles, KML, GeoJSON
- **Analysis**: Compute areas, distances, bearings
- **Integration**: Link to external GIS systems

---

## User Experience

### **Before**
1. Generate Coordinate List PDF
2. Manually re-enter points in other modules
3. No spatial database
4. No cross-module integration

### **After**
1. Generate Coordinate List PDF
2. **Points automatically saved to database**
3. **Immediately available in all modules**
4. **Full attribute preservation**
5. **Proper coordinate system (SRID)**

---

## Success Notification

After generating Coordinate List, users see:

```
✅ Coordinate List Generated!

📄 PDF: 12 pages, 156 points
📍 Points Layer: 156 features imported
🗺️ Layer ID: 45 (SRID 20139)

The points layer is now available in Areas v2 and other modules.
```

---

## Error Handling

### **Scenario 1: PDF Success, Layer Failure**

```
⚠️ Coordinate List PDF generated successfully!

However, the points layer could not be created:
[Error message]

You can still use the PDF, but the points won't be available in other modules.
```

**Result**: PDF is still usable, user can retry layer creation later

### **Scenario 2: Partial Import**

```
✅ Points layer created successfully!
   - Features: 150/156 imported

⚠️ 6 errors occurred during import
```

**Result**: Most points imported, errors logged to console

---

## Testing

### **Test 1: Full Workflow**
1. Navigate to Cadastral Standard
2. Select project "Elon Estates Gwelo"
3. Complete Calculations Part 1
4. Click "Generate Coordinate List"
5. **Expected**: PDF opens + Success alert with layer info
6. Navigate to Areas v2
7. Select points layer from dropdown
8. **Expected**: All 156 points available for search

### **Test 2: Point Attributes**
1. After generating Coordinate List
2. Navigate to Areas v2
3. Search for point "2342C"
4. **Expected**: Point found with all attributes:
   - Name, status, description
   - Field Book page, Calculations page
   - Y/X coordinates
   - Adjustment metadata

### **Test 3: SRID Verification**
1. Generate Coordinate List for Lo29 project
2. Check layer SRID
3. **Expected**: SRID = 20139
4. Enable WGS84 basemap in map
5. **Expected**: Points display correctly on basemap

### **Test 4: Multiple Projects**
1. Generate Coordinate List for Project A
2. Generate Coordinate List for Project B
3. Navigate to Areas v2
4. **Expected**: Two separate layers available
5. Select Project A layer
6. **Expected**: Only Project A points shown

---

## Database Queries

### **Find all survey points layers**
```sql
SELECT * FROM layers 
WHERE layer_type = 'survey_points'
ORDER BY created_at DESC;
```

### **Get points for a specific project**
```sql
SELECT f.* 
FROM features f
JOIN layers l ON f.layer_id = l.id
WHERE l.layer_type = 'survey_points'
  AND l.params->>'survey_project_id' = '5';
```

### **Search points by name**
```sql
SELECT * FROM features
WHERE layer_id = 45
  AND (properties->>'name') ILIKE '%2342%';
```

### **Get points with duplicates**
```sql
SELECT * FROM features
WHERE layer_id = 45
  AND (properties->>'is_duplicate')::boolean = true;
```

---

## Benefits

✅ **Automatic**: No manual data entry  
✅ **Complete**: All attributes preserved  
✅ **Accurate**: Proper SRID and coordinates  
✅ **Integrated**: Available across all modules  
✅ **Searchable**: Full-text search on all fields  
✅ **Traceable**: Links to source documents  
✅ **Extensible**: Ready for GIS analysis  

---

## Files Modified

1. **`app-frontend/src/services/projectPoints.ts`** (NEW)
   - Service for creating project points layers
   - Feature property mapping
   - SRID determination

2. **`app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`**
   - Added project validation
   - Integrated layer creation after PDF generation
   - Success/error notifications

3. **`app-frontend/src/stores/projectContext.ts`** (EXISTING)
   - Shared project context for cross-module access

---

## Related Documentation

- **Layer Structure**: `LAYER_STRUCTURE_DOCUMENTATION.md`
- **Project Context**: `PROJECT_CONTEXT_INTEGRATION.md`
- **Areas2View**: `AREAS2VIEW_TECHNICAL_BREAKDOWN.md`
- **Adjusted Coordinates**: `app-frontend/src/types/adjusted-coordinates.ts`

---

## Summary

When generating a Coordinate List, the system now:
1. ✅ Creates a spatial project
2. ✅ Creates a points layer with correct SRID
3. ✅ Imports all adjusted coordinates as features
4. ✅ Preserves all 25+ attributes per point
5. ✅ Makes points available in Areas2View and other modules
6. ✅ Provides clear success/error feedback

This creates a **single source of truth** for survey points across the entire application! 🎯
