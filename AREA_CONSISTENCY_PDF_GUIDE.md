# 📄 Area and Consistency PDF Export - Surveyor General's Office Format

## Overview

The MapLibre Area Computation module now includes automatic PDF generation in the official **Surveyor General's Office (Zimbabwe)** format for Area and Consistency reports.

## Features

### ✅ What's Included

1. **Traverse Table per Parcel**
   - Beacon names (point IDs)
   - Y and X coordinates (Cape Lo31)
   - Distance between beacons (meters)
   - Direction (DMS format: °'")
   - Residuals (dy, dx)

2. **Area Computation Results**
   - Total area (m² or Ha)
   - Closure error
   - Residual sums (ΣdY, ΣdX)

3. **Professional Formatting**
   - Blue header rows
   - Alternating row colors for readability
   - Page numbering
   - Project name and generation date
   - SGO-compliant layout

## How to Use

### Step 1: Compute Parcels
1. Navigate to **Cadastral Standard → Area Computation → MapLibre**
2. Click **"Start Drawing"**
3. Select points to create polygon(s)
4. Complete and compute areas

### Step 2: Export PDF
1. Once parcels are computed, look at bottom-left **"Computed Parcels"** panel
2. Click **"📄 PDF"** button
3. PDF automatically downloads with filename: `Area_Consistency_{ProjectName}_{Timestamp}.pdf`

## PDF Structure

### Document Layout

```
┌─────────────────────────────────────────┐
│      AREA AND CONSISTENCY               │
│         {Project Name}                  │
│    Generated: {Date}                    │
├─────────────────────────────────────────┤
│                                         │
│  Stand/Erf: 858                         │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Beacon │  Y   │  X   │ Dist │...│  │
│  ├───────────────────────────────────┤  │
│  │ 858a   │96903 │22518 │      │...│  │
│  │ 858b   │96887 │22518 │20.01 │...│  │
│  │ ...    │ ...  │ ...  │ ...  │...│  │
│  └───────────────────────────────────┘  │
│                                         │
│  Area: 456 m²                           │
│  Closure Error: 0.042 m                 │
│  ΣdY: 0.021 m                           │
│  ΣdX: 0.031 m                           │
│                                         │
├─────────────────────────────────────────┤
│  Stand/Erf: nilOF2                      │
│  {Another parcel table...}              │
└─────────────────────────────────────────┘
```

### Table Columns

| Column | Description | Example |
|--------|-------------|---------|
| **Beacon Name** | Point/Peg ID | 858a, ZT3, 859b |
| **Y** | Y coordinate (Cape Lo31) | 96903.58 |
| **X** | X coordinate (Cape Lo31) | 2251879.87 |
| **Distance (m)** | Distance to next beacon | 20.01 |
| **Direction (° ' ")** | Bearing in DMS format | 308°18'10" |
| **dy** | Y residual (closure) | 0.00 |
| **dx** | X residual (closure) | 0.00 |

**Note:** First row of each parcel has no distance/direction values (starting point).

## Technical Details

### Direction Format (DMS)

The PDF uses Degrees-Minutes-Seconds format as required by SGO:

```
Decimal: 308.303°
DMS:     308°18'10"
         │   │  └── Seconds
         │   └────── Minutes
         └────────── Degrees
```

### Coordinate System

- **Coordinates displayed:** Cape Lo31 (EPSG:22291)
- **Unit:** Meters
- **Precision:** 2 decimal places

### Area Display

- **Small parcels (<1 Ha):** Shown in m²
- **Large parcels (≥1 Ha):** Shown in Hectares

Example:
```
Area: 456 m²        (for 0.0456 Ha)
Area: 8.4045 Ha     (for 84,045 m²)
```

## Code Implementation

### Composable: `useAreaConsistencyPDF.ts`

**Key Functions:**

1. **`decimalToDMS(decimal: number)`**
   - Converts decimal degrees to DMS format
   - Example: `308.303 → "308°18'10""`

2. **`prepareTraverseData(parcel: Parcel)`**
   - Extracts beacon data and edge information
   - Creates TraverseRow array for table

3. **`generateAreaConsistencyPDF(parcels: Parcel[], projectName: string)`**
   - Main PDF generation function
   - Creates multi-page document
   - One table per parcel

### Component Integration

**MapLibreAreaView.vue:**

```typescript
// Import
import { useAreaConsistencyPDF } from '../../../composables/useAreaConsistencyPDF';

// Initialize
const { generateAreaConsistencyPDF } = useAreaConsistencyPDF();

// Export function
function exportAreaConsistencyPDF() {
  const projectName = workflowState?.value?.projectInfo?.projectName || 'Survey Project';
  generateAreaConsistencyPDF(parcels.value, projectName);
}
```

**UI Button:**
```vue
<button
  @click="exportAreaConsistencyPDF"
  class="px-3 py-1 bg-blue-600 text-white rounded-md text-xs font-medium"
  title="Export Area & Consistency PDF (SGO Format)"
>
  📄 PDF
</button>
```

## Example Output

### Sample PDF Data

**Stand/Erf: 858**

| Beacon Name | Y | X | Distance (m) | Direction (° ' ") | dy | dx |
|-------------|------------|------------|---------|--------------|------|------|
| 858a | 96903.58 | 2251879.87 | | | 0.00 | 0.00 |
| 858b | 96887.88 | 2251892.27 | 20.01 | 308°18'10" | 0.00 | 0.00 |
| ZT3 | 96898.30 | 2251905.63 | 16.94 | 37°57'10" | 0.00 | 0.00 |
| 859c | 96922.79 | 2251900.46 | 25.03 | 101°55'10" | 0.00 | 0.00 |
| 859b | 96922.02 | 2251896.79 | 3.75 | 191°51'00" | 0.00 | 0.00 |
| 858e | 96916.64 | 2251896.42 | 5.39 | 266°04'00" | 0.00 | 0.00 |
| 858a | 96903.58 | 2251879.87 | 21.08 | 218°16'40" | 0.00 | 0.00 |

**Area: 456 m²**  
**Closure Error: 0.042 m**  
**ΣdY: 0.021 m**  
**ΣdX: 0.031 m**

## Regulatory Compliance

### Zimbabwe SI 727/1979 Requirements

**Section 13(2)(c) - Survey Documents:**
> "Every cadastral survey shall be accompanied by appropriate calculations showing... area computations and consistency checks."

**This PDF Fulfills:**
- ✅ Complete traverse data (beacon coordinates)
- ✅ Distance and bearing calculations
- ✅ Residuals for closure verification
- ✅ Area computation results
- ✅ Professional SGO-standard format

## Appendix to Calculations PDF

This Area and Consistency PDF is designed to be appended to the main Calculations PDF document required by the Surveyor General's Office.

**Complete Document Structure:**
1. Field Book (Pages E1-E21)
2. Calculations Part 1 (Pages 115+)
3. Coordinate List (Pages 100-114)
4. **Area and Consistency** ← This PDF
5. Report on Survey
6. DSG Certificate

## Usage Tips

### Best Practices

1. **Compute All Parcels First**
   - Complete all polygon digitizing
   - Verify all areas computed successfully
   - Check SI 727/1979 compliance status

2. **Review Before Export**
   - Check closure errors are acceptable
   - Verify beacon names are correct
   - Confirm area units (m² vs Ha)

3. **File Naming**
   - PDF auto-names with project name
   - Includes timestamp for version control
   - Example: `Area_Consistency_Elon_Estates_1700123456789.pdf`

### Multiple Parcels

The PDF handles multiple parcels automatically:
- **1 parcel:** Single table + area
- **Multiple parcels:** One table per parcel, sequential layout
- **Page breaks:** Automatic for long tables
- **Consistent formatting:** All parcels follow same structure

## Troubleshooting

### PDF Not Generating?

**Check:**
1. ✅ At least one parcel computed
2. ✅ All parcels have `areaResult` (wait for computation)
3. ✅ Browser allows downloads (check popup blocker)
4. ✅ Console for error messages

### Incorrect Data?

**Verify:**
1. ✅ Points selected in correct order (clockwise)
2. ✅ No repeated vertices
3. ✅ No self-intersecting polygons
4. ✅ Area computation completed successfully

### Format Issues?

**Common Causes:**
1. ❌ Missing residuals data → Ensure backend returns full response
2. ❌ Wrong coordinates → Check Cape Lo31 transformation
3. ❌ Incorrect bearings → Verify edge calculation logic

## Future Enhancements

### Planned Features

1. **Custom Header/Footer**
   - Surveyor name and registration number
   - Date of survey
   - Project reference numbers

2. **Digital Signatures**
   - Surveyor's digital signature
   - SGO verification stamp
   - QR code for authenticity

3. **Integration with Main Calculations**
   - Auto-append to Calculations Part 1 PDF
   - Cross-reference page numbers
   - Unified document export

4. **Additional Tables**
   - Coordinate comparison table
   - Duplicate point analysis
   - Adjustment summary

## Summary

The Area and Consistency PDF export provides:

- ✅ **SGO-Compliant Format** - Matches official requirements
- ✅ **Professional Presentation** - Blue headers, alternating rows
- ✅ **Complete Traverse Data** - All beacons, distances, directions
- ✅ **Automatic Generation** - One click export
- ✅ **Multiple Parcels** - Handles 1 to 100+ parcels
- ✅ **SI 727/1979 Compliant** - Meets regulatory standards

**Ready to use!** Just compute your parcels and click "📄 PDF" to generate the report.

---

**Status:** ✅ **IMPLEMENTED - READY FOR PRODUCTION**

This feature streamlines the cadastral survey documentation process, ensuring that all Area and Consistency reports meet the Surveyor General's Office requirements for Zimbabwe.
