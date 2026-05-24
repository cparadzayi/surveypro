# CSV System Column Parsing - Cape Lo Zone Detection

## Overview

The CSV parser now automatically detects and validates the Cape Lo zone (central meridian) from the **System column** in coordinate CSV files. This ensures the correct SRID is used for PostGIS storage based on the actual coordinate system in the CSV data.

---

## CSV Format

### **Expected Columns**

Your CSV sample shows the correct format:

```csv
Point,Y,X,SR_num,Description,Survey_date,System,Meas_unit
P2,97538.004,2247107.9,200/2000,50mm Iron,Nov-00,Lo 31,M
ZA,96271.08,2247869.9,200/2000,50mm Iron,Nov-00,Lo 31,M
ZD,96551.464,2248065.6,200/2000,50mm Iron,Nov-00,Lo 31,M
ZE,96649.178,2247915,200/2000,50mm Iron,Nov-00,Lo 31,M
ZG,97128.263,2248259.2,200/2000,50mm Iron,Nov-00,Lo 31,M
```

### **System Column Values**

The parser accepts multiple formats:
- `Lo 31` (with space)
- `Lo31` (no space)
- `31` (numeric only)
- Case-insensitive: `lo 31`, `LO 31`, `LO31`

**Valid zones:** Lo 25, Lo 27, Lo 29, Lo 31, Lo 33

---

## How It Works

### **1. Column Detection**

Parser checks for System column using multiple possible names:
- `system`
- `lo`
- `zone`

```typescript
const hasSystemColumn = header.some(h => 
  h === 'system' || h === 'lo' || h === 'zone'
);
```

### **2. Zone Extraction**

For each row, the parser extracts the Cape Lo zone:

```typescript
function extractCapeLoZone(systemValue: string): number | null {
  if (!systemValue) return null;
  
  const normalized = systemValue.toLowerCase().trim();
  const match = normalized.match(/\d+/);  // Extract digits
  
  if (!match) return null;
  
  const zone = parseInt(match[0], 10);
  const validZones = [25, 27, 29, 31, 33];
  
  return validZones.includes(zone) ? zone : null;
}
```

**Examples:**
- `"Lo 31"` → `31`
- `"Lo31"` → `31`
- `"31"` → `31`
- `"lo 29"` → `29`
- `"Invalid"` → `null`

### **3. Consistency Validation**

The parser validates that **all points use the same Cape Lo zone**:

```typescript
if (detectedMeridian === null) {
  // First point - set the expected zone
  detectedMeridian = pointMeridian;
  console.log(`🎯 Detected Cape Lo zone: Lo ${pointMeridian}`);
} else if (detectedMeridian !== pointMeridian) {
  // Inconsistent zone - add warning
  result.warnings.push({
    row: i,
    field: 'system',
    message: `Inconsistent Cape Lo zone: Expected Lo ${detectedMeridian}, found Lo ${pointMeridian}`,
    suggestion: `All points should use the same Cape Lo zone (Lo ${detectedMeridian})`
  });
}
```

### **4. Result Storage**

The detected central meridian is stored in the validation result:

```typescript
export interface CSVValidationResult {
  isValid: boolean;
  errors: CSVValidationError[];
  warnings: CSVValidationWarning[];
  preview: CadastralPoint[];
  summary: { ... };
  detectedCentralMeridian?: number;  // 25, 27, 29, 31, or 33
}
```

---

## Console Output

### **With System Column**

```
[CSV Parser] Header columns: ['point', 'y', 'x', 'sr_num', 'description', 'survey_date', 'system', 'meas_unit']
[CSV Parser] System column detected: true
[CSV Parser] 🎯 Detected Cape Lo zone from System column: Lo 31
[CSV Parser] 📊 Import Summary:
  - Total Points: 542
  - Field Book Points: 530
  - Calculated Points: 12 (excluded from field book)
  - Fixed Points (F): 450
  - Peg Points (P): 92
  - Other Points: 0
  - 🎯 Detected Cape Lo Zone: Lo 31
  - SRID will be: 22291
```

### **Without System Column**

```
[CSV Parser] Header columns: ['point', 'y', 'x', 'status', 'description', 'date of survey']
[CSV Parser] System column detected: false
[CSV Parser] 📊 Import Summary:
  - Total Points: 542
  - Field Book Points: 542
  - Fixed Points (F): 450
  - Peg Points (P): 92
  - Other Points: 0
  - ⚠️ No System column detected - will use project's default central meridian
```

---

## Integration with Backend

### **CSV Import Flow**

1. **Frontend parses CSV** → Detects `detectedCentralMeridian`
2. **Sends to backend** → Includes central meridian in request
3. **Backend uses detected value** → Overrides project default if provided
4. **PostGIS storage** → Uses correct SRID for the zone

### **Backend Integration (✅ COMPLETE)**

The backend CSV import routes now accept and use the detected central meridian:

**`csvImports.js` - execute-merge endpoint:**

```javascript
const {
  project_id,
  import_id,
  matched_points,
  new_points,
  orphaned_parcel_ids = [],
  partial_parcel_actions = {},
  duplicate_tolerance = 0.1,
  detectedCentralMeridian // Cape Lo zone from CSV System column (25/27/29/31/33)
} = request.body;

// Determine central meridian: Use detected value from CSV if provided
let centralMeridian;
let meridianSource;

if (detectedCentralMeridian) {
  // CSV has System column with Cape Lo zone
  centralMeridian = detectedCentralMeridian;
  meridianSource = 'CSV System column';
  console.log(`[CSV Import] 🎯 Using central meridian from CSV System column: Lo ${centralMeridian}`);
} else {
  // Fall back to project's central meridian setting
  const projectResult = await client.query(
    'SELECT central_meridian FROM survey_projects WHERE id = $1',
    [project_id]
  );
  
  if (projectResult.rows.length === 0) {
    throw new Error(`Project ${project_id} not found`);
  }
  
  centralMeridian = projectResult.rows[0].central_meridian;
  meridianSource = 'project setting';
  console.log(`[CSV Import] 📋 Using central meridian from project setting: Lo ${centralMeridian}`);
}

const srid = getCapeLoSRID(centralMeridian);
console.log(`[CSV Import] Central meridian: Lo ${centralMeridian} (from ${meridianSource}), SRID: ${srid}`);
```

**Frontend Service (`csvImports.ts`):**

```typescript
export async function executeMerge(data: {
  project_id: number;
  import_id: number;
  matched_points: PointMatch[];
  new_points: Array<{ id: string; y: number; x: number }>;
  orphaned_parcel_ids?: number[];
  partial_parcel_actions?: Record<number, 'delete' | 'keep' | 'review'>;
  duplicate_tolerance?: number;
  detectedCentralMeridian?: number; // Cape Lo zone from CSV System column
}): Promise<...> {
  const response = await api.post('/csv-imports/execute-merge', data);
  return response.data;
}
```

**Frontend Component (`CadastralStandardView.vue`):**

```typescript
// Store detected central meridian from CSV validation
pendingCSVData.value = {
  content,
  filename: file.name,
  points: validationResult.preview,
  detectedCentralMeridian: validationResult.detectedCentralMeridian
};

// Pass to backend during merge execution
const result = await executeMerge({
  project_id: selectedProjectId.value,
  import_id: importId,
  matched_points: analysis.matched,
  new_points: analysis.newPoints.map(p => ({
    id: p.id,
    y: p.coordinate.y,
    x: p.coordinate.x
  })),
  orphaned_parcel_ids: analysis.parcelAnalysis.orphaned.map(p => p.id),
  partial_parcel_actions: partialParcelActions,
  duplicate_tolerance: duplicateTolerance,
  detectedCentralMeridian: pendingCSVData.value?.detectedCentralMeridian
});
```

---

## SRID Mapping

| System Column | Central Meridian | EPSG SRID | Coverage |
|---------------|-----------------|-----------|----------|
| Lo 25 | 25°E | 22287 | Western Zimbabwe |
| Lo 27 | 27°E | 22289 | West-Central Zimbabwe |
| Lo 29 | 29°E | 22290 | Central Zimbabwe |
| Lo 31 | 31°E | 22291 | East-Central Zimbabwe |
| Lo 33 | 33°E | 22293 | Eastern Zimbabwe |

**SRID Calculation:**
```
SRID = 22287 + (meridian - 25) / 2

Examples:
- Lo 25: 22287 + (25 - 25) / 2 = 22287
- Lo 27: 22287 + (27 - 25) / 2 = 22289
- Lo 29: 22287 + (29 - 25) / 2 = 22290
- Lo 31: 22287 + (31 - 25) / 2 = 22291
- Lo 33: 22287 + (33 - 25) / 2 = 22293
```

---

## Validation & Warnings

### **Valid System Values**

✅ Accepted:
- `Lo 25`, `Lo 27`, `Lo 29`, `Lo 31`, `Lo 33`
- `Lo25`, `Lo27`, `Lo29`, `Lo31`, `Lo33`
- `25`, `27`, `29`, `31`, `33`
- Case-insensitive variations

### **Invalid System Values**

❌ Rejected with warning:
- `Lo 30` (not a valid zone)
- `Lo 32` (not a valid zone)
- `ABC` (no numeric value)
- Empty or missing

**Warning message:**
```
Invalid System value: "Lo 30". Expected Lo 25/27/29/31/33
Suggestion: Use valid Cape Lo zone: Lo 25, Lo 27, Lo 29, Lo 31, or Lo 33
```

### **Inconsistent Zones**

⚠️ Warning if points have different zones:

**Example:**
- Point 1: `Lo 31`
- Point 2: `Lo 29` ← Warning

**Warning message:**
```
Inconsistent Cape Lo zone: Expected Lo 31, found Lo 29
Suggestion: All points should use the same Cape Lo zone (Lo 31)
```

---

## Benefits

### **1. Automatic Zone Detection**
- No manual zone selection needed
- CSV contains its own coordinate system metadata
- Reduces user error

### **2. Data Integrity**
- Ensures coordinates match their declared system
- Validates consistency across all points
- Warns about mixed zones

### **3. Flexibility**
- Works with or without System column
- Falls back to project's default if column missing
- Supports multiple column name formats

### **4. Traceability**
- Console logs show detected zone
- SRID calculation is transparent
- Warnings highlight potential issues

---

## Files Modified

### **Frontend:**
- ✅ `app-frontend/src/utils/cadastral-csv.ts`
  - Added `extractCapeLoZone()` function
  - Added System column detection
  - Added consistency validation
  - Added `detectedCentralMeridian` to result

- ✅ `app-frontend/src/types/cadastral.ts`
  - Added `detectedCentralMeridian?: number` to `CSVValidationResult`

### **Backend (TODO):**
- ⏳ `app-backend/src/routes/csvImports.js`
  - Accept `detectedCentralMeridian` in request body
  - Use detected value if provided
  - Fall back to project's setting if not provided

---

## Testing

### **Test Case 1: CSV with System Column**

**Input CSV:**
```csv
Point,Y,X,Description,System
P1,97538.004,2247107.9,50mm Iron,Lo 31
P2,96271.08,2247869.9,50mm Iron,Lo 31
```

**Expected Output:**
```javascript
{
  isValid: true,
  detectedCentralMeridian: 31,
  summary: { totalPoints: 2, ... }
}
```

**Console:**
```
[CSV Parser] 🎯 Detected Cape Lo zone from System column: Lo 31
[CSV Parser] - 🎯 Detected Cape Lo Zone: Lo 31
[CSV Parser] - SRID will be: 22291
```

### **Test Case 2: CSV without System Column**

**Input CSV:**
```csv
Point,Y,X,Description
P1,97538.004,2247107.9,50mm Iron
P2,96271.08,2247869.9,50mm Iron
```

**Expected Output:**
```javascript
{
  isValid: true,
  detectedCentralMeridian: undefined,
  summary: { totalPoints: 2, ... }
}
```

**Console:**
```
[CSV Parser] System column detected: false
[CSV Parser] - ⚠️ No System column detected - will use project's default central meridian
```

### **Test Case 3: Inconsistent Zones**

**Input CSV:**
```csv
Point,Y,X,Description,System
P1,97538.004,2247107.9,50mm Iron,Lo 31
P2,96271.08,2247869.9,50mm Iron,Lo 29
```

**Expected Output:**
```javascript
{
  isValid: true,
  detectedCentralMeridian: 31,
  warnings: [
    {
      row: 2,
      field: 'system',
      message: 'Inconsistent Cape Lo zone: Expected Lo 31, found Lo 29',
      suggestion: 'All points should use the same Cape Lo zone (Lo 31)'
    }
  ],
  summary: { totalPoints: 2, ... }
}
```

---

## Next Steps

1. ✅ **Frontend parsing** - Complete
2. ✅ **Backend integration** - Complete
3. ⏳ **Frontend UI** - Display detected zone in import dialog
4. ⏳ **Validation** - Warn if detected zone differs from project's setting
5. ⏳ **Testing** - Test with all 5 Cape Lo zones

---

## Status

✅ **CSV System column parsing - FULLY IMPLEMENTED**

### **Frontend (Complete)**
- ✅ Parser detects and validates Cape Lo zone from System column
- ✅ Handles multiple formats (Lo 31, Lo31, 31)
- ✅ Validates consistency across all points
- ✅ Stores `detectedCentralMeridian` in validation result
- ✅ Passes detected value through to backend
- ✅ Comprehensive console logging

### **Backend (Complete)**
- ✅ CSV import routes accept `detectedCentralMeridian` parameter
- ✅ Uses detected value if provided (CSV takes precedence)
- ✅ Falls back to project's `central_meridian` if not provided
- ✅ Logs which source is being used (CSV vs project)
- ✅ Passes correct SRID to all `ST_MakePoint` operations

### **Console Output**

**With System column:**
```
[CSV Parser] 🎯 Detected Cape Lo zone from System column: Lo 31
[CSV Merge] 🎯 Using detected central meridian from CSV: Lo 31
[CSV Import] 🎯 Using central meridian from CSV System column: Lo 31
[CSV Import] Central meridian: Lo 31 (from CSV System column), SRID: 22291
```

**Without System column:**
```
[CSV Parser] System column detected: false
[CSV Merge] 📋 Using project's default central meridian: Lo 31
[CSV Import] 📋 Using central meridian from project setting: Lo 31
[CSV Import] Central meridian: Lo 31 (from project setting), SRID: 22291
```

### **Files Modified**

**Frontend:**
- ✅ `app-frontend/src/utils/cadastral-csv.ts` - System column parsing
- ✅ `app-frontend/src/types/cadastral.ts` - Added `detectedCentralMeridian` to result type
- ✅ `app-frontend/src/services/csvImports.ts` - Added parameter to `executeMerge`
- ✅ `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` - Pass through to backend

**Backend:**
- ✅ `app-backend/src/routes/csvImports.js` - Accept and use detected central meridian
- ✅ `app-backend/src/utils/capeLoSRID.js` - Already existed for SRID mapping

### **How It Works**

1. **CSV Upload** → Frontend parses System column
2. **Validation** → Extracts Cape Lo zone (25/27/29/31/33)
3. **Storage** → Stores in `pendingCSVData.detectedCentralMeridian`
4. **Merge Execution** → Passes to backend in request body
5. **Backend Logic** → Uses CSV value if present, else project default
6. **PostGIS Storage** → Applies correct SRID to all coordinate points

**Last Updated:** 2025-12-31
**Status:** ✅ Complete - System column parsing fully integrated from frontend to backend
