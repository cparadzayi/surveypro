# Calculations Part 2 - PDF Download Feature

## Overview
Added PDF generation capability for Calculations Part 2 (Area Computations) with automatic page numbering that continues from Calculations Part 1.

## Implementation

### Button Location
- **Position**: Next to "🧮 Compute All Areas" button in the Defined Parcels section
- **Label**: "📄 Download Areas - PDF"
- **Visibility**: Only appears after areas have been computed
- **State**: Disabled during PDF generation (shows "Generating...")

### Page Numbering Logic

The PDF automatically determines the starting page number:

```typescript
// Get starting page from Calculations Part 1
const calcsPart1 = workflowState?.documents?.calculationsPart1;
let startingPage = 116; // Default fallback

if (calcsPart1?.pageCount) {
  // Continue from last page of Calculations Part 1 + 1
  startingPage = calcsPart1.startingPage + calcsPart1.pageCount;
}
```

**Example:**
- Calculations Part 1: Pages 115-125 (11 pages)
- Calculations Part 2: Starts at Page 126

### PDF Content Structure

#### Title Page
- **Title**: "CALCULATIONS PART 2"
- **Subtitle**: "AREA COMPUTATIONS"
- **Metadata**:
  - Coordinate System (e.g., "Lo 29° (EPSG:20937)")
  - Date Generated
  - Total Parcels

#### For Each Parcel

**1. Parcel Header**
- Number and designation (e.g., "1. LOT 1")

**2. Area Information**
- **Area**: Displayed in m² or hectares (based on 10,000 m² threshold)
- **Centroid**: Y and X coordinates (2 decimal places)
- **Consistency Check**: ΣdY and ΣdX residuals (2 decimal places)

**3. Boundary Points Table**

| Point | Y (m) | X (m) | Distance (m) |
|-------|-------|-------|--------------|
| P1    | 97538.12 | 2247108.45 | 125.50 |
| P2    | 97663.45 | 2247110.23 | 98.75 |
| ...   | ...   | ...   | ...   |

- **Point**: Point ID from coordinate list
- **Y (m)**: Westing coordinate (2 decimals)
- **X (m)**: Southing coordinate (2 decimals)
- **Distance (m)**: Distance to next boundary point (2 decimals)

### PDF Features

**1. Automatic Pagination**
- Detects when content exceeds page height
- Adds new pages automatically
- Repeats table headers on new pages
- Maintains consistent page numbering

**2. Professional Formatting**
- A4 portrait orientation
- 20mm margins
- Hierarchical font sizes:
  - Title: 16pt bold
  - Subtitle: 14pt bold
  - Section headers: 12pt bold
  - Body text: 10pt normal
  - Table data: 9pt normal
- Page numbers centered at bottom

**3. Data Precision**
- Coordinates: 2 decimal places (centimeter precision)
- Areas < 10,000 m²: Nearest integer
- Areas ≥ 10,000 m²: 4 decimal places (hectares)
- Distances: 2 decimal places
- Residuals: 2 decimal places

### File Naming Convention

```
Calculations_Part2_Areas_Page{startingPage}.pdf
```

**Examples:**
- `Calculations_Part2_Areas_Page126.pdf` (if Calcs Part 1 ends at 125)
- `Calculations_Part2_Areas_Page116.pdf` (default if no Calcs Part 1)

### Success Message

After generation, displays:
```
✅ Calculations Part 2 PDF generated successfully!

Starting Page: 126
Total Pages: 3
Parcels: 5
```

## User Workflow

### Step-by-Step Process

1. **Define Parcels** - Add boundary points for each parcel
2. **Compute Areas** - Click "🧮 Compute All Areas"
3. **Review Results** - Check area, centroid, and consistency
4. **Download PDF** - Click "📄 Download Areas - PDF"
5. **PDF Downloads** - File saved to browser's download folder

### Prerequisites

- At least one parcel must be defined
- All parcels must have computed areas
- Calculations Part 1 should be completed (for proper page numbering)

## Technical Details

### Dependencies

```typescript
import jsPDF from 'jspdf';
```

### State Management

```typescript
const isGeneratingPDF = ref(false);  // Loading state
const hasComputedAreas = computed(() => 
  parcels.value.some(p => p.areaResult !== undefined)
);
```

### Data Structure

```typescript
interface Parcel {
  designation: string;
  points: ParcelPoint[];
  areaResult?: {
    area: {
      signed_m2: number;
      abs_m2: number;
      display: {
        hectares: number;
        unit: 'ha';
      } | {
        square_meters: number;
        unit: 'm2';
      };
    };
    centroid: { y: number; x: number; };
    residuals?: {
      sumDy: number;
      sumDx: number;
      edges: Array<{
        distance: number;
        // ... other edge properties
      }>;
    };
  };
}
```

### Error Handling

1. **No Computed Areas**: Alert user to compute areas first
2. **PDF Generation Error**: Catch and display error message
3. **Missing Calculations Part 1**: Uses default page 116

## Integration with Workflow

### Document Continuity

The PDF maintains document continuity in the cadastral workflow:

```
1. Field Book          → Pages E1-E21
2. Calculations Part 1 → Pages 115-125
3. Coordinate List     → Pages 100-114
4. Calculations Part 2 → Pages 126-128  ← This feature
5. Report on Survey    → Pages 129+
```

### Workflow State

The generated PDF metadata could be stored in workflow state:

```typescript
workflowState.documents.calculationsPart2 = {
  metadata: {
    title: 'Calculations Part 2: Area Computations',
    dateGenerated: new Date(),
    startingPage: 126,
    pageCount: 3
  },
  parcels: [...],
  pdf: blob
};
```

## Future Enhancements

1. **Diagram Generation**: Include parcel boundary diagrams
2. **Bearing Information**: Add bearing columns to boundary table
3. **Area Comparison**: Compare computed vs. title deed areas
4. **Closure Analysis**: Show misclosure and adjustment details
5. **Combined PDF**: Merge with Calculations Part 1 into single document
6. **Custom Templates**: Allow surveyor-specific letterheads
7. **Digital Signatures**: Add surveyor's digital signature
8. **Export Formats**: Support CSV, Excel, or DXF exports

## Benefits

1. **Professional Output**: Formatted for official submission
2. **Page Continuity**: Seamless integration with other documents
3. **Complete Documentation**: All parcel data in one PDF
4. **Audit Trail**: Includes computation metadata
5. **Easy Sharing**: Standard PDF format for clients/authorities

## Testing Checklist

- [ ] Single parcel PDF generation
- [ ] Multiple parcels PDF generation
- [ ] Page numbering continuation from Calcs Part 1
- [ ] Default page numbering (no Calcs Part 1)
- [ ] Table pagination across multiple pages
- [ ] Large datasets (20+ parcels)
- [ ] Special characters in parcel designations
- [ ] Missing residuals data
- [ ] Browser download functionality
- [ ] File naming convention

## Notes

- PDF generation is client-side (no server required)
- Uses jsPDF library (already in dependencies)
- Coordinates use Zimbabwe P(Y,X) convention
- All measurements in meters
- Compatible with all modern browsers
