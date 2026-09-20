import jsPDF from 'jspdf'
import { parseBeaconStatus } from './beaconStatus';
import { useSurveyLookupStore } from '../stores/surveyLookup'
import type { AdjustedCoordinate } from '../types/adjusted-coordinates'
import { toCoordinateListPrecision } from '../types/adjusted-coordinates'

// Survey point interface (legacy - for backward compatibility)
export interface SurveyPoint {
  pointId: string
  y: number
  x: number
  status: string
  description: string
  surveyDate: string
  observationIndex?: number
}

// Surveyor information interface
export interface SurveyorInfo {
  name: string
  licenseNumber: string
  firm: string
  address: string
  surveyDate: string
  projectTitle: string
  district: string
  centralMeridian?: number // Lo value from project settings
  /** Legacy free-text instruments column; the field book cover falls back to
   *  this when the structured instrument fields below are all empty. */
  instruments?: string
  /** Field assistant, shown on the field book cover. */
  assistedBy?: string
  instrumentDescription?: string
  instrumentBaseSerial?: string
  instrumentRoverSerial?: string
}

// Grouped points interface
interface GroupedPoints {
  trig: AdjustedCoordinate[]
  working: AdjustedCoordinate[]
  adopted: AdjustedCoordinate[]
  foundNotAdopted: AdjustedCoordinate[]
  calculated: AdjustedCoordinate[]
  placed: AdjustedCoordinate[]
}

/**
 * Trim `text` so it fits within `maxWidthMm` in the document's current font.
 *
 * Column overruns in this document are a function of glyph width, not character
 * count, so the trim is measured rather than guessed: a cap tuned by counting
 * characters at one font size overruns silently at the next, which is exactly
 * how a 30-character description came to run into the F/P column when the table
 * moved from 8pt to 10pt.
 *
 * Returns the whole string untouched when it already fits, so the common case
 * costs one measurement and nothing else.
 */
const fitToWidth = (pdf: jsPDF, text: string, maxWidthMm: number): string => {
  const value = text ?? '';
  if (!value || pdf.getTextWidth(value) <= maxWidthMm) return value;

  let trimmed = value;
  while (trimmed.length > 1 && pdf.getTextWidth(trimmed) > maxWidthMm) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
};

/**
 * Column geometry of the CO-ORDINATE LIST table, in mm from the left margin.
 *
 * Defined once because it was not: the same offsets were repeated at nineteen
 * call sites, so the header row and the value row for F/P had drifted 10mm
 * apart and the F. B values had drifted past the right margin entirely.
 *
 * The beacons column is sized for beacon names -- "87DNew" and the like, about
 * 11mm -- not for the word CONSTANTS that shares it. CONSTANTS right-justifies
 * to BEACONS_RIGHT instead and reaches left across the Calcs cell, which is
 * empty on that row. The 19mm this frees goes to the description, which had
 * been truncating "12mm iron peg in concrete" mid-word.
 *
 * USABLE is the page less both margins; nothing may be drawn beyond it.
 */
const COL = {
  fieldBook: 0,
  calcs: 15,
  beacons: 35,
  /** Right edge of the beacons column. 3mm short of `y` so its contents never
   *  butt against the coordinates beside them. */
  beaconsRight: 48,
  /** Centre of the beacons column: names and their header sit here, which reads
   *  as a column rather than as text pushed up against the Y values. */
  beaconsCentre: 41.5,
  y: 51,
  metres: 56,
  x: 81,
  description: 111,
  /** F/P and F. B are right-justified: these are their right edges. */
  fpRight: 166,
  fbRefRight: 180,
} as const;

/** Page width less both margins, in mm. Nothing is drawn past this. */
const USABLE = 180;

export class CoordinateListGenerator {
  private currentPage = 100; // Starting page for Coordinate List
  private surveyorInfo!: SurveyorInfo; // Store surveyor info for use in page headers
  
  private options = {
    format: 'a4' as const,
    orientation: 'portrait' as const,
    unit: 'mm' as const,
    marginLeft: 15,
    marginRight: 15,
    marginTop: 20,
    marginBottom: 20
  }
  
  /**
   * Generate Coordinate List PDF (pages 100+)
   * 
   * @param adjustedCoordinates - Coordinates from Calculations Part 1
   * @param surveyorInfo - Surveyor and project information
   * @param projectControlPoints - Optional control points from national trig system
   * @param calcPageLookup - Optional lookup for calculation page references (Point ID → Calc Page)
   * @param fieldBookLookup - Optional lookup for field book page references (Point ID → Field Book Page)
   */
  async generateCoordinateListPDF(
    adjustedCoordinates: AdjustedCoordinate[],
    surveyorInfo: SurveyorInfo,
    projectControlPoints?: any[],
    calcPageLookup?: Record<string, number>,
    fieldBookLookup?: Record<string, string>
  ): Promise<{ pdf: jsPDF, pageCount: number }> {
    const pdf = new jsPDF(this.options);
    const lookupStore = useSurveyLookupStore();
    
    // Store surveyor info for use in page headers
    this.surveyorInfo = surveyorInfo;
    
    // Reset page counter
    this.currentPage = 100;
    
    // Apply calculation page lookup if provided (for cross-references)
    if (calcPageLookup) {
      console.log('[CoordinateList] Applying calculation page lookup:', Object.keys(calcPageLookup).length, 'points');
      console.log('[CoordinateList] Sample calc lookup:', Object.entries(calcPageLookup).slice(0, 10));
      
      adjustedCoordinates = adjustedCoordinates.map(coord => {
        const calcPage = calcPageLookup[coord.pointId];
        if (calcPage) {
          console.log(`[CoordinateList] Point ${coord.pointId}: calcPage from lookup = ${calcPage}`);
        } else {
          console.log(`[CoordinateList] Point ${coord.pointId}: NOT in lookup, using default = ${coord.calculationsPage || 0}`);
        }
        return {
          ...coord,
          calculationsPage: calcPage || coord.calculationsPage || 0
        };
      });
    }
    
    // Apply field book page lookup if provided (for cross-references)
    if (fieldBookLookup) {
      console.log('[CoordinateList] Applying field book lookup:', Object.keys(fieldBookLookup).length, 'points');
      adjustedCoordinates = adjustedCoordinates.map(coord => ({
        ...coord,
        fieldBookPage: fieldBookLookup[coord.pointId] || coord.fieldBookPage || '-'
      }));
    }
    
    // Group points by type
    const groupedPoints = this.groupPointsByType(adjustedCoordinates);
    
    // Prepend project control points to TRIG BEACONS section
    // These are the control points selected during project creation
    if (projectControlPoints && projectControlPoints.length > 0) {
      console.log('[CoordinateList] Processing control points:', projectControlPoints.length);
      console.log('[CoordinateList] First control point structure:', projectControlPoints[0]);
      
      const trigPoints: AdjustedCoordinate[] = projectControlPoints.map((cp, index) => {
        // Log all properties to see what's available
        console.log(`[CoordinateList] Control point ${index}:`, cp);
        console.log(`[CoordinateList] Available keys:`, Object.keys(cp));
        
        // Handle different possible property names for coordinates
        // Parse string values to numbers
        const yRaw = cp.y_gauss || cp.yGauss || cp.y_coordinate || cp.y || cp.Y || cp.northing;
        const xRaw = cp.x_gauss || cp.xGauss || cp.x_coordinate || cp.x || cp.X || cp.easting;
        
        const y = typeof yRaw === 'number' ? yRaw : parseFloat(yRaw) || 0;
        const x = typeof xRaw === 'number' ? xRaw : parseFloat(xRaw) || 0;
        
        console.log(`[CoordinateList] Control point ${cp.monu_num}: Y=${y} (parsed from ${yRaw}), X=${x} (parsed from ${xRaw})`);
        
        return {
          pointId: cp.monu_num || cp.id || `CP${index + 1}`,
          y: y,
          x: x,
          status: 'TRIG',
          description: cp.monu_name || cp.name || cp.monu_num || `Control Point ${index + 1}`,
          surveyDate: '',
          // Additional fields for coordinate list display
          fieldBookPage: '', // Control points don't have field book entries
          calculationsPage: 0, // Control points are from national system (no calculations page)
          adjustment: {
            isDuplicate: false,
            observationCount: 1,
            method: 'gps' as const // Control points are GPS-fixed from national system
          }
        };
      });
      
      console.log('[CoordinateList] Converted trig points:', trigPoints.length);
      console.log('[CoordinateList] First converted trig point:', trigPoints[0]);
      
      // Prepend control points to trig beacons (they come first)
      groupedPoints.trig = [...trigPoints, ...groupedPoints.trig];
    }
    
    // Generate cover page
    const totalPoints = adjustedCoordinates.length + (projectControlPoints?.length || 0);
    this.generateCoverPage(pdf, surveyorInfo, totalPoints);
    
    // Generate continuous list with all sections
    // Sections flow into each other, separated by section headers
    // ⭐ CALCULATED POINTS appear after FOUND BEACONS
    const allSections = [
      { name: 'TRIG BEACONS / TSMs', points: groupedPoints.trig },
      { name: 'WORKING STATIONS', points: groupedPoints.working },
      { name: 'ADOPTED BEACONS', points: groupedPoints.adopted },
      { name: 'FOUND, NOT ADOPTED', points: groupedPoints.foundNotAdopted },
      { name: 'CALCULATED POINTS', points: groupedPoints.calculated },
      { name: 'PLACED BEACONS', points: groupedPoints.placed }
    ].filter(section => section.points.length > 0);
    
    console.log('[CoordinateList] 📋 Sections to render:');
    allSections.forEach((section, index) => {
      console.log(`  ${index + 1}. ${section.name}: ${section.points.length} points`);
    });
    
    this.generateContinuousList(
      pdf,
      allSections,
      lookupStore.fieldBookPageLookup
    );
    
    // Use actual PDF page count to avoid off-by-one errors
    // this.currentPage represents the last page number used, not the next page
    const pageCount = this.currentPage - 100 + 1;  // +1 to include the current page
    return { pdf, pageCount };
  }
  
  /**
   * Generate cover page for Coordinate List
   */
  private generateCoverPage(
    pdf: jsPDF,
    surveyorInfo: SurveyorInfo,
    totalPoints: number
  ): void {
    pdf.addPage();
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('CO-ORDINATE LIST', this.options.marginLeft, 50);
    
    let yPosition = 70;
    pdf.setFontSize(12);
    
    pdf.text('SURVEY OF:', this.options.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(surveyorInfo.projectTitle || '', this.options.marginLeft + 30, yPosition);
    yPosition += 15;
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('DISTRICT:', this.options.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(surveyorInfo.district || '', this.options.marginLeft + 30, yPosition);
    yPosition += 15;
    
    // Survey details
    pdf.setFont('helvetica', 'bold');
    pdf.text('S.R. No.:', this.options.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    yPosition += 15;
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Land Surveyor:', this.options.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(surveyorInfo.name, this.options.marginLeft + 40, yPosition);
    yPosition += 10;
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('License No:', this.options.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(surveyorInfo.licenseNumber, this.options.marginLeft + 40, yPosition);
    yPosition += 15;
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Survey Date:', this.options.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(surveyorInfo.surveyDate, this.options.marginLeft + 40, yPosition);
    yPosition += 15;
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Total Points:', this.options.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${totalPoints}`, this.options.marginLeft + 40, yPosition);
    
    // Footer
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'italic');
    // Use central meridian from project settings, fallback to 31 if not specified
    const loValue = surveyorInfo.centralMeridian ?? 31;
    const footerText = `Lo ${loValue}° CO-ORDINATES - Metres`;
    const footerWidth = pdf.getTextWidth(footerText);
    const footerX = (pdf.internal.pageSize.getWidth() - footerWidth) / 2;
    pdf.text(footerText, footerX, pdf.internal.pageSize.getHeight() - 20);
  }
  
  /**
   * Group points by type based on description and status
   * Points are assigned to ONE category only, with priority order:
   * 1. TRIG BEACONS (highest priority)
   * 2. WORKING STATIONS
   * 3. FOUND BEACONS
   * 4. CALCULATED POINTS ⭐ NEW: Not physically beaconed
   * 5. PLACED BEACONS (lowest priority)
   */
  private groupPointsByType(points: AdjustedCoordinate[]): GroupedPoints {
    const grouped: GroupedPoints = {
      trig: [],
      working: [],
      adopted: [],
      foundNotAdopted: [],
      calculated: [],
      placed: []
    };

    points.forEach(point => {
      // The Status column is what the surveyor states deliberately, so it
      // decides the section; the description is only consulted when the status
      // is silent. It used to be the other way round, and a station coded WS
      // was filed by whatever its description happened to mention.
      const { kind, provenance } = parseBeaconStatus(point.status);

      if (kind === 'TRIG' || kind === 'OCP' || this.isTrigBeacon(point)) {
        grouped.trig.push(point);
      } else if (kind === 'WS' || kind === 'WSU' || this.isWorkingStation(point)) {
        grouped.working.push(point);
      } else if (this.isCalculatedPoint(point)) {
        grouped.calculated.push(point);
      } else if (provenance === 'F') {
        grouped.adopted.push(point);
      } else if (provenance === 'FN') {
        grouped.foundNotAdopted.push(point);
      } else if (this.isFoundBeacon(point)) {
        grouped.adopted.push(point);
      } else {
        // Everything else is a placed beacon. Nothing falls through: a point
        // that matched no rule used to be dropped, and a beacon missing from a
        // lodged co-ordinate list is the worst outcome on offer.
        grouped.placed.push(point);
      }
    });
    
    console.log('[CoordinateList] 📊 Point grouping:');
    console.log(`  - TRIG: ${grouped.trig.length}`);
    console.log(`  - WORKING: ${grouped.working.length}`);
    console.log(`  - ADOPTED: ${grouped.adopted.length}`);
    console.log(`  - FOUND, NOT ADOPTED: ${grouped.foundNotAdopted.length}`);
    console.log(`  - CALCULATED: ${grouped.calculated.length}`);
    console.log(`  - PLACED: ${grouped.placed.length}`);
    
    return grouped;
  }
  
  /**
   * Check if point is a trig beacon or TSM (Town Survey Mark)
   * TSMs are identified by pointId starting with 'TSM' followed by numbers
   */
  private isTrigBeacon(point: AdjustedCoordinate): boolean {
    const desc = (point.description || '').toLowerCase();
    const status = (point.status || '').toLowerCase();
    const pointId = (point.pointId || '').toUpperCase();
    
    // Check if pointId matches TSM#### pattern (e.g., TSM5025, TSM5026)
    const isTSM = /^TSM\d+$/.test(pointId);
    
    return status === 'trig' ||
           isTSM ||
           desc.includes('trig') || 
           desc.includes('town survey mark') ||
           desc.includes('tsm');
  }
  
  /**
   * Check if point is a working station
   */
  private isWorkingStation(point: AdjustedCoordinate): boolean {
    const desc = (point.description || '').toLowerCase();
    const status = (point.status || '').toLowerCase();
    // No bare `desc.includes('ws')`: that is true of "brass screws in concrete"
    // and of anything else with those two letters adjacent. An explicit WS/WSU
    // status is handled by the caller; this is only the description fallback.
    return desc.includes('working station') ||
           status.includes('working');
  }
  
  /**
   * Check if point is a found beacon
   */
  private isFoundBeacon(point: AdjustedCoordinate): boolean {
    const status = (point.status || '').toLowerCase();
    return status === 'f' || status.includes('found');
  }
  
  /**
   * Check if point is a calculated point
   * ⭐ NEW: Calculated points are not physically beaconed
   */
  private isCalculatedPoint(point: AdjustedCoordinate): boolean {
    const status = (point.status || '').toLowerCase();
    const desc = (point.description || '').toLowerCase();
    return status === 'c' || 
           status === 'calc' || 
           status.includes('calculated') ||
           desc.includes('calculated') ||
           desc.includes('not beaconed');
  }
  
  /**
   * Check if point is a placed beacon
   */
  private isPlacedBeacon(point: AdjustedCoordinate): boolean {
    const status = (point.status || '').toLowerCase();
    const desc = (point.description || '').toLowerCase();
    
    // Default classification: if status is 'new' or empty, treat as placed beacon
    // This ensures all points are included in the coordinate list
    if (status === 'new' || status === '' || status === 'n') {
      return true;
    }
    
    return status === 'p' || 
           status.includes('placed') || 
           status.includes('peg') ||
           desc.includes('iron peg') ||
           desc.includes('iron pipe');
  }
  
  /**
   * Generate continuous list with all sections flowing together
   */
  private generateContinuousList(
    pdf: jsPDF,
    sections: Array<{ name: string; points: AdjustedCoordinate[] }>,
    fieldBookLookup: Record<string, string>
  ): void {
    let isFirstPage = true;
    let currentY = 0;
    let currentSectionIndex = 0;
    let pointIndexInSection = 0;
    let isFirstPageOfDocument = true;

    // Nothing to lay out. The caller filters out empty sections, so an empty coordinate
    // list leaves no sections at all -- and the code below indexes sections[0] directly.
    // The document is still valid: generateCoverPage() has already added the cover page.
    if (sections.length === 0) {
      return;
    }

    // Start first page
    pdf.addPage();
    this.addPageNumber(pdf, this.currentPage);
    this.generatePageHeader(pdf, '', true, this.surveyorInfo);
    currentY = this.generateTableHeader(pdf, sections[0].name, true);
    
    // Add the first section header (TRIG BEACONS / TSMs, etc.)
    currentY = this.addSectionHeader(pdf, sections[0].name, currentY);
    
    while (currentSectionIndex < sections.length) {
      const section = sections[currentSectionIndex];
      const remainingPoints = section.points.slice(pointIndexInSection);
      
      if (remainingPoints.length === 0) {
        // Move to next section
        currentSectionIndex++;
        pointIndexInSection = 0;
        
        if (currentSectionIndex < sections.length) {
          // Add section header with line break
          const nextSection = sections[currentSectionIndex];
          currentY = this.addSectionHeader(pdf, nextSection.name, currentY);
          
          // Check if we need a new page after section header
          if (currentY > pdf.internal.pageSize.getHeight() - this.options.marginBottom - 20) {
            pdf.addPage();
            this.currentPage++;
            this.addPageNumber(pdf, this.currentPage);
            this.generatePageHeader(pdf, '', false, this.surveyorInfo);
            currentY = this.generateTableHeader(pdf, nextSection.name, false);
          }
        }
        continue;
      }
      
      // Render points on current page
      const result = this.renderPointsOnPageContinuous(
        pdf,
        remainingPoints,
        fieldBookLookup,
        currentY
      );
      
      pointIndexInSection += result.renderedCount;
      currentY = result.endY;
      
      // Check if we need a new page
      if (result.needsNewPage && (pointIndexInSection < section.points.length || currentSectionIndex < sections.length - 1)) {
        pdf.addPage();
        this.currentPage++;
        this.addPageNumber(pdf, this.currentPage);
        this.generatePageHeader(pdf, '', false, this.surveyorInfo);
        
        // Determine which section name to show in header
        const headerSection = currentSectionIndex < sections.length ? sections[currentSectionIndex].name : '';
        currentY = this.generateTableHeader(pdf, headerSection, false);
      }
    }
  }
  
  /**
   * Add section header with line break
   */
  private addSectionHeader(pdf: jsPDF, sectionName: string, currentY: number): number {
    const rowHeight = 6;
    const headerHeight = 10;
    
    console.log(`[CoordinateList] 📋 Adding section header: "${sectionName}" at Y=${currentY}`);
    
    // Check if we have space for section header
    if (currentY + headerHeight > pdf.internal.pageSize.getHeight() - this.options.marginBottom) {
      console.log(`[CoordinateList] ⚠️ Not enough space for section header, will trigger new page`);
      return currentY; // Will trigger new page in main loop
    }
    
    // Add blank line
    currentY += rowHeight;
    
    // Add section header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(sectionName, this.options.marginLeft, currentY);
    console.log(`[CoordinateList] ✅ Section header "${sectionName}" rendered at Y=${currentY}`);
    currentY += rowHeight;
    
    return currentY;
  }
  
  /**
   * Generate page header with title
   */
  private generatePageHeader(
    pdf: jsPDF, 
    groupName: string, 
    isFirstPage: boolean,
    surveyorInfo: SurveyorInfo
  ): void {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    
    // Main title
    pdf.text('CO-ORDINATE LIST', this.options.marginLeft, 25);
    
    // S.R. No. on right
    pdf.setFontSize(12);
    const srText = 'S.R. No.';
    const srWidth = pdf.getTextWidth(srText);
    pdf.text(srText, pdf.internal.pageSize.getWidth() - this.options.marginRight - srWidth, 25);
    
    // Project title - split into multiple lines if needed
    pdf.setFontSize(10);
    const surveyOfText = `SURVEY OF: ${surveyorInfo.projectTitle}`;
    const maxWidth = pdf.internal.pageSize.getWidth() - 2 * this.options.marginLeft;
    const lines = pdf.splitTextToSize(surveyOfText, maxWidth);
    let yPos = 35;
    lines.forEach((line: string) => {
      pdf.text(line, this.options.marginLeft, yPos);
      yPos += 7;
    });
    
    // District - with proper label/value separation
    pdf.setFont('helvetica', 'bold');
    pdf.text('DISTRICT:', this.options.marginLeft, yPos + 3);
    pdf.setFont('helvetica', 'normal');
    pdf.text(surveyorInfo.district || '', this.options.marginLeft + 30, yPos + 3);
    
    // Group name (only on first page of group)
    if (isFirstPage) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(groupName, this.options.marginLeft, 65);
    }
  }
  
  /**
   * Generate table header (repeats on every page)
   */
  private generateTableHeader(pdf: jsPDF, groupName: string, isFirstPage: boolean): number {
    let yPos = 58;
    
    // Table header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    
    // REFERENCES section
    pdf.text('REFERENCES', this.options.marginLeft, yPos);
    // Use central meridian from project settings, fallback to 31 if not specified
    const loValue = this.surveyorInfo.centralMeridian ?? 31;
    console.log('[CoordinateList] Table header - centralMeridian:', this.surveyorInfo.centralMeridian, 'using:', loValue);
    pdf.text(`Lo ${loValue}°`, this.options.marginLeft + COL.y, yPos);
    pdf.text('DESCRIPTION', this.options.marginLeft + COL.description, yPos);
    yPos += 5;
    
    pdf.setFontSize(10);
    pdf.text('F/B', this.options.marginLeft, yPos);
    pdf.text('Calcs', this.options.marginLeft + COL.calcs, yPos);
    pdf.text('Beacons/', this.options.marginLeft + COL.beaconsCentre, yPos, { align: 'center' });
    pdf.text('CO-ORDINATES', this.options.marginLeft + COL.y, yPos);
    yPos += 4;
    
    pdf.text('Stations', this.options.marginLeft + COL.beaconsCentre, yPos, { align: 'center' });
    pdf.text('Metres', this.options.marginLeft + COL.metres, yPos);
    pdf.text('F = Found', this.options.marginLeft + COL.description, yPos);
    pdf.text('F/P', this.options.marginLeft + COL.fpRight - pdf.getTextWidth('F/P'), yPos);
    pdf.text('F/B', this.options.marginLeft + COL.fbRefRight - pdf.getTextWidth('F/B'), yPos);
    yPos += 4;
    
    pdf.text('Y', this.options.marginLeft + COL.y, yPos);
    pdf.text('X', this.options.marginLeft + COL.x, yPos);
    pdf.text('P = Placed', this.options.marginLeft + COL.description, yPos);
    yPos += 6;
    
    // CONSTANTS row (on every page)
    pdf.setFont('helvetica', 'normal');
    pdf.text('CONSTANTS', this.options.marginLeft + COL.beaconsRight, yPos, { align: 'right' });
    pdf.text('± 0.00', this.options.marginLeft + COL.y, yPos);
    pdf.text('± 0.00', this.options.marginLeft + COL.x, yPos);
    yPos += 8;
    
    return yPos; // Return starting Y position for data rows
  }
  
  /**
   * Render points on current page until full (continuous mode)
   * Returns rendered count, end Y position, and whether new page is needed
   */
  private renderPointsOnPageContinuous(
    pdf: jsPDF,
    points: AdjustedCoordinate[],
    fieldBookLookup: Record<string, string>,
    startY: number
  ): { renderedCount: number; endY: number; needsNewPage: boolean } {
    let yPos = startY;
    const maxY = pdf.internal.pageSize.getHeight() - this.options.marginBottom;
    const rowHeight = 6;
    let renderedCount = 0;
    
    // Table rows
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    
    for (const point of points) {
      // Check if we have space for this row
      if (yPos + rowHeight > maxY) {
        return { renderedCount, endY: yPos, needsNewPage: true };
      }
      
      // F/B column - BLANK (for manual entry, not for cross-reference)
      // This column is intentionally left blank
      
      // Calcs column - Calculations Part 1 page reference (from adjusted coordinate)
      // Skip for TRIG beacons from national system (calculationsPage === 0)
      const calcsPage = point.calculationsPage === 0 ? '' : (point.calculationsPage?.toString() || '-');
      if (calcsPage) {
        pdf.text(calcsPage, this.options.marginLeft + COL.calcs, yPos);
      }
      
      // Point - Point ID
      pdf.text(point.pointId, this.options.marginLeft + COL.beaconsCentre, yPos, { align: 'center' });
      
      // Y coordinate (Westing) - use banker's rounding to 2 decimals
      const coords = toCoordinateListPrecision(point);
      
      // Debug: Log first few points to verify coordinates
      if (renderedCount < 5) {
        console.log(`[CoordinateList] Rendering point ${point.pointId}: y=${point.y} -> ${coords.y}, x=${point.x} -> ${coords.x}`);
      }
      
      pdf.text(coords.y, this.options.marginLeft + COL.y, yPos);
      
      // X coordinate (Southing) - use banker's rounding to 2 decimals
      pdf.text(coords.x, this.options.marginLeft + COL.x, yPos);
      
      // Description, trimmed to the width actually available before the F/P
      // column rather than to a character count. A count cannot know how wide
      // the glyphs are: "50mm iron pipe in concrete" and "IIIIIIIIIIIIIIIIIIIIIIIIII"
      // are both 26 characters and differ by half a column, so a cap tuned for
      // one font size silently overruns at the next.
      // Derived from the columns either side rather than tuned by hand, so it
      // follows them if they move. The gap keeps the description visibly
      // separate from F/P, whose right-justified glyph starts a little before
      // its nominal edge.
      const descLimit = COL.fpRight - COL.description - 5;
      pdf.text(
        fitToWidth(pdf, point.description, descLimit),
        this.options.marginLeft + COL.description,
        yPos,
      );
      
      // F/P status (skip for TRIG beacons from national system)
      // RIGHT-JUSTIFIED
      if (point.calculationsPage !== 0) {
        // ⭐ CRITICAL: A calculated point was derived, not visited. It is neither
        // Found nor Placed — the only two values this column's legend defines —
        // and no field book page records an observation of it. Both cells carry
        // the "-" not-applicable marker; only the Calcs page reference is real.
        const isCalculated = this.isCalculatedPoint(point);

        const status = isCalculated ? '-' : point.status.toUpperCase().substring(0, 1);
        pdf.text(status, this.options.marginLeft + COL.fpRight, yPos, { align: 'right' });

        // F.B column - Field Book page reference (cross-reference to Field Book)
        // RIGHT-JUSTIFIED
        const fbPage = isCalculated ? '-' : (point.fieldBookPage || '-');
        pdf.text(fbPage, this.options.marginLeft + COL.fbRefRight, yPos, { align: 'right' });
      }
      
      yPos += rowHeight;
      renderedCount++;
    }
    
    return { renderedCount, endY: yPos, needsNewPage: false };
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
   * Calculate expected page count for coordinate list
   */
  calculatePageCount(adjustedCoordinates: AdjustedCoordinate[]): number {
    const groupedPoints = this.groupPointsByType(adjustedCoordinates);
    const pointsPerPage = 35;
    
    let totalPages = 1; // Cover page
    
    // Every section, counted from the grouping itself rather than named one by
    // one. The hand-written list had already fallen behind: it never counted
    // CALCULATED POINTS, so the page total ran short whenever a survey had any.
    for (const section of Object.values(groupedPoints)) {
      if (section.length > 0) {
        totalPages += Math.ceil(section.length / pointsPerPage);
      }
    }
    
    return totalPages;
  }
}
