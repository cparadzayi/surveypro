# Control Points Integration Guide

## Overview

This guide documents the integration of Zimbabwe's national trigonometric control points system into the SurveyPro project workflow.

## Workflow

### 1. Project Creation with Trig System Connection

When creating a new survey project, the surveyor must:

1. **Select Deeds Registry District** - Enter the district (e.g., GWELO, HARARE)
2. **Select Central Meridian** - Choose from Lo27, Lo29, Lo31, or Lo33
3. **Select Control Points** - Choose at least 3 control points from the selected meridian zone
4. **Complete Project Details** - Fill in remaining project information

### 2. Control Point Selection Process

The system provides:
- **Filtering by Central Meridian** - Only shows points in the selected zone
- **Search Functionality** - Search by monument number, name, or area
- **Type Filtering** - Filter by PRIM, SEC, TERT, QUART, or TSM
- **Visual Selection** - Click to select/deselect points
- **Ordered Display** - Selected points are numbered in order

### 3. Coordinate List Generation

Selected control points automatically appear in the "TRIG BEACONS" section of the Coordinate List (first section).

## Implementation Components

### 1. Database Schema

**Migration: `011.do.sql`**

```sql
-- Add central meridian to projects
ALTER TABLE survey_projects 
  ADD COLUMN central_meridian INTEGER CHECK (central_meridian IN (27, 29, 31, 33));

-- Junction table for project control points
CREATE TABLE project_control_points (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES survey_projects(id),
  control_point_id INTEGER REFERENCES control_points(id),
  point_order INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**To Apply:**
```bash
cd app-backend
psql -U postgres -d surveypro_v1 -f migrations/011.do.sql
```

### 2. Frontend Component

**File:** `app-frontend/src/components/ControlPointSelector.vue`

**Features:**
- Central meridian selection (Lo27, Lo29, Lo31, Lo33)
- Real-time fetching of control points from API
- Search and filter functionality
- Multi-select with visual feedback
- Minimum 3 points validation
- Ordered selection display

**Props:**
```typescript
modelValue: {
  meridian: number | null
  points: number[]  // Array of control point IDs
}
```

**Events:**
```typescript
'update:modelValue': [value: { meridian: number | null, points: number[] }]
```

### 3. Updated Project Form

**File:** `app-frontend/src/views/modules/settings/ProjectsView.vue`

**Changes:**
- Added `ControlPointSelector` component
- Updated `formData` to include `controlPoints`
- Added validation for minimum 3 control points
- Stores selected points when creating/editing projects

### 4. API Endpoints

**Existing Endpoint (Used):**
```
GET /api/control-points?gauss_lo={meridian}&limit=1000
```

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "monu_num": "1/P",
      "monu_name": "Gasikani",
      "type": "PRIM",
      "gauss_lo": 31,
      "y_gauss": 82173.340,
      "x_gauss": 1894016.190,
      "area_nm": "Lions Den"
    }
  ],
  "pagination": {...}
}
```

### 5. Backend Routes (To Be Updated)

**File:** `app-backend/src/routes/survey-projects.js`

**Required Changes:**
1. Accept `central_meridian` and `control_point_ids` in POST/PUT requests
2. Store control points in `project_control_points` table
3. Return control points when fetching projects

**Example Implementation:**

```javascript
// POST /api/survey-projects
app.post('/survey-projects', async (request, reply) => {
  const { 
    name, 
    surveyorId, 
    centralMeridian, 
    controlPointIds,
    ...otherFields 
  } = request.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create project
    const projectResult = await client.query(
      `INSERT INTO survey_projects (name, surveyor_id, central_meridian, ...)
       VALUES ($1, $2, $3, ...) RETURNING id`,
      [name, surveyorId, centralMeridian, ...]
    );
    
    const projectId = projectResult.rows[0].id;
    
    // Insert control points
    if (controlPointIds && controlPointIds.length > 0) {
      for (let i = 0; i < controlPointIds.length; i++) {
        await client.query(
          `INSERT INTO project_control_points (project_id, control_point_id, point_order)
           VALUES ($1, $2, $3)`,
          [projectId, controlPointIds[i], i + 1]
        );
      }
    }
    
    await client.query('COMMIT');
    reply.send({ ok: true, project: {...} });
  } catch (error) {
    await client.query('ROLLBACK');
    reply.status(500).send({ error: error.message });
  } finally {
    client.release();
  }
});
```

## Coordinate List Integration

### Current Structure

The Coordinate List generator (`coordinate-list.ts`) groups points into sections:
1. **TRIG BEACONS** - Control points from national system
2. **WORKING STATIONS** - GPS-fixed working stations
3. **FOUND BEACONS** - Existing beacons found on site
4. **PLACED BEACONS** - New beacons placed during survey

### Required Updates

**File:** `app-frontend/src/utils/coordinate-list.ts`

**Changes Needed:**

```typescript
// Add project control points to the generator
async generateCoordinateListPDF(
  adjustedCoordinates: AdjustedCoordinate[],
  surveyorInfo: SurveyorInfo,
  projectControlPoints?: ControlPoint[]  // NEW PARAMETER
): Promise<{ pdf: jsPDF, pageCount: number }> {
  
  // Group points by type
  const groupedPoints = this.groupPointsByType(adjustedCoordinates);
  
  // Prepend project control points to trig beacons section
  if (projectControlPoints && projectControlPoints.length > 0) {
    const trigPoints = projectControlPoints.map(cp => ({
      pointId: cp.monu_num,
      y: cp.y_gauss,
      x: cp.x_gauss,
      status: 'TRIG',
      description: cp.monu_name,
      type: cp.type,
      // ... other fields
    }));
    
    groupedPoints.trig = [...trigPoints, ...groupedPoints.trig];
  }
  
  // Continue with normal generation...
}
```

## Testing Workflow

### 1. Setup Database

```bash
# Run migration
cd app-backend
psql -U postgres -d surveypro_v1 -f migrations/011.do.sql

# Verify tables
psql -U postgres -d surveypro_v1 -c "\d project_control_points"
```

### 2. Import Control Points

```bash
# Ensure control_points table has data
psql -U postgres -d surveypro_v1 -c "SELECT COUNT(*) FROM control_points;"

# If empty, import CSV
node scripts/import-control-points.js "path/to/zimgausscontrolpoints.csv"
```

### 3. Test Frontend

1. Start backend: `cd app-backend && npm run dev`
2. Start frontend: `cd app-frontend && npm run dev`
3. Navigate to Settings → Projects
4. Click "Add Project"
5. Fill in project details
6. Select central meridian (e.g., Lo31)
7. Select at least 3 control points
8. Save project
9. Verify control points are stored

### 4. Test Coordinate List Generation

1. Create a survey with selected control points
2. Generate Coordinate List PDF
3. Verify "TRIG BEACONS" section contains selected control points
4. Verify points appear in correct order
5. Verify coordinates match database values

## Data Flow

```
User Creates Project
    ↓
Selects Central Meridian (Lo27/29/31/33)
    ↓
Frontend fetches control points via API
GET /api/control-points?gauss_lo={meridian}
    ↓
User selects ≥3 control points
    ↓
Form submits with:
  - central_meridian: 31
  - control_point_ids: [1, 5, 12]
    ↓
Backend stores in:
  - survey_projects.central_meridian
  - project_control_points (junction table)
    ↓
When generating Coordinate List:
  - Fetch project control points
  - Include in TRIG BEACONS section
  - Display with coordinates from control_points table
```

## Validation Rules

1. **Central Meridian**: Must be 27, 29, 31, or 33
2. **Minimum Control Points**: At least 3 required
3. **Control Point Validity**: Must exist in control_points table
4. **Meridian Consistency**: All selected points must match the chosen meridian

## UI/UX Features

### Visual Feedback
- ✅ Selected meridian highlighted in blue
- ✅ Selected points show checkmark and order number
- ✅ Progress indicator shows count (e.g., "3 selected")
- ✅ Validation message if < 3 points selected
- ✅ Success message when ≥ 3 points selected

### Search & Filter
- 🔍 Real-time search by monument number, name, or area
- 🏷️ Filter by type (PRIM, SEC, TERT, QUART, TSM)
- 📊 Displays coordinates and area for each point

### Accessibility
- Keyboard navigation support
- Clear visual hierarchy
- Responsive design for mobile/tablet
- Loading states for async operations

## Future Enhancements

1. **Map View**: Display control points on interactive map
2. **Proximity Search**: Find nearest control points to survey area
3. **Point Details**: Show full details (height, inspection date, etc.)
4. **Bulk Selection**: Select all points in an area
5. **Export**: Export selected points to CSV/PDF
6. **History**: Track which projects used which control points
7. **Validation**: Check if points are within reasonable distance

## Troubleshooting

### Control Points Not Loading
- Check database connection
- Verify control_points table has data
- Check API endpoint is accessible
- Inspect browser console for errors

### Cannot Select Points
- Ensure central meridian is selected first
- Check if points exist for selected meridian
- Verify API returns data

### Points Not Appearing in Coordinate List
- Verify project has control points saved
- Check coordinate list generator receives control points
- Ensure TRIG BEACONS section is rendered

## Summary

This integration connects survey projects to Zimbabwe's national trigonometric system by:
1. ✅ Requiring central meridian selection
2. ✅ Enforcing minimum 3 control points
3. ✅ Storing control point associations
4. ✅ Including control points in Coordinate List
5. ✅ Providing intuitive selection interface

The system ensures all cadastral surveys are properly connected to the national reference system as required by surveying standards.

---

**Status**: Implementation complete, pending backend route updates and testing
**Last Updated**: 2025-10-26
