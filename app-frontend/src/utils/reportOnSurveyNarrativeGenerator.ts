/**
 * Narrative Report on Survey PDF Generator
 * Generates professional narrative-style Report on Survey documents
 * Based on Zimbabwe cadastral survey standards
 */

import { jsPDF } from 'jspdf';
import type { ReportOnSurveyData } from '../types/cadastral';
import { stampSequentialPageNumbers } from './pdfPageNumber';
import { formatSurveyMonthYear } from './surveyDate';
import { buildFoundBeaconsNarrative } from './beaconAcceptanceNarrative';
import { composeReportSurveyOf } from './planDesignation';
import { purposeSentence } from './reportPurpose';
import { describeAlignment, type AlignmentResult } from '../../../app-shared/beaconAlignment';

export interface ReportGenerationOptions {
  surveyorName: string;
  licenseNumber: string;
  firm: string;
  address: string;
  surveyDate: string;
  surveyOf: string;
  district?: string;
  assistant?: string;
  /** Structured "Survey of" parts: compose the header instead of surveyOf. */
  township?: string;
  parentProperty?: string;
  wholePortion?: string;
  standNames?: string[];
  /** Equipment clause for "Survey based on". */
  instrumentDescription?: string;
  instrumentBaseSerial?: string;
  instrumentRoverSerial?: string;
  /** SI 727 para (5): new beacons on the parent boundary and their displacement from it. */
  alignment?: AlignmentResult[];
}

/** Join a list in the practitioner-report manner: "A, B and C" (no serial comma). */
function naturalList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return String(items[0]);
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * How tightly the report is set, all in mm and pt. The report is drawn with the first layout; if it runs past
 * one page it is drawn again with the next, and the first that fits on a single page (signature included) is
 * kept. A report that fits as it always did is therefore unchanged; one that does not is compacted only as far
 * as it needs to be.
 */
export interface ReportLayout {
  name: string;
  margin: number;
  lineHeight: number;
  labelWidth: number;
  bodyFont: number;
  titleFont: number;
  titleGap: number;
  sectionGap: number;
  commentGap: number;
  signatureGap: number;
  signatureFont: number;
}

export const REPORT_LAYOUTS: ReportLayout[] = [
  { name: 'standard', margin: 25, lineHeight: 7, labelWidth: 50, bodyFont: 11, titleFont: 14, titleGap: 12, sectionGap: 8, commentGap: 15, signatureGap: 10, signatureFont: 10 },
  { name: 'compact', margin: 20, lineHeight: 5.6, labelWidth: 42, bodyFont: 10, titleFont: 13, titleGap: 9, sectionGap: 5, commentGap: 9, signatureGap: 8, signatureFont: 10 },
  { name: 'tight', margin: 15, lineHeight: 4.7, labelWidth: 38, bodyFont: 9.5, titleFont: 12, titleGap: 7, sectionGap: 3.5, commentGap: 6, signatureGap: 6, signatureFont: 9.5 },
];

export class NarrativeReportOnSurveyGenerator {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private L: ReportLayout;
  private margin: number;
  private currentY: number;
  private lineHeight: number;
  private labelWidth: number; // Width for left-aligned labels

  constructor(layout: ReportLayout = REPORT_LAYOUTS[0]) {
    this.L = layout;
    this.margin = layout.margin;
    this.currentY = layout.margin;
    this.lineHeight = layout.lineHeight;
    this.labelWidth = layout.labelWidth;
    this.doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
  }

  /**
   * Generate complete narrative Report on Survey PDF
   */
  async generate(
    reportData: ReportOnSurveyData,
    options: ReportGenerationOptions,
    startingPage?: number
  ): Promise<{ pdf: Blob; pageCount: number }> {
    console.log('[NarrativeReportOnSurvey] Generating PDF...', reportData);

    // Title
    this.addTitle();
    
    // Header section with survey details
    this.addHeaderSection(reportData, options);
    
    // Purpose section
    this.addPurposeSection(reportData);
    
    // Survey based on section (narrative)
    this.addSurveyBasisNarrative(reportData, options);
    
    // Found Beacons section
    this.addFoundBeaconsNarrative(reportData);
    
    // Placed Beacons section
    this.addPlacedBeaconsNarrative(reportData);
    
    // New beacons on the parent boundary (SI 727 para (5))
    this.addAlignmentNarrative(options.alignment);
    
    // Comments/Unusual Occurrences
    this.addCommentsSection(reportData);
    
    // Signature section
    this.addSignatureSection(options);

    // Collated into Comprehensive_Latest.pdf: continue the document's page
    // sequence. Standalone (no startingPage): leave the report unnumbered.
    if (startingPage !== undefined) {
      stampSequentialPageNumbers(this.doc, startingPage);
    }

    const pageCount = this.doc.getNumberOfPages();
    const pdfBlob = this.doc.output('blob');

    console.log('[NarrativeReportOnSurvey] PDF generated:', pageCount, 'pages');
    return { pdf: pdfBlob, pageCount };
  }

  /**
   * Add title
   */
  private addTitle(): void {
    this.doc.setFontSize(this.L.titleFont);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Report on Survey', this.margin, this.currentY);
    
    this.currentY += this.L.titleGap;
  }

  /**
   * Add header section with survey details
   */
  private addHeaderSection(reportData: ReportOnSurveyData, options: ReportGenerationOptions): void {
    this.doc.setFontSize(this.L.bodyFont);
    this.doc.setFont('helvetica', 'normal');
    
    // S.R. No — the report header pairs it with the designation, right-justified
    // above the "Survey of" line.
    const srText = srNumberText(reportData.srNumber);
    this.doc.text(srText, this.pageWidth - this.margin, this.currentY, { align: 'right' });
    this.currentY += this.lineHeight;
    
    // Survey of — composed from the stand names + township phrase when the
    // structured parts are supplied, else the authored surveyOf verbatim.
    const surveyOf = composeReportSurveyOf({
      standNames: options.standNames,
      township: options.township,
      parentProperty: options.parentProperty,
      wholePortion: options.wholePortion,
      fallbackSurveyOf: options.surveyOf,
    });
    this.addLabelValuePair('Survey of', surveyOf || 'N/A');
    
    // Land Surveyor
    this.addLabelValuePair('Land Surveyor', options.surveyorName || 'N/A');
    
    // Date of Survey — the month and year the work was done, as the field book
    // cover states it ("July 2026"), not the day the form was filled in.
    this.addLabelValuePair('Date of Survey', formatSurveyMonthYear(options.surveyDate) || 'N/A');
    
    // District
    if (options.district) {
      this.addLabelValuePair('District', options.district);
    }
    
    this.currentY += this.L.sectionGap;
  }

  /**
   * Add label-value pair with colon separator
   */
  private addLabelValuePair(label: string, value: string): void {
    const x = this.margin;
    
    if (label) {
      // Label with colon
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(`${label}`, x, this.currentY);
      
      // Colon
      this.doc.text(':', x + this.labelWidth, this.currentY);
      
      // Value
      this.doc.setFont('helvetica', 'normal');
      const lines = this.doc.splitTextToSize(value, this.pageWidth - this.margin * 2 - this.labelWidth - 5);
      lines.forEach((line: string, index: number) => {
        this.checkPageBreak(10);
        this.doc.text(line, x + this.labelWidth + 5, this.currentY + (index * this.lineHeight));
      });
      this.currentY += lines.length * this.lineHeight;
    } else {
      // Continuation line (no label)
      this.doc.setFont('helvetica', 'normal');
      const lines = this.doc.splitTextToSize(value, this.pageWidth - this.margin * 2 - this.labelWidth - 5);
      lines.forEach((line: string, index: number) => {
        this.checkPageBreak(10);
        this.doc.text(line, x + this.labelWidth + 5, this.currentY + (index * this.lineHeight));
      });
      this.currentY += lines.length * this.lineHeight;
    }
  }

  /**
   * Add purpose section
   */
  private addPurposeSection(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(30);
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Purpose', this.margin, this.currentY);
    this.doc.text(':', this.margin + this.labelWidth, this.currentY);
    
    this.doc.setFont('helvetica', 'normal');
    
    // Build purpose text from the statutory subcategories, with the reference
    // cited under its statutory term (e.g. planning authority approval).
    const purposeText = purposeSentence(
      reportData.purpose.type,
      reportData.purpose.reference,
      reportData.purpose.otherDescription
    );
    
    const lines = this.doc.splitTextToSize(purposeText, this.pageWidth - this.margin * 2 - this.labelWidth - 5);
    lines.forEach((line: string, index: number) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + this.labelWidth + 5, this.currentY + (index * this.lineHeight));
    });
    
    this.currentY += lines.length * this.lineHeight + this.L.sectionGap;
  }

  /**
   * Add Survey Based On section (narrative)
   */
  private addSurveyBasisNarrative(reportData: ReportOnSurveyData, options: ReportGenerationOptions): void {
    this.checkPageBreak(40);
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Survey based on', this.margin, this.currentY);
    this.doc.text(':', this.margin + this.labelWidth, this.currentY);
    
    this.doc.setFont('helvetica', 'normal');
    
    // Build narrative text
    let narrativeText = '';
    const basis = reportData.surveyBasis;
    
    // Trig stations — stated in the sample-report wording
    // "Trigonometrical beacons 176/P (Kenyani), ..., and 49/T (Christmas Gift)".
    if (basis.trigStations && basis.trigStationNames && basis.trigStationNames.length > 0) {
      narrativeText += `Trigonometrical beacons ${naturalList(basis.trigStationNames)}. `;
    }
    
    // Town survey marks
    if (basis.townSurveyMarks && basis.townSurveyMarkNames && basis.townSurveyMarkNames.length > 0) {
      narrativeText += `Town Survey Marks ${naturalList(basis.townSurveyMarkNames)}. `;
    }
    
    // Official control points
    if (basis.officialControlPoints && basis.controlPointNames && basis.controlPointNames.length > 0) {
      narrativeText += `Official Control Points ${naturalList(basis.controlPointNames)}. `;
    }
    
    // Previous survey
    if (basis.previousSurvey && basis.previousSurveySRNumber) {
      narrativeText += `Previous Survey (${basis.previousSurveySRNumber}). `;
    }
    
    // Local system
    if (basis.localSystem && basis.localSystemDetails) {
      if (basis.localSystemDetails.baseMeasurementComparison) {
        narrativeText += `${basis.localSystemDetails.baseMeasurementComparison}. `;
      }
      if (basis.localSystemDetails.trueNorthMethod) {
        narrativeText += `${basis.localSystemDetails.trueNorthMethod}. `;
      }
    }
    
    // Equipment — attached to the last sentence per the sample's
    // "... beacons X and Y, using Trimble R8 GNSS equipment."
    const equipment = this.buildEquipmentClause(options);
    if (equipment) {
      if (narrativeText) {
        narrativeText = `${narrativeText.trim().replace(/\.$/, '')}, ${equipment}. `;
      } else {
        narrativeText = `${equipment.charAt(0).toUpperCase()}${equipment.slice(1)}. `;
      }
    }
    
    if (!narrativeText) {
      narrativeText = 'Not specified.';
    }
    
    const lines = this.doc.splitTextToSize(narrativeText, this.pageWidth - this.margin * 2 - this.labelWidth - 5);
    lines.forEach((line: string, index: number) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + this.labelWidth + 5, this.currentY + (index * this.lineHeight));
    });
    
    this.currentY += lines.length * this.lineHeight + this.L.sectionGap;
  }

  /**
   * "using Trimble R8 GNSS equipment" — the equipment clause appended to the
   * survey-basis narrative, with serials bracketed when supplied. Empty string
   * when no instrument was captured, so reports before Project Setup added the
   * instrument fields print exactly as they always did.
   */
  private buildEquipmentClause(options: ReportGenerationOptions): string {
    const desc = String(options.instrumentDescription || '').trim();
    if (!desc) return '';
    const bits: string[] = [];
    if (options.instrumentBaseSerial) bits.push(`base ${options.instrumentBaseSerial}`);
    if (options.instrumentRoverSerial) bits.push(`rover ${options.instrumentRoverSerial}`);
    const serials = bits.length > 0 ? ` (${bits.join(', ')})` : '';
    return `using ${desc}${serials} equipment`;
  }

  /**
   * Add Found Beacons section (narrative)
   */
  private addFoundBeaconsNarrative(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(30);
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Found beacons', this.margin, this.currentY);
    this.doc.text(':', this.margin + this.labelWidth, this.currentY);
    
    this.doc.setFont('helvetica', 'normal');
    
    const foundBeacons = reportData.beacons?.filter(b => b.status === 'found') || [];
    
    if (foundBeacons.length === 0) {
      this.doc.text('NIL.', this.margin + this.labelWidth + 5, this.currentY);
      this.currentY += this.lineHeight + this.L.sectionGap;
      return;
    }
    
    // Composed acceptance narrative: "Beacons A, B ... were found. After
    // comparison, positions of all the found beacons/stations except X were
    // accepted ... The coordinates of all found and accepted beacons were
    // adopted as final coordinates."
    const narrative = buildFoundBeaconsNarrative(reportData);
    const narrativeLines = this.doc.splitTextToSize(
      narrative.fullText,
      this.pageWidth - this.margin * 2 - this.labelWidth - 5
    );
    narrativeLines.forEach((line: string) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + this.labelWidth + 5, this.currentY);
      this.currentY += this.lineHeight;
    });
    
    // Per-beacon detail notes are kept so the physical circumstances and
    // rejection reasons the old bullet list carried are not lost.
    const detailNotes: string[] = [];
    
    narrative.acceptedFound.forEach(beacon => {
      const bits: string[] = [];
      if (beacon.condition) bits.push(`${beacon.condition} condition`);
      if (beacon.circumstances) bits.push(beacon.circumstances);
      if (bits.length > 0) detailNotes.push(`    ${beacon.beaconId}: ${bits.join(', ')}.`);
    });
    
    narrative.rejectedFound.forEach(beacon => {
      const reason = beacon.rejectionReason || 'outside the accepted comparison tolerance';
      detailNotes.push(`    ${beacon.beaconId}: not adopted (${reason}).`);
    });
    
    if (detailNotes.length > 0) {
      this.currentY += 2;
      detailNotes.forEach(note => {
        const wrapped = this.doc.splitTextToSize(note, this.pageWidth - this.margin * 2 - this.labelWidth - 5);
        wrapped.forEach((line: string) => {
          this.checkPageBreak(10);
          this.doc.text(line, this.margin + this.labelWidth + 5, this.currentY);
          this.currentY += this.lineHeight;
        });
      });
    }
    
    this.currentY += this.L.sectionGap;
  }

  /**
   * Add Placed Beacons section (narrative)
   */
  private addPlacedBeaconsNarrative(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(30);
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Placed beacons', this.margin, this.currentY);
    this.doc.text(':', this.margin + this.labelWidth, this.currentY);
    
    this.doc.setFont('helvetica', 'normal');
    
    const replacedBeacons = reportData.beacons?.filter(b => b.status === 'replaced') || [];
    const newBeacons = reportData.beacons?.filter(b => b.status === 'not-found') || [];
    const allPlacedBeacons = [...replacedBeacons, ...newBeacons];
    
    let narrativeText = '';
    
    if (allPlacedBeacons.length === 0) {
      narrativeText = 'All new beacons were positioned in accordance with the approved subdivision layout plan.';
    } else {
      // Build narrative for placed beacons
      const beaconDescriptions: string[] = [];
      
      allPlacedBeacons.forEach(beacon => {
        let desc = '';
        
        if (beacon.replacement?.method) {
          desc = beacon.replacement.method;
        } else {
          desc = 'Beacons';
        }
        
        if (beacon.circumstances) {
          desc += ` ${beacon.circumstances}`;
        }
        
        desc += ' were measured and adopted';
        
        if (beacon.replacement?.reason) {
          desc += ` (${beacon.replacement.reason})`;
        }
        
        beaconDescriptions.push(desc);
      });
      
      // Combine similar descriptions
      if (beaconDescriptions.length > 0) {
        narrativeText = beaconDescriptions[0] + '.';
      }
    }
    
    const lines = this.doc.splitTextToSize(narrativeText, this.pageWidth - this.margin * 2 - this.labelWidth - 5);
    lines.forEach((line: string, index: number) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + this.labelWidth + 5, this.currentY + (index * this.lineHeight));
    });
    
    this.currentY += lines.length * this.lineHeight + this.L.sectionGap;
  }

  /**
   * Beacons on line: the new beacons placed on the parent property's boundary and SI 727 para (5)'s verdict on
   * each. All on line: one sentence naming them and the largest displacement. A beacon off the true boundary
   * but within proviso (i) is stated on its own.
   */
  private addAlignmentNarrative(rows: AlignmentResult[] | undefined): void {
    if (!rows || rows.length === 0) return;
    this.checkPageBreak(30);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Beacons on line', this.margin, this.currentY);
    this.doc.text(':', this.margin + this.labelWidth, this.currentY);
    this.doc.setFont('helvetica', 'normal');
    const onLine = rows.filter((r) => r.band === 'on-line');
    const parts: string[] = [];
    if (onLine.length) {
      const worst = Math.max(...onLine.map((r) => r.offset));
      const names = naturalList(onLine.map((r) => r.beacon));
      parts.push(`${names} ${onLine.length === 1 ? 'was' : 'were'} placed on the boundary between the parent property's beacons and ${onLine.length === 1 ? 'is' : 'are'} on line within SI 727 para (5) (largest displacement ${(worst * 1000).toFixed(0)} mm).`);
    }
    for (const r of rows.filter((x) => x.band !== 'on-line')) parts.push(describeAlignment(r));
    const lines = this.doc.splitTextToSize(parts.join(' '), this.pageWidth - this.margin * 2 - this.labelWidth - 5);
    lines.forEach((line: string, index: number) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + this.labelWidth + 5, this.currentY + (index * this.lineHeight));
    });
    this.currentY += lines.length * this.lineHeight + this.L.sectionGap;
  }

  /**
   * Add Comments section
   */
  private addCommentsSection(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(30);
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Comment', this.margin, this.currentY);
    this.doc.text(':', this.margin + this.labelWidth, this.currentY);
    
    this.doc.setFont('helvetica', 'normal');
    
    let commentText = reportData.unusualOccurrences || 'Survey was straightforward.';
    
    const lines = this.doc.splitTextToSize(commentText, this.pageWidth - this.margin * 2 - this.labelWidth - 5);
    lines.forEach((line: string, index: number) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + this.labelWidth + 5, this.currentY + (index * this.lineHeight));
    });
    
    this.currentY += lines.length * this.lineHeight + this.L.commentGap;
  }

  /**
   * Add signature section
   */
  private addSignatureSection(options: ReportGenerationOptions): void {
    // The signature stays together: the gap, the line, the name and "Land Surveyor".
    this.checkPageBreak(this.L.signatureGap + 5 + this.lineHeight * 2);
    
    this.currentY += this.L.signatureGap;
    
    this.doc.setFontSize(this.L.signatureFont);
    this.doc.setFont('helvetica', 'normal');
    
    // Signature line
    this.doc.line(this.margin, this.currentY, this.margin + 80, this.currentY);
    this.currentY += 5;
    
    this.doc.setFontSize(this.L.signatureFont);
    this.doc.text(options.surveyorName, this.margin, this.currentY);
    this.currentY += this.lineHeight;
    
    // Name and "Land Surveyor" only: the licence number and the date are not part of the report's signature.
    this.doc.setFontSize(this.L.signatureFont - 1);
    this.doc.text(`Land Surveyor`, this.margin, this.currentY);
    this.currentY += this.lineHeight;
  }

  /**
   * Check if page break is needed
   */
  private checkPageBreak(requiredSpace: number): void {
    if (this.currentY + requiredSpace > this.pageHeight - this.margin) {
      this.doc.addPage();
      this.currentY = this.margin;
    }
  }
}

/**
 * The report's S.R. number line. Before the office issues a number it is left for the examiner to fill in,
 * with the year it will fall in: "S.R. No: .... / 2026".
 */
export function srNumberText(srNumber: string | null | undefined, now: Date = new Date()): string {
  const sr = (srNumber ?? '').trim();
  return `S.R. No: ${sr && !/^n\/?a$/i.test(sr) ? sr : `.... / ${now.getFullYear()}`}`;
}

/**
 * Generate Narrative Report on Survey PDF
 *
 * @param startingPage - When provided, stamps in-sequence page numbers so the
 *   report can be collated at the end of Comprehensive_Latest.pdf.
 */
export async function generateNarrativeReportOnSurveyPDF(
  reportData: ReportOnSurveyData,
  options: ReportGenerationOptions,
  startingPage?: number
): Promise<{ pdf: Blob; pageCount: number; layout: string }> {
  // One page where possible, signature included: each layout in turn until one fits; when none does, the one
  // that takes the fewest pages (the earliest, so the least compacted, on a tie).
  let best: { pdf: Blob; pageCount: number; layout: string } | null = null;
  for (const layout of REPORT_LAYOUTS) {
    const result = await new NarrativeReportOnSurveyGenerator(layout).generate(reportData, options, startingPage);
    if (result.pageCount === 1) return { ...result, layout: layout.name };
    if (!best || result.pageCount < best.pageCount) best = { ...result, layout: layout.name };
  }
  return best!;
}
