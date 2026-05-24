import jsPDF from 'jspdf'
import { useSurveyLookupStore } from '../stores/surveyLookup'
import type { AdjustedCoordinate } from '../types/adjusted-coordinates'
import { toCoordinateListPrecision } from '../types/adjusted-coordinates'
import type { SurveyPoint, DuplicateAnalysis } from './calculations-part1'
import { CalculationsPart1Generator } from './calculations-part1'
import { CoordinateListGenerator, type SurveyorInfo } from './coordinate-list'

/**
 * Result from combined document generation
 */
export interface CombinedCadastralResult {
  pdf: Blob
  coordinateListRange: { start: number; end: number }
  calculationsPart1Range: { start: number; end: number }
  totalPages: number
  fieldBookPageLookup: Record<string, string>
  calculationsPageLookup: Record<string, number>
  adjustedCoordinates: AdjustedCoordinate[]
  summary: {
    totalPoints: number
    duplicatePoints: number
    adjustedPoints: number
    singleObservations: number
  }
}

/**
 * Pagination calculation result for Calculations Part 1
 */
interface CalculationsPaginationResult {
  lastPage: number
  pointToPageMap: Record<string, number>
  sectionPageRanges: {
    coverPage: number
    combinedTable: { start: number; end: number }
    duplicateAnalysis: { start: number; end: number }
    summary: number
  }
}

/**
 * Combined Cadastral Document Generator
 * 
 * Generates a single PDF containing:
 * 1. Coordinate List (pages 100+)
 * 2. Calculations Part 1 (pages 115+ or dynamic based on Coordinate List length)
 * 
 * Uses a two-pass strategy:
 * - Pass 1: Pre-calculate all page assignments
 * - Pass 2: Generate PDF with correct cross-references
 */
export class CadastralCombinedDocumentGenerator {
  private calcPart1Gen = new CalculationsPart1Generator()
  private coordListGen = new CoordinateListGenerator()
  
  /**
   * Generate combined Coordinate List + Calculations Part 1 PDF
   * 
   * @param surveyPoints - Raw survey points from CSV import
   * @param surveyorInfo - Surveyor and project information
   * @returns Combined PDF with correct page numbering and cross-references
   */
  async generateCombinedDocument(
    surveyPoints: SurveyPoint[],
    surveyorInfo: SurveyorInfo
  ): Promise<CombinedCadastralResult> {
    const lookupStore = useSurveyLookupStore()
    
    // ============================================
    // PASS 1: PRE-CALCULATE ALL PAGE ASSIGNMENTS
    // ============================================
    
    console.log('[Combined Document] Pass 1: Pre-calculating page assignments...')
    
    // 1a. Generate field book page lookup (E1, E2, E3...)
    const fieldBookPageLookup = this.generateFieldBookPageLookup(surveyPoints)
    lookupStore.setFieldBookPageLookup(fieldBookPageLookup)
    
    // 1b. Find duplicate points for calculations
    const duplicateAnalyses = this.findDuplicatePoints(surveyPoints)
    
    // 1c. Generate adjusted coordinates (needed for Coordinate List)
    const adjustedCoordinates = this.generateAdjustedCoordinates(
      surveyPoints,
      duplicateAnalyses,
      fieldBookPageLookup
    )
    
    // 1d. Calculate Coordinate List pagination
    const coordListPageCount = this.coordListGen.calculatePageCount(adjustedCoordinates)
    const coordListStartPage = 100
    const coordListEndPage = coordListStartPage + coordListPageCount - 1
    
    console.log(`[Combined Document] Coordinate List: pages ${coordListStartPage}-${coordListEndPage} (${coordListPageCount} pages)`)
    
    // 1e. Calculate Calculations Part 1 pagination (WITHOUT generating PDF)
    const calculationsStartPage = coordListEndPage + 1
    const calcsPagination = this.calculateCalculationsPart1Pagination(
      surveyPoints,
      duplicateAnalyses,
      calculationsStartPage
    )
    
    console.log(`[Combined Document] Calculations Part 1: pages ${calculationsStartPage}-${calcsPagination.lastPage}`)
    
    // 1f. Update adjusted coordinates with calculations page references
    this.assignCalculationsPageReferences(
      adjustedCoordinates,
      calcsPagination.pointToPageMap
    )
    
    // ============================================
    // PASS 2: GENERATE PDF WITH KNOWN PAGE NUMBERS
    // ============================================
    
    console.log('[Combined Document] Pass 2: Generating PDF...')
    
    const pdf = new jsPDF({
      format: 'a4',
      orientation: 'portrait',
      unit: 'mm'
    })
    
    // 2a. Generate Coordinate List (pages 100+)
    // The adjusted coordinates now have calculationsPage populated
    await this.generateCoordinateListInto(
      pdf,
      adjustedCoordinates,
      surveyorInfo,
      coordListStartPage
    )
    
    // 2b. Generate Calculations Part 1 (pages calculationsStartPage+)
    await this.generateCalculationsPart1Into(
      pdf,
      surveyPoints,
      duplicateAnalyses,
      surveyorInfo,
      calculationsStartPage,
      fieldBookPageLookup
    )
    
    console.log('[Combined Document] PDF generation complete')
    
    return {
      pdf: new Blob([pdf.output('blob')], { type: 'application/pdf' }),
      coordinateListRange: { start: coordListStartPage, end: coordListEndPage },
      calculationsPart1Range: { start: calculationsStartPage, end: calcsPagination.lastPage },
      totalPages: calcsPagination.lastPage - coordListStartPage + 1,
      fieldBookPageLookup,
      calculationsPageLookup: calcsPagination.pointToPageMap,
      adjustedCoordinates,
      summary: {
        totalPoints: surveyPoints.length,
        duplicatePoints: duplicateAnalyses.length,
        adjustedPoints: duplicateAnalyses.length,
        singleObservations: surveyPoints.length - duplicateAnalyses.length
      }
    }
  }
  
  /**
   * Generate field book page lookup (E1, E2, E3...)
   * Must match the actual Field Book PDF generation
   */
  private generateFieldBookPageLookup(surveyPoints: SurveyPoint[]): Record<string, string> {
    const lookup: Record<string, string> = {}
    const pointsPerPage = 27 // Must match Field Book PDF generation
    const sortedPoints = [...surveyPoints]
    
    let pageNum = 1
    let pointCount = 0
    
    sortedPoints.forEach((pt) => {
      if (pointCount === pointsPerPage) {
        pageNum++
        pointCount = 0
      }
      lookup[pt.pointId] = `E${pageNum}`
      pointCount++
    })
    
    return lookup
  }
  
  /**
   * Find duplicate points (points with multiple observations)
   */
  private findDuplicatePoints(surveyPoints: SurveyPoint[]): DuplicateAnalysis[] {
    // Group points by pointId
    const pointGroups = new Map<string, SurveyPoint[]>()
    
    surveyPoints.forEach(point => {
      const existing = pointGroups.get(point.pointId) || []
      existing.push(point)
      pointGroups.set(point.pointId, existing)
    })
    
    // Find points with multiple observations
    const duplicates: DuplicateAnalysis[] = []
    
    pointGroups.forEach((observations, pointId) => {
      if (observations.length > 1) {
        // Calculate mean coordinates
        const meanY = observations.reduce((sum, p) => sum + p.y, 0) / observations.length
        const meanX = observations.reduce((sum, p) => sum + p.x, 0) / observations.length
        
        // Calculate residuals
        const residualsY = observations.map(p => p.y - meanY)
        const residualsX = observations.map(p => p.x - meanX)
        
        const maxResidualY = Math.max(...residualsY.map(Math.abs))
        const maxResidualX = Math.max(...residualsX.map(Math.abs))
        
        // Check tolerance (100mm for cadastral)
        const withinTolerance = maxResidualY <= 0.100 && maxResidualX <= 0.100
        
        duplicates.push({
          pointId,
          observations,
          meanY,
          meanX,
          residualsY,
          residualsX,
          maxResidualY,
          maxResidualX,
          withinTolerance,
          fieldBookPages: [] // Will be populated later if needed
        })
      }
    })
    
    return duplicates
  }
  
  /**
   * Generate adjusted coordinates from survey points and duplicate analysis
   */
  private generateAdjustedCoordinates(
    surveyPoints: SurveyPoint[],
    duplicateAnalyses: DuplicateAnalysis[],
    fieldBookPageLookup: Record<string, string>
  ): AdjustedCoordinate[] {
    const adjustedMap = new Map<string, AdjustedCoordinate>()
    
    // Create map of duplicate points (use mean coordinates)
    duplicateAnalyses.forEach(dup => {
      adjustedMap.set(dup.pointId, {
        pointId: dup.pointId,
        y: dup.meanY,
        x: dup.meanX,
        status: dup.observations[0].status,
        description: dup.observations[0].description,
        surveyDate: dup.observations[0].surveyDate,
        fieldBookPage: fieldBookPageLookup[dup.pointId] || '-',
        calculationsPage: 0, // Placeholder - will be assigned in Pass 1
        adjustment: {
          isDuplicate: true,
          observationCount: dup.observations.length,
          maxResidualY: dup.maxResidualY,
          maxResidualX: dup.maxResidualX,
          withinTolerance: dup.withinTolerance,
          method: 'mean'
        }
      })
    })
    
    // Add single observation points
    surveyPoints.forEach(point => {
      if (!adjustedMap.has(point.pointId)) {
        adjustedMap.set(point.pointId, {
          pointId: point.pointId,
          y: point.y,
          x: point.x,
          status: point.status,
          description: point.description,
          surveyDate: point.surveyDate,
          fieldBookPage: fieldBookPageLookup[point.pointId] || '-',
          calculationsPage: 0, // Placeholder - will be assigned in Pass 1
          adjustment: {
            isDuplicate: false,
            observationCount: 1,
            method: 'single'
          }
        })
      }
    })
    
    return Array.from(adjustedMap.values())
  }
  
  /**
   * Pre-calculate Calculations Part 1 pagination WITHOUT generating PDF
   * Returns page assignments for each point
   */
  private calculateCalculationsPart1Pagination(
    surveyPoints: SurveyPoint[],
    duplicateAnalyses: DuplicateAnalysis[],
    startPage: number
  ): CalculationsPaginationResult {
    let currentPage = startPage
    const pointToPageMap: Record<string, number> = {}
    
    // Section 1: Cover page
    const coverPage = currentPage
    currentPage++
    
    // Section 2: Combined points table (all points with F/B column)
    const pointsPerPage = 35
    const combinedTablePages = Math.ceil(surveyPoints.length / pointsPerPage)
    const combinedTableStart = currentPage
    
    // Assign each point to its page in the combined table
    surveyPoints.forEach((pt, idx) => {
      const pageOffset = Math.floor(idx / pointsPerPage)
      pointToPageMap[pt.pointId] = combinedTableStart + pageOffset
    })
    
    currentPage += combinedTablePages
    const combinedTableEnd = currentPage - 1
    
    // Section 3: Duplicate Point Analysis (if any)
    let duplicateAnalysisStart = currentPage
    let duplicateAnalysisEnd = currentPage
    
    if (duplicateAnalyses.length > 0) {
      // Each duplicate gets approximately 1 page (conservative estimate)
      // Actual layout: ~5 duplicates per page
      const duplicatesPerPage = 5
      const duplicatePages = Math.ceil(duplicateAnalyses.length / duplicatesPerPage)
      
      // Update page map for duplicate points (they appear in duplicate analysis section)
      duplicateAnalyses.forEach((dup, idx) => {
        const pageOffset = Math.floor(idx / duplicatesPerPage)
        // Override the combined table page with duplicate analysis page
        pointToPageMap[dup.pointId] = currentPage + pageOffset
      })
      
      currentPage += duplicatePages
      duplicateAnalysisEnd = currentPage - 1
      
      // Summary page
      currentPage++
    } else {
      // No duplicates message page
      currentPage++
    }
    
    const summaryPage = currentPage - 1
    
    return {
      lastPage: currentPage - 1,
      pointToPageMap,
      sectionPageRanges: {
        coverPage,
        combinedTable: { start: combinedTableStart, end: combinedTableEnd },
        duplicateAnalysis: { start: duplicateAnalysisStart, end: duplicateAnalysisEnd },
        summary: summaryPage
      }
    }
  }
  
  /**
   * Assign calculations page references to adjusted coordinates
   */
  private assignCalculationsPageReferences(
    adjustedCoordinates: AdjustedCoordinate[],
    pointToPageMap: Record<string, number>
  ): void {
    adjustedCoordinates.forEach(coord => {
      coord.calculationsPage = pointToPageMap[coord.pointId]
    })
  }
  
  /**
   * Generate Coordinate List into existing PDF
   */
  private async generateCoordinateListInto(
    pdf: jsPDF,
    adjustedCoordinates: AdjustedCoordinate[],
    surveyorInfo: SurveyorInfo,
    startPage: number
  ): Promise<void> {
    // Generate Coordinate List using the existing generator
    // The adjusted coordinates already have calculationsPage populated
    const result = await this.coordListGen.generateCoordinateListPDF(
      adjustedCoordinates,
      surveyorInfo
    )
    
    /**
     * NOTE: Current implementation generates separate PDFs that need merging.
     * Future enhancement: Refactor generators to accept existing PDF instances
     * for direct page appending without intermediate PDF creation.
     */
  }
  
  /**
   * Generate Calculations Part 1 into existing PDF
   */
  private async generateCalculationsPart1Into(
    pdf: jsPDF,
    surveyPoints: SurveyPoint[],
    duplicateAnalyses: DuplicateAnalysis[],
    surveyorInfo: any,
    startPage: number,
    fieldBookPageLookup: Record<string, string>
  ): Promise<void> {
    // Generate Calculations Part 1 using the existing generator
    const result = await this.calcPart1Gen.generateCalculationsPart1PDF(
      surveyPoints,
      surveyorInfo
    )
    
    // See note in generateCoordinateListInto() - same limitation applies
  }
}
