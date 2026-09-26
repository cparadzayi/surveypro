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
import type { SiteCalibration } from '@/utils/siteCalibration';
import { CoverPageGenerator, type CoverPageInfo } from '@/utils/cover-page';
import { CoordinateListGenerator } from '@/utils/coordinate-list';
import { CalculationsPart1Generator } from '@/utils/calculations-part1';
import { FieldBookGenerator, type FieldBookPoint } from '@/utils/field-book';
import type { AdjustedCoordinate } from '@/types/adjusted-coordinates';
import type { SurveyorInfo } from '@/utils/coordinate-list';
import { surveyOfForSurveyor } from '@/utils/coordinate-list';
import { TwoPassDocumentGenerator } from '@/utils/TwoPassDocumentGenerator';
import type { DocumentMeasurements } from '@/types/document-measurements';
import type { ReportOnSurveyData } from '@/types/cadastral';
import type { BeaconComparisonReportOptions } from '@/utils/beaconComparisonReportGenerator';
import { isCalculatedPoint } from '@/utils/calculatedPoint';
import type { PartyWallRow } from '@/utils/fieldBookPagination';

/**
 * Duplicate-observation and parcel shapes accepted as document input.
 *
 * These lived in services/pageAllocation.ts, which existed to estimate page
 * numbers ahead of rendering. The two-pass generator measures the real PDFs
 * instead, so that service is gone; these are the input contract, not its
 * invention, so they stay — declared here, next to their only consumer.
 * Note there are three `DuplicateAnalysis` types in this codebase. This one is
 * the *input* shape. The rendered one, with maxResidual/withinTolerance, is in
 * utils/calculations-part1.ts and is what a consumer of the PDF actually wants;
 * types/adjusted-coordinates.ts holds a third, structural copy.
 */
export interface DuplicateAnalysis {
  pointId: string;
  observations: Array<{
    y: number;
    x: number;
    fieldBookPage?: string;
  }>;
  meanY: number;
  meanX: number;
  standardDeviationY: number;
  standardDeviationX: number;
}

export interface Parcel {
  id?: string;
  name: string;
  coordinates: Array<{ x: number; y: number }>;
  area?: number;
}

/**
 * TRIG beacons come from the national control network — the survey did not
 * establish them, so they appear in the Coordinate List only.
 */
const isTrigSurveyPoint = (pt: { description?: string; status?: string }): boolean => {
  const desc = (pt.description || '').toUpperCase();
  const status = (pt.status || '').toUpperCase();
  return desc.includes('TRIG') || status.includes('TRIG');
};

/** A point computed rather than observed — no beacon was visited. */
/** @see utils/calculatedPoint.ts — this was one of three spellings; now it delegates. */
const isCalculatedSurveyPoint = isCalculatedPoint;

/**
 * Field Book and Calculations do NOT take the same points.
 *
 * The Field Book records observations, so a calculated point has no place in it.
 * Calculations is where a calculated point is derived, so it must be there — that
 * run is what assigns it the page number the Coordinate List later cites. Feeding
 * one shared list to both sections leaves calculated points with no Calculations
 * page at all, and the reference silently disappears from the Coordinate List.
 */
export function splitSurveyPointsForSections<T extends { pointId?: string; description?: string; status?: string }>(
  points: T[],
): { forCalculations: T[]; forFieldBook: T[] } {
  const forCalculations = points.filter(pt => !isTrigSurveyPoint(pt));
  const forFieldBook = forCalculations.filter(pt => {
    if (isCalculatedSurveyPoint(pt)) {
      console.log(`[ComprehensiveDoc] 🧮 Excluding calculated point from Field Book: ${pt.pointId}`);
      return false;
    }
    return true;
  });
  return { forCalculations, forFieldBook };
}

export interface ComprehensiveDocumentData {
  // Project Information
  projectInfo: CoverPageInfo;
  surveyorInfo: SurveyorInfo;
  
  // Field Book Data
  fieldBookObservations?: any[]; // Raw observations for field book
  
  /** GNSS site calibration; omit to skip the field book's calibration page */
  siteCalibration?: SiteCalibration;

  /** Party-wall servitude rows; appended to the field book & Calculations final pages */
  partyWalls?: PartyWallRow[];

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

  // Beacon Comparison Report (SI 727 s.67(5)) — omit to skip the section
  reportData?: ReportOnSurveyData | null;
  reportOptions?: BeaconComparisonReportOptions;
}

export interface ComprehensiveDocumentResult {
  pdf: Blob;
  totalPages: number;
  actualCoordListLastPage: number;  // ⭐ Actual last page number from Coordinate List
  actualCalcStartPage: number;      // ⭐ Actual start page for Calculations Part 1
  actualCalcLastPage: number;       // ⭐ Actual last page number from Calculations Part 1
}

export class ComprehensiveDocumentGenerator {
  private twoPassGenerator: TwoPassDocumentGenerator;

  constructor() {
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
    sections?: {
      cover: Blob;
      fieldBook: Blob;
      coordinateList: Blob;
      calculations: Blob;
      beaconComparison?: Blob;
    };
  }> {
    console.log('[ComprehensiveDoc] 🎯 Using TWO-PASS generation for 100% accurate cross-references');
    
    // Filter out TRIG beacons (they only appear in Coordinate List). Calculated
    // points stay: TwoPassDocumentGenerator drops them inside renderFieldBook,
    // so they still reach Calculations and get their page.
    const { forCalculations: surveyPointsOnly } = splitSurveyPointsForSections(data.surveyPoints);
    
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
      parcels: data.parcels,
      reportData: data.reportData,
      reportOptions: data.reportOptions,
      siteCalibration: data.siteCalibration,
      partyWalls: data.partyWalls
    });
    
    // Generate cover page separately
    console.log('[ComprehensiveDoc] 📄 Generating cover page...');
    const coverPageGenerator = new CoverPageGenerator();
    const coverPageBlob = coverPageGenerator.generateCoverPage(data.projectInfo);

    // The cover is usually two pages (letter + project info), but the page-break guard in the
    // letter can spill it to three when the enclosed-documents list is long. Read the real page
    // count from the generated PDF instead of assuming 2, so totalPages stays accurate.
    const coverDoc = await PDFDocument.load(await coverPageBlob.arrayBuffer());
    const coverPageCount = coverDoc.getPageCount();

    // Merge cover page with main document
    console.log('[ComprehensiveDoc] 🔗 Merging cover page with main document...');
    const finalPdf = await this.mergePDFs([coverPageBlob, result.pdf]);

    console.log('[ComprehensiveDoc] ✅ Generation complete!');
    console.log(`  - Total pages: ${result.totalPages + coverPageCount} (${coverPageCount} cover + ${result.totalPages} content)`);
    // fieldBook.pages is the PHYSICAL count, which includes the unnumbered
    // cover page -- the E range itself is one shorter.
    console.log(`  - Field Book: E1-E${result.measurements.fieldBook.pages - 1}`);
    console.log(`  - Coordinate List: ${result.measurements.coordinateList.startPage}-${result.measurements.coordinateList.endPage}`);
    console.log(`  - Calculations: ${result.measurements.calculations.startPage}-${result.measurements.calculations.endPage}`);
    console.log(`  - Areas: ${result.measurements.areas.startPage}-${result.measurements.areas.endPage}`);

    return {
      pdf: finalPdf,
      totalPages: result.totalPages + coverPageCount, // cover is normally 2 pages, but 3 when the enclosed list spills
      actualCoordListLastPage: result.measurements.coordinateList.endPage,
      actualCalcStartPage: result.measurements.calculations.startPage,
      actualCalcLastPage: result.measurements.calculations.endPage,
      measurements: result.measurements,
      sections: {
        cover: coverPageBlob,
        fieldBook: result.sections.fieldBook,
        coordinateList: result.sections.coordinateList,
        calculations: result.sections.calculations,
        ...(result.sections.beaconComparison
          ? { beaconComparison: result.sections.beaconComparison }
          : {}),
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
  
}
