/**
 * Report on Survey PDF Generator
 * Generates SI 727 of 1979 compliant Report on Survey documents
 */

import { jsPDF } from 'jspdf';
import type { ReportOnSurveyData } from '../types/cadastral';
import {
  renderBeaconComparison,
  type BeaconComparisonCursor,
} from './beaconComparisonSection';
import { formatDateDDMMYYYY } from './dateFormat';
import { buildFoundBeaconsNarrative } from './beaconAcceptanceNarrative';
import { composeReportSurveyOf } from './planDesignation';
import { purposeStatement } from './reportPurpose';

export interface ReportGenerationOptions {
  surveyorName: string;
  licenseNumber: string;
  firm: string;
  address: string;
  surveyDate: string;
  surveyOf: string;
  /** Structured "Survey of" parts: compose the header instead of surveyOf. */
  township?: string;
  parentProperty?: string;
  wholePortion?: string;
  standNames?: string[];
  /** Equipment line for Section 2. */
  instrumentDescription?: string;
  instrumentBaseSerial?: string;
  instrumentRoverSerial?: string;
}

export class ReportOnSurveyGenerator {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number = 20;
  private currentY: number = 20;
  private lineHeight: number = 7;

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
   * Generate complete Report on Survey PDF
   */
  async generate(
    reportData: ReportOnSurveyData,
    options: ReportGenerationOptions
  ): Promise<{ pdf: Blob; pageCount: number }> {
    console.log('[ReportOnSurvey] Generating PDF...', reportData);

    // Title page
    this.addTitle();
    this.addSurveyorInfo(reportData, options);
    
    // Section 1: Purpose
    this.addSection1(reportData);
    
    // Section 2: Survey Based On
    this.addSection2(reportData, options);
    
    // Section 3 & 4: Beacons
    this.addSection3And4(reportData);
    
    // Beacon Comparison (if applicable)
    if (reportData.beaconComparison) {
      this.addBeaconComparison(reportData);
    }
    
    // Section 5: Curvilinear Boundaries
    this.addSection5(reportData);
    
    // Section 6: Unusual Occurrences
    this.addSection6(reportData);
    
    // Signature section
    this.addSignatureSection(options);

    const pageCount = this.doc.getNumberOfPages();
    const pdfBlob = this.doc.output('blob');

    console.log('[ReportOnSurvey] PDF generated:', pageCount, 'pages');
    return { pdf: pdfBlob, pageCount };
  }

  /**
   * Add title and header
   */
  private addTitle(): void {
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('REPORT ON SURVEY', this.pageWidth / 2, this.currentY, { align: 'center' });
    
    this.currentY += 10;
    this.doc.setFontSize(12);
    this.doc.text('SI 727 of 1979 - Surveyor General\'s Regulations', this.pageWidth / 2, this.currentY, { align: 'center' });
    
    this.currentY += 15;
  }

  /**
   * Add surveyor information
   */
  private addSurveyorInfo(reportData: ReportOnSurveyData, options: ReportGenerationOptions): void {
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    
    const surveyOf = composeReportSurveyOf({
      standNames: options.standNames,
      township: options.township,
      parentProperty: options.parentProperty,
      wholePortion: options.wholePortion,
      fallbackSurveyOf: options.surveyOf,
    });
    
    const info = [
      `Survey Of: ${surveyOf}`,
      `S.R. No: ${reportData.srNumber}`,
      `Land Surveyor: ${options.surveyorName}`,
      `Date of Survey: ${options.surveyDate}`,
      `License Number: ${options.licenseNumber}`,
      `Firm: ${options.firm}`,
      `Address: ${options.address}`
    ];
    
    info.forEach(line => {
      const wrapped = this.doc.splitTextToSize(line, this.pageWidth - this.margin * 2);
      wrapped.forEach((part: string) => {
        this.doc.text(part, this.margin, this.currentY);
        this.currentY += this.lineHeight;
      });
    });
    
    this.currentY += 5;
    this.addHorizontalLine();
    this.currentY += 10;
  }

  /**
   * Section 1: Purpose of Survey
   */
  private addSection1(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(30);
    
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('1. PURPOSE OF SURVEY', this.margin, this.currentY);
    this.currentY += this.lineHeight + 2;
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    
    // Statutory subcategory, lettered (a)-(g), with the reference cited under
    // its statutory term (e.g. "letter of instruction reference").
    const statement = purposeStatement(
      reportData.purpose.type,
      reportData.purpose.reference,
      reportData.purpose.otherDescription
    );
    
    const lines = this.doc.splitTextToSize(statement, this.pageWidth - this.margin * 2 - 10);
    lines.forEach((line: string) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    });
    
    this.currentY += 5;
  }

  /**
   * Section 2: Survey Based On
   */
  private addSection2(reportData: ReportOnSurveyData, options: ReportGenerationOptions): void {
    this.checkPageBreak(40);
    
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('2. SURVEY BASED ON', this.margin, this.currentY);
    this.currentY += this.lineHeight + 2;
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    
    const basis = reportData.surveyBasis;
    
    if (basis.trigStations) {
      this.doc.text('(a) Trigonometrical stations:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      if (basis.trigStationNames && basis.trigStationNames.length > 0) {
        const names = basis.trigStationNames.join(', ');
        const lines = this.doc.splitTextToSize(`   ${names}`, this.pageWidth - this.margin * 2 - 10);
        lines.forEach((line: string) => {
          this.checkPageBreak(10);
          this.doc.text(line, this.margin + 10, this.currentY);
          this.currentY += this.lineHeight;
        });
      }
    }
    
    if (basis.townSurveyMarks) {
      this.doc.text('(b) Town survey marks:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      if (basis.townSurveyMarkNames && basis.townSurveyMarkNames.length > 0) {
        const names = basis.townSurveyMarkNames.join(', ');
        const lines = this.doc.splitTextToSize(`   ${names}`, this.pageWidth - this.margin * 2 - 10);
        lines.forEach((line: string) => {
          this.checkPageBreak(10);
          this.doc.text(line, this.margin + 10, this.currentY);
          this.currentY += this.lineHeight;
        });
      }
    }
    
    if (basis.officialControlPoints) {
      this.doc.text('(c) Official control points:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      if (basis.controlPointNames && basis.controlPointNames.length > 0) {
        const names = basis.controlPointNames.join(', ');
        const lines = this.doc.splitTextToSize(`   ${names}`, this.pageWidth - this.margin * 2 - 10);
        lines.forEach((line: string) => {
          this.checkPageBreak(10);
          this.doc.text(line, this.margin + 10, this.currentY);
          this.currentY += this.lineHeight;
        });
      }
    }
    
    if (basis.previousSurvey) {
      const srLine = basis.previousSurveySRNumber
        ? `(d) Previous survey (S.R. No: ${basis.previousSurveySRNumber})`
        : '(d) Previous survey';
      this.doc.text(srLine, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    }
    
    if (basis.localSystem) {
      this.doc.text('(e) Local system:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      if (basis.localSystemDetails) {
        if (basis.localSystemDetails.baseMeasurementComparison) {
          this.doc.text('   (i) Comparison of base measurement:', this.margin + 10, this.currentY);
          this.currentY += this.lineHeight;
          const lines = this.doc.splitTextToSize(`       ${basis.localSystemDetails.baseMeasurementComparison}`, this.pageWidth - this.margin * 2 - 15);
          lines.forEach((line: string) => {
            this.checkPageBreak(10);
            this.doc.text(line, this.margin + 15, this.currentY);
            this.currentY += this.lineHeight;
          });
        }
        if (basis.localSystemDetails.trueNorthMethod) {
          this.doc.text('   (ii) How true north was derived:', this.margin + 10, this.currentY);
          this.currentY += this.lineHeight;
          const lines = this.doc.splitTextToSize(`       ${basis.localSystemDetails.trueNorthMethod}`, this.pageWidth - this.margin * 2 - 15);
          lines.forEach((line: string) => {
            this.checkPageBreak(10);
            this.doc.text(line, this.margin + 15, this.currentY);
            this.currentY += this.lineHeight;
          });
        }
      }
    }
    
    if (options.instrumentDescription) {
      const serials = [options.instrumentBaseSerial, options.instrumentRoverSerial]
        .filter(Boolean)
        .join(', ');
      this.doc.text(`• Equipment: ${options.instrumentDescription}${serials ? ` (${serials})` : ''}`, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    }
    
    this.currentY += 5;
  }

  /**
   * Section 3 & 4: Found and Replaced Beacons
   */
  private addSection3And4(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(50);
    
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('3. BEACONS FOUND', this.margin, this.currentY);
    this.currentY += this.lineHeight + 2;
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    
    const foundBeacons = reportData.beacons?.filter(b => b.status === 'found') || [];
    const replacedBeacons = reportData.beacons?.filter(b => b.status === 'replaced') || [];
    
    if (foundBeacons.length > 0) {
      // Acceptance clause composed from the s.67(5) comparison result:
      // "Beacons A, B ... were found ... After comparison, positions of all
      // the found beacons/stations except X were accepted ...", which also
      // states which lines were adopted.
      const acceptance = buildFoundBeaconsNarrative(reportData);
      const acceptanceLines = this.doc.splitTextToSize(
        `${acceptance.foundSentence} ${acceptance.comparisonSentence} ${acceptance.adoptionSentence}`,
        this.pageWidth - this.margin * 2 - 10
      );
      acceptanceLines.forEach((line: string) => {
        this.checkPageBreak(10);
        this.doc.text(line, this.margin + 5, this.currentY);
        this.currentY += this.lineHeight;
      });
      this.currentY += 2;
      
      // (a) Particular circumstances — scattered stones, no centre mark,
      //     concreted by owner, fence-posts, etc.
      const withCircumstances = foundBeacons.filter(b => b.condition || b.circumstances);
      if (withCircumstances.length > 0) {
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('(a) Circumstances', this.margin + 5, this.currentY);
        this.currentY += this.lineHeight;
        this.doc.setFont('helvetica', 'normal');
        
        withCircumstances.forEach(beacon => {
          const bits: string[] = [];
          if (beacon.condition) bits.push(beacon.condition);
          if (beacon.circumstances) bits.push(beacon.circumstances);
          const lines = this.doc.splitTextToSize(
            `  • Beacon ${beacon.beaconId}: ${bits.join('. ')}.`,
            this.pageWidth - this.margin * 2 - 10
          );
          lines.forEach((line: string) => {
            this.checkPageBreak(10);
            this.doc.text(line, this.margin + 10, this.currentY);
            this.currentY += this.lineHeight;
          });
        });
        this.currentY += 2;
      }
      
      // (b) Alignment tests — full details with results.
      const withTests = foundBeacons.filter(b => b.alignmentTest);
      if (withTests.length > 0) {
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('(b) Alignment tests', this.margin + 5, this.currentY);
        this.currentY += this.lineHeight;
        this.doc.setFont('helvetica', 'normal');
        
        withTests.forEach(beacon => {
          const test = beacon.alignmentTest!;
          const parts: string[] = [];
          if (test.line) parts.push(`on line ${test.line}`);
          if (test.testResult) parts.push(test.testResult);
          if (test.discrepancyMeters !== undefined) parts.push(`${test.discrepancyMeters} m discrepancy`);
          parts.push(test.acceptable ? 'within tolerance' : 'outside tolerance');
          const lines = this.doc.splitTextToSize(
            `  • Beacon ${beacon.beaconId}: ${parts.join(', ')}.`,
            this.pageWidth - this.margin * 2 - 10
          );
          lines.forEach((line: string) => {
            this.checkPageBreak(10);
            this.doc.text(line, this.margin + 10, this.currentY);
            this.currentY += this.lineHeight;
          });
        });
        this.currentY += 2;
      }
    } else {
      this.doc.text('No beacons found.', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    }
    
    this.currentY += 5;
    
    // Section 4: Replaced Beacons
    this.checkPageBreak(30);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('4. BEACONS REPLACED', this.margin, this.currentY);
    this.currentY += this.lineHeight + 2;
    
    this.doc.setFont('helvetica', 'normal');
    
    if (replacedBeacons.length > 0) {
      replacedBeacons.forEach(beacon => {
        this.checkPageBreak(15);
        this.doc.text(`• Beacon ${beacon.beaconId}:`, this.margin + 5, this.currentY);
        this.currentY += this.lineHeight;
        
        if (beacon.replacement?.reason) {
          this.doc.text(`  Reason for choice of position: ${beacon.replacement.reason}`, this.margin + 10, this.currentY);
          this.currentY += this.lineHeight;
        }
        
        if (beacon.circumstances) {
          const lines = this.doc.splitTextToSize(`  Circumstances: ${beacon.circumstances}`, this.pageWidth - this.margin * 2 - 10);
          lines.forEach((line: string) => {
            this.checkPageBreak(10);
            this.doc.text(line, this.margin + 10, this.currentY);
            this.currentY += this.lineHeight;
          });
        }
      });
    } else {
      this.doc.text('No beacons replaced.', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    }
    
    this.currentY += 5;
  }

  /**
   * Add Beacon Comparison (SI 727 Section 67(5))
   * Delegates to the shared renderer so the standalone Beacon Comparison Report
   * and this inline block stay identical.
   */
  private addBeaconComparison(reportData: ReportOnSurveyData): void {
    if (!reportData.beaconComparison) return;

    const cursor: BeaconComparisonCursor = {
      doc: this.doc,
      margin: this.margin,
      lineHeight: this.lineHeight,
      pageWidth: this.pageWidth,
      pageHeight: this.pageHeight,
      y: this.currentY,
    };
    renderBeaconComparison(cursor, reportData);
    this.currentY = cursor.y;
  }

  /**
   * Section 5: Curvilinear Boundaries
   */
  private addSection5(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(30);
    
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('5. CURVILINEAR BOUNDARIES PLOTTED FROM', this.margin, this.currentY);
    this.currentY += this.lineHeight + 2;
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    
    if (!reportData.curvilinearBoundaries.applicable) {
      this.doc.text('Not applicable to this survey.', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight + 5;
      return;
    }
    
    const methodLetters: Record<string, string> = {
      'previous-survey': 'a',
      'taped-traverse': 'b',
      'tacheometric-traverse': 'c',
      'aerial-photography': 'd',
      'various': 'e'
    };
    
    const methodLabels: Record<string, string> = {
      'previous-survey': 'Previous survey',
      'taped-traverse': 'Taped traverse',
      'tacheometric-traverse': 'Tacheometric traverse',
      'aerial-photography': 'Aerial photography',
      'various': 'Various methods'
    };
    
    const method = reportData.curvilinearBoundaries.method;
    const letter = method ? methodLetters[method] : '';
    const label = method ? methodLabels[method] || method : '';
    
    if (method === 'previous-survey') {
      let line = `(${letter}) ${label}`;
      if (reportData.curvilinearBoundaries.previousSurveySRNumber) {
        line += ` - S.R. No: ${reportData.curvilinearBoundaries.previousSurveySRNumber}`;
      }
      if (reportData.curvilinearBoundaries.previousSurveyReference) {
        line += `, letter reference permitting adoption: ${reportData.curvilinearBoundaries.previousSurveyReference}`;
      }
      const lines = this.doc.splitTextToSize(line, this.pageWidth - this.margin * 2 - 10);
      lines.forEach((part: string) => {
        this.checkPageBreak(10);
        this.doc.text(part, this.margin + 5, this.currentY);
        this.currentY += this.lineHeight;
      });
    } else if (method) {
      this.doc.text(`(${letter}) ${label}`, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    }
    
    if (reportData.curvilinearBoundaries.details) {
      this.doc.text('Details:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      
      const lines = this.doc.splitTextToSize(reportData.curvilinearBoundaries.details, this.pageWidth - this.margin * 2 - 10);
      lines.forEach((line: string) => {
        this.checkPageBreak(10);
        this.doc.text(line, this.margin + 10, this.currentY);
        this.currentY += this.lineHeight;
      });
    }
    
    this.currentY += 5;
  }

  /**
   * Section 6: Unusual Occurrences
   */
  private addSection6(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(40);
    
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('6. UNUSUAL OCCURRENCES AND COMMENTS', this.margin, this.currentY);
    this.currentY += this.lineHeight + 2;
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    
    if (!reportData.unusualOccurrences || reportData.unusualOccurrences.trim() === '') {
      this.doc.text('None reported.', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight + 5;
      return;
    }
    
    const lines = this.doc.splitTextToSize(reportData.unusualOccurrences, this.pageWidth - this.margin * 2 - 5);
    lines.forEach((line: string) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    });
    
    this.currentY += 5;
  }

  /**
   * Add signature section
   */
  private addSignatureSection(options: ReportGenerationOptions): void {
    this.checkPageBreak(60);
    
    this.currentY += 10;
    this.addHorizontalLine();
    this.currentY += 10;
    
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    
    this.doc.text('I certify that this report is true and correct to the best of my knowledge.', this.margin, this.currentY);
    this.currentY += this.lineHeight + 15;
    
    // Signature line
    this.doc.line(this.margin, this.currentY, this.margin + 80, this.currentY);
    this.currentY += 5;
    this.doc.setFontSize(9);
    this.doc.text(options.surveyorName, this.margin, this.currentY);
    this.currentY += this.lineHeight;
    this.doc.text(`Land Surveyor (License No. ${options.licenseNumber})`, this.margin, this.currentY);
    this.currentY += this.lineHeight + 5;
    
    // Date line
    this.doc.text(`Date: ${formatDateDDMMYYYY(new Date())}`, this.margin, this.currentY);
  }

  /**
   * Add horizontal line
   */
  private addHorizontalLine(): void {
    this.doc.line(this.margin, this.currentY, this.pageWidth - this.margin, this.currentY);
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
 * Generate Report on Survey PDF
 */
export async function generateReportOnSurveyPDF(
  reportData: ReportOnSurveyData,
  options: ReportGenerationOptions
): Promise<{ pdf: Blob; pageCount: number }> {
  const generator = new ReportOnSurveyGenerator();
  return await generator.generate(reportData, options);
}
