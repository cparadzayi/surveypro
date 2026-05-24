# Land Parcels Layer Implementation

## Overview
This implementation adds a persistent parcels layer to each survey project with automatic polygon generation, color coding, and duplicate detection.

## What's Been Created

### 1. Database Schema (`migrations/014.do.sql`)
- **Table**: `land_parcels`
- **Fields**:
  - `id`: Primary key
  - `project_id`: Foreign key to survey_projects
  - `parcel_number`: Unique within project
  - `parcel_name`: Optional name
  - `boundary_points`: Array of point IDs
  - `area_sqm`, `area_hectares`, `area_acres`: Calculated areas
  - `status`: 'draft' (yellow) or 'calculated' (lime green)
  - `geometry_geojson`: Polygon geometry
  - `created_at`, `updated_at`: Timestamps

### 2. API Routes (`src/routes/parcels.js`)
- `GET /api/parcels/:projectId` - Get all parcels for a project
- `POST /api/parcels` - Create new parcel (draft status)
- `PUT /api/parcels/:id` - Update parcel (add points, calculate area)
- `DELETE /api/parcels/:id` - Delete parcel
- `GET /api/parcels/:projectId/check-duplicate/:parcelNumber` - Check for duplicates

### 3. Frontend Store (`stores/parcels.ts`)
- Pinia store for state management
- Methods: `loadParcels`, `createParcel`, `updateParcel`, `deleteParcel`, `checkDuplicate`
- Computed: `currentParcels`, `draftParcels`, `calculatedParcels`

### 4. Geometry Composable (`composables/useParcelGeometry.ts`)
- `generatePolygon()` - Auto-generate polygon from boundary points
- `calculateArea()` - Calculate area using Shoelace formula
- `getPolygonColor()` - Get color based on status (yellow/lime green)

## Next Steps to Complete Integration

### Step 1: Run Database Migration
```bash
cd app-backend
# The migration will run automatically on next server start
# Or manually run: psql -d surveypro -f migrations/014.do.sql
```

### Step 2: Register API Route
Add to `app-backend/src/app.js`:
```javascript
// Register parcels routes
fastify.register(require('./routes/parcels'), { prefix: '/api/parcels' });
```

### Step 3: Integrate into Calculations Part 2

Add to `CalculationsPart2View.vue`:

```vue
<script setup>
import { useParcelsStore } from '../../../stores/parcels';
import { useParcelGeometry } from '../../../composables/useParcelGeometry';

const parcelsStore = useParcelsStore();
const { generatePolygon, getPolygonColor } = useParcelGeometry();

// Load parcels when project is selected
watch(() => workflowState.projectInfo.projectId, async (projectId) => {
  if (projectId) {
    await parcelsStore.loadParcels(projectId);
    // Add parcels to map
    addParcelsToMap();
  }
});

// Save parcel when area is calculated
async function saveParcel(parcelData) {
  const geometry = generatePolygon(parcelData.boundaryPoints, coordinatePoints.value);
  
  if (!geometry) {
    alert('Cannot generate polygon - invalid boundary points');
    return;
  }

  // Check for duplicate
  const isDuplicate = await parcelsStore.checkDuplicate(
    workflowState.projectInfo.projectId,
    parcelData.parcelNumber
  );

  if (isDuplicate) {
    alert(`Parcel ${parcelData.parcelNumber} already exists!`);
    return;
  }

  // Create or update parcel
  const parcel = {
    project_id: workflowState.projectInfo.projectId,
    parcel_number: parcelData.parcelNumber,
    parcel_name: parcelData.parcelName,
    boundary_points: parcelData.boundaryPoints,
    area_sqm: geometry.area.sqm,
    area_hectares: geometry.area.hectares,
    area_acres: geometry.area.acres,
    status: 'calculated',
    geometry_geojson: geometry.geoJSON
  };

  await parcelsStore.createParcel(parcel);
  addParcelToMap(parcel, geometry);
}

// Add parcels to map
function addParcelsToMap() {
  parcelsStore.currentParcels.forEach(parcel => {
    const geometry = generatePolygon(parcel.boundary_points, coordinatePoints.value);
    if (geometry) {
      addParcelToMap(parcel, geometry);
    }
  });
}

// Add single parcel to map
function addParcelToMap(parcel, geometry) {
  const colors = getPolygonColor(parcel.status);
  
  const polygon = L.polygon(geometry.polygon, {
    color: colors.color,
    fillColor: colors.fillColor,
    fillOpacity: 0.4,
    weight: 2
  }).addTo(map);

  polygon.bindPopup(`
    <strong>${parcel.parcel_number}</strong><br>
    ${parcel.parcel_name || ''}<br>
    Area: ${parcel.area_hectares?.toFixed(4)} ha<br>
    Status: ${parcel.status}
  `);
}
</script>
```

## Features

### ✅ Automatic Polygon Generation
- As user adds boundary points, polygon is auto-generated
- Uses Gauss coordinates (Y, X) from adjusted coordinates
- Closes polygon automatically if not closed

### ✅ Color Coding
- **Yellow (#FFFF00)**: Draft status (being built)
- **Lime Green (#32CD32)**: Calculated status (area computed)

### ✅ Duplicate Detection
- Checks parcel number uniqueness within project
- Prevents duplicate parcels
- Shows error message if duplicate detected

### ✅ Persistence
- Parcels saved to database
- Automatically loaded when project is opened
- Survives browser refresh and session changes

### ✅ Area Calculation
- Uses Shoelace formula for accurate area
- Calculates in square meters, hectares, and acres
- Handles complex polygons

## Usage Flow

1. User opens Calculations Part 2
2. System automatically loads existing parcels for the project
3. User builds parcel by selecting boundary points
4. Polygon appears in **yellow** as points are added
5. User calculates area
6. System checks for duplicate parcel number
7. If unique, parcel is saved with **lime green** color
8. Parcel persists and appears on subsequent visits

## Testing

1. Start backend: `cd app-backend && npm run dev`
2. Start frontend: `cd app-frontend && npm run dev`
3. Open Calculations Part 2
4. Create a parcel and verify:
   - Yellow color while building
   - Duplicate detection works
   - Area calculation is accurate
   - Lime green after calculation
   - Parcel persists after refresh

## Database Query Examples

```sql
-- Get all parcels for a project
SELECT * FROM land_parcels WHERE project_id = 1;

-- Get only calculated parcels
SELECT * FROM land_parcels WHERE status = 'calculated';

-- Count parcels per project
SELECT project_id, COUNT(*) as parcel_count 
FROM land_parcels 
GROUP BY project_id;
```
