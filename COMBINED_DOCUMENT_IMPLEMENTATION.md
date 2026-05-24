# Combined Cadastral Document Implementation

## Problem Statement

The Surveyor General requires **Coordinate List** and **Calculations Part 1** to be presented as a **single combined document** with:
- Coordinate List: Pages 100-115 (or variable based on point count)
- Calculations Part 1: Pages 116+ (starting immediately after Coordinate List)

The challenge: Coordinate List needs to reference Calculations Part 1 pages in the "Calcs" column, but we're generating Coordinate List first.

## Solution: Two-Pass Pre-Calculation Strategy

### Pass 1: Pre-Calculate Page Assignments

1. **Generate Calculations Part 1** (temporary, starting at page 116 as placeholder)
   - This produces `adjustedCoordinates` with mean values for duplicates
   - Creates `calculationsPageLookup` mapping pointId → page number
   - Returns page count

2. **Calculate Coordinate List pagination**
   - Count pages needed: `ceil(points / 35)`
   - Determine end page: e.g., 100 + 15 = 115

3. **Calculate actual Calculations Part 1 start page**
   - `actualStartPage = coordListEndPage + 1` (e.g., 116)

4. **Update adjusted coordinates**
   - Offset all `calculationsPage` values by the difference
   - If Calcs was generated starting at 116, and needs to start at 116, offset = 0
   - If Calcs was generated starting at 1, and needs to start at 116, offset = 115

### Pass 2: Generate Final PDFs

5. **Generate Coordinate List** (pages 100-115)
   - Uses `adjustedCoordinates` with correct `calculationsPage` values
   - Calcs column automatically populated from `coord.calculationsPage`

6. **Generate Calculations Part 1** (pages 116+)
   - Already generated in Pass 1
   - Just need to renumber pages if necessary

## Implementation Options

### Option A: Separate PDFs (Current Approach) ✅ **RECOMMENDED**

**Pros:**
- Simple implementation
- No PDF merging library needed
- Each document can be regenerated independently
- User can print/submit separately if needed

**Cons:**
- User has to manage two files
- Surveyor General expects single document

**Implementation:**
```typescript
const result = await generator.generateCombinedDocument(surveyPoints, surveyorInfo)

// Download both PDFs
downloadPDF(result.coordinateListPDF, 'Coordinate-List-Pages-100-115.pdf')
downloadPDF(result.calculationsPart1PDF, 'Calculations-Part1-Pages-116-130.pdf')

// User manually combines them or prints in sequence
```

### Option B: PDF Merging with pdf-lib

**Pros:**
- Single PDF output
- Meets Surveyor General requirement exactly

**Cons:**
- Requires additional dependency (`pdf-lib`)
- More complex implementation
- Larger bundle size

**Implementation:**
```typescript
import { PDFDocument } from 'pdf-lib'

async function mergePDFs(coordListBlob, calcsPart1Blob, coordListEndPage) {
  const coordListPdf = await PDFDocument.load(await coordListBlob.arrayBuffer())
  const calcsPart1Pdf = await PDFDocument.load(await calcsPart1Blob.arrayBuffer())
  
  const mergedPdf = await PDFDocument.create()
  
  // Copy Coordinate List pages
  const coordPages = await mergedPdf.copyPages(coordListPdf, coordListPdf.getPageIndices())
  coordPages.forEach(page => mergedPdf.addPage(page))
  
  // Copy Calculations Part 1 pages (with renumbered headers)
  const calcsPages = await mergedPdf.copyPages(calcsPart1Pdf, calcsPart1Pdf.getPageIndices())
  calcsPages.forEach(page => mergedPdf.addPage(page))
  
  // Note: Page numbers are baked into the PDF, so renumbering requires
  // either regenerating with correct numbers OR overlaying new page numbers
  
  return await mergedPdf.save()
}
```

### Option C: Single-Pass Generation (Future Refactor)

Refactor both generators to accept an existing `jsPDF` instance and append pages:

```typescript
class CadastralCombinedDocumentGenerator {
  async generateCombinedDocument(surveyPoints, surveyorInfo) {
    const pdf = new jsPDF()
    
    // Pass 1: Pre-calculate
    const calcsPagination = this.calculateCalculationsPagination(surveyPoints, 116)
    const coordListPages = this.calculateCoordListPages(surveyPoints)
    const actualCalcsStart = 100 + coordListPages
    
    // Pass 2: Generate into single PDF
    this.coordListGen.generateInto(pdf, adjustedCoords, surveyorInfo, 100)
    this.calcPart1Gen.generateInto(pdf, surveyPoints, surveyorInfo, actualCalcsStart)
    
    return pdf
  }
}
```

**Pros:**
- True single PDF
- No merging needed
- Clean architecture

**Cons:**
- Requires refactoring both generators
- More invasive changes

## Recommended Approach

**Start with Option A** (separate PDFs) because:
1. ✅ Minimal code changes
2. ✅ No new dependencies
3. ✅ Works immediately
4. ✅ Can be enhanced later

**Future enhancement** (Option C):
- Refactor generators to support `generateInto(pdf, startPage)`
- Combine into single PDF natively

## Current Status

✅ **Implemented:**
- `SimplifiedCadastralCombinedGenerator` class
- Two-pass pre-calculation strategy
- Correct page number offsetting
- Adjusted coordinates with proper `calculationsPage` values

📋 **TODO:**
- Update `CadastralStandardView.vue` to use new generator
- Add UI for downloading both PDFs
- Add instructions for combining PDFs (or implement Option B/C)

## Testing Checklist

- [ ] Coordinate List starts at page 100
- [ ] Calculations Part 1 starts at `coordListEndPage + 1`
- [ ] Calcs column in Coordinate List shows correct page numbers
- [ ] All cross-references are accurate
- [ ] Field Book pages (E1, E2...) are consistent across documents
- [ ] Duplicate points show mean coordinates in Coordinate List
- [ ] Page numbering is sequential when combined
