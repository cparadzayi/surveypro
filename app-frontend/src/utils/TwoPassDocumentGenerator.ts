/**
 * Two-Pass Document Generator
 * 
 * Solves the circular dependency problem in comprehensive document generation
 * by measuring document structure first, then rendering with accurate cross-references.
 * 
 * PASS 1: Measurement - Use VirtualPDFMeasurer to determine actual page numbers
 * PASS 2: Rendering - Generate PDFs with accurate cross-references
 */

import { PDFDocument } from 'pdf-lib'
import type {
  DocumentMeasurements,
  CalculationsMeasurement,
  FieldBookMeasurement,
  CoordinateListMeasurement,
  AreasMeasurement,
  SectionMeasurement
} from '../types/document-measurements'
import type { CalculationsPart1Result } from '../types/adjusted-coordinates'
import { CalculationsPart1Generator, type SurveyPoint } from './calculations-part1'
import { CoordinateListGenerator, type SurveyorInfo } from './coordinate-list'
import { FieldBookGenerator } from './field-book'
import type { AdjustedCoordinate } from '../types/adjusted-coordinates'
import type { ReportOnSurveyData } from '../types/cadastral'
import {
  generateBeaconComparisonReportPDF,
  type BeaconComparisonReportOptions,
} from './beaconComparisonReportGenerator'

export interface TwoPassDocumentData {
  surveyPoints: SurveyPoint[]
  adjustedCoordinates: AdjustedCoordinate[]
  surveyorInfo: SurveyorInfo
  projectControlPoints?: any[]
  parcels?: any[]
  /** SI 727 s.67(5) Beacon Comparison Report inputs; omit to skip the section */
  reportData?: ReportOnSurveyData | null
  reportOptions?: BeaconComparisonReportOptions
}

export interface TwoPassDocumentResult {
  pdf: Blob
  sections: {
    fieldBook: Blob
    coordinateList: Blob
    calculations: Blob
    beaconComparison?: Blob
  }
  measurements: DocumentMeasurements
  totalPages: number
}

export class TwoPassDocumentGenerator {
  private calcGenerator: CalculationsPart1Generator
  private coordListGenerator: CoordinateListGenerator
  private fieldBookGenerator: FieldBookGenerator
  
  constructor() {
    this.calcGenerator = new CalculationsPart1Generator()
    this.coordListGenerator = new CoordinateListGenerator()
    this.fieldBookGenerator = new FieldBookGenerator()
  }
  
  /**
   * Generate comprehensive document using two-pass approach
   */
  async generate(data: TwoPassDocumentData): Promise<TwoPassDocumentResult> {
    console.log('\n┌─────────────────────────────────────────────────────────┐')
    console.log('│  🎯 TWO-PASS PDF GENERATION                            │')
    console.log('└─────────────────────────────────────────────────────────┘\n')
    
    const startTime = Date.now()
    
    // PASS 1: Measurement
    console.log('📏 PASS 1: MEASURING DOCUMENT STRUCTURE')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const measurements = await this.measurePass(data)
    const measureTime = Date.now() - startTime
    console.log(`✅ Measurement complete in ${measureTime}ms\n`)
    
    // PASS 2: Rendering
    console.log('📖 PASS 2: RENDERING FINAL PDF')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const rendered = await this.renderPass(data, measurements)
    const renderTime = Date.now() - startTime - measureTime
    const totalTime = Date.now() - startTime
    
    console.log(`✅ Rendering complete in ${renderTime}ms`)
    console.log(`\n🎉 TOTAL GENERATION TIME: ${totalTime}ms`)
    console.log(`   - Measurement: ${measureTime}ms (${Math.round(measureTime/totalTime*100)}%)`)
    console.log(`   - Rendering: ${renderTime}ms (${Math.round(renderTime/totalTime*100)}%)`)
    console.log(`   - Total Pages: ${measurements.totalPages}`)
    
    return {
      pdf: rendered.merged,
      sections: rendered.sections,
      measurements,
      totalPages: measurements.totalPages
    }
  }
  
  /**
   * PASS 1: Measure document structure
   */
  private async measurePass(data: TwoPassDocumentData): Promise<DocumentMeasurements> {
    const measureStart = Date.now()
    
    // 1. Measure Field Book
    console.log('  📘 Measuring Field Book...')
    const fieldBookMeasure = this.measureFieldBook(data)
    console.log(`     ✓ ${fieldBookMeasure.pages} pages (E1-E${fieldBookMeasure.pages})`)
    
    // 2. Measure Coordinate List FIRST (starts at page 100)
    console.log('  📋 Measuring Coordinate List...')
    const coordListMeasure = await this.measureCoordinateList(data)
    console.log(`     ✓ ${coordListMeasure.pages} pages (${coordListMeasure.startPage}-${coordListMeasure.endPage})`)
    
    // 3. Measure the Beacon Comparison Report (0 pages when there is no comparison data)
    console.log('  📐 Measuring Beacon Comparison Report...')
    const beaconMeasure = await this.measureBeaconComparison(data, coordListMeasure)
    console.log(beaconMeasure.pages > 0
      ? `     ✓ ${beaconMeasure.pages} pages (${beaconMeasure.startPage}-${beaconMeasure.endPage})`
      : '     ✓ skipped (no comparison data)')

    // 4. Measure Calculations Part 1 (starts AFTER the Beacon Comparison Report)
    console.log('  🧮 Measuring Calculations Part 1...')
    const calcStartPage = coordListMeasure.endPage + beaconMeasure.pages + 1
    const calcsMeasure = await this.measureCalculations(data, calcStartPage)
    console.log(`     ✓ ${calcsMeasure.pages} pages (${calcsMeasure.startPage}-${calcsMeasure.endPage})`)
    console.log(`     ✓ ${Object.keys(calcsMeasure.pointPageMap).length} points tracked`)

    // 5. Measure Areas (if parcels exist) - starts AFTER Calculations
    console.log('  📐 Measuring Areas & Consistencies...')
    const areasMeasure = this.measureAreas(data, calcsMeasure)
    console.log(`     ✓ ${areasMeasure.pages} pages (${areasMeasure.startPage}-${areasMeasure.endPage})`)

    const measurements: DocumentMeasurements = {
      fieldBook: fieldBookMeasure,
      calculations: calcsMeasure,
      coordinateList: coordListMeasure,
      beaconComparison: beaconMeasure,
      areas: areasMeasure,
      totalPages: areasMeasure.endPage,
      measuredAt: new Date(),
      measurementDuration: Date.now() - measureStart
    }

    console.log('\n  📊 MEASUREMENT SUMMARY:')
    console.log(`     Field Book:      Pages E1-E${fieldBookMeasure.pages}`)
    console.log(`     Coordinate List: Pages ${coordListMeasure.startPage}-${coordListMeasure.endPage}`)
    console.log(`     Beacon Comparison: Pages ${beaconMeasure.startPage}-${beaconMeasure.endPage}`)
    console.log(`     Calculations:    Pages ${calcsMeasure.startPage}-${calcsMeasure.endPage}`)
    console.log(`     Areas:           Pages ${areasMeasure.startPage}-${areasMeasure.endPage}`)
    console.log(`     TOTAL:           ${measurements.totalPages} pages`)

    return measurements
  }
  
  /**
   * PASS 2: Render final PDF with accurate cross-references
   */
  private async renderPass(
    data: TwoPassDocumentData,
    measurements: DocumentMeasurements
  ): Promise<{
    merged: Blob;
    sections: { fieldBook: Blob; coordinateList: Blob; calculations: Blob; beaconComparison?: Blob }
  }> {
    const pdfs: Blob[] = []
    
    // 1. Generate Field Book
    console.log('  📘 Rendering Field Book...')
    const fieldBookResult = await this.renderFieldBook(data)
    pdfs.push(fieldBookResult.pdf)
    console.log(`     ✓ ${measurements.fieldBook.pages} pages generated`)
    console.log(`     ✓ ${Object.keys(fieldBookResult.pointPageMap).length} points tracked`)
    
    // 2. Generate Coordinate List (with accurate calc AND field book page refs!)
    console.log('  📋 Rendering Coordinate List...')
    const coordListPDF = await this.renderCoordinateList(
      data,
      measurements.calculations.pointPageMap, // ✅ Accurate calc pages!
      fieldBookResult.pointPageMap // ✅ Accurate field book pages!
    )
    pdfs.push(coordListPDF)
    console.log(`     ✓ ${measurements.coordinateList.pages} pages with accurate cross-refs`)

    // 3. Generate the Beacon Comparison Report (before Calculations, in sequence)
    let beaconComparisonPDF: Blob | undefined
    if ((measurements.beaconComparison?.pages || 0) > 0) {
      console.log('  📐 Rendering Beacon Comparison Report...')
      const beaconResult = await this.renderBeaconComparisonReport(
        data,
        measurements.beaconComparison!.startPage
      )
      if (beaconResult) {
        if (beaconResult.pageCount !== measurements.beaconComparison!.pages) {
          console.warn(
            `[TwoPassDocumentGenerator] Beacon Comparison page count drifted between passes: ` +
            `Pass 1 measured ${measurements.beaconComparison!.pages} pages, Pass 2 rendered ${beaconResult.pageCount} pages.`
          )
        }
        beaconComparisonPDF = beaconResult.pdf
        pdfs.push(beaconResult.pdf)
        console.log(`     ✓ ${beaconResult.pageCount} pages generated`)
      }
    }

    // 4. Generate Calculations Part 1
    console.log('  🧮 Rendering Calculations Part 1...')
    const calcsPDF = await this.renderCalculations(
      data,
      measurements.calculations.startPage
    )
    pdfs.push(calcsPDF)
    console.log(`     ✓ ${measurements.calculations.pages} pages generated`)

    // 5. Generate Areas (if parcels exist)
    if (data.parcels && data.parcels.length > 0) {
      console.log('  📐 Rendering Areas & Consistencies...')
      // TODO: Implement areas rendering
      console.log(`     ✓ ${measurements.areas.pages} pages generated`)
    }

    // 6. Merge all sections into the collated body
    console.log('  🔗 Merging PDFs...')
    const merged = await this.mergePDFs(pdfs)
    console.log(`     ✓ Final document assembled`)

    return {
      merged,
      sections: {
        fieldBook: fieldBookResult.pdf,
        coordinateList: coordListPDF,
        calculations: calcsPDF,
        ...(beaconComparisonPDF ? { beaconComparison: beaconComparisonPDF } : {}),
      },
    }
  }
  
  // ========================================
  // MEASUREMENT METHODS
  // ========================================
  
  private measureFieldBook(data: TwoPassDocumentData): FieldBookMeasurement {
    const pointsPerPage = 27
    const pages = Math.ceil(data.surveyPoints.length / pointsPerPage)
    
    // Calculate point page map during measurement
    const pointPageMap: Record<string, string> = {}
    data.surveyPoints.forEach((pt, index) => {
      const pageNumber = Math.floor(index / pointsPerPage) + 1
      pointPageMap[pt.pointId] = `E${pageNumber}`
    })
    
    return {
      pages,
      startPage: 1,
      endPage: pages,
      pointsPerPage,
      totalPoints: data.surveyPoints.length,
      pointPageMap
    }
  }
  
  private async measureCalculations(
    data: TwoPassDocumentData,
    calcStartPage: number
  ): Promise<CalculationsMeasurement> {
    console.log(`     → Calculations will start at page: ${calcStartPage}`)
    console.log(`     → Generating Calculations Part 1 to measure actual pages...`)
    
    // ⚠️ IMPORTANT: We must actually generate Calculations to get accurate page count
    // VirtualPDFMeasurer doesn't accurately simulate all content (tables, sections, etc.)
    const result = await this.calcGenerator.generateCalculationsPart1PDF(
      data.surveyPoints,
      data.surveyorInfo,
      calcStartPage, // ✅ Start page AFTER coordinate list
      false // measureOnly = false → Actually generate the PDF!
    ) as CalculationsPart1Result
    
    // Extract page count and point page map from the generated PDF
    const actualPages = result.pageCount
    const endPage = calcStartPage + actualPages - 1
    
    console.log(`     → Actual pages generated: ${actualPages}`)
    console.log(`     → Page range: ${calcStartPage} to ${endPage}`)
    console.log(`     → Points tracked: ${Object.keys(result.calculationsPageLookup).length}`)
    
    return {
      pages: actualPages,
      startPage: calcStartPage,
      endPage: endPage,
      pointPageMap: result.calculationsPageLookup,
      pointLocations: [],
      duplicateCount: result.duplicateAnalyses.length
    }
  }
  
  private async measureCoordinateList(
    data: TwoPassDocumentData
  ): Promise<CoordinateListMeasurement> {
    const pointsPerPage = 35
    const totalPoints = data.adjustedCoordinates.length
    const startPage = 100
    
    // ⚠️ IMPORTANT: We must actually generate the Coordinate List to get accurate page count
    // because section headers, table headers, and page breaks affect the actual page count
    // Simple calculation (totalPoints ÷ 35) is NOT accurate!
    
    console.log(`     → Total coordinates: ${totalPoints}`)
    console.log(`     → Generating Coordinate List to measure actual pages...`)
    
    // Generate the actual Coordinate List PDF to get accurate page count
    const result = await this.coordListGenerator.generateCoordinateListPDF(
      data.adjustedCoordinates,
      data.surveyorInfo,
      data.projectControlPoints,
      undefined, // No calc page lookup yet (we'll apply it in render phase)
      undefined  // No field book lookup yet (we'll apply it in render phase)
    )
    
    const actualPages = result.pageCount
    const endPage = startPage + actualPages - 1
    
    console.log(`     → Actual pages generated: ${actualPages}`)
    console.log(`     → Page range: ${startPage} to ${endPage}`)
    console.log(`     → Coordinate List: ${actualPages} data pages (${startPage}-${endPage}) + 1 cover page`)
    
    return {
      pages: actualPages,
      startPage,
      endPage,
      pointsPerPage,
      totalCoordinates: totalPoints
    }
  }
  
  /**
   * Render the Beacon Comparison Report once to learn its real page count (K).
   * Returns a zero-page measurement when there is no comparison data, which
   * leaves the Calculations start page exactly where it is today.
   */
  private async measureBeaconComparison(
    data: TwoPassDocumentData,
    coordListMeasure: CoordinateListMeasurement
  ): Promise<SectionMeasurement> {
    const startPage = coordListMeasure.endPage + 1
    const result = await this.renderBeaconComparisonReport(data, startPage)
    const pages = result?.pageCount ?? 0
    return {
      pages,
      startPage,
      endPage: startPage + pages - 1
    }
  }

  /**
   * Render the Beacon Comparison Report at the given start page, or null when
   * there is nothing to compare.
   */
  private async renderBeaconComparisonReport(
    data: TwoPassDocumentData,
    startingPage: number
  ): Promise<{ pdf: Blob; pageCount: number } | null> {
    if (!data.reportData) return null
    const options: BeaconComparisonReportOptions = data.reportOptions || {
      surveyorName: data.surveyorInfo.name,
      licenseNumber: data.surveyorInfo.licenseNumber,
      surveyDate: data.surveyorInfo.surveyDate,
      surveyOf: data.surveyorInfo.projectTitle
    }
    return generateBeaconComparisonReportPDF(data.reportData, options, startingPage)
  }

  private measureAreas(
    data: TwoPassDocumentData,
    calcsMeasure: CalculationsMeasurement
  ): AreasMeasurement {
    const parcelCount = data.parcels?.length || 0
    const parcelsPerPage = 2
    const pages = parcelCount > 0 ? Math.ceil(parcelCount / parcelsPerPage) : 0
    const startPage = calcsMeasure.endPage + 1
    
    console.log(`     → Areas will start at page ${startPage} (after Calculations ends at ${calcsMeasure.endPage})`)
    
    return {
      pages,
      startPage,
      endPage: startPage + pages - 1,
      parcelCount,
      parcelsPerPage
    }
  }
  
  // ========================================
  // RENDERING METHODS
  // ========================================
  
  private async renderFieldBook(data: TwoPassDocumentData): Promise<{
    pdf: Blob;
    pointPageMap: Record<string, string>;
  }> {
    // Filter out calculated points (they don't appear in field book)
    // Calculated points are identified by description containing "calculated" (case-insensitive)
    const filteredPoints = data.surveyPoints.filter(pt => {
      const desc = (pt.description || '').toLowerCase();
      const isCalculated = desc.includes('calculated');
      if (isCalculated) {
        console.log(`[FieldBook] 🧮 Excluding calculated point: ${pt.pointId}`);
      }
      return !isCalculated;
    });
    
    console.log(`[FieldBook] 📊 Points: ${data.surveyPoints.length} total, ${filteredPoints.length} in field book, ${data.surveyPoints.length - filteredPoints.length} calculated (excluded)`);
    
    // Convert survey points to field book format
    const fieldBookPoints = filteredPoints.map((pt, idx) => ({
      id: pt.pointId, // FieldBookPoint requires 'id' field
      pointId: pt.pointId,
      y: pt.y,
      x: pt.x,
      description: pt.description,
      status: pt.status,
      surveyDate: pt.surveyDate
    }))
    
    // Map SurveyorInfo to FieldBookMetadata
    const metadata = {
      surveyorName: data.surveyorInfo.name,
      licenseNumber: data.surveyorInfo.licenseNumber,
      projectTitle: data.surveyorInfo.projectTitle,
      surveyDate: data.surveyorInfo.surveyDate
    }
    
    const result = await this.fieldBookGenerator.generateFieldBookPDF(
      fieldBookPoints,
      metadata
    )
    
    // Convert jsPDF to Blob and return with pointPageMap
    return {
      pdf: new Blob([result.pdf.output('blob')], { type: 'application/pdf' }),
      pointPageMap: result.pointPageMap
    }
  }
  
  private async renderCoordinateList(
    data: TwoPassDocumentData,
    calcPageLookup: Record<string, number>,
    fieldBookLookup: Record<string, string>
  ): Promise<Blob> {
    const result = await this.coordListGenerator.generateCoordinateListPDF(
      data.adjustedCoordinates,
      data.surveyorInfo,
      data.projectControlPoints,
      calcPageLookup, // ✅ Pass accurate calculation page lookup
      fieldBookLookup // ✅ Pass accurate field book page lookup
    )
    
    // Convert jsPDF to Blob
    return new Blob([result.pdf.output('blob')], { type: 'application/pdf' })
  }
  
  private async renderCalculations(
    data: TwoPassDocumentData,
    startingPage: number
  ): Promise<Blob> {
    const result = await this.calcGenerator.generateCalculationsPart1PDF(
      data.surveyPoints,
      data.surveyorInfo,
      startingPage,
      false // measureOnly = false (normal rendering)
    ) as any // Result is CalculationsPart1Result when measureOnly = false
    
    return result.pdf
  }
  
  /**
   * Merge multiple PDF blobs into one
   */
  private async mergePDFs(pdfBlobs: Blob[]): Promise<Blob> {
    const mergedPdf = await PDFDocument.create()
    
    for (const blob of pdfBlobs) {
      const arrayBuffer = await blob.arrayBuffer()
      const pdf = await PDFDocument.load(arrayBuffer)
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices())
      copiedPages.forEach((page) => {
        mergedPdf.addPage(page)
      })
    }
    
    const mergedPdfBytes = await mergedPdf.save()
    return new Blob([mergedPdfBytes as any], { type: 'application/pdf' })
  }
}
