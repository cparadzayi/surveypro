import jsPDF from 'jspdf'
import { useSurveyLookupStore } from '../stores/surveyLookup'
import type { AdjustedCoordinate, CalculationsPart1Result } from '../types/adjusted-coordinates'
import { VirtualPDFMeasurer } from './VirtualPDFMeasurer'
import type { CalculationsMeasurement } from '../types/document-measurements'

// Survey point interface for calculations
export interface SurveyPoint {
  pointId: string
  y: number
  x: number
  status: string
  description: string
  surveyDate: string
  observationIndex?: number
}

// Duplicate point analysis interface
export interface DuplicateAnalysis {
  pointId: string
  observations: SurveyPoint[]
  meanY: number
  meanX: number
  residualsY: number[]
  residualsX: number[]
  maxResidualY: number
  maxResidualX: number
  withinTolerance: boolean
  fieldBookPages: number[]
}

// Survey tolerance standards (in meters) - based on Zimbabwe Survey Regulations
export const SURVEY_TOLERANCES = {
  // For cadastral surveys - varies by point type and method
  CADASTRAL_PRIMARY: 0.050,     // 50mm for primary control points
  CADASTRAL_SECONDARY: 0.100,   // 100mm for secondary points
  CADASTRAL_BOUNDARY: 0.150,    // 150mm for boundary points
  TRAVERSE_CLOSURE: 0.200       // 200mm for traverse closure
}

export class CalculationsPart1Generator {
  private currentPage = 116; // Starting page for Calculations Part 1
  
  /**
   * Generate lookup table for field book page cross-referencing
   */
  // Generate lookup table during PDF field book generation
  // IMPORTANT: Must match the actual Field Book PDF generation
  // Dynamic calculation: A4 page (297mm) - margins/headers (80mm) = 217mm available
  // Row height: ~8mm → 217mm / 8mm ≈ 27 points per page
  private generateFieldBookPageLookup(surveyPoints: SurveyPoint[]): Record<string, string> {
    const lookup: Record<string, string> = {};
    const pointsPerPage = 27; // Must match Field Book PDF generation (dynamic calculation)
    
    // ⭐ CRITICAL: Filter out calculated points - they don't appear in field book
    const fieldBookPoints = surveyPoints.filter(pt => {
      const desc = (pt.description || '').toLowerCase();
      const status = (pt.status || '').toLowerCase();
      const isCalculated = desc.includes('calculated') || status === 'c' || status === 'calc';
      
      if (isCalculated) {
        console.log(`[CalculationsPart1] 🧮 Excluding calculated point from F/B lookup: ${pt.pointId}`);
        lookup[pt.pointId] = '-'; // Set calculated points to show "-" in F/B column
      }
      
      return !isCalculated;
    });
    
    console.log(`[CalculationsPart1] 📊 Field Book lookup: ${surveyPoints.length} total, ${fieldBookPoints.length} in field book, ${surveyPoints.length - fieldBookPoints.length} calculated`);
    
    const sortedPoints = [...fieldBookPoints];
    let pageNum = 1;
    let pointCount = 0;
    sortedPoints.forEach((pt, idx) => {
      if (pointCount === pointsPerPage) {
        pageNum++;
        pointCount = 0;
      }
      lookup[pt.pointId] = `E${pageNum}`;
      pointCount++;
    });
    // Persist lookup in Pinia for canonical reference
    const lookupStore = useSurveyLookupStore();
    lookupStore.setFieldBookPageLookup(lookup);
    return lookup;
  }
  
  private options = {
    format: 'a4' as const,
    orientation: 'portrait' as const,
    unit: 'mm' as const,
    marginLeft: 20,
    marginRight: 20,
    marginTop: 20,
    marginBottom: 20
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

  /**
   * Generate Calculations Part 1 PDF document
   * Returns both the PDF and adjusted coordinates for use in Coordinate List
   * 
   * @param surveyPoints - Survey points to process
   * @param surveyorInfo - Surveyor information
   * @param startingPage - Starting page number (default 116)
   * @param measureOnly - If true, only measure without rendering (for two-pass generation)
   */
  async generateCalculationsPart1PDF(
    surveyPoints: SurveyPoint[],
    surveyorInfo: {
      name: string
      licenseNumber: string
      firm: string
      address: string
      surveyDate: string
      projectTitle: string
    },
    startingPage: number = 116,
    measureOnly: boolean = false
  ): Promise<CalculationsPart1Result | CalculationsMeasurement> {
    // Set the starting page for this generation
    this.currentPage = startingPage;
    const actualStartingPage = startingPage; // Save the actual starting page before it gets incremented
    
    // ⭐ MEASUREMENT MODE: Return measurements without rendering
    if (measureOnly) {
      console.log('[CalculationsPart1] 📏 MEASUREMENT MODE: Measuring document structure...')
      return this.measureCalculations(surveyPoints, surveyorInfo, startingPage)
    }
    
    // NORMAL MODE: Generate PDF
    const pdf = new jsPDF(this.options)
    try {
      // Use a consistent sorted list for field book page mapping
      const sortedFieldBookPoints = [...surveyPoints];
      // Find duplicate points
      const duplicateAnalyses = this.findDuplicatePoints(surveyPoints)

      // Note: Cover page is generated separately by CoverPageGenerator

      // ⭐ CRITICAL: Reset calculations page lookup BEFORE generation
      this.calculationsPageLookup = {};
      
      // Add combined points table
  const lookupStore = useSurveyLookupStore();
  const fieldBookPageLookup = this.generateFieldBookPageLookup(surveyPoints);
  lookupStore.setFieldBookPageLookup(fieldBookPageLookup);
  this.generateCombinedPointsTable(pdf, sortedFieldBookPoints, lookupStore.fieldBookPageLookup);

      // Add duplicate observation analysis before coordinate list
      if (duplicateAnalyses.length > 0) {
        this.generateCalculationsPages(pdf, duplicateAnalyses, surveyorInfo, sortedFieldBookPoints, lookupStore.fieldBookPageLookup);
        this.generateSummaryPage(pdf, duplicateAnalyses, surveyorInfo);
      }
      // ✅ If no duplicates, don't add any pages - Calculations Part 1 will be empty
      // This is correct because Calculations Part 1 is specifically for duplicate analysis

      // Note: Coordinate List is generated separately by CoordinateListGenerator;

      // Generate adjusted coordinates from calculations
      const adjustedCoordinates = this.generateAdjustedCoordinates(
        surveyPoints,
        duplicateAnalyses,
        lookupStore.fieldBookPageLookup
      );

      // Get the populated lookup
      const calculationsPageLookup = this.createCalculationsPageLookup(sortedFieldBookPoints);
      
      console.log('[CalculationsPart1] 📖 Calculations page lookup created:', {
        totalPoints: Object.keys(calculationsPageLookup).length,
        sample: Object.entries(calculationsPageLookup).slice(0, 10),
        pageRange: {
          min: Math.min(...Object.values(calculationsPageLookup)),
          max: Math.max(...Object.values(calculationsPageLookup))
        }
      });

      // Generation complete - return results
      
      // ⚠️ CRITICAL: jsPDF creates an initial empty page by default
      // We need to delete it before returning the PDF
      const totalPages = pdf.getNumberOfPages()
      if (totalPages > 0) {
        pdf.deletePage(1)  // Delete the first empty page
        console.log(`[CalculationsPart1] 📄 Deleted initial empty page. Pages: ${totalPages} → ${pdf.getNumberOfPages()}`)
      }
      
      const actualPageCount = pdf.getNumberOfPages()
      console.log(`[CalculationsPart1] 📄 Final page count: ${actualPageCount} pages`)
      
      return {
        pdf: new Blob([pdf.output('blob')], { type: 'application/pdf' }),
        adjustedCoordinates,
        duplicateAnalyses,  // ⭐ RETURN DUPLICATE ANALYSES
        pageCount: actualPageCount,  // ✅ Correct page count (after deleting empty page)
        startingPage: actualStartingPage, // Return the actual starting page, not the incremented one
        fieldBookPageLookup: lookupStore.fieldBookPageLookup,
        calculationsPageLookup,
        summary: {
          totalPoints: surveyPoints.length,
          duplicatePoints: duplicateAnalyses.length,
          adjustedPoints: duplicateAnalyses.length,
          singleObservations: surveyPoints.length - duplicateAnalyses.length
        }
      };
    } catch (error) {
      console.error('Error generating Calculations Part 1 PDF:', error);
      throw error;
    }
  }

  /**
   * Measure calculations document structure without rendering
   * Used in Pass 1 of two-pass generation
   */
  private measureCalculations(
    surveyPoints: SurveyPoint[],
    surveyorInfo: any,
    startingPage: number
  ): CalculationsMeasurement {
    console.log('[CalculationsPart1] 📏 Starting measurement pass...')
    const startTime = Date.now()
    
    // Create virtual PDF measurer
    const measurer = new VirtualPDFMeasurer()
    this.currentPage = startingPage
    
    // Find duplicate points
    const duplicateAnalyses = this.findDuplicatePoints(surveyPoints)
    console.log(`[CalculationsPart1] Found ${duplicateAnalyses.length} duplicate points to analyze`)
    
    // Reset calculations page lookup
    this.calculationsPageLookup = {}
    
    // Measure calculations pages
    if (duplicateAnalyses.length > 0) {
      this.measureCalculationsPages(measurer, duplicateAnalyses, surveyorInfo)
    } else {
      // No duplicates - single page with message
      measurer.addPage()
      this.currentPage++
    }
    
    const measurement: CalculationsMeasurement = {
      pages: measurer.getPageCount(),
      startPage: startingPage,
      endPage: startingPage + measurer.getPageCount() - 1,
      pointPageMap: measurer.getPointPageMap(),
      pointLocations: Array.from(measurer.getPointLocations().values()),
      duplicateCount: duplicateAnalyses.length
    }
    
    const duration = Date.now() - startTime
    console.log(`[CalculationsPart1] ✅ Measurement complete in ${duration}ms:`)
    console.log(`  - Pages: ${measurement.pages}`)
    console.log(`  - Page range: ${measurement.startPage}-${measurement.endPage}`)
    console.log(`  - Points tracked: ${Object.keys(measurement.pointPageMap).length}`)
    
    // Log summary
    measurer.logSummary()
    
    return measurement
  }

  /**
   * Measure calculations pages structure
   * Simulates generateCalculationsPages but with VirtualPDFMeasurer
   */
  private measureCalculationsPages(
    measurer: VirtualPDFMeasurer,
    analyses: DuplicateAnalysis[],
    surveyorInfo: any
  ): void {
    const pageHeight = measurer.internal.pageSize.getHeight()
    const maxY = pageHeight - 20 // Leave space at bottom
    let yPosition = 0
    let isFirstAnalysis = true
    
    analyses.forEach((analysis, idx) => {
      // Calculate space needed for this analysis (same logic as real generation)
      const headerHeight = 20 // Title + table header
      const observationHeight = analysis.observations.length * 6 // 6mm per observation
      const summaryHeight = 30 // Mean, residuals, tolerance
      const separatorHeight = 10 // Space for separator line
      const totalHeight = headerHeight + observationHeight + summaryHeight + separatorHeight
      
      // Check if we need a new page
      if (isFirstAnalysis || yPosition + totalHeight > maxY) {
        measurer.addPage()
        
        if (isFirstAnalysis) {
          // First page has title
          measurer.text('DUPLICATE POINT ANALYSIS', 15, 30)
          yPosition = 45
          isFirstAnalysis = false
        } else {
          yPosition = 30
          this.currentPage++
        }
      }
      
      // Separator line
      if (yPosition > 45) {
        yPosition += 8
      }
      
      // Point ID title
      measurer.text(`Point: ${analysis.pointId}`, 15, yPosition)
      
      // ⭐ CRITICAL: Record point location
      measurer.recordPointLocation(analysis.pointId)
      this.calculationsPageLookup[analysis.pointId] = this.currentPage
      
      yPosition += 8
      
      // Table header
      yPosition += 5
      
      // Observations (simulate rows)
      analysis.observations.forEach(() => {
        yPosition += 5
      })
      
      // Summary
      yPosition += 3
      yPosition += 5 // Mean Y/X
      yPosition += 5 // Max residuals
      yPosition += 5 // Tolerance check
      yPosition += 10 // Spacing
    })
  }

  /**
   * Generate combined table of all survey points with F/B column
   */
  private generateCombinedPointsTable(pdf: jsPDF, surveyPoints: SurveyPoint[], lookup: Record<string, string>): void {
    const pointsPerPage = 35;
    const sortedPoints = [...surveyPoints];
    const totalPages = Math.ceil(sortedPoints.length / pointsPerPage);
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      pdf.addPage();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      const pageNumText = `${this.currentPage}`;
      const pageNumWidth = pdf.getTextWidth(pageNumText);
      pdf.text(pageNumText, pdf.internal.pageSize.getWidth() - this.options.marginRight - pageNumWidth, 20);
      pdf.setFontSize(14);
      pdf.text('CALCULATIONS', this.options.marginLeft, 25);
      let yPosition = 40;
      pdf.setFontSize(10);
      pdf.text('ID', this.options.marginLeft, yPosition);
      pdf.text('Y (m)', this.options.marginLeft + 25, yPosition);
      pdf.text('X (m)', this.options.marginLeft + 60, yPosition);
      pdf.text('Status', this.options.marginLeft + 95, yPosition);
      pdf.text('F/B', this.options.marginLeft + 120, yPosition);
      pdf.text('Description', this.options.marginLeft + 145, yPosition);
      yPosition += 6;
      pdf.setFont('helvetica', 'normal');
      const startIdx = pageIndex * pointsPerPage;
      const endIdx = Math.min(startIdx + pointsPerPage, sortedPoints.length);
      for (let idx = startIdx; idx < endIdx; idx++) {
        const pt = sortedPoints[idx];
        
        // ⭐ CRITICAL: Record the page number for this point in the Combined Points Table
        // This ensures ALL points have a Calculations page reference, not just duplicates
        if (!this.calculationsPageLookup[pt.pointId]) {
          this.calculationsPageLookup[pt.pointId] = this.currentPage;
          console.log(`[CalculationsPart1] 📍 Point ${pt.pointId} → Page ${this.currentPage} (Combined Table)`);
        }
        
        // All rows: render ID, Y, X in red with a solid red underline
        const idText = pt.pointId;
        const yText  = pt.y.toFixed(3);
        const xText  = pt.x.toFixed(3);
        const idX   = this.options.marginLeft;
        const yColX = this.options.marginLeft + 25;
        const xColX = this.options.marginLeft + 60;
        const lineY = yPosition + 0.8; // 0.8mm below text baseline

        pdf.setLineWidth(0.2); // solid thin line
        pdf.setTextColor(0, 0, 0); // text always black
        pdf.setDrawColor(220, 0, 0); // underline lines in red

        pdf.text(idText, idX, yPosition);
        pdf.line(idX, lineY, idX + pdf.getTextWidth(idText), lineY);

        pdf.text(yText, yColX, yPosition);
        pdf.line(yColX, lineY, yColX + pdf.getTextWidth(yText), lineY);

        pdf.text(xText, xColX, yPosition);
        pdf.line(xColX, lineY, xColX + pdf.getTextWidth(xText), lineY);

        // Reset draw color to black for remaining columns
        pdf.setDrawColor(0, 0, 0);

        pdf.text(pt.status, this.options.marginLeft + 95, yPosition);
        // Use lookup table for F/B column
        const fieldBookPage = lookup[pt.pointId] || '-';
        pdf.text(fieldBookPage, this.options.marginLeft + 120, yPosition);
        pdf.text(pt.description, this.options.marginLeft + 145, yPosition);
        yPosition += 6;
      }
      this.currentPage++; // Increment page number after each page
    }
  }

  /**
   * Generate field book table (3 decimal places)
   */
  private generateFieldBookTable(pdf: jsPDF, surveyPoints: SurveyPoint[]): void {
    pdf.addPage();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('FIELD BOOK COORDINATES', this.options.marginLeft, 30);
    let yPosition = 45;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('ID', this.options.marginLeft, yPosition);
    pdf.text('Y (m)', this.options.marginLeft + 25, yPosition);
    pdf.text('X (m)', this.options.marginLeft + 60, yPosition);
    pdf.text('F/B', this.options.marginLeft + 95, yPosition);
    yPosition += 6;
    pdf.setFont('helvetica', 'normal');
    // Use a consistent sorted list for field book page mapping
    const sortedPoints = [...surveyPoints];
    const lookup = this.generateFieldBookPageLookup(sortedPoints);
    let pageNum = 1;
    let pointCount = 0;
    sortedPoints.forEach((pt, idx) => {
      if (pointCount === 35) {
        pageNum++;
        pointCount = 0;
        pdf.addPage();
        yPosition = 30;
      }
      pdf.text(pt.pointId, this.options.marginLeft, yPosition);
      pdf.text(pt.y.toFixed(3), this.options.marginLeft + 25, yPosition);
      pdf.text(pt.x.toFixed(3), this.options.marginLeft + 60, yPosition);
      // Use canonical lookup for E-page
      pdf.text(lookup[pt.pointId], this.options.marginLeft + 95, yPosition);
      yPosition += 6;
      pointCount++;
    });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
  }

  /**
   * Generate coordinate list table (2 decimal places)
   */
  // Grouping and sorting logic for coordinate list (same as UI)
  private getPointGroupOrder(point: SurveyPoint): number {
    const desc = (point.description || '').toLowerCase();
    const status = (point.status || '').toLowerCase();
    if (desc.includes('trig') || desc.includes('town survey mark')) return 1;
    if (status.includes('working station')) return 2;
    if (status.includes('adopted')) return 3;
    if (status.includes('found')) return 4;
    if (status.includes('placed')) return 5;
    if (status.includes('computed')) return 6;
    return 99;
  }

  private getSortedCoordinateList(surveyPoints: SurveyPoint[]): SurveyPoint[] {
    return [...surveyPoints].sort((a, b) => {
      const groupA = this.getPointGroupOrder(a);
      const groupB = this.getPointGroupOrder(b);
      if (groupA !== groupB) return groupA - groupB;
      return a.pointId.localeCompare(b.pointId);
    });
  }

  // ...existing code...

  private generateCoordinateListTable(pdf: jsPDF, surveyPoints: SurveyPoint[], lookup: Record<string, string>): void {
    const sortedPoints = this.getSortedCoordinateList(surveyPoints);
    const pointsPerPage = 35;
    const totalPages = Math.ceil(sortedPoints.length / pointsPerPage);
    const surveyTitle = 'SURVEY OF: STANDS 108, 167 - 256, 268 - 277, 282 - 296 ADVALOREM TOWNSHIP SHABANI MINE SURFACE RIGHTS A';
    const district = 'SHABANI';
    const constantsY = '+ 90 000.00';
    const constantsX = '+2 240 000.00';
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      pdf.addPage();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      const pageNumText = `${100 + pageIndex}`;
      const pageNumWidth = pdf.getTextWidth(pageNumText);
      pdf.text(pageNumText, (pdf.internal.pageSize.getWidth()) / 2, 18, { align: 'center' });

      pdf.setFontSize(16);
      pdf.text('CO-ORDINATE LIST', (pdf.internal.pageSize.getWidth()) / 2, 28, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(surveyTitle, this.options.marginLeft, 36);
      pdf.text(`DISTRICT: ${district}`, this.options.marginLeft, 42);

      let yPosition = 50;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.line(this.options.marginLeft, yPosition - 6, 190, yPosition - 6);
      pdf.text('GROUP', this.options.marginLeft + 2, yPosition);
      pdf.text('F/B (OBS)', this.options.marginLeft + 25, yPosition);
      pdf.text('CALCS', this.options.marginLeft + 50, yPosition);
      pdf.text('POINT', this.options.marginLeft + 75, yPosition);
      pdf.text('Y', this.options.marginLeft + 100, yPosition);
      pdf.text('X', this.options.marginLeft + 125, yPosition);
      pdf.text('DESCRIPTION', this.options.marginLeft + 150, yPosition);
      pdf.text('STATUS', this.options.marginLeft + 175, yPosition);
      pdf.text('F/B', this.options.marginLeft + 195, yPosition);
      yPosition += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const startIdx = pageIndex * pointsPerPage;
      const endIdx = Math.min(startIdx + pointsPerPage, sortedPoints.length);
      for (let idx = startIdx; idx < endIdx; idx++) {
        const pt = sortedPoints[idx];
        // Group logic
        const group = this.getPointGroupOrder(pt);
        // F/B (OBS): Use canonical lookup for field book page
        const fbObs = lookup[pt.pointId] || '-';
        // CALCS: Calculate page number in Calculations Part 1 PDF
        // Assume combined points table starts at page 100, 35 points per page
        const calcsPage = 100 + Math.floor(idx / pointsPerPage);
        // Other columns
        const colBeacon = pt.pointId;
        const colY = pt.y.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const colX = pt.x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const colDesc = pt.description || '-';
        const colStatus = pt.status || '-';
        // F/B: Use canonical lookup again for reference
        const colFieldBook = lookup[pt.pointId] || '-';
        pdf.text(group === 99 ? '-' : group.toString(), this.options.marginLeft + 2, yPosition);
        pdf.text(fbObs, this.options.marginLeft + 25, yPosition);
        pdf.text(calcsPage.toString(), this.options.marginLeft + 50, yPosition);
        pdf.text(colBeacon, this.options.marginLeft + 75, yPosition);
        pdf.text(colY, this.options.marginLeft + 100, yPosition);
        pdf.text(colX, this.options.marginLeft + 125, yPosition);
        pdf.text(colDesc, this.options.marginLeft + 150, yPosition);
        pdf.text(colStatus, this.options.marginLeft + 175, yPosition);
        pdf.text(colFieldBook, this.options.marginLeft + 195, yPosition);
        yPosition += 6;
      }
      pdf.line(this.options.marginLeft, yPosition, 190, yPosition);
    }
  }

  /**
   * Find duplicate point observations in survey data
   */
  private findDuplicatePoints(surveyPoints: SurveyPoint[]): DuplicateAnalysis[] {
    const pointGroups = new Map<string, SurveyPoint[]>()
    
    // Group points by point ID
    surveyPoints.forEach((point, index) => {
      const observations = pointGroups.get(point.pointId) || []
      observations.push({
        ...point,
        observationIndex: index + 1
      })
      pointGroups.set(point.pointId, observations)
    })
    
    // Find points with multiple observations
    const duplicateAnalyses: DuplicateAnalysis[] = []
    
    pointGroups.forEach((observations, pointId) => {
      if (observations.length > 1) {
        const analysis = this.analyzeDuplicatePoint(pointId, observations)
        duplicateAnalyses.push(analysis)
      }
    })
    
    return duplicateAnalyses.sort((a, b) => a.pointId.localeCompare(b.pointId))
  }

  /**
   * Analyze duplicate point observations
   */
  private analyzeDuplicatePoint(pointId: string, observations: SurveyPoint[]): DuplicateAnalysis {
    // Calculate mean coordinates
    const meanY = observations.reduce((sum, obs) => sum + obs.y, 0) / observations.length
    const meanX = observations.reduce((sum, obs) => sum + obs.x, 0) / observations.length
    
    // Calculate residuals
    const residualsY = observations.map(obs => obs.y - meanY)
    const residualsX = observations.map(obs => obs.x - meanX)
    
    // Find maximum residuals
    const maxResidualY = Math.max(...residualsY.map(Math.abs))
    const maxResidualX = Math.max(...residualsX.map(Math.abs))
    
    // Determine tolerance based on point type
    const tolerance = this.getToleranceForPoint(observations[0])
    const withinTolerance = maxResidualY <= tolerance && maxResidualX <= tolerance
    
    // Calculate field book pages (simplified - would need actual page mapping)
    const fieldBookPages = observations.map((_, index) => Math.floor(index / 35) + 1)
    
    return {
      pointId,
      observations,
      meanY,
      meanX,
      residualsY,
      residualsX,
      maxResidualY,
      maxResidualX,
      withinTolerance,
      fieldBookPages
    }
  }

  /**
   * Determine appropriate tolerance for point type
   */
  private getToleranceForPoint(point: SurveyPoint): number {
    const desc = point.description.toLowerCase()
    const status = point.status.toLowerCase()
    
    if (desc.includes('iron pipe') || status === 'f') {
      return SURVEY_TOLERANCES.CADASTRAL_PRIMARY
    } else if (desc.includes('iron peg') || status === 'p') {
      return SURVEY_TOLERANCES.CADASTRAL_SECONDARY
    } else {
      return SURVEY_TOLERANCES.CADASTRAL_BOUNDARY
    }
  }

  /**
   * Generate cover page
   */
  private generateCoverPage(pdf: jsPDF, surveyorInfo: any, duplicateCount: number): void {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(18)
    
    // Title
    const title = 'CALCULATIONS PART 1'
    const titleWidth = pdf.getTextWidth(title)
    const titleX = (pdf.internal.pageSize.getWidth() - titleWidth) / 2
    pdf.text(title, titleX, 40)
    
    // Subtitle
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'normal')
    const subtitle = 'Duplicate Point Analysis and Mean Coordinate Calculations'
    const subtitleWidth = pdf.getTextWidth(subtitle)
    const subtitleX = (pdf.internal.pageSize.getWidth() - subtitleWidth) / 2
    pdf.text(subtitle, subtitleX, 55)
    
    // Project information
    let yPosition = 80
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    
    pdf.text('Project:', this.options.marginLeft, yPosition)
    pdf.setFont('helvetica', 'normal')
    pdf.text(surveyorInfo.projectTitle, this.options.marginLeft + 30, yPosition)
    yPosition += 15
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Surveyor:', this.options.marginLeft, yPosition)
    pdf.setFont('helvetica', 'normal')
    pdf.text(surveyorInfo.name, this.options.marginLeft + 30, yPosition)
    yPosition += 10
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('License:', this.options.marginLeft, yPosition)
    pdf.setFont('helvetica', 'normal')
    pdf.text(surveyorInfo.licenseNumber, this.options.marginLeft + 30, yPosition)
    yPosition += 15
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Survey Date:', this.options.marginLeft, yPosition)
    pdf.setFont('helvetica', 'normal')
    pdf.text(surveyorInfo.surveyDate, this.options.marginLeft + 30, yPosition)
    yPosition += 15
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Points Analyzed:', this.options.marginLeft, yPosition)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`${duplicateCount} points with duplicate observations`, this.options.marginLeft + 30, yPosition)
    
    // Footer
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'italic')
    const footerText = 'SurveyPro - Professional Cadastral Survey Calculations'
    const footerWidth = pdf.getTextWidth(footerText)
    const footerX = (pdf.internal.pageSize.getWidth() - footerWidth) / 2
    pdf.text(footerText, footerX, pdf.internal.pageSize.getHeight() - 20)
  }

  /**
   * Generate detailed calculations pages
   * Fits multiple duplicate analyses on each page with line separators
   */
  private generateCalculationsPages(
    pdf: jsPDF,
    analyses: DuplicateAnalysis[],
    surveyorInfo: any,
    surveyPoints: SurveyPoint[],
    _lookup: Record<string, string>
  ): void {
    // Use Pinia store for cross-referencing
    const lookupStore = useSurveyLookupStore();
    const fieldBookPageLookup = lookupStore.fieldBookPageLookup;

    const pageHeight = pdf.internal.pageSize.getHeight();
    const maxY = pageHeight - this.options.marginBottom - 10; // Leave space at bottom
    let yPosition = 0;
    let isFirstAnalysis = true;

    analyses.forEach((analysis, idx) => {
      // Calculate space needed for this analysis
      const headerHeight = 20; // Title + table header
      const observationHeight = analysis.observations.length * 6; // 6mm per observation
      const summaryHeight = 30; // Mean, residuals, tolerance
      const separatorHeight = 10; // Space for separator line
      const totalHeight = headerHeight + observationHeight + summaryHeight + separatorHeight;

      // Check if we need a new page
      if (isFirstAnalysis || yPosition + totalHeight > maxY) {
        pdf.addPage();
        this.addPageNumber(pdf, this.currentPage);
        
        // Add page title on first page
        if (isFirstAnalysis) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.text('DUPLICATE POINT ANALYSIS', this.options.marginLeft, 30);
          yPosition = 45;
          isFirstAnalysis = false;
        } else {
          yPosition = 30;
          this.currentPage++;
        }
      }

      // Draw separator line if not first on page
      if (yPosition > 45) {
        pdf.setDrawColor(200, 200, 200);
        pdf.line(this.options.marginLeft, yPosition, 
                 pdf.internal.pageSize.getWidth() - this.options.marginRight, yPosition);
        yPosition += 8;
      }

      // Point ID title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(`Point: ${analysis.pointId}`, this.options.marginLeft, yPosition);
      
      // ⭐ CRITICAL: Record the ACTUAL page number for this point
      this.calculationsPageLookup[analysis.pointId] = this.currentPage;
      console.log(`[CalculationsPart1] 📍 Point ${analysis.pointId} → Page ${this.currentPage}`);
      
      yPosition += 8;

      // Table header
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text('Obs', this.options.marginLeft, yPosition);
      pdf.text('Y (m)', this.options.marginLeft + 15, yPosition);
      pdf.text('X (m)', this.options.marginLeft + 45, yPosition);
      pdf.text('Res Y (m)', this.options.marginLeft + 75, yPosition);
      pdf.text('Res X (m)', this.options.marginLeft + 105, yPosition);
      pdf.text('F/B', this.options.marginLeft + 135, yPosition);
      yPosition += 5;

      // Observations
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      analysis.observations.forEach(obs => {
        pdf.text(obs.observationIndex ? obs.observationIndex.toString() : '-', 
                 this.options.marginLeft, yPosition);
        pdf.text(obs.y.toFixed(3), this.options.marginLeft + 15, yPosition);
        pdf.text(obs.x.toFixed(3), this.options.marginLeft + 45, yPosition);
        const resY = (obs.y - analysis.meanY).toFixed(3);
        const resX = (obs.x - analysis.meanX).toFixed(3);
        pdf.text(resY, this.options.marginLeft + 75, yPosition);
        pdf.text(resX, this.options.marginLeft + 105, yPosition);
        const fbPage = fieldBookPageLookup[obs.pointId] || '-';
        pdf.text(fbPage, this.options.marginLeft + 135, yPosition);
        yPosition += 5;
      });

      // Summary
      yPosition += 3;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(`Mean Y: ${analysis.meanY.toFixed(3)}`, this.options.marginLeft, yPosition);
      pdf.text(`Mean X: ${analysis.meanX.toFixed(3)}`, this.options.marginLeft + 60, yPosition);
      yPosition += 5;
      
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Max Res Y: ${analysis.maxResidualY.toFixed(3)} m`, this.options.marginLeft, yPosition);
      pdf.text(`Max Res X: ${analysis.maxResidualX.toFixed(3)} m`, this.options.marginLeft + 60, yPosition);
      yPosition += 5;
      
      const toleranceColor: [number, number, number] = analysis.withinTolerance ? [0, 128, 0] : [255, 0, 0];
      pdf.setTextColor(...toleranceColor);
      pdf.text(`Tolerance: ${analysis.withinTolerance ? 'PASS' : 'FAIL'}`, this.options.marginLeft, yPosition);
      pdf.setTextColor(0, 0, 0); // Reset to black
      yPosition += 8;
    });

    // Increment page counter for the last page used
    this.currentPage++;
  }

  /**
   * Generate summary page
   */
  private generateSummaryPage(
    pdf: jsPDF,
    analyses: DuplicateAnalysis[],
    surveyorInfo: any
  ): void {
    pdf.addPage()
    
    // Add page number
    this.addPageNumber(pdf, this.currentPage);
    this.currentPage++;
    
    // Page header
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text('CALCULATIONS PART 1 - SUMMARY', this.options.marginLeft, 30)
    
    let yPosition = 50
    
    // Summary statistics
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text('SUMMARY STATISTICS:', this.options.marginLeft, yPosition)
    yPosition += 15
    
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    
    const totalPoints = analyses.length
    const withinTolerance = analyses.filter(a => a.withinTolerance).length
    const exceedTolerance = totalPoints - withinTolerance
    
    pdf.text(`Total points with duplicate observations: ${totalPoints}`, this.options.marginLeft, yPosition)
    yPosition += 8
    pdf.text(`Points within tolerance: ${withinTolerance}`, this.options.marginLeft, yPosition)
    yPosition += 8
    pdf.text(`Points exceeding tolerance: ${exceedTolerance}`, this.options.marginLeft, yPosition)
    yPosition += 15
    
    // Points exceeding tolerance (if any)
    if (exceedTolerance > 0) {
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(255, 0, 0) // Red
      pdf.text('POINTS EXCEEDING TOLERANCE:', this.options.marginLeft, yPosition)
      pdf.setTextColor(0, 0, 0) // Reset to black
      yPosition += 10
      
      pdf.setFont('helvetica', 'normal')
      analyses.filter(a => !a.withinTolerance).forEach(analysis => {
        const maxResidual = Math.max(analysis.maxResidualY, analysis.maxResidualX) * 1000
        pdf.text(`${analysis.pointId}: Max residual ${maxResidual.toFixed(1)} mm`, 
                 this.options.marginLeft + 10, yPosition)
        yPosition += 8
      })
      yPosition += 10
    }
    
    // Certification
    pdf.setFont('helvetica', 'bold')
    pdf.text('SURVEYOR CERTIFICATION:', this.options.marginLeft, yPosition)
    yPosition += 15
    
    pdf.setFont('helvetica', 'normal')
    pdf.text('I certify that the above calculations have been checked and are correct.', this.options.marginLeft, yPosition)
    yPosition += 8
    pdf.text('All duplicate observations have been analyzed in accordance with', this.options.marginLeft, yPosition)
    yPosition += 8
    pdf.text('the Survey Regulations and professional surveying standards.', this.options.marginLeft, yPosition)
    yPosition += 20
    
    // Signature block
    pdf.text('Surveyor:', this.options.marginLeft, yPosition)
    pdf.text(surveyorInfo.name, this.options.marginLeft + 40, yPosition)
    yPosition += 10
    
    pdf.text('License No:', this.options.marginLeft, yPosition)
    pdf.text(surveyorInfo.licenseNumber, this.options.marginLeft + 40, yPosition)
    yPosition += 10
    
    pdf.text('Date:', this.options.marginLeft, yPosition)
    pdf.text(new Date().toLocaleDateString(), this.options.marginLeft + 40, yPosition)
  }
  
  /**
   * Generate Found Beacons section (matching template format)
   */
  private generateFoundBeaconsSection(
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
    this.addPageNumber(pdf, this.currentPage);
    
    // Section title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Found beacons', this.options.marginLeft, 30);
    
    // Generate table
    this.generateSimplePointTable(pdf, foundBeacons, fieldBookLookup, 45);
    
    this.currentPage++;
  }
  
  /**
   * Generate Placed Beacons section (matching template format)
   */
  private generatePlacedBeaconsSection(
    pdf: jsPDF,
    surveyPoints: SurveyPoint[],
    fieldBookLookup: Record<string, string>
  ): void {
    // Filter placed beacons
    const placedBeacons = surveyPoints.filter(p => 
      p.status.toLowerCase() === 'p' ||
      p.status.toLowerCase().includes('placed') ||
      p.status.toLowerCase().includes('peg')
    );
    
    if (placedBeacons.length === 0) return;
    
    pdf.addPage();
    this.addPageNumber(pdf, this.currentPage);
    
    // Section title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Placed beacons', this.options.marginLeft, 30);
    
    // Generate table
    this.generateSimplePointTable(pdf, placedBeacons, fieldBookLookup, 45);
    
    this.currentPage++;
  }
  
  /**
   * Generate simple point table (Point, Y, X, F.B) - matches template format
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
    pdf.text('Y', this.options.marginLeft + 40, yPos);
    pdf.text('X', this.options.marginLeft + 80, yPos);
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
      
      // Y coordinate (3 decimal places)
      pdf.text(point.y.toFixed(3), this.options.marginLeft + 40, yPos);
      
      // X coordinate (3 decimal places)
      pdf.text(point.x.toFixed(3), this.options.marginLeft + 80, yPos);
      
      // F.B (Field Book page)
      const fbPage = fieldBookLookup[point.pointId] || '-';
      pdf.text(fbPage, this.options.marginLeft + 120, yPos);
      
      yPos += 6;
    });
  }

  /**
   * Generate adjusted coordinates from survey data and duplicate analysis
   * This is the core output that feeds into the Coordinate List
   */
  private generateAdjustedCoordinates(
    surveyPoints: SurveyPoint[],
    duplicateAnalyses: DuplicateAnalysis[],
    fieldBookPageLookup: Record<string, string>
  ): AdjustedCoordinate[] {
    const adjustedCoordinates: AdjustedCoordinate[] = [];
    const duplicateMap = new Map<string, DuplicateAnalysis>();
    
    // Create map of duplicate analyses
    duplicateAnalyses.forEach(analysis => {
      duplicateMap.set(analysis.pointId, analysis);
    });
    
    // Get unique points (deduplicate)
    const uniquePoints = new Map<string, SurveyPoint>();
    surveyPoints.forEach(point => {
      if (!uniquePoints.has(point.pointId)) {
        uniquePoints.set(point.pointId, point);
      }
    });
    
    // Process each unique point
    uniquePoints.forEach((point, pointId) => {
      const duplicate = duplicateMap.get(pointId);
      
      if (duplicate) {
        // Point has multiple observations - use mean coordinates
        adjustedCoordinates.push({
          pointId,
          y: duplicate.meanY,
          x: duplicate.meanX,
          status: point.status,
          description: point.description,
          surveyDate: point.surveyDate,
          fieldBookPage: fieldBookPageLookup[pointId] || '-',
          calculationsPage: this.currentPage, // Will be updated in lookup
          adjustment: {
            isDuplicate: true,
            observationCount: duplicate.observations.length,
            maxResidualY: duplicate.maxResidualY,
            maxResidualX: duplicate.maxResidualX,
            withinTolerance: duplicate.withinTolerance,
            method: 'mean'
          }
        });
      } else {
        // Single observation - use as-is
        adjustedCoordinates.push({
          pointId,
          y: point.y,
          x: point.x,
          status: point.status,
          description: point.description,
          surveyDate: point.surveyDate,
          fieldBookPage: fieldBookPageLookup[pointId] || '-',
          calculationsPage: this.currentPage, // Will be updated in lookup
          adjustment: {
            isDuplicate: false,
            observationCount: 1,
            method: 'single'
          }
        });
      }
    });
    
    return adjustedCoordinates.sort((a, b) => a.pointId.localeCompare(b.pointId));
  }

  /**
   * Create calculations page lookup map
   * Maps each point ID to its page number in Calculations Part 1
   * This is populated during generation as we track actual page numbers
   */
  private calculationsPageLookup: Record<string, number> = {};
  
  private createCalculationsPageLookup(surveyPoints: SurveyPoint[]): Record<string, number> {
    // Return the lookup that was populated during generation
    return this.calculationsPageLookup;
  }
}