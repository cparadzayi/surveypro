import jsPDF from 'jspdf'
import { useSurveyLookupStore } from '../stores/surveyLookup'
import type { AdjustedCoordinate } from '../types/adjusted-coordinates'
import type { SurveyPoint, DuplicateAnalysis } from './calculations-part1'
import { CalculationsPart1Generator } from './calculations-part1'
import { CoordinateListGenerator, type SurveyorInfo } from './coordinate-list'

/**
 * Simplified Combined Cadastral Document Generator
 * 
 * Strategy:
 * 1. Generate Calculations Part 1 first (to get adjusted coordinates and page mapping)
 * 2. Calculate where Coordinate List will end
 * 3. Generate Coordinate List with correct Calcs column references
 * 4. Renumber Calculations Part 1 pages and append
 * 
 * This avoids the circular dependency by generating Calculations first,
 * then using its output to populate the Coordinate List.
 */
export class SimplifiedCadastralCombinedGenerator {
  private calcPart1Gen = new CalculationsPart1Generator()
  private coordListGen = new CoordinateListGenerator()
  
  /**
   * Generate combined document
   */
  async generateCombinedDocument(
    surveyPoints: SurveyPoint[],
    surveyorInfo: SurveyorInfo,
    projectControlPoints?: any[]
  ) {
    console.log('[Simplified Combined] Starting generation...')
    console.log('[Simplified Combined] Control points received:', projectControlPoints?.length || 0)
    if (projectControlPoints && projectControlPoints.length > 0) {
      console.log('[Simplified Combined] First control point:', projectControlPoints[0])
    }
    
    // Step 1: Generate Calculations Part 1 (temporary, starting at page 116)
    // This gives us adjusted coordinates and tells us which points appear on which pages
    const calcResult = await this.calcPart1Gen.generateCalculationsPart1PDF(
      surveyPoints,
      surveyorInfo
    )
    
    console.log('[Simplified Combined] Calculations Part 1 generated:', calcResult.pageCount, 'pages')
    console.log('[Simplified Combined] Starting page:', calcResult.startingPage)
    console.log('[Simplified Combined] Adjusted coordinates:', calcResult.adjustedCoordinates.length)
    
    // Step 2: Generate Coordinate List FIRST to get ACTUAL end page
    // We generate it with placeholder calculationsPage values (they'll be wrong initially)
    const coordListStartPage = 100
    const coordListResultTemp = await this.coordListGen.generateCoordinateListPDF(
      calcResult.adjustedCoordinates,
      surveyorInfo,
      projectControlPoints
    )
    
    // Get the ACTUAL last page number from the generated Coordinate List
    const coordListEndPage = coordListStartPage + coordListResultTemp.pageCount - 1
    
    console.log('[Simplified Combined] Coordinate List ACTUAL pages:', coordListResultTemp.pageCount, '(100-' + coordListEndPage + ')')
    
    // Step 3: Calculate actual Calculations Part 1 starting page
    const actualCalcsStartPage = coordListEndPage + 1
    const actualCalcsEndPage = actualCalcsStartPage + calcResult.pageCount - 1
    
    console.log('[Simplified Combined] Calculations Part 1 will be renumbered to:', actualCalcsStartPage + '-' + actualCalcsEndPage)
    
    // Step 4: Update adjusted coordinates with correct calculations page numbers
    // The calculationsPageLookup from Step 1 has page numbers starting at calcResult.startingPage
    // We need to offset them to actual page numbers (actualCalcsStartPage, actualCalcsStartPage+1, ...)
    const pageOffset = actualCalcsStartPage - calcResult.startingPage
    
    console.log('[Simplified Combined] Page offset calculation:', actualCalcsStartPage, '-', calcResult.startingPage, '=', pageOffset)
    
    calcResult.adjustedCoordinates.forEach(coord => {
      if (coord.calculationsPage) {
        const oldPage = coord.calculationsPage
        coord.calculationsPage = coord.calculationsPage + pageOffset
        if (oldPage <= calcResult.startingPage + 2) { // Log first few for debugging
          console.log(`[Simplified Combined] Updated point ${coord.pointId}: page ${oldPage} -> ${coord.calculationsPage}`)
        }
      }
    })
    
    console.log('[Simplified Combined] Updated calculations page references with offset:', pageOffset)
    
    // Step 5: Regenerate Coordinate List with correct Calcs column
    const coordListResult = await this.coordListGen.generateCoordinateListPDF(
      calcResult.adjustedCoordinates,
      surveyorInfo,
      projectControlPoints
    )
    
    console.log('[Simplified Combined] Coordinate List regenerated with correct cross-references')
    
    // Step 6: REGENERATE Calculations Part 1 with correct starting page
    // This is critical because page numbers are baked into the PDF
    console.log('[Simplified Combined] Regenerating Calculations Part 1 with correct page numbers...')
    const calcResultFinal = await this.calcPart1Gen.generateCalculationsPart1PDF(
      surveyPoints,
      surveyorInfo,
      actualCalcsStartPage // Pass the correct starting page!
    )
    
    console.log('[Simplified Combined] Calculations Part 1 regenerated starting at page:', actualCalcsStartPage)
    
    // Step 7: Convert jsPDF to Blob for consistent return type
    const coordListBlob = new Blob([coordListResult.pdf.output('blob')], { type: 'application/pdf' })
    
    return {
      coordinateListPDF: coordListBlob,
      calculationsPart1PDF: calcResultFinal.pdf, // Use the regenerated PDF with correct page numbers
      coordinateListRange: { start: coordListStartPage, end: coordListEndPage },
      calculationsPart1Range: { start: actualCalcsStartPage, end: actualCalcsEndPage },
      adjustedCoordinates: calcResult.adjustedCoordinates, // Keep the updated coordinates
      duplicateAnalyses: calcResultFinal.duplicateAnalyses, // ⭐ RETURN DUPLICATE ANALYSES
      fieldBookPageLookup: calcResult.fieldBookPageLookup,
      summary: calcResult.summary
    }
  }
}
