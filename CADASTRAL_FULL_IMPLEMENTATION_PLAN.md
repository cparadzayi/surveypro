# Cadastral Standard Module - Full Implementation Plan

## **Confirmed Requirements**

1. ✅ **Field Book pages:** E1, E2, E3... (keep current format)
2. ✅ **Calcs column:** References Calculations Part 1 page where coordinate value is sourced
3. ✅ **Full Calculations structure:** Implement all sections from template

---

## **Document Structure**

### **1. Field Book (Separate Document)**
- **Pages:** E1, E2, E3, ..., E21 (for 541 points)
- **Points per page:** 27
- **Format:** Electronic Field Book with coordinates (3 decimal precision)

### **2. Coordinate List (Pages 100+)**
- **Starting page:** 100
- **Points per page:** 35
- **Columns:**
  - **F/B** - Field Book reference (E1, E2, E3...)
  - **Calcs** - Calculations Part 1 page reference (115, 116, 117...)
  - **Beacons/Stations** - Point ID
  - **Y** - Northing coordinate (Lo 29°)
  - **X** - Easting coordinate (Lo 29°)
  - **Description** - Point description
  - **F/P** - Found/Placed status
  - **F.B** - Additional Field Book reference

**Groups (in order):**
1. TRIG BEACONS
2. WORKING STATIONS
3. FOUND BEACONS
4. PLACED BEACONS

### **3. Calculations Part 1 (Appended after Coordinate List)**
- **Starting page:** 115+ (after Coordinate List ends)
- **Sections:**
  1. **Working Stations Fixed by GPS**
  2. **Found Beacons Fixed by GPS**
  3. **Data Polars** (SR date/time)
  4. **Coordinate Comparison** (This Survey vs Previous Survey)
  5. **Calculation of New Points** (Line running calculations)
  6. **Duplicate Point Analysis** (if applicable)

---

## **Page Numbering Logic**

### **Example for 541 Points:**

**Coordinate List:**
- 541 points ÷ 35 points/page = 15.46 → **16 pages**
- Page range: **100 to 115**

**Calculations Part 1:**
- Starts at page **116**
- Multiple sections, variable length
- Example: Pages 116-130 (15 pages)

**Total Combined PDF:** Pages 100-130 (31 pages)

---

## **Implementation Phases**

### **Phase 1: Coordinate List Generator** ✅ Priority

Create `src/utils/coordinate-list.ts`

```typescript
export class CoordinateListGenerator {
  /**
   * Generate Coordinate List PDF (pages 100+)
   */
  async generateCoordinateListPDF(
    surveyPoints: SurveyPoint[],
    calculationsResults: CalculationsResults,
    surveyorInfo: SurveyorInfo
  ): Promise<{ pdf: jsPDF, pageCount: number }> {
    const pdf = new jsPDF(this.options);
    const startPage = 100;
    
    // Group points by type
    const groupedPoints = this.groupPointsByType(surveyPoints);
    
    // Generate pages for each group
    let currentPage = startPage;
    
    // 1. TRIG BEACONS
    currentPage = this.generatePointGroup(pdf, groupedPoints.trig, 'TRIG BEACONS', currentPage);
    
    // 2. WORKING STATIONS
    currentPage = this.generatePointGroup(pdf, groupedPoints.working, 'WORKING STATIONS', currentPage);
    
    // 3. FOUND BEACONS
    currentPage = this.generatePointGroup(pdf, groupedPoints.found, 'FOUND BEACONS', currentPage);
    
    // 4. PLACED BEACONS
    currentPage = this.generatePointGroup(pdf, groupedPoints.placed, 'PLACED BEACONS', currentPage);
    
    const pageCount = currentPage - startPage;
    return { pdf, pageCount };
  }
  
  /**
   * Group points by type based on description and status
   */
  private groupPointsByType(points: SurveyPoint[]): GroupedPoints {
    return {
      trig: points.filter(p => this.isTrigBeacon(p)),
      working: points.filter(p => this.isWorkingStation(p)),
      found: points.filter(p => this.isFoundBeacon(p)),
      placed: points.filter(p => this.isPlacedBeacon(p))
    };
  }
  
  /**
   * Generate a group of points with proper F/B and Calcs columns
   */
  private generatePointGroup(
    pdf: jsPDF,
    points: SurveyPoint[],
    groupName: string,
    startPage: number
  ): number {
    const pointsPerPage = 35;
    const totalPages = Math.ceil(points.length / pointsPerPage);
    
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const currentPage = startPage + pageIndex;
      pdf.addPage();
      
      // Page header
      this.generatePageHeader(pdf, currentPage);
      
      // Group header (first page only)
      if (pageIndex === 0) {
        this.generateGroupHeader(pdf, groupName);
      }
      
      // Table
      const pagePoints = points.slice(pageIndex * pointsPerPage, (pageIndex + 1) * pointsPerPage);
      this.generatePointTable(pdf, pagePoints, currentPage);
    }
    
    return startPage + totalPages;
  }
  
  /**
   * Generate point table with F/B and Calcs columns
   */
  private generatePointTable(pdf: jsPDF, points: SurveyPoint[], currentPage: number): void {
    const lookupStore = useSurveyLookupStore();
    
    points.forEach((point, index) => {
      // F/B column - Field Book page reference
      const fieldBookPage = lookupStore.fieldBookPageLookup[point.pointId] || '-';
      
      // Calcs column - Calculations Part 1 page reference
      const calcsPage = this.getCalculationsPageForPoint(point);
      
      // Render row
      this.renderPointRow(pdf, {
        fb: fieldBookPage,
        calcs: calcsPage,
        station: point.pointId,
        y: point.y.toFixed(2),
        x: point.x.toFixed(2),
        description: point.description,
        fp: point.status,
        fb2: fieldBookPage
      });
    });
  }
  
  /**
   * Determine which Calculations page a point's coordinate comes from
   */
  private getCalculationsPageForPoint(point: SurveyPoint): string {
    // Logic to determine which Calculations page contains this point's value
    // This depends on the Calculations structure
    // For now, return placeholder
    return '116'; // Will be updated after Calculations is generated
  }
}
```

---

### **Phase 2: Full Calculations Part 1 Structure** ✅ Priority

Expand `src/utils/calculations-part1.ts`

```typescript
export class CalculationsPart1Generator {
  /**
   * Generate complete Calculations Part 1 PDF
   */
  async generateCalculationsPart1PDF(
    surveyPoints: SurveyPoint[],
    surveyorInfo: SurveyorInfo,
    startPage: number = 116
  ): Promise<{ pdf: jsPDF, pageCount: number, pointPageMap: Record<string, number> }> {
    const pdf = new jsPDF(this.options);
    let currentPage = startPage;
    const pointPageMap: Record<string, number> = {};
    
    // 1. Working Stations Fixed by GPS
    const workingStations = this.filterWorkingStations(surveyPoints);
    currentPage = this.generateWorkingStationsGPS(pdf, workingStations, currentPage, pointPageMap);
    
    // 2. Found Beacons Fixed by GPS
    const foundBeacons = this.filterFoundBeacons(surveyPoints);
    currentPage = this.generateFoundBeaconsGPS(pdf, foundBeacons, currentPage, pointPageMap);
    
    // 3. Data Polars
    const polarData = this.extractPolarData(surveyPoints);
    currentPage = this.generateDataPolars(pdf, polarData, currentPage);
    
    // 4. Coordinate Comparison
    const comparisonData = this.prepareCoordinateComparison(surveyPoints);
    currentPage = this.generateCoordinateComparison(pdf, comparisonData, currentPage);
    
    // 5. Calculation of New Points
    const newPoints = this.filterNewPoints(surveyPoints);
    currentPage = this.generateNewPointsCalculation(pdf, newPoints, currentPage, pointPageMap);
    
    // 6. Duplicate Point Analysis (if applicable)
    const duplicates = this.findDuplicatePoints(surveyPoints);
    if (duplicates.length > 0) {
      currentPage = this.generateDuplicateAnalysis(pdf, duplicates, currentPage, pointPageMap);
    }
    
    const pageCount = currentPage - startPage;
    return { pdf, pageCount, pointPageMap };
  }
  
  /**
   * Section 1: Working Stations Fixed by GPS
   */
  private generateWorkingStationsGPS(
    pdf: jsPDF,
    stations: SurveyPoint[],
    startPage: number,
    pointPageMap: Record<string, number>
  ): number {
    pdf.addPage();
    const currentPage = startPage;
    
    // Page number
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(`${currentPage}`, pdf.internal.pageSize.getWidth() - 30, 20);
    
    // Section title
    pdf.setFontSize(14);
    pdf.text('CALCULATIONS', 20, 30);
    
    pdf.setFontSize(12);
    pdf.text('WORKING STATIONS FIXED BY GPS', 20, 45);
    
    // Table
    let yPos = 60;
    pdf.setFontSize(10);
    pdf.text('Station', 20, yPos);
    pdf.text('Y', 60, yPos);
    pdf.text('X', 100, yPos);
    pdf.text('F/B', 140, yPos);
    
    yPos += 10;
    pdf.setFont('helvetica', 'normal');
    
    stations.forEach(station => {
      pdf.text(station.pointId, 20, yPos);
      pdf.text(station.y.toFixed(3), 60, yPos);
      pdf.text(station.x.toFixed(3), 100, yPos);
      
      const lookupStore = useSurveyLookupStore();
      const fbPage = lookupStore.fieldBookPageLookup[station.pointId] || '-';
      pdf.text(fbPage, 140, yPos);
      
      // Map this point to this page
      pointPageMap[station.pointId] = currentPage;
      
      yPos += 8;
    });
    
    return currentPage + 1;
  }
  
  /**
   * Section 2: Found Beacons Fixed by GPS
   */
  private generateFoundBeaconsGPS(
    pdf: jsPDF,
    beacons: SurveyPoint[],
    startPage: number,
    pointPageMap: Record<string, number>
  ): number {
    // Similar structure to Working Stations
    // Map each beacon to its page
    return startPage + 1;
  }
  
  /**
   * Section 3: Data Polars (SR date/time)
   */
  private generateDataPolars(
    pdf: jsPDF,
    polarData: PolarObservation[],
    startPage: number
  ): number {
    // Generate polar observation tables
    return startPage + Math.ceil(polarData.length / 10);
  }
  
  /**
   * Section 4: Coordinate Comparison
   */
  private generateCoordinateComparison(
    pdf: jsPDF,
    comparisonData: CoordinateComparison[],
    startPage: number
  ): number {
    pdf.addPage();
    const currentPage = startPage;
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(`${currentPage}`, pdf.internal.pageSize.getWidth() - 30, 20);
    
    pdf.setFontSize(14);
    pdf.text('COORDINATE COMPARISON', 20, 30);
    
    // Table with "This Survey" vs "Previous Survey" columns
    // Calculate dY and dX differences
    
    return currentPage + 1;
  }
  
  /**
   * Section 5: Calculation of New Points (Line running)
   */
  private generateNewPointsCalculation(
    pdf: jsPDF,
    newPoints: NewPointCalculation[],
    startPage: number,
    pointPageMap: Record<string, number>
  ): number {
    // Generate line running calculations
    // Format: Line running 84d - Sec2N, Direction 300-20-50
    // Show POINT, Y, X, DIST columns
    
    // Map each calculated point to its page
    return startPage + Math.ceil(newPoints.length / 15);
  }
  
  /**
   * Section 6: Duplicate Point Analysis
   */
  private generateDuplicateAnalysis(
    pdf: jsPDF,
    duplicates: DuplicateAnalysis[],
    startPage: number,
    pointPageMap: Record<string, number>
  ): number {
    // Existing duplicate analysis logic
    // Map each duplicate point to its page
    return startPage + duplicates.length;
  }
}
```

---

### **Phase 3: Merge & Cross-Reference Update** ✅ Priority

Create `src/utils/cadastral-pdf-merger.ts`

```typescript
export class CadastralPDFMerger {
  /**
   * Generate complete Coordinate List + Calculations Part 1 combined PDF
   */
  async generateCombinedPDF(
    surveyPoints: SurveyPoint[],
    surveyorInfo: SurveyorInfo
  ): Promise<Blob> {
    // Step 1: Generate Calculations Part 1 (in memory, not saved)
    const calculationsGen = new CalculationsPart1Generator();
    const calculationsResult = await calculationsGen.generateCalculationsPart1PDF(
      surveyPoints,
      surveyorInfo,
      116 // Temporary start page
    );
    
    // Step 2: Calculate Coordinate List page count
    const coordinateListGen = new CoordinateListGenerator();
    const coordListPageCount = coordinateListGen.calculatePageCount(surveyPoints);
    
    // Coordinate List: pages 100 to (100 + coordListPageCount - 1)
    // Calculations Part 1: starts at (100 + coordListPageCount)
    const calculationsStartPage = 100 + coordListPageCount;
    
    // Step 3: Regenerate Calculations Part 1 with correct page numbers
    const finalCalculations = await calculationsGen.generateCalculationsPart1PDF(
      surveyPoints,
      surveyorInfo,
      calculationsStartPage
    );
    
    // Step 4: Generate Coordinate List with correct Calcs column references
    const coordinateList = await coordinateListGen.generateCoordinateListPDF(
      surveyPoints,
      finalCalculations.pointPageMap, // Use this to populate Calcs column
      surveyorInfo
    );
    
    // Step 5: Merge PDFs
    const mergedPDF = this.mergePDFs(coordinateList.pdf, finalCalculations.pdf);
    
    return new Blob([mergedPDF.output('blob')], { type: 'application/pdf' });
  }
  
  /**
   * Merge two jsPDF documents
   */
  private mergePDFs(pdf1: jsPDF, pdf2: jsPDF): jsPDF {
    // Get pages from pdf2 and append to pdf1
    const pageCount = pdf2.internal.pages.length - 1;
    
    for (let i = 1; i <= pageCount; i++) {
      pdf1.addPage();
      // Copy content from pdf2 page i to pdf1
      // This requires accessing internal jsPDF structures
    }
    
    return pdf1;
  }
}
```

---

## **Data Structures**

### **Point Grouping Logic**

```typescript
interface GroupedPoints {
  trig: SurveyPoint[];
  working: SurveyPoint[];
  found: SurveyPoint[];
  placed: SurveyPoint[];
}

function isTrigBeacon(point: SurveyPoint): boolean {
  const desc = point.description.toLowerCase();
  return desc.includes('trig') || desc.includes('town survey mark');
}

function isWorkingStation(point: SurveyPoint): boolean {
  const status = point.status.toLowerCase();
  return status.includes('working station');
}

function isFoundBeacon(point: SurveyPoint): boolean {
  const status = point.status.toLowerCase();
  return status === 'f' || status.includes('found');
}

function isPlacedBeacon(point: SurveyPoint): boolean {
  const status = point.status.toLowerCase();
  return status === 'p' || status.includes('placed') || status.includes('peg');
}
```

### **Calculations Results Interface**

```typescript
interface CalculationsResults {
  workingStations: GPSFixedPoint[];
  foundBeacons: GPSFixedPoint[];
  polarObservations: PolarObservation[];
  coordinateComparisons: CoordinateComparison[];
  newPoints: NewPointCalculation[];
  duplicateAnalyses: DuplicateAnalysis[];
  pointPageMap: Record<string, number>; // pointId → Calculations page number
}

interface GPSFixedPoint {
  pointId: string;
  y: number;
  x: number;
  fieldBookPage: string;
  calculationsPage: number;
}

interface PolarObservation {
  station: string;
  date: string;
  time: string;
  observations: {
    pointId: string;
    y: number;
    x: number;
  }[];
}

interface CoordinateComparison {
  pointId: string;
  thisSurvey: { y: number; x: number };
  previousSurvey: { y: number; x: number };
  differences: { dy: number; dx: number };
}

interface NewPointCalculation {
  line: string; // e.g., "84d - Sec2N"
  direction: string; // e.g., "300-20-50"
  points: {
    pointId: string;
    y: number;
    x: number;
    distance: number;
  }[];
  calculationsPage: number;
}
```

---

## **UI Workflow Updates**

### **Current Workflow:**
```
Step 1: Import CSV
Step 2: Generate Field Book
Step 3: Generate Calculations Part 1
Step 4: Generate Coordinate List
```

### **Updated Workflow:**
```
Step 1: Import CSV
Step 2: Generate Field Book (E1-E21)
Step 3: Generate Calculations Part 1 + Coordinate List (Combined)
  ↓
  - Performs calculations
  - Generates Coordinate List (pages 100+)
  - Appends Calculations Part 1 (pages 115+)
  - Updates cross-references
  ↓
Step 4: Generate Report on Survey
```

---

## **Implementation Checklist**

### **Phase 1: Coordinate List** (Priority 1)
- [ ] Create `coordinate-list.ts` generator
- [ ] Implement point grouping logic
- [ ] Generate table with F/B and Calcs columns
- [ ] Handle pagination (35 points per page)
- [ ] Start at page 100

### **Phase 2: Full Calculations Structure** (Priority 2)
- [ ] Expand `calculations-part1.ts`
- [ ] Section 1: Working Stations Fixed by GPS
- [ ] Section 2: Found Beacons Fixed by GPS
- [ ] Section 3: Data Polars
- [ ] Section 4: Coordinate Comparison
- [ ] Section 5: Calculation of New Points
- [ ] Section 6: Duplicate Point Analysis (existing)
- [ ] Track pointPageMap for cross-referencing

### **Phase 3: Merge Logic** (Priority 3)
- [ ] Create `cadastral-pdf-merger.ts`
- [ ] Calculate Coordinate List page count
- [ ] Determine Calculations Part 1 start page
- [ ] Generate both PDFs with correct page numbers
- [ ] Update Calcs column in Coordinate List
- [ ] Merge into single PDF

### **Phase 4: UI Updates** (Priority 4)
- [ ] Update button labels
- [ ] Combine "Generate Calculations Part 1" and "Generate Coordinate List"
- [ ] Show progress indicator during generation
- [ ] Display page count summary

### **Phase 5: Testing** (Priority 5)
- [ ] Test with 541 points dataset
- [ ] Verify page numbering
- [ ] Verify cross-references (F/B and Calcs columns)
- [ ] Test with different point counts
- [ ] Test with/without duplicates

---

## **Next Steps**

1. **Start with Coordinate List Generator** - This is the foundation
2. **Expand Calculations Part 1** - Add all sections from template
3. **Implement Merge Logic** - Combine both PDFs with correct page numbers
4. **Update UI** - Streamline workflow
5. **Test thoroughly** - Verify all cross-references

---

## **Questions to Address**

1. **Polar Data Source:** Where do we get polar observation data (SR date/time)?
2. **Coordinate Comparison:** Do we have previous survey data to compare against?
3. **Line Running Calculations:** How do we determine which points are calculated via line running?
4. **GPS Fixed Points:** How do we identify which points are GPS-fixed vs calculated?

---

## **Estimated Complexity**

- **Coordinate List Generator:** Medium (2-3 days)
- **Full Calculations Structure:** High (4-5 days)
- **Merge Logic:** Medium (2-3 days)
- **UI Updates:** Low (1 day)
- **Testing & Refinement:** Medium (2-3 days)

**Total Estimated Time:** 11-15 days

---

## **Status**

📋 **Planning Complete**  
⏳ **Implementation Pending**  
🎯 **Ready to Start Phase 1**
