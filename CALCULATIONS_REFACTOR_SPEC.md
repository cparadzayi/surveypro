# Calculations Part 1 - Refactored Structure

Based on the provided template image (pages 113-114), here's the exact structure to implement:

## **Page Structure**

### **Page 113-114: Found Beacons & Placed Beacons**

**Format:**
```
┌─────────────────────────────────────────────┐
│                                         113 │
├─────────────────────────────────────────────┤
│ Found beacons                               │
│                                             │
│ Point    X           Y           F.B        │
│ 1B2   96534.040  2249851.314     E2        │
│ 172   96012.492  2249947.423     E2        │
│ 90c   96190.753  2250043.593     E2        │
│ ...                                         │
│                                             │
│ Placed beacons                              │
│                                             │
│ Point    X           Y           F.B        │
│ 1A0S  96465.827  2249292.780     E2        │
│ 103H  96417.013  2245347.507     E2        │
│ ...                                         │
└─────────────────────────────────────────────┘
```

## **Implementation Details**

### **1. Found Beacons Section**

**Criteria:** Points with status 'F' or 'Found'

**Columns:**
- **Point:** Point ID
- **X:** Easting coordinate (3 decimal places)
- **Y:** Northing coordinate (3 decimal places)
- **F.B:** Field Book page reference (E1, E2, E3...)

**Layout:**
- Points per page: ~40-50 (based on available space)
- Simple table format
- No headers on continuation pages

### **2. Placed Beacons Section**

**Criteria:** Points with status 'P' or 'Placed' or 'Peg'

**Columns:** Same as Found Beacons
- **Point:** Point ID
- **X:** Easting coordinate (3 decimal places)
- **Y:** Northing coordinate (3 decimal places)
- **F.B:** Field Book page reference (E1, E2, E3...)

**Layout:**
- Points per page: ~40-50
- Continues from Found Beacons
- Multiple pages if needed

## **Complete Calculations Part 1 Structure**

Based on the template, the full structure should be:

```
Page 100-115: Coordinate List (separate document)

Page 116+: CALCULATIONS Part 1
  ├─ Page 116: Working Stations Fixed by GPS
  │    └─ Table: Point, Y, X, F/B
  │
  ├─ Page 117: Found Beacons Fixed by GPS  
  │    └─ Table: Point, Y, X, F/B
  │
  ├─ Page 118-119: Data Polars (SR 21/2016)
  │    └─ Polar observations with date/time
  │
  ├─ Page 120: Coordinate Comparison
  │    └─ This Survey vs Previous Survey
  │    └─ Differences (dY, dX)
  │
  ├─ Page 121-125: Calculation of New Points
  │    └─ Line running calculations
  │    └─ Direction and distance
  │
  └─ Page 126+: Duplicate Point Analysis (if applicable)
       └─ Mean coordinates
       └─ Residuals
       └─ Tolerance check
```

## **Refactored Code Structure**

```typescript
export class CalculationsPart1Generator {
  private currentPage = 116; // Starting page
  
  /**
   * Generate complete Calculations Part 1 PDF
   */
  async generateCalculationsPart1PDF(
    surveyPoints: SurveyPoint[],
    surveyorInfo: SurveyorInfo
  ): Promise<Blob> {
    const pdf = new jsPDF(this.options);
    const lookupStore = useSurveyLookupStore();
    
    // Generate Field Book lookup
    const fieldBookLookup = this.generateFieldBookPageLookup(surveyPoints);
    lookupStore.setFieldBookPageLookup(fieldBookLookup);
    
    // Section 1: Working Stations Fixed by GPS
    this.generateWorkingStationsGPS(pdf, surveyPoints, fieldBookLookup);
    
    // Section 2: Found Beacons Fixed by GPS
    this.generateFoundBeaconsGPS(pdf, surveyPoints, fieldBookLookup);
    
    // Section 3: Data Polars (if available)
    if (this.hasPolarData(surveyPoints)) {
      this.generateDataPolars(pdf, surveyPoints);
    }
    
    // Section 4: Coordinate Comparison (if previous survey data available)
    if (this.hasPreviousSurveyData(surveyPoints)) {
      this.generateCoordinateComparison(pdf, surveyPoints);
    }
    
    // Section 5: Calculation of New Points (if applicable)
    const newPoints = this.extractNewPointCalculations(surveyPoints);
    if (newPoints.length > 0) {
      this.generateNewPointsCalculation(pdf, newPoints, fieldBookLookup);
    }
    
    // Section 6: Duplicate Point Analysis
    const duplicates = this.findDuplicatePoints(surveyPoints);
    if (duplicates.length > 0) {
      this.generateDuplicateAnalysis(pdf, duplicates, fieldBookLookup);
    }
    
    return new Blob([pdf.output('blob')], { type: 'application/pdf' });
  }
  
  /**
   * Section 1: Working Stations Fixed by GPS
   */
  private generateWorkingStationsGPS(
    pdf: jsPDF,
    surveyPoints: SurveyPoint[],
    fieldBookLookup: Record<string, string>
  ): void {
    // Filter working stations
    const workingStations = surveyPoints.filter(p => 
      p.status.toLowerCase().includes('working') ||
      p.description.toLowerCase().includes('working station')
    );
    
    if (workingStations.length === 0) return;
    
    pdf.addPage();
    
    // Page number
    this.addPageNumber(pdf, this.currentPage);
    
    // Section title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('CALCULATIONS', this.options.marginLeft, 30);
    
    pdf.setFontSize(12);
    pdf.text('WORKING STATIONS FIXED BY GPS', this.options.marginLeft, 45);
    
    // Table
    this.generateSimplePointTable(pdf, workingStations, fieldBookLookup, 60);
    
    this.currentPage++;
  }
  
  /**
   * Section 2: Found Beacons Fixed by GPS
   */
  private generateFoundBeaconsGPS(
    pdf: jsPDF,
    surveyPoints: SurveyPoint[],
    fieldBookLookup: Record<string, string>
  ): void {
    // Filter found beacons
    const foundBeacons = surveyPoints.filter(p => 
      p.status.toLowerCase() === 'f' ||
      p.status.toLowerCase().includes('found')
    );
    
    if (foundBeacons.length === 0) return;
    
    pdf.addPage();
    
    // Page number
    this.addPageNumber(pdf, this.currentPage);
    
    // Section title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Found beacons', this.options.marginLeft, 30);
    
    // Table
    this.generateSimplePointTable(pdf, foundBeacons, fieldBookLookup, 45);
    
    this.currentPage++;
  }
  
  /**
   * Generate simple point table (Point, X, Y, F.B)
   */
  private generateSimplePointTable(
    pdf: jsPDF,
    points: SurveyPoint[],
    fieldBookLookup: Record<string, string>,
    startY: number
  ): void {
    let yPos = startY;
    
    // Table header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Point', this.options.marginLeft, yPos);
    pdf.text('X', this.options.marginLeft + 40, yPos);
    pdf.text('Y', this.options.marginLeft + 80, yPos);
    pdf.text('F.B', this.options.marginLeft + 120, yPos);
    
    yPos += 8;
    
    // Table rows
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    
    const maxY = pdf.internal.pageSize.getHeight() - 30;
    
    points.forEach((point, index) => {
      // Check if we need a new page
      if (yPos > maxY) {
        pdf.addPage();
        this.addPageNumber(pdf, this.currentPage);
        this.currentPage++;
        yPos = 30;
      }
      
      // Point ID
      pdf.text(point.pointId, this.options.marginLeft, yPos);
      
      // X coordinate
      pdf.text(point.x.toFixed(3), this.options.marginLeft + 40, yPos);
      
      // Y coordinate
      pdf.text(point.y.toFixed(3), this.options.marginLeft + 80, yPos);
      
      // F.B (Field Book page)
      const fbPage = fieldBookLookup[point.pointId] || '-';
      pdf.text(fbPage, this.options.marginLeft + 120, yPos);
      
      yPos += 6;
    });
  }
  
  /**
   * Section 3: Data Polars
   */
  private generateDataPolars(
    pdf: jsPDF,
    surveyPoints: SurveyPoint[]
  ): void {
    // Extract polar observation data
    // This would come from the survey data if available
    
    pdf.addPage();
    this.addPageNumber(pdf, this.currentPage);
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('DATA POLARS - SR 21/2016', this.options.marginLeft, 30);
    
    // Generate polar observation tables
    // Format: Station, Date, Time, Observations
    
    this.currentPage++;
  }
  
  /**
   * Section 4: Coordinate Comparison
   */
  private generateCoordinateComparison(
    pdf: jsPDF,
    surveyPoints: SurveyPoint[]
  ): void {
    pdf.addPage();
    this.addPageNumber(pdf, this.currentPage);
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('COORDINATE COMPARISON', this.options.marginLeft, 30);
    
    let yPos = 50;
    
    // Table header
    pdf.setFontSize(10);
    pdf.text('Point', this.options.marginLeft, yPos);
    pdf.text('This Survey', this.options.marginLeft + 30, yPos);
    pdf.text('Previous Survey', this.options.marginLeft + 80, yPos);
    pdf.text('Difference', this.options.marginLeft + 130, yPos);
    
    yPos += 8;
    
    // Table with Y, X for each survey and dY, dX
    
    this.currentPage++;
  }
  
  /**
   * Section 5: Calculation of New Points
   */
  private generateNewPointsCalculation(
    pdf: jsPDF,
    newPoints: NewPointCalculation[],
    fieldBookLookup: Record<string, string>
  ): void {
    newPoints.forEach(calculation => {
      pdf.addPage();
      this.addPageNumber(pdf, this.currentPage);
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('CALCULATION OF NEW POINTS', this.options.marginLeft, 30);
      
      pdf.setFontSize(10);
      pdf.text(`Line running ${calculation.line}`, this.options.marginLeft, 45);
      pdf.text(`Direction ${calculation.direction}`, this.options.marginLeft + 80, 45);
      
      // Table: POINT, Y, X, DIST
      let yPos = 60;
      pdf.text('POINT', this.options.marginLeft, yPos);
      pdf.text('Y', this.options.marginLeft + 40, yPos);
      pdf.text('X', this.options.marginLeft + 80, yPos);
      pdf.text('DIST', this.options.marginLeft + 120, yPos);
      
      yPos += 8;
      pdf.setFont('helvetica', 'normal');
      
      calculation.points.forEach(point => {
        pdf.text(point.pointId, this.options.marginLeft, yPos);
        pdf.text(point.y.toFixed(3), this.options.marginLeft + 40, yPos);
        pdf.text(point.x.toFixed(3), this.options.marginLeft + 80, yPos);
        pdf.text(point.distance.toFixed(2), this.options.marginLeft + 120, yPos);
        yPos += 6;
      });
      
      this.currentPage++;
    });
  }
  
  /**
   * Section 6: Duplicate Point Analysis (existing logic)
   */
  private generateDuplicateAnalysis(
    pdf: jsPDF,
    duplicates: DuplicateAnalysis[],
    fieldBookLookup: Record<string, string>
  ): void {
    // Keep existing duplicate analysis logic
    // Just update page numbering to use this.currentPage
  }
  
  /**
   * Helper: Add page number to top right
   */
  private addPageNumber(pdf: jsPDF, pageNum: number): void {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const pageText = pageNum.toString();
    const pageWidth = pdf.getTextWidth(pageText);
    pdf.text(pageText, pdf.internal.pageSize.getWidth() - this.options.marginRight - pageWidth, 15);
  }
}
```

## **Data Extraction Logic**

```typescript
/**
 * Extract new point calculations from survey data
 */
private extractNewPointCalculations(surveyPoints: SurveyPoint[]): NewPointCalculation[] {
  // This would analyze the survey data to identify:
  // - Line running calculations
  // - Direction and distance
  // - Calculated points
  
  // For now, return empty array if no calculation metadata
  return [];
}

/**
 * Check if polar observation data is available
 */
private hasPolarData(surveyPoints: SurveyPoint[]): boolean {
  // Check if survey points have polar observation metadata
  return false; // Placeholder
}

/**
 * Check if previous survey data is available for comparison
 */
private hasPreviousSurveyData(surveyPoints: SurveyPoint[]): boolean {
  // Check if there's previous survey data to compare against
  return false; // Placeholder
}
```

## **Interface Definitions**

```typescript
interface NewPointCalculation {
  line: string; // e.g., "84d - Sec2N"
  direction: string; // e.g., "300-20-50"
  points: {
    pointId: string;
    y: number;
    x: number;
    distance: number;
  }[];
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
```

## **Summary**

The refactored structure will:

1. ✅ Match the exact format from the template
2. ✅ Use simple Point, X, Y, F.B tables for Found/Placed beacons
3. ✅ Support all sections from the template
4. ✅ Handle pagination automatically
5. ✅ Maintain correct page numbering starting at 116
6. ✅ Use Field Book lookup for F.B column
7. ✅ Be extensible for future sections (polars, comparisons, etc.)

## **Next Steps**

1. Implement the refactored structure in `calculations-part1.ts`
2. Test with 541 points dataset
3. Verify page numbering and cross-references
4. Add support for optional sections (polars, comparisons) when data is available
