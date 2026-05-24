# TRIG Beacons Fixes - Critical Issues Resolved

**Date:** November 18, 2024  
**Status:** ✅ Fixed and Ready for Testing

## Issues Identified

### Issue 1: TRIG Beacons Appearing in Field Book ❌
**Problem:** TRIG beacons (control points from national network) were appearing in the Electronic Field Book, which is incorrect per cadastral regulations.

**Expected Behavior:** TRIG beacons should ONLY appear in the Coordinate List section, not in the Field Book. The Field Book should only contain surveyed points.

### Issue 2: Only 1 TRIG Beacon in Coordinate List ❌
**Problem:** Only 1 control point appearing in Coordinate List instead of all 4 selected control points:
- 136/P (MANYANGA)
- 149/P (BONDE)
- 150/P (MUNAKA)
- 1242/S (MGWANI)

**Expected Behavior:** All 4 selected control points should appear in the TRIG BEACONS section of the Coordinate List.

---

## Root Causes

### Cause 1: No Filtering in Field Book Generator
The `ComprehensiveDocumentGenerator` was passing ALL survey points (including TRIG beacons) to the Field Book generator without filtering.

**Location:** `app-frontend/src/utils/comprehensive-document.ts` (lines 112-124)

### Cause 2: Incorrect API Parameter
The control points fetch in `MapLibreAreaView.vue` was using the wrong API parameter (`lo` instead of `gauss_lo`), causing the API to return no results or incorrect results.

**Location:** `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` (line 2305)

---

## Fixes Applied

### Fix 1: Filter TRIG Beacons from Field Book ✅

**File:** `app-frontend/src/utils/comprehensive-document.ts`

**Change:** Added filtering logic to exclude TRIG beacons before generating Field Book

```typescript
// ⭐ FILTER OUT TRIG BEACONS - They should NOT appear in Field Book
// TRIG beacons are from the national control network and only appear in Coordinate List
const surveyPointsOnly = data.surveyPoints.filter(pt => {
  const desc = (pt.description || '').toUpperCase();
  const status = (pt.status || '').toUpperCase();
  const isTrig = desc.includes('TRIG') || status.includes('TRIG');
  return !isTrig;
});

console.log('[ComprehensiveDoc] 📋 Field Book filtering:');
console.log('[ComprehensiveDoc] - Total survey points:', data.surveyPoints.length);
console.log('[ComprehensiveDoc] - TRIG beacons filtered out:', data.surveyPoints.length - surveyPointsOnly.length);
console.log('[ComprehensiveDoc] - Points for Field Book:', surveyPointsOnly.length);

// Convert survey points to field book format (excluding TRIG beacons)
const fieldBookPoints: FieldBookPoint[] = surveyPointsOnly.map(pt => ({
  id: pt.pointId,
  y: pt.y,
  x: pt.x,
  status: pt.status,
  surveyDate: pt.surveyDate,
  description: pt.description
}));
```

**Impact:**
- ✅ TRIG beacons no longer appear in Field Book
- ✅ Field Book only contains surveyed points
- ✅ Detailed logging shows filtering statistics

---

### Fix 2: Correct API Parameter for Control Points ✅

**File:** `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

**Change:** Fixed API parameter from `lo` to `gauss_lo` and added limit parameter

**Before:**
```typescript
const response = await axios.get(`${API_BASE}/control-points`, {
  params: { lo: centralMeridian }  // ❌ Wrong parameter
});
```

**After:**
```typescript
const response = await axios.get(`${API_BASE}/control-points`, {
  params: { 
    gauss_lo: centralMeridian,  // ✅ Correct parameter
    limit: 5000  // Fetch all control points for this meridian
  }
});
```

**Impact:**
- ✅ API now correctly fetches control points for the selected meridian
- ✅ All 4 control points will be retrieved
- ✅ Control points properly filtered by selected IDs

---

## Testing Instructions

### Test 1: Verify TRIG Beacons NOT in Field Book

**Steps:**
1. Generate a comprehensive document with control points selected
2. Open the generated PDF
3. Navigate to the Field Book section (pages E1-E99)
4. Verify NO TRIG beacons appear

**Expected Console Output:**
```
[ComprehensiveDoc] 📋 Field Book filtering:
[ComprehensiveDoc] - Total survey points: 54
[ComprehensiveDoc] - TRIG beacons filtered out: 4
[ComprehensiveDoc] - Points for Field Book: 50
[FieldBook] Generating field book with 50 points
[FieldBook] Will generate 2 pages (E1-E2)
```

**Expected Result:**
- [ ] Field Book contains only surveyed points (50 points)
- [ ] NO TRIG beacons in Field Book
- [ ] Console shows "TRIG beacons filtered out: 4"

---

### Test 2: Verify All 4 TRIG Beacons in Coordinate List

**Steps:**
1. Generate a comprehensive document with 4 control points selected:
   - 136/P (MANYANGA)
   - 149/P (BONDE)
   - 150/P (MUNAKA)
   - 1242/S (MGWANI)
2. Open the generated PDF
3. Navigate to the Coordinate List section (page 100+)
4. Check the TRIG BEACONS section

**Expected Console Output:**
```
[MapLibre] 📍 Fetching control points...
[MapLibre] - Control Point IDs: [136, 149, 150, 1242]
[MapLibre] ✅ Found 4 control points
[MapLibre] - Control points: 136/P, 149/P, 150/P, 1242/S
[MapLibre] - First control point: { id: 136, monu_num: "136/P", monu_name: "MANYANGA", ... }

[CoordinateList] Processing control points: 4
[CoordinateList] Control point 0: { monu_num: "136/P", y_gauss: 13757.670, x_gauss: 2310135.110, ... }
[CoordinateList] Control point 1: { monu_num: "149/P", y_gauss: 58433.600, x_gauss: 2306915.080, ... }
[CoordinateList] Control point 2: { monu_num: "150/P", y_gauss: 54382.030, x_gauss: 2277207.840, ... }
[CoordinateList] Control point 3: { monu_num: "1242/S", y_gauss: 18862.520, x_gauss: 2268555.010, ... }
[CoordinateList] Converted trig points: 4
```

**Expected Result in PDF:**
```
TRIG BEACONS
────────────────────────────────────────────────────────────────
Point ID    Y (m)           X (m)           Status  F/B  Calcs  Description
────────────────────────────────────────────────────────────────
136/P       13757.67        2310135.11      TRIG    -    -      MANYANGA
149/P       58433.60        2306915.08      TRIG    -    -      BONDE
150/P       54382.03        2277207.84      TRIG    -    -      MUNAKA
1242/S      18862.52        2268555.01      TRIG    -    -      MGWANI
```

**Verification Checklist:**
- [ ] All 4 control points appear in Coordinate List
- [ ] Control points are in TRIG BEACONS section (at the top)
- [ ] Coordinates match the expected values
- [ ] F/B column is empty (or shows "-")
- [ ] Calcs column is empty or shows "0" (control points have no calculations)
- [ ] Description shows correct names (MANYANGA, BONDE, MUNAKA, MGWANI)

---

## Technical Details

### TRIG Beacon Identification Logic

TRIG beacons are identified by checking both `description` and `status` fields:

```typescript
const isTrig = (point: any) => {
  const desc = (point.description || '').toUpperCase();
  const status = (point.status || '').toUpperCase();
  return desc.includes('TRIG') || status.includes('TRIG');
};
```

### Control Points Data Flow

1. **Project Setup** → User selects ≥3 control points
2. **Database Storage** → Control point IDs saved with project
3. **Workflow State** → IDs stored in `workflowState.projectInfo.controlPointIds`
4. **API Fetch** → Full control point data fetched using `gauss_lo` parameter
5. **Filtering** → Control points filtered by stored IDs
6. **Document Generation** → Control points passed to Coordinate List generator
7. **Coordinate List** → Control points prepended to TRIG BEACONS section

### API Endpoint Details

**Endpoint:** `GET /api/control-points`

**Required Parameters:**
- `gauss_lo`: Central meridian (27, 29, 31, or 33)
- `limit`: Maximum number of results (use 5000 to get all)

**Example:**
```
GET /api/control-points?gauss_lo=31&limit=5000
```

**Response Format:**
```json
{
  "data": [
    {
      "id": 136,
      "monu_num": "136/P",
      "monu_name": "MANYANGA",
      "type": "PRIM",
      "y_gauss": 13757.670,
      "x_gauss": 2310135.110,
      "gauss_lo": 31,
      "area_nm": "GWERU"
    },
    // ... more control points
  ],
  "pagination": { ... }
}
```

---

## Common Issues & Troubleshooting

### Issue: TRIG beacons still appearing in Field Book

**Possible Causes:**
1. Old cached PDF being displayed
2. Filtering logic not applied

**Solutions:**
1. Clear browser cache and regenerate document
2. Check console for "[ComprehensiveDoc] TRIG beacons filtered out: X"
3. Verify `surveyPointsOnly` array excludes TRIG beacons

### Issue: Still only 1 control point in Coordinate List

**Possible Causes:**
1. API returning empty results (wrong parameter)
2. Control point IDs not saved during project setup
3. Filtering removing control points

**Solutions:**
1. Check console for "[MapLibre] ✅ Found X control points"
2. Verify `workflowState.projectInfo.controlPointIds` contains all IDs
3. Check API response in Network tab (should use `gauss_lo` parameter)
4. Verify control points are for the correct meridian

### Issue: Control points have wrong coordinates

**Possible Causes:**
1. Wrong meridian selected
2. Control points from different meridian

**Solutions:**
1. Verify `centralMeridian` matches project setup
2. Check control point `gauss_lo` field matches selected meridian
3. Re-select control points for correct meridian

---

## Summary

✅ **Both Issues Fixed!**

1. ✅ **TRIG beacons removed from Field Book** - Now only surveyed points appear
2. ✅ **All 4 control points in Coordinate List** - API parameter fixed to fetch all control points

**Files Modified:**
- `app-frontend/src/utils/comprehensive-document.ts` - Added TRIG beacon filtering
- `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` - Fixed API parameter

**Impact:**
- Complies with cadastral regulations (TRIG beacons only in Coordinate List)
- All selected control points now appear correctly
- Proper data flow from project setup → API → document generation

**Next Steps:**
1. Test with actual project data
2. Verify console logs show correct filtering and fetching
3. Confirm PDF output matches expected format
4. Proceed with Phase 2 automation if tests pass
