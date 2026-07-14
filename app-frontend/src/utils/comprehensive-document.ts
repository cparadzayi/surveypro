/**
 * Comprehensive Document Generator
 * Generates complete SGO-compliant survey document with all sections:
 * 1. Cover Page (Letter + Project Info)
 * 2. Electronic Field Book (E1-E99)
 * 3. Coordinate List (100-XXX) with cross-references
 * 4. Calculation Sheets (XXX+1 onwards) with cross-references
 * 5. Area & Consistency (continues from Calculations)
 * 
 * Uses two-pass generation to resolve circular dependencies between
 * Coordinate List and Calculation Sheets
 */

import { PDFDocument } from 'pdf-lib';
import type { SurveyPoint } from '@/utils/coordinate-list';
import { PageAllocationService, type DuplicateAnalysis, type Parcel } from '@/services/pageAllocation';
import { CoverPageGenerator, type CoverPageInfo } from '@/utils/cover-page';
import { CoordinateListGenerator } from '@/utils/coordinate-list';
import { CalculationsPart1Generator } from '@/utils/calculations-part1';
import { FieldBookGenerator, type FieldBookPoint } from '@/utils/field-book';
import type { AdjustedCoordinate } from '@/types/adjusted-coordinates';
import type { SurveyorInfo } from '@/utils/coordinate-list';
import { TwoPassDocumentGenerator } from '@/utils/TwoPassDocumentGenerator';
import type { DocumentMeasurements } from '@/types/document-measurements';

export interface ComprehensiveDocumentData {
  // Project Information
  projectInfo: CoverPageInfo;
  surveyorInfo: SurveyorInfo;
  
  // Field Book Data
  fieldBookObservations?: any[]; // Raw observations for field book
  
  // Survey Points
  surveyPoints: SurveyPoint[];
  adjustedCoordinates: AdjustedCoordinate[];
  projectControlPoints?: any[];
  
  // Calculations
  duplicateAnalyses: DuplicateAnalysis[];
  
  // Area & Consistency
  parcels: Parcel[];
  beaconLabels?: Array<{
    beaconName: string;
    displayLabel: string;
    stand: string;
    beaconY: number;
    beaconX: number;
    y: number;
    x: number;
    offset: number;
    clearance: number;
    parcelId: string;
  }>;
}

export interface ComprehensiveDocumentResult {
  pdf: Blob;
  pageAllocation: any;
  totalPages: number;
  actualCoordListLastPage: number;  // ⭐ Actual last page number from Coordinate List
  actualCalcStartPage: number;      // ⭐ Actual start page for Calculations Part 1
  actualCalcLastPage: number;       // ⭐ Actual last page number from Calculations Part 1
}

export class ComprehensiveDocumentGenerator {
  private pageAllocator: PageAllocationService;
  private twoPassGenerator: TwoPassDocumentGenerator;
  
  constructor() {
    this.pageAllocator = new PageAllocationService();
    this.twoPassGenerator = new TwoPassDocumentGenerator();
  }
  
  /**
   * Generate comprehensive document using NEW two-pass approach
   * This method provides 100% accurate cross-references by measuring first, then rendering
   * 
   * @param data - Complete survey data
   * @param useTwoPass - If true, use new two-pass generator (default: true)
   */
  async generateWithTwoPass(
    data: ComprehensiveDocumentData,
    useTwoPass: boolean = true
  ): Promise<ComprehensiveDocumentResult & {
    measurements?: DocumentMeasurements;
    sections?: { cover: Blob; fieldBook: Blob; coordinateList: Blob; calculations: Blob };
  }> {
    console.log('[ComprehensiveDoc] 🎯 Using TWO-PASS generation for 100% accurate cross-references');
    
    // Filter out TRIG beacons (they only appear in Coordinate List)
    const surveyPointsOnly = data.surveyPoints.filter(pt => {
      const desc = (pt.description || '').toUpperCase();
      const status = (pt.status || '').toUpperCase();
      const isTrig = desc.includes('TRIG') || status.includes('TRIG');
      return !isTrig;
    });
    
    console.log('[ComprehensiveDoc] 📋 Survey points filtering:');
    console.log(`  - Total: ${data.surveyPoints.length}`);
    console.log(`  - TRIG beacons: ${data.surveyPoints.length - surveyPointsOnly.length}`);
    console.log(`  - For processing: ${surveyPointsOnly.length}`);
    
    // Generate main document sections using two-pass
    const result = await this.twoPassGenerator.generate({
      surveyPoints: surveyPointsOnly,
      adjustedCoordinates: data.adjustedCoordinates,
      surveyorInfo: data.surveyorInfo,
      projectControlPoints: data.projectControlPoints,
      parcels: data.parcels
    });
    
    // Generate cover page separately
    console.log('[ComprehensiveDoc] 📄 Generating cover page...');
    const coverPageGenerator = new CoverPageGenerator();
    const coverPageBlob = coverPageGenerator.generateCoverPage(data.projectInfo);
    
    // Merge cover page with main document
    console.log('[ComprehensiveDoc] 🔗 Merging cover page with main document...');
    const finalPdf = await this.mergePDFs([coverPageBlob, result.pdf]);
    
    console.log('[ComprehensiveDoc] ✅ Generation complete!');
    console.log(`  - Total pages: ${result.totalPages + 2} (2 cover + ${result.totalPages} content)`);
    console.log(`  - Field Book: E1-E${result.measurements.fieldBook.pages}`);
    console.log(`  - Coordinate List: ${result.measurements.coordinateList.startPage}-${result.measurements.coordinateList.endPage}`);
    console.log(`  - Calculations: ${result.measurements.calculations.startPage}-${result.measurements.calculations.endPage}`);
    console.log(`  - Areas: ${result.measurements.areas.startPage}-${result.measurements.areas.endPage}`);
    
    return {
      pdf: finalPdf,
      pageAllocation: result.measurements, // Return measurements as page allocation
      totalPages: result.totalPages + 2, // +2 for cover pages
      actualCoordListLastPage: result.measurements.coordinateList.endPage,
      actualCalcStartPage: result.measurements.calculations.startPage,
      actualCalcLastPage: result.measurements.calculations.endPage,
      measurements: result.measurements,
      sections: {
        cover: coverPageBlob,
        fieldBook: result.sections.fieldBook,
        coordinateList: result.sections.coordinateList,
        calculations: result.sections.calculations,
      },
    };
  }
  
  /**
   * Merge multiple PDF blobs
   */
  private async mergePDFs(pdfBlobs: Blob[]): Promise<Blob> {
    const mergedPdf = await PDFDocument.create();
    
    for (const blob of pdfBlobs) {
      const arrayBuffer = await blob.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => {
        mergedPdf.addPage(page);
      });
    }
    
    const mergedPdfBytes = await mergedPdf.save();
    return new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
  }
  
  /**
   * Generate complete comprehensive document with all sections (LEGACY METHOD)
   * Uses old page allocation service
   * 
   * @deprecated Use generateWithTwoPass() for 100% accurate cross-references
   */
  async generateComprehensiveDocument(
    data: ComprehensiveDocumentData
  ): Promise<ComprehensiveDocumentResult> {
    console.log('[ComprehensiveDoc] 🚀 Starting two-pass generation...');
    
    // ========================================
    // PASS 1: Calculate all page numbers
    // ========================================
    console.log('[ComprehensiveDoc] 📊 Pass 1: Calculating page allocations...');
    
    const pageAllocation = this.pageAllocator.calculateAllPageNumbers({
      observations: data.surveyPoints, // Use survey points for Field Book page calculation
      points: data.surveyPoints,
      duplicateAnalyses: data.duplicateAnalyses,
      parcels: data.parcels
    });
    
    console.log('[ComprehensiveDoc] Page Allocation:', {
      coverPage: `Physical ${pageAllocation.coverPage.physicalStart}-${pageAllocation.coverPage.physicalEnd}`,
      fieldBook: `Physical ${pageAllocation.fieldBook.physicalStart}-${pageAllocation.fieldBook.physicalEnd}, Display ${pageAllocation.fieldBook.displayStart}-${pageAllocation.fieldBook.displayEnd}`,
      coordinateList: `Physical ${pageAllocation.coordinateList.physicalStart}-${pageAllocation.coordinateList.physicalEnd}, Display ${pageAllocation.coordinateList.displayStart}-${pageAllocation.coordinateList.displayEnd}`,
      calculations: `Physical ${pageAllocation.calculations.physicalStart}-${pageAllocation.calculations.physicalEnd}, Display ${pageAllocation.calculations.displayStart}-${pageAllocation.calculations.displayEnd}`,
      areas: `Physical ${pageAllocation.areas.physicalStart}-${pageAllocation.areas.physicalEnd}, Display ${pageAllocation.areas.displayStart}-${pageAllocation.areas.displayEnd}`
    });
    
    // Create cross-reference lookups
    const fieldBookLookup = this.pageAllocator.createFieldBookLookup(data.fieldBookObservations || []);
    
    // ⚠️ NOTE: We'll create the ACTUAL calc page lookup after generating calculations
    // The estimated lookup from pageAllocation is not accurate for found/placed beacons
    let calcPageLookup: Record<string, number> = {};
    
    console.log('[ComprehensiveDoc] 📖 Created field book lookup:', {
      fieldBookEntries: Object.keys(fieldBookLookup).length
    });
    
    // ========================================
    // PASS 2: Generate each section with cross-references
    // ========================================
    console.log('[ComprehensiveDoc] 📄 Pass 2: Generating document sections...');
    
    // Section 1: Cover Page (2 pages, no numbers)
    console.log('[ComprehensiveDoc] 1/5 Generating Cover Page...');
    const coverPageGenerator = new CoverPageGenerator();
    const coverPageBlob = coverPageGenerator.generateCoverPage(data.projectInfo);
    
    // Section 2: Field Book (E1-E99)
    console.log('[ComprehensiveDoc] 2/5 Generating Field Book...');
    let fieldBookBlob: Blob | null = null;
    
    // ⭐ CRITICAL: Filter out TRIG beacons and CALCULATED points for Field Book & Calculations
    // - TRIG beacons are from the national control network and only appear in Coordinate List
    // - CALCULATED points are computed (not observed) and only appear in Calculations & Coordinate List
    const surveyPointsOnly = data.surveyPoints.filter(pt => {
      const desc = (pt.description || '').toUpperCase();
      const status = (pt.status || '').toUpperCase();
      const isTrig = desc.includes('TRIG') || status.includes('TRIG');
      const isCalculated = desc.includes('CALCULATED') || status === 'C' || status === 'CALC';
      
      if (isCalculated) {
        console.log(`[ComprehensiveDoc] 🧮 Excluding calculated point from Field Book: ${pt.pointId}`);
      }
      
      return !isTrig && !isCalculated;
    });
    
    console.log('[ComprehensiveDoc] 📋 Survey points filtering:');
    console.log('[ComprehensiveDoc] - Total survey points:', data.surveyPoints.length);
    console.log('[ComprehensiveDoc] - TRIG beacons filtered out:', data.surveyPoints.filter(pt => {
      const desc = (pt.description || '').toUpperCase();
      const status = (pt.status || '').toUpperCase();
      return desc.includes('TRIG') || status.includes('TRIG');
    }).length);
    console.log('[ComprehensiveDoc] - Calculated points filtered out:', data.surveyPoints.filter(pt => {
      const desc = (pt.description || '').toUpperCase();
      const status = (pt.status || '').toUpperCase();
      return desc.includes('CALCULATED') || status === 'C' || status === 'CALC';
    }).length);
    console.log('[ComprehensiveDoc] - Points for Field Book:', surveyPointsOnly.length);
    
    if (surveyPointsOnly.length > 0) {
      try {
        const fieldBookGenerator = new FieldBookGenerator();
        
        // Convert survey points to field book format (excluding TRIG beacons)
        const fieldBookPoints: FieldBookPoint[] = surveyPointsOnly.map(pt => ({
          id: pt.pointId,
          y: pt.y,
          x: pt.x,
          status: pt.status,
          surveyDate: pt.surveyDate,
          description: pt.description
        }));
        
        const fieldBookResult = await fieldBookGenerator.generateFieldBookPDF(
          fieldBookPoints,
          {
            surveyorName: data.surveyorInfo.name,
            surveyDescription: data.projectInfo.projectTitle,
            surveyDate: data.surveyorInfo.surveyDate
          }
        );
        
        fieldBookBlob = new Blob([fieldBookResult.pdf.output('blob')], { type: 'application/pdf' });
        console.log('[ComprehensiveDoc] ✅ Field Book generated:', fieldBookResult.pageCount, 'pages');
      } catch (error) {
        console.error('[ComprehensiveDoc] ❌ Failed to generate Field Book:', error);
      }
    } else {
      console.warn('[ComprehensiveDoc] ⚠️ No survey points for Field Book');
    }
    
    // Section 3: Calculation Sheets (GENERATE FIRST to get actual page lookup!)
    // ⚠️ CRITICAL FIX: Generate calculations BEFORE coordinate list
    // This gives us the ACTUAL calculationsPageLookup for cross-references
    console.log('[ComprehensiveDoc] 3/5 Generating Calculation Sheets FIRST...');
    
    // Use estimated start page for first pass
    const estimatedCalcStartPage = pageAllocation.calculations.displayStart;
    console.log('[ComprehensiveDoc] 📊 Calculations estimated start page:', estimatedCalcStartPage);
    
    const calcGenerator = new CalculationsPart1Generator();
    const calcResult = await calcGenerator.generateCalculationsPart1PDF(
      surveyPointsOnly, // ⭐ Use SAME filtered list as Field Book (no TRIG beacons)
      data.surveyorInfo,
      estimatedCalcStartPage
    );
    const calcBlob = calcResult.pdf;
    
    // ⭐ CRITICAL: Get the ACTUAL calculations page lookup from the generator
    calcPageLookup = calcResult.calculationsPageLookup || {};
    
    console.log('[ComprehensiveDoc] 📖 Actual calc page lookup from generator:', {
      totalMapped: Object.keys(calcPageLookup).length,
      sample: Object.entries(calcPageLookup).slice(0, 5)
    });
    
    // ⭐ CRITICAL: Calculate ACTUAL last page number from Calculations Part 1
    const actualCalcLastPage = calcResult.startingPage + calcResult.pageCount - 1;
    console.log('[ComprehensiveDoc] 📊 Calculations Part 1 actual pages:');
    console.log('[ComprehensiveDoc] - Starting page:', calcResult.startingPage);
    console.log('[ComprehensiveDoc] - Page count:', calcResult.pageCount);
    console.log('[ComprehensiveDoc] - Actual last page:', actualCalcLastPage);
    console.log('[ComprehensiveDoc] - Estimated last page (pageAllocation):', pageAllocation.calculations.displayEnd);
    
    // Section 4: Coordinate List (100-XXX) with ACTUAL cross-references
    console.log('[ComprehensiveDoc] 4/5 Generating Coordinate List with ACTUAL cross-references...');
    console.log('[ComprehensiveDoc] - Adjusted coordinates:', data.adjustedCoordinates.length);
    console.log('[ComprehensiveDoc] - Project control points:', data.projectControlPoints?.length || 0);
    console.log('[ComprehensiveDoc] - Using ACTUAL calc page lookup with', Object.keys(calcPageLookup).length, 'entries');
    
    if (data.projectControlPoints && data.projectControlPoints.length > 0) {
      console.log('[ComprehensiveDoc] - First control point:', data.projectControlPoints[0]);
    }
    
    const coordListGenerator = new CoordinateListGenerator();
    const coordListResult = await coordListGenerator.generateCoordinateListPDF(
      data.adjustedCoordinates,
      data.surveyorInfo,
      data.projectControlPoints,
      calcPageLookup // ✅ Pass ACTUAL calculation page lookup for cross-references
    );
    const coordListBlob = new Blob([coordListResult.pdf.output('blob')], { type: 'application/pdf' });
    
    // ⭐ CRITICAL: Calculate ACTUAL Coordinate List ending page
    const actualCoordListLastPage = 100 + coordListResult.pageCount - 1;
    console.log('[ComprehensiveDoc] 📊 Coordinate List actual pages:');
    console.log('[ComprehensiveDoc] - Starting page: 100');
    console.log('[ComprehensiveDoc] - Page count:', coordListResult.pageCount);
    console.log('[ComprehensiveDoc] - Actual last page:', actualCoordListLastPage);
    
    // Section 5: Area & Consistency (continues from Calculations)
    console.log('[ComprehensiveDoc] 5/5 Generating Area & Consistency...');
    // This will be handled by the existing useAreaConsistencyPDF composable
    // We'll pass the correct starting page number
    
    // ========================================
    // MERGE: Combine all sections
    // ========================================
    console.log('[ComprehensiveDoc] 🔗 Merging all sections...');
    
    const mergedPdf = await this.mergeSections({
      coverPage: coverPageBlob,
      fieldBook: fieldBookBlob,
      coordinateList: coordListBlob,
      calculations: calcBlob,
      // areas will be added by the caller
    }, pageAllocation);
    
    const totalPages = pageAllocation.areas.physicalEnd;
    
    console.log('[ComprehensiveDoc] ✅ Complete! Total pages:', totalPages);
    console.log('[ComprehensiveDoc] 📊 Actual page numbers:');
    console.log('[ComprehensiveDoc] - Coordinate List: 100 -', actualCoordListLastPage);
    console.log('[ComprehensiveDoc] - Calculations Part 1:', calcResult.startingPage, '-', actualCalcLastPage);
    
    // ⭐ LOG ACTUAL RESULTS FOR ML TRAINING
    const { expertPagePredictor } = await import('../services/pageNumberingExpert');
    expertPagePredictor.logActualResults({
      coordinateListPages: coordListResult.pageCount,
      calculationsPages: calcResult.pageCount,
      areasPages: 0 // Will be filled in when areas are generated
    });
    
    // Display ML statistics if available
    const stats = expertPagePredictor.getStatistics();
    if (stats) {
      console.log('[ComprehensiveDoc] 📈 ML Training Stats:', {
        totalPredictions: stats.totalPredictions,
        completedPredictions: stats.completedPredictions,
        avgErrors: {
          coordinateList: stats.avgCoordListError,
          calculations: stats.avgCalcError,
          areas: stats.avgAreasError
        },
        accuracy: stats.accuracy
      });
    }
    
    return {
      pdf: mergedPdf,
      pageAllocation,
      totalPages,
      actualCoordListLastPage,  // ⭐ RETURN ACTUAL COORDINATE LIST LAST PAGE
      actualCalcStartPage: calcResult.startingPage,  // ⭐ RETURN ACTUAL CALCULATIONS START PAGE
      actualCalcLastPage        // ⭐ RETURN ACTUAL CALCULATIONS LAST PAGE
    };
  }
  
  /**
   * Merge all PDF sections with correct page numbering
   */
  private async mergeSections(
    sections: {
      coverPage: Blob | null;
      fieldBook: Blob | null;
      coordinateList: Blob | null;
      calculations: Blob | null;
    },
    pageAllocation: any
  ): Promise<Blob> {
    const mergedPdf = await PDFDocument.create();
    
    // Merge Cover Page (no page numbers)
    if (sections.coverPage) {
      const coverPdfDoc = await PDFDocument.load(await sections.coverPage.arrayBuffer());
      const coverPages = await mergedPdf.copyPages(coverPdfDoc, coverPdfDoc.getPageIndices());
      coverPages.forEach(page => mergedPdf.addPage(page));
    }
    
    // Merge Field Book (E1-E99 page numbers)
    if (sections.fieldBook) {
      const fieldBookPdfDoc = await PDFDocument.load(await sections.fieldBook.arrayBuffer());
      const fieldBookPages = await mergedPdf.copyPages(fieldBookPdfDoc, fieldBookPdfDoc.getPageIndices());
      fieldBookPages.forEach(page => mergedPdf.addPage(page));
      // Note: Field Book page numbers (E1, E2, etc.) are already embedded in the PDF
    }
    
    // Merge Coordinate List (100-XXX page numbers - already has them)
    if (sections.coordinateList) {
      const coordListPdfDoc = await PDFDocument.load(await sections.coordinateList.arrayBuffer());
      const coordListPages = await mergedPdf.copyPages(coordListPdfDoc, coordListPdfDoc.getPageIndices());
      coordListPages.forEach(page => mergedPdf.addPage(page));
    }
    
    // Merge Calculation Sheets (XXX+1 onwards - already has them)
    if (sections.calculations) {
      const calcPdfDoc = await PDFDocument.load(await sections.calculations.arrayBuffer());
      const calcPages = await mergedPdf.copyPages(calcPdfDoc, calcPdfDoc.getPageIndices());
      calcPages.forEach(page => mergedPdf.addPage(page));
    }
    
    // Area & Consistency will be added by the caller
    
    const mergedBytes = await mergedPdf.save();
    return new Blob([mergedBytes as BlobPart], { type: 'application/pdf' });
  }
}
