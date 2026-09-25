/**
 * Narrative Report on Survey PDF Generator
 * Generates professional narrative-style Report on Survey documents
 * Based on Zimbabwe cadastral survey standards
 */

import { jsPDF } from 'jspdf';
import type { ReportOnSurveyData } from '../types/cadastral';
import { stampSequentialPageNumbers } from './pdfPageNumber';
import { formatDateDDMMYYYY } from './dateFormat';
import { formatSurveyMonthYear } from './surveyDate';
import { buildFoundBeaconsNarrative } from './beaconAcceptanceNarrative';
import { composeReportSurveyOf } from './planDesignation';
import { purposeSentence } from './reportPurpose';

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
}

/** Join a list in the practitioner-report manner: "A, B and C" (no serial comma). */
function naturalList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return String(items[0]);
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export class NarrativeReportOnSurveyGenerator {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number = 25;
  private currentY: number = 25;
  private lineHeight: number = 7;
  private labelWidth: number = 50; // Width for left-aligned labels

  constructor() {
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
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Report on Survey', this.margin, this.currentY);
    
    this.currentY += 12;
  }

  /**
   * Add header section with survey details
   */
  private addHeaderSection(reportData: ReportOnSurveyData, options: ReportGenerationOptions): void {
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'normal');
    
    // S.R. No — the report header pairs it with the designation, right-justified
    // above the "Survey of" line.
    const srText = `S.R. No: ${reportData.srNumber || 'N/A'}`;
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
    
    this.currentY += 8;
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
    
    this.currentY += lines.length * this.lineHeight + 8;
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
    
    this.currentY += lines.length * this.lineHeight + 8;
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
      this.currentY += this.lineHeight + 8;
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
    
    this.currentY += 8;
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
      narrativeText = 'All new beacons were positioned in accordance to the approved subdivision layout plan.';
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
    
    this.currentY += lines.length * this.lineHeight + 8;
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
    
    this.currentY += lines.length * this.lineHeight + 15;
  }

  /**
   * Add signature section
   */
  private addSignatureSection(options: ReportGenerationOptions): void {
    this.checkPageBreak(60);
    
    this.currentY += 10;
    
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    
    // Signature line
    this.doc.line(this.margin, this.currentY, this.margin + 80, this.currentY);
    this.currentY += 5;
    
    this.doc.setFontSize(10);
    this.doc.text(options.surveyorName, this.margin, this.currentY);
    this.currentY += this.lineHeight;
    
    this.doc.setFontSize(9);
    this.doc.text(`Land Surveyor`, this.margin, this.currentY);
    this.currentY += this.lineHeight;
    
    this.doc.text(`License No. ${options.licenseNumber}`, this.margin, this.currentY);
    this.currentY += this.lineHeight + 5;
    
    // Date
    this.doc.text(`Date: ${formatDateDDMMYYYY(new Date())}`, this.margin, this.currentY);
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
 * Generate Narrative Report on Survey PDF
 *
 * @param startingPage - When provided, stamps in-sequence page numbers so the
 *   report can be collated at the end of Comprehensive_Latest.pdf.
 */
export async function generateNarrativeReportOnSurveyPDF(
  reportData: ReportOnSurveyData,
  options: ReportGenerationOptions,
  startingPage?: number
): Promise<{ pdf: Blob; pageCount: number }> {
  const generator = new NarrativeReportOnSurveyGenerator();
  return await generator.generate(reportData, options, startingPage);
}
