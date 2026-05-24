# Land Parcel Duplicate Detection System

## Overview

The duplicate detection system prevents saving land parcels that:
1. **Have similar stand names** (e.g., "2428a" vs "2428")
2. **Have overlapping polygons** (partially or wholly overlapping geometry)
3. **Have identical geometries** (exact duplicate polygons)

## How It Works

### Detection Algorithm

When you attempt to save a parcel, the system performs three checks:

#### 1. **Similar Stand Name Detection**
- Normalizes stand names by:
  - Converting to lowercase
  - Removing all spaces
  - Removing trailing letter suffixes (a, b, c, etc.)
- **Example:** "2428a" → normalized to "2428"
- **Example:** "2428 A" → normalized to "2428"
- **Result:** Both would be detected as duplicates of stand "2428"

#### 2. **Spatial Overlap Detection**
Uses PostGIS spatial functions to calculate:
- Overlap area in square meters
- Overlap percentage relative to existing parcel
- Severity classification:
  - **Critical (≥95%)**: Complete overlap
  - **High (50-94%)**: Major overlap
  - **Medium (10-49%)**: Partial overlap
  - **Low (<10%)**: Minor overlap

#### 3. **Exact Geometry Matching**
- Uses PostGIS `ST_Equals()` to detect identical polygons
- Even if stand names differ, identical geometries are flagged

## User Experience

### Scenario 1: Critical/High Severity Duplicates (BLOCKED)

When saving a parcel with critical or high-priority conflicts, you'll see:

```
⚠️ DUPLICATE DETECTED!

Stand "2428a" has 2 potential conflict(s):

🚫 CRITICAL ISSUES (1):
  1. Stand "2428a" is similar to existing stand "2428"
     Normalized: "2428" matches "2428"

⚠️ HIGH PRIORITY (1):
  1. Polygon overlaps 98.5% with existing parcel "2428"
     • Overlap: 98.5%

❌ Cannot save: Critical or high-priority conflicts detected.

Please:
• Use a different stand number
• Adjust polygon boundaries to avoid overlaps
• Check if this parcel already exists
```

**Action Required:**
- Change the stand number (e.g., use "2427" instead)
- Adjust polygon boundaries to remove overlap
- Verify this isn't a duplicate entry

### Scenario 2: Medium/Low Severity (WARNING)

For minor overlaps, you'll see a warning and can choose to proceed:

```
⚠️ DUPLICATE DETECTED!

Stand "2428b" has 1 potential conflict(s):

ℹ️ WARNINGS (1):
  1. Polygon overlaps 15.2% with existing parcel "2428"
     • Overlap: 15.2%

⚠️ Do you want to save anyway?
(Not recommended - may cause data inconsistency)
```

**Options:**
- Click **Cancel** to go back and fix the issue
- Click **OK** to save anyway (not recommended)

### Scenario 3: No Duplicates (SUCCESS)

If no duplicates are detected:

```
✅ No duplicates detected - proceeding with save
✅ Parcel saved to land_parcels table (ID: 123)
```

## Technical Details

### Backend Implementation

**File:** `app-backend/src/models/landParcel.js`

```javascript
async checkDuplicates(projectId, stand, geom, excludeId = null)
```

**Returns:**
```javascript
{
  hasDuplicates: boolean,
  duplicateCount: number,
  duplicates: [
    {
      type: 'similar_name' | 'partial_overlap' | 'major_overlap' | 'complete_overlap' | 'exact_geometry',
      severity: 'critical' | 'high' | 'medium' | 'low',
      existing_id: number,
      existing_stand: string,
      overlap_area_m2: string,  // Only for overlaps
      overlap_percent: number,   // Only for overlaps
      message: string,
      details: string
    }
  ],
  summary: {
    critical: number,
    high: number,
    medium: number,
    low: number
  }
}
```

### API Endpoint

**POST** `/land-parcels/check-duplicates`

**Request Body:**
```json
{
  "project_id": 1,
  "stand": "2428a",
  "geom": {
    "type": "Polygon",
    "coordinates": [[[y1, x1], [y2, x2], ...]]
  },
  "exclude_id": 123  // Optional: exclude specific parcel from check (for updates)
}
```

**Response:**
```json
{
  "ok": true,
  "hasDuplicates": true,
  "duplicateCount": 2,
  "duplicates": [...],
  "summary": {
    "critical": 1,
    "high": 1,
    "medium": 0,
    "low": 0
  }
}
```

### Frontend Integration

**File:** `app-frontend/src/views/modules/lite/areas2/Areas2View.vue`

The `saveParcelToDatabase()` function now:
1. Creates polygon geometry from selected points
2. Calls `checkParcelDuplicates()` API
3. Analyzes results and shows appropriate warnings
4. Blocks saves for critical/high severity issues
5. Asks for confirmation for medium/low severity issues

## Severity Thresholds

| Severity | Conditions | Action |
|----------|-----------|--------|
| **Critical** | • Similar stand name<br>• ≥95% geometry overlap<br>• Exact geometry match | **BLOCK SAVE**<br>User must fix the issue |
| **High** | • 50-94% geometry overlap | **BLOCK SAVE**<br>User must fix the issue |
| **Medium** | • 10-49% geometry overlap | **WARN**<br>User can override |
| **Low** | • <10% geometry overlap | **WARN**<br>User can override |

## Stand Name Normalization Logic

The system normalizes stand names to catch variations:

| Original | Normalized | Matches |
|----------|-----------|---------|
| 2428a | 2428 | 2428, 2428a, 2428A, 2428 a, 2428 A |
| 2428 A | 2428 | 2428, 2428a, 2428A, 2428 a, 2428 A |
| 2428-A | 2428-a | 2428-a, 2428-A (hyphen is NOT removed) |
| Stand 2428 | stand2428 | Stand 2428, STAND 2428 |

**Note:** Only trailing single letters are removed. Multi-letter suffixes are preserved.

## PostGIS Spatial Checks

### Overlap Detection Query
```sql
WITH new_geom AS (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 22291) as geom
)
SELECT 
  lp.id, 
  lp.stand,
  ST_Area(ST_Intersection(lp.geom, ng.geom)) as overlap_area_m2,
  ROUND((ST_Area(ST_Intersection(lp.geom, ng.geom)) / 
         NULLIF(ST_Area(lp.geom), 0) * 100)::numeric, 2) as overlap_percent
FROM land_parcels lp, new_geom ng
WHERE lp.project_id = $2
  AND ST_Intersects(lp.geom, ng.geom)
  AND NOT ST_Touches(lp.geom, ng.geom)  -- Exclude parcels that only touch at boundaries
ORDER BY overlap_area_m2 DESC
```

### Exact Match Detection
```sql
SELECT lp.id, lp.stand
FROM land_parcels lp, new_geom ng
WHERE lp.project_id = $2
  AND ST_Equals(lp.geom, ng.geom)
```

## Console Logging

The system provides detailed console logs for debugging:

```
💾 [Areas2View] Checking for duplicates before saving parcel "2428a"...
⚠️ [Areas2View] Found 2 potential duplicate(s)
📌 [Areas2View] User cancelled save due to duplicate warnings
```

Or for successful saves:
```
✅ [Areas2View] No duplicates detected - proceeding with save
✅ [Areas2View] Parcel saved to land_parcels table (ID: 123)
```

## Best Practices

### For Surveyors

1. **Use Consistent Naming**
   - Decide on a naming convention: "2428a" vs "2428 A" vs "2428-A"
   - Stick to it throughout the project

2. **Check Existing Parcels First**
   - Review the map before digitizing
   - Look for similar stand numbers
   - Verify boundaries don't overlap

3. **Handle Warnings Appropriately**
   - **Never ignore critical/high warnings** - fix the issue
   - **Be cautious with medium warnings** - verify it's intentional
   - **Low warnings** may be acceptable for adjacent parcels with minor overlaps

4. **Update vs Create**
   - If updating an existing parcel, use the update function
   - Don't create a new parcel with slight variations

### For Administrators

1. **Database Cleanup**
   - Periodically check for duplicate parcels that slipped through
   - Use SQL queries to identify similar stand names
   - Merge or delete duplicates as needed

2. **Training**
   - Train users on proper stand naming conventions
   - Explain the importance of avoiding overlaps
   - Show examples of acceptable vs unacceptable overlaps

## Troubleshooting

### False Positives

**Problem:** System flags parcels that aren't actually duplicates

**Solutions:**
- Check if stand names are legitimately different (e.g., "2428" vs "2428-B" for subdivisions)
- Verify polygon boundaries - small overlaps may be digitization errors
- Contact administrator if system is too strict

### Missing Duplicates

**Problem:** System doesn't detect obvious duplicates

**Possible Causes:**
- Stand names differ significantly (e.g., "2428" vs "Lot 2428")
- Polygons don't overlap enough (< 10% threshold)
- Different projects (system only checks within same project)

**Solutions:**
- Use manual visual inspection of map
- Query database directly for similar stands
- Adjust detection thresholds if needed (developer task)

## Future Enhancements

Potential improvements to consider:

1. **Fuzzy String Matching**
   - Detect "2428" vs "Lot 2428" vs "Stand 2428"
   - Use Levenshtein distance or similar algorithms

2. **Visual Overlap Highlighting**
   - Show overlapping areas on map in red
   - Display both parcels side-by-side for comparison

3. **Batch Duplicate Detection**
   - Check all parcels in a project at once
   - Generate report of potential duplicates

4. **Configurable Thresholds**
   - Allow administrators to adjust overlap percentages
   - Different rules for different project types

5. **Duplicate Resolution Wizard**
   - Guide users through merging/updating duplicates
   - Suggest best actions based on conflict type

## Files Modified

### Backend
- `app-backend/src/models/landParcel.js` - Added `checkDuplicates()` function
- `app-backend/src/routes/landParcels.js` - Added `/land-parcels/check-duplicates` endpoint

### Frontend
- `app-frontend/src/services/spatial.ts` - Added `checkParcelDuplicates()` service
- `app-frontend/src/views/modules/lite/areas2/Areas2View.vue` - Integrated duplicate check in `saveParcelToDatabase()`

## Testing

### Test Cases

1. **Similar Stand Names**
   ```
   Create parcel "2428"
   Try to create parcel "2428a"
   Expected: BLOCKED with similar name warning
   ```

2. **Complete Overlap**
   ```
   Create parcel with polygon A
   Try to create different stand with same polygon A
   Expected: BLOCKED with 100% overlap warning
   ```

3. **Partial Overlap**
   ```
   Create parcel with polygon A
   Try to create parcel with polygon B (50% overlap with A)
   Expected: BLOCKED with 50% overlap warning
   ```

4. **Minor Overlap**
   ```
   Create parcel with polygon A
   Try to create parcel with polygon C (5% overlap with A)
   Expected: WARNING, allow with confirmation
   ```

5. **No Duplicates**
   ```
   Create parcel "2428" with polygon A
   Create parcel "2429" with polygon B (no overlap)
   Expected: Both save successfully
   ```

## Performance Considerations

- Duplicate checks add ~100-300ms to save operations
- PostGIS spatial queries are optimized with spatial indexes
- Checks are only performed before save (not on every edit)
- No impact on map rendering or point selection

## Security Notes

- Duplicate checks respect project boundaries
- Users can only check duplicates in their own projects
- Authentication required for all duplicate check endpoints
- No sensitive data exposed in error messages
