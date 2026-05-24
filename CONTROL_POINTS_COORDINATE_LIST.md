# Control Points in Coordinate List - Implementation Guide

## Overview

The system now automatically includes selected control points (trig beacons) from the National Trig System at the beginning of the Coordinate List under the "TRIG BEACONS" section.

## How It Works

### 1. Project Setup (Settings → Projects)

When creating or editing a project:

1. **Select Central Meridian**: Choose Lo27, Lo29, Lo31, or Lo33
2. **Select Control Points**: Pick at least 3 control points from the national database
3. **Click "Update"**: Saves the project with control point selections

**Database Storage:**
- `survey_projects.central_meridian` - Stores the selected meridian (27, 29, 31, or 33)
- `project_control_points` table - Stores the selected control point IDs with their order
- `project_meridian_cache` table - Caches selections for each meridian (allows switching)

### 2. Cadastral Workflow Integration

When generating the Coordinate List in the Cadastral Standard module:

**Step 1: Workflow State Setup**

The workflow state (`CadastralWorkflowState`) now includes:

```typescript
projectInfo: {
  name: string;
  district: string;
  surveyDescription: string;
  projectId?: number;              // Survey project ID
  centralMeridian?: number;         // Lo27, Lo29, Lo31, Lo33
  controlPointIds?: number[];       // Selected control point IDs
}
```

**Step 2: Automatic Fetching**

When you click "Generate Coordinate List", the system:

1. Checks if `projectInfo.projectId` and `projectInfo.controlPointIds` exist
2. Fetches control points from the API: `/api/control-points?gauss_lo={meridian}`
3. Filters to only include the selected control points
4. Passes them to the coordinate list generator

**Step 3: PDF Generation**

The `CoordinateListGenerator` (in `utils/coordinate-list.ts`):

1. Receives `projectControlPoints` parameter
2. Converts them to `AdjustedCoordinate` format:
   ```typescript
   {
     pointId: cp.monu_num,        // e.g., "168/S"
     y: cp.y_gauss,               // Westing coordinate
     x: cp.x_gauss,               // Southing coordinate
     status: 'TRIG',              // Marked as TRIG beacon
     description: cp.monu_name,   // e.g., "Gletwyn"
     fieldBookPage: '',           // No field book entry
     calculationsPage: 0          // No calculations (from national system)
   }
   ```
3. Prepends them to the TRIG BEACONS section (they appear first)
4. Generates the PDF with control points at the top

### 3. Coordinate List Output

The generated PDF shows:

```
CO-ORDINATE LIST                                    S.R. No. 42272

SURVEY OF: RELOCATION OF BEACONS STAND 935 GLETWYN TOWNSHIP OF GLETWYN
DISTRICT: SALISBURY

                                Lo 31°
REFERENCES                   CO-ORDINATES              DESCRIPTION
                              Metres
F/B    Calcs   Beacons/      Y           X            F = Found      F/P   F.B
               Stations                                P = Placed
       CONSTANTS             +0,00    +1 960 000,00

TRIG BEACONS
                168/S        -17 876.13  +3 287.17    Gletwyn
                82/T         -15 241.10  +4 516.15    Auds HILL
                84/T         -21 430.58  +6 211.84    Sternblick N

FOUND BEACONS
                ...
```

## Setting Up Workflow State

To populate the workflow state with project information, you need to:

### Option 1: Manual Setup (Current)

In the Cadastral Standard module, manually set:

```typescript
import { useCadastralWorkflow } from '@/composables/useCadastralWorkflow'

const { workflowState } = useCadastralWorkflow()

// When loading a project
workflowState.projectInfo.projectId = project.id
workflowState.projectInfo.centralMeridian = project.central_meridian
workflowState.projectInfo.controlPointIds = project.control_point_ids
```

### Option 2: Automatic Integration (Recommended)

Add a "Load Project" feature in the Cadastral Standard module:

1. Add a project selector dropdown at the top
2. When user selects a project, fetch its details
3. Auto-populate workflow state with project info
4. Control points will automatically appear in Coordinate List

## API Endpoints Used

### Fetch Control Points
```
GET /api/control-points?gauss_lo={meridian}&limit=10000
```

Response:
```json
{
  "ok": true,
  "data": [
    {
      "id": 168,
      "monu_num": "168/S",
      "monu_name": "Gletwyn",
      "type": "SEC",
      "y_gauss": -17876.13,
      "x_gauss": 3287.17,
      "gauss_lo": 31,
      ...
    }
  ]
}
```

### Fetch Project Control Points
```
GET /api/projects/{projectId}/control-points
```

Response:
```json
{
  "ok": true,
  "controlPoints": [
    {
      "id": 168,
      "monu_num": "168/S",
      "monu_name": "Gletwyn",
      "point_order": 1
    }
  ]
}
```

## Testing

### Test Scenario 1: With Control Points

1. Create project "Mhofuland" with Lo31
2. Select control points: 101/P, 103/P, 104/P
3. Click "Update"
4. In Cadastral Standard:
   - Set `workflowState.projectInfo.projectId = 8`
   - Set `workflowState.projectInfo.centralMeridian = 31`
   - Set `workflowState.projectInfo.controlPointIds = [39, 62, 63]`
5. Import CSV and generate Coordinate List
6. **Expected**: Control points appear at top under "TRIG BEACONS"

### Test Scenario 2: Without Control Points

1. Don't set `projectInfo.projectId` or `controlPointIds`
2. Generate Coordinate List
3. **Expected**: Only CSV points appear (no control points section at top)

## Database Schema

### project_control_points
```sql
CREATE TABLE project_control_points (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES survey_projects(id),
  control_point_id INTEGER REFERENCES control_points(id),
  point_order INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### project_meridian_cache
```sql
CREATE TABLE project_meridian_cache (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES survey_projects(id),
  meridian INTEGER CHECK (meridian IN (27, 29, 31, 33)),
  control_point_ids INTEGER[],
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, meridian)
);
```

## Future Enhancements

1. **Auto-load Project**: Add project selector in Cadastral Standard module
2. **Control Point Details**: Show more info (height, coordinates) in project view
3. **Validation**: Ensure at least 3 control points selected
4. **Export**: Include control points in project export/backup

## Summary

✅ Control points are stored per project with central meridian
✅ Coordinate list generator supports control points parameter
✅ Control points appear first in TRIG BEACONS section
✅ System fetches and filters control points automatically
✅ Works with existing coordinate list generation logic

**Next Step**: Add project selector UI in Cadastral Standard module to automatically populate `workflowState.projectInfo` when user selects a project!
