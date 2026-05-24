# Layer Structure for Area Calculations

## Overview
The spatial data system uses a **3-tier hierarchy**: Projects → Layers → Features

```
Project (e.g., "Elon Estates Gwelo")
  └── Layer (e.g., "Survey Points")
       └── Feature (individual points with geometry + properties)
```

---

## Database Schema

### **1. Projects Table**
```sql
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  description TEXT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Top-level container for survey projects

**Example**:
```json
{
  "id": 1,
  "name": "Elon Estates Gwelo",
  "code": "EEG-2025",
  "description": "Cadastral survey for Elon Estates subdivision",
  "user_id": 1
}
```

---

### **2. Layers Table**
```sql
CREATE TABLE layers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  layer_type VARCHAR(50),           -- e.g., 'points', 'parcels', 'boundaries'
  geom_type VARCHAR(50),             -- 'Point', 'LineString', 'Polygon'
  srid INTEGER DEFAULT 4326,         -- Spatial Reference ID (EPSG code)
  project_id INTEGER NOT NULL REFERENCES projects(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name, project_id)
);
```

**Purpose**: Typed collection of features within a project

**Key Fields**:
- **`name`**: Human-readable layer name (e.g., "Survey Points", "Parcels")
- **`layer_type`**: Optional classification (e.g., 'points', 'parcels')
- **`geom_type`**: GeoJSON geometry type constraint
- **`srid`**: EPSG code for coordinate system
  - `4326` = WGS84 (lat/lon)
  - `22285` = Cape / Lo25 (Clarke 1880 Modified)
  - `22287` = Cape / Lo27 (Clarke 1880 Modified)
  - `22289` = Cape / Lo29 (Clarke 1880 Modified)
  - `22291` = Cape / Lo31 (Clarke 1880 Modified)
  - `22293` = Cape / Lo33 (Clarke 1880 Modified)

**Example**:
```json
{
  "id": 5,
  "name": "Survey Points",
  "layer_type": "points",
  "geom_type": "Point",
  "srid": 22289,
  "project_id": 1
}
```

---

### **3. Features Table**
```sql
CREATE TABLE features (
  id SERIAL PRIMARY KEY,
  geometry JSONB,                    -- GeoJSON geometry object
  properties JSONB,                  -- Arbitrary key-value properties
  layer_id INTEGER NOT NULL REFERENCES layers(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  bbox NUMERIC[],                    -- Bounding box [minx, miny, maxx, maxy]
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Individual spatial features (points, lines, polygons)

**Key Fields**:
- **`geometry`**: GeoJSON geometry object
- **`properties`**: Flexible JSON object for attributes
- **`bbox`**: Auto-computed bounding box for spatial queries

---

## Feature Structure for Area Calculations

### **Point Feature (Survey Point)**

#### **Geometry**
```json
{
  "type": "Point",
  "coordinates": [96751.29, -2247626.76]
}
```

**Coordinate Order**: `[Y, X]` for Zimbabwe P(Y,X) system
- **Y**: Westing (positive westward)
- **X**: Southing (positive southward)

#### **Properties**
```json
{
  "name": "2342C",
  "beacon": "2342C",
  "point_name": "2342C",
  "label": "2342C",
  "code": "2342C",
  "status": "P",
  "description": "Corner beacon",
  "date_of_survey": "2025-10-30"
}
```

**Searchable Fields** (used by Areas2View):
- `name` - Primary identifier
- `beacon` - Alternative identifier
- `label` - Display label
- `code` - Code/reference
- `id` - Feature ID (as text)

**Search Logic**:
```sql
WHERE (properties->>'name') ILIKE '%2342%' 
   OR (properties->>'beacon') ILIKE '%2342%'
   OR (properties->>'label') ILIKE '%2342%'
   OR (properties->>'code') ILIKE '%2342%'
   OR CAST(id AS TEXT) ILIKE '%2342%'
```

#### **Complete Feature Example**
```json
{
  "id": 123,
  "layer_id": 5,
  "project_id": 1,
  "geometry": {
    "type": "Point",
    "coordinates": [96751.29, -2247626.76]
  },
  "properties": {
    "name": "2342C",
    "beacon": "2342C",
    "status": "P",
    "description": "Corner beacon at NE boundary",
    "date_of_survey": "2025-10-27",
    "surveyor": "John Doe",
    "accuracy": "±0.02m"
  },
  "bbox": [96751.29, -2247626.76, 96751.29, -2247626.76],
  "created_at": "2025-10-27T10:30:00Z"
}
```

---

## API Endpoints for Area Calculations

### **1. List Layers**
```http
GET /spatial/projects/:projectId/layers
Authorization: Bearer <token>
```

**Response**:
```json
[
  {
    "id": 5,
    "name": "Survey Points",
    "layer_type": "points",
    "geom_type": "Point",
    "srid": 22289,
    "project_id": 1
  }
]
```

---

### **2. Get Layer Details**
```http
GET /spatial/layers/:layerId
Authorization: Bearer <token>
```

**Response**:
```json
{
  "id": 5,
  "name": "Survey Points",
  "layer_type": "points",
  "geom_type": "Point",
  "srid": 22289,
  "project_id": 1,
  "created_at": "2025-10-27T08:00:00Z"
}
```

---

### **3. Search Points by Name** ⭐
```http
GET /spatial/layers/:layerId/search?q=2342&limit=20
Authorization: Bearer <token>
```

**Query Parameters**:
- `q` (required): Search term (case-insensitive, partial match)
- `limit` (optional): Max results (default: 20)

**Response**:
```json
[
  {
    "id": 123,
    "layer_id": 5,
    "project_id": 1,
    "geometry": {
      "type": "Point",
      "coordinates": [96751.29, -2247626.76]
    },
    "properties": {
      "name": "2342C",
      "beacon": "2342C",
      "status": "P"
    },
    "bbox": [96751.29, -2247626.76, 96751.29, -2247626.76]
  },
  {
    "id": 124,
    "layer_id": 5,
    "project_id": 1,
    "geometry": {
      "type": "Point",
      "coordinates": [96765.67, -2247625.42]
    },
    "properties": {
      "name": "2342D",
      "beacon": "2342D",
      "status": "P"
    },
    "bbox": [96765.67, -2247625.42, 96765.67, -2247625.42]
  }
]
```

---

### **4. List All Features (Paginated)**
```http
GET /spatial/layers/:layerId/features?page=1&limit=50&search=2342
Authorization: Bearer <token>
```

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `search` (optional): Filter by properties

**Response**:
```json
{
  "items": [ /* array of features */ ],
  "total": 150,
  "page": 1,
  "limit": 50
}
```

---

### **5. Get GeoJSON for Map**
```http
GET /spatial/layers/:layerId/geojson?search=2342
Authorization: Bearer <token>
```

**Response**:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": 123,
      "geometry": {
        "type": "Point",
        "coordinates": [96751.29, -2247626.76]
      },
      "properties": {
        "name": "2342C",
        "beacon": "2342C"
      }
    }
  ]
}
```

---

### **6. Create Feature**
```http
POST /spatial/layers/:layerId/features
Authorization: Bearer <token>
Content-Type: application/json

{
  "geometry": {
    "type": "Point",
    "coordinates": [96751.29, -2247626.76]
  },
  "properties": {
    "name": "2342C",
    "beacon": "2342C",
    "status": "P"
  }
}
```

**Response**: Created feature object with `id`

---

### **7. Query by Bounding Box**
```http
POST /spatial/layers/:layerId/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "bbox": [96700, -2247700, 96800, -2247600]
}
```

**Bbox Format**: `[minx, miny, maxx, maxy]`

---

### **8. Transform Coordinates** (PostGIS)
```http
POST /spatial/layers/:layerId/transform
Authorization: Bearer <token>
Content-Type: application/json

{
  "points": [
    { "y": 96751.29, "x": -2247626.76 },
    { "y": 96765.67, "x": -2247625.42 }
  ]
}
```

**Response**:
```json
{
  "ok": true,
  "coords": [
    { "lat": -19.123456, "lon": 29.234567 },
    { "lat": -19.123450, "lon": 29.234580 }
  ]
}
```

---

## How Areas2View Uses Layers

### **Workflow**

1. **User selects layer** from dropdown
   ```typescript
   layerId.value = 5  // "Survey Points" layer
   ```

2. **Component loads layer metadata**
   ```typescript
   const layerInfo = await getLayer(layerId)
   // { id: 5, name: "Survey Points", srid: 20139, ... }
   ```

3. **User types in search box** (e.g., "2342")
   ```typescript
   const suggestions = await searchFeatures(layerId, "2342", 20)
   // Returns features with name/beacon matching "2342"
   ```

4. **User selects point from dropdown**
   ```typescript
   const [y, x] = feature.geometry.coordinates
   points.value.push({ 
     nameText: feature.properties.name,
     yText: String(y),
     xText: String(x)
   })
   ```

5. **After 3+ points, compute area**
   ```typescript
   const result = await areaCompute({
     points: [
       { y: 96751.29, x: -2247626.76 },
       { y: 96765.67, x: -2247625.42 },
       { y: 96764.89, x: -2247635.11 }
     ],
     includeResiduals: true
   })
   ```

6. **Optionally save result back to layer**
   ```typescript
   if (save.value && saveLayerId.value) {
     // Backend saves computed polygon to specified layer
   }
   ```

---

## Property Naming Conventions

### **Recommended Properties for Survey Points**

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `name` | string | Primary identifier (e.g., "2342C") | ✅ Yes |
| `beacon` | string | Beacon/peg identifier | Recommended |
| `status` | string | P=Placed, F=Found, C=Calculated | Recommended |
| `description` | string | Additional notes | Optional |
| `date_of_survey` | string | ISO date (YYYY-MM-DD) | Optional |
| `surveyor` | string | Surveyor name | Optional |
| `accuracy` | string | Measurement accuracy (e.g., "±0.02m") | Optional |
| `elevation` | number | Height above datum (m) | Optional |
| `point_type` | string | Corner, boundary, control, etc. | Optional |

### **Example CSV Import Format**
```csv
Point,Y,X,Status,Description,Date of survey
2342C,96751.29,-2247626.76,P,Corner beacon,2025-10-27
2342D,96765.67,-2247625.42,P,Boundary peg,2025-10-27
2375A,96764.89,-2247635.11,F,Existing beacon,2025-10-27
```

**Mapping**:
- `Point` → `properties.name`
- `Y` → `geometry.coordinates[0]`
- `X` → `geometry.coordinates[1]`
- `Status` → `properties.status`
- `Description` → `properties.description`
- `Date of survey` → `properties.date_of_survey`

---

## SRID Configuration

### **Cape Datum Gauss-Conformal Projections**

**Datum**: Cape (Clarke 1880 Modified ellipsoid)  
**Projection**: Transverse Mercator (Gauss-Schreiber)

| EPSG Code | Full Name | Central Meridian | Coverage |
|-----------|-----------|------------------|----------|
| 22285 | Cape / Lo25 | 25°E | Western Zimbabwe |
| 22287 | Cape / Lo27 | 27°E | |
| 22289 | Cape / Lo29 | 29°E | Central (Harare, Bulawayo) |
| 22291 | Cape / Lo31 | 31°E | Eastern Zimbabwe |
| 22293 | Cape / Lo33 | 33°E | Far Eastern |

**Technical Details**:
- **Ellipsoid**: Clarke 1880 (modified for southern Africa)
- **False Easting**: 0 meters
- **False Northing**: 0 meters
- **Scale Factor**: 1.0 at central meridian
- **Units**: Meters

### **Setting Layer SRID**

**Option 1: During Layer Creation**
```http
POST /spatial/projects/:projectId/layers
{
  "name": "Survey Points",
  "geom_type": "Point",
  "srid": 22289
}
```

**Option 2: Update Existing Layer**
```http
PUT /spatial/layers/:layerId/srid
{
  "srid": 22289,
  "central_meridian": "Lo29"
}
```

**Why SRID Matters**:
- Enables WGS84 basemap preview in DataMap
- Required for coordinate transformation (PostGIS)
- Ensures correct spatial calculations

---

## Performance Considerations

### **Indexing**
Current implementation uses in-memory filtering. For production:

```sql
-- Add GIN index for property searches
CREATE INDEX idx_features_properties_gin ON features USING GIN (properties);

-- Add spatial index (requires PostGIS)
CREATE INDEX idx_features_geom ON features USING GIST (ST_GeomFromGeoJSON(geometry));

-- Add layer_id index
CREATE INDEX idx_features_layer_id ON features(layer_id);
```

### **Search Optimization**
```sql
-- Current: ILIKE with wildcards (slow for large datasets)
WHERE (properties->>'name') ILIKE '%2342%'

-- Better: Full-text search (for large datasets)
CREATE INDEX idx_features_fts ON features USING GIN (
  to_tsvector('simple', 
    COALESCE(properties->>'name', '') || ' ' ||
    COALESCE(properties->>'beacon', '')
  )
);
```

---

## Common Issues & Solutions

### **Issue 1: "No matching points" in search**
**Causes**:
- Layer not selected
- SRID not set (prevents some queries)
- Property names don't match search fields

**Solution**:
```javascript
// Ensure properties include searchable fields
{
  "properties": {
    "name": "2342C",        // ✅ Primary search field
    "beacon": "2342C",      // ✅ Alternative
    "custom_id": "2342C"    // ❌ Not searchable by default
  }
}
```

### **Issue 2: Points not appearing on map**
**Causes**:
- Invalid geometry coordinates
- SRID mismatch
- Coordinates outside viewport

**Solution**:
- Validate coordinates are in correct system (P(Y,X))
- Set layer SRID to match coordinate system
- Check bbox calculation

### **Issue 3: Search returns wrong points**
**Cause**: Case-sensitive or exact match expected

**Solution**: Search uses `ILIKE` (case-insensitive, partial match)
```sql
-- Matches: "2342", "2342C", "ABC2342", "2342-corner"
WHERE (properties->>'name') ILIKE '%2342%'
```

---

## Future Enhancements

1. **PostGIS Integration**: Replace JSONB geometry with native PostGIS geometry
2. **Spatial Indexes**: Add GIST indexes for fast spatial queries
3. **Topology Validation**: Ensure polygon closure, no self-intersections
4. **Attribute Validation**: Schema enforcement for required properties
5. **Versioning**: Track feature history and changes
6. **Bulk Operations**: Import/export large datasets efficiently
7. **Computed Properties**: Auto-calculate derived attributes

---

## Related Documentation

- **Areas2View Technical Breakdown**: `AREAS2VIEW_TECHNICAL_BREAKDOWN.md`
- **Database Migrations**: `app-backend/migrations/001.do.sql`
- **API Routes**: `app-backend/src/routes/spatial.js`
- **Models**: `app-backend/src/models/feature.js`, `layer.js`, `project.js`
