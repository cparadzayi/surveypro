/**
 * Report on Survey PDF Generator
 * Generates SI 727 of 1979 compliant Report on Survey documents
 */

import { jsPDF } from 'jspdf';
import type { ReportOnSurveyData, FoundBeacon } from '../types/cadastral';

interface ReportGenerationOptions {
  surveyorName: string;
  licenseNumber: string;
  firm: string;
  address: string;
  surveyDate: string;
  surveyOf: string;
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
    this.addTitle(reportData.srNumber);
    this.addSurveyorInfo(options);
    
    // Section 1: Purpose
    this.addSection1(reportData);
    
    // Section 2: Survey Based On
    this.addSection2(reportData);
    
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
  private addTitle(srNumber: string): void {
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('REPORT ON SURVEY', this.pageWidth / 2, this.currentY, { align: 'center' });
    
    this.currentY += 10;
    this.doc.setFontSize(12);
    this.doc.text('SI 727 of 1979 - Surveyor General\'s Regulations', this.pageWidth / 2, this.currentY, { align: 'center' });
    
    this.currentY += 10;
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(`Survey Register Number: ${srNumber}`, this.pageWidth / 2, this.currentY, { align: 'center' });
    
    this.currentY += 15;
  }

  /**
   * Add surveyor information
   */
  private addSurveyorInfo(options: ReportGenerationOptions): void {
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    
    const info = [
      `Land Surveyor: ${options.surveyorName}`,
      `License Number: ${options.licenseNumber}`,
      `Firm: ${options.firm}`,
      `Address: ${options.address}`,
      `Survey Date: ${options.surveyDate}`,
      `Survey Of: ${options.surveyOf}`
    ];
    
    info.forEach(line => {
      this.doc.text(line, this.margin, this.currentY);
      this.currentY += this.lineHeight;
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
    
    // Survey type
    const typeLabels: Record<string, string> = {
      'state-land': 'State Land',
      'municipal-land': 'Municipal Land',
      'private-land': 'Private Land',
      'amended-title': 'Amended Title',
      'servitude': 'Servitude',
      'replacement': 'Replacement Diagram',
      'other': 'Other'
    };
    
    const typeLabel = typeLabels[reportData.purpose.type] || reportData.purpose.type;
    this.doc.text(`Survey Type: ${typeLabel}`, this.margin + 5, this.currentY);
    this.currentY += this.lineHeight;
    
    if (reportData.purpose.type === 'other' && reportData.purpose.otherDescription) {
      this.doc.text(`Description: ${reportData.purpose.otherDescription}`, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    }
    
    this.doc.text(`Permit/Approval Reference: ${reportData.purpose.reference}`, this.margin + 5, this.currentY);
    this.currentY += this.lineHeight + 5;
  }

  /**
   * Section 2: Survey Based On
   */
  private addSection2(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(40);
    
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('2. SURVEY BASED ON', this.margin, this.currentY);
    this.currentY += this.lineHeight + 2;
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    
    const basis = reportData.surveyBasis;
    
    if (basis.trigStations) {
      this.doc.text('• Trig Stations:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      if (basis.trigStationNames && basis.trigStationNames.length > 0) {
        const names = basis.trigStationNames.join(', ');
        this.doc.text(`  ${names}`, this.margin + 10, this.currentY);
        this.currentY += this.lineHeight;
      }
    }
    
    if (basis.townSurveyMarks) {
      this.doc.text('• Town Survey Marks:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      if (basis.townSurveyMarkNames && basis.townSurveyMarkNames.length > 0) {
        const names = basis.townSurveyMarkNames.join(', ');
        this.doc.text(`  ${names}`, this.margin + 10, this.currentY);
        this.currentY += this.lineHeight;
      }
    }
    
    if (basis.officialControlPoints) {
      this.doc.text('• Official Control Points:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      if (basis.controlPointNames && basis.controlPointNames.length > 0) {
        const names = basis.controlPointNames.join(', ');
        this.doc.text(`  ${names}`, this.margin + 10, this.currentY);
        this.currentY += this.lineHeight;
      }
    }
    
    if (basis.previousSurvey) {
      this.doc.text('• Previous Survey:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      if (basis.previousSurveySRNumber) {
        this.doc.text(`  S.R. Number: ${basis.previousSurveySRNumber}`, this.margin + 10, this.currentY);
        this.currentY += this.lineHeight;
      }
    }
    
    if (basis.localSystem) {
      this.doc.text('• Local System:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      if (basis.localSystemDetails) {
        if (basis.localSystemDetails.baseMeasurementComparison) {
          this.doc.text(`  Base Measurement: ${basis.localSystemDetails.baseMeasurementComparison}`, this.margin + 10, this.currentY);
          this.currentY += this.lineHeight;
        }
        if (basis.localSystemDetails.trueNorthMethod) {
          this.doc.text(`  True North Method: ${basis.localSystemDetails.trueNorthMethod}`, this.margin + 10, this.currentY);
          this.currentY += this.lineHeight;
        }
      }
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
      foundBeacons.forEach(beacon => {
        this.checkPageBreak(20);
        this.doc.text(`• Beacon ${beacon.beaconId}:`, this.margin + 5, this.currentY);
        this.currentY += this.lineHeight;
        
        if (beacon.condition) {
          this.doc.text(`  Condition: ${beacon.condition}`, this.margin + 10, this.currentY);
          this.currentY += this.lineHeight;
        }
        
        if (beacon.alignmentTest) {
          this.doc.text(`  Alignment Test: ${beacon.alignmentTest.testResult}`, this.margin + 10, this.currentY);
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
          this.doc.text(`  Reason: ${beacon.replacement.reason}`, this.margin + 10, this.currentY);
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
   */
  private addBeaconComparison(reportData: ReportOnSurveyData): void {
    if (!reportData.beaconComparison) return;
    
    this.checkPageBreak(60);
    
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('BEACON COMPARISON (SI 727 Section 67(5))', this.margin, this.currentY);
    this.currentY += this.lineHeight + 2;
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    
    const comparison = reportData.beaconComparison;
    
    // Method
    const methodLabels: Record<string, string> = {
      'tabulation': 'Tabulation of Co-ordinates',
      'sketch': 'Comparison Sketch',
      'both': 'Both Tabulation and Sketch'
    };
    
    this.doc.text(`Method: ${methodLabels[comparison.method]}`, this.margin + 5, this.currentY);
    this.currentY += this.lineHeight;
    
    if (comparison.currentSRNumber) {
      this.doc.text(`Current Survey: ${comparison.currentSRNumber}`, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    }
    
    if (comparison.originalSRNumber) {
      this.doc.text(`Original Survey: ${comparison.originalSRNumber}`, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    }
    
    // Prefer an explicit adjustment summary (Helmert LSQ + W-test); fall back to the legacy tolerance line.
    const adjustmentLine = comparison.adjustmentSummary
      || `Tolerance Threshold: ±${comparison.toleranceThreshold.toFixed(3)}m`;
    const adjustmentLines = this.doc.splitTextToSize(adjustmentLine, this.pageWidth - this.margin * 2 - 10);
    adjustmentLines.forEach((line: string) => {
      this.doc.text(line, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    });
    this.currentY += 3;

    // Tabulation table (if applicable)
    if (comparison.method === 'tabulation' || comparison.method === 'both') {
      this.addBeaconComparisonTable(reportData);
    }
    
    // Conclusion
    if (comparison.conclusion) {
      this.currentY += 5;
      this.doc.setFont('helvetica', 'bold');
      this.doc.text('Conclusion:', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
      
      this.doc.setFont('helvetica', 'normal');
      const lines = this.doc.splitTextToSize(comparison.conclusion, this.pageWidth - this.margin * 2 - 10);
      lines.forEach((line: string) => {
        this.checkPageBreak(10);
        this.doc.text(line, this.margin + 10, this.currentY);
        this.currentY += this.lineHeight;
      });
    }
    
    this.currentY += 5;
  }

  /**
   * Add beacon comparison table
   */
  private addBeaconComparisonTable(reportData: ReportOnSurveyData): void {
    const beaconsWithOriginal = reportData.beacons?.filter(b => 
      b.originalData && b.originalData.coordinates
    ) || [];
    
    if (beaconsWithOriginal.length === 0) return;
    
    this.checkPageBreak(80);
    
    // Table header
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    
    const colX = [this.margin + 5, 40, 70, 100, 130, 155];
    const rowHeight = 6;
    
    this.doc.text('Beacon', colX[0], this.currentY);
    this.doc.text('Original Y', colX[1], this.currentY);
    this.doc.text('Original X', colX[2], this.currentY);
    this.doc.text('New Y', colX[3], this.currentY);
    this.doc.text('New X', colX[4], this.currentY);
    this.doc.text('Δ (m)', colX[5], this.currentY);
    
    this.currentY += rowHeight;
    this.addHorizontalLine();
    this.currentY += 2;
    
    // Table rows
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    
    beaconsWithOriginal.forEach(beacon => {
      this.checkPageBreak(15);
      
      const origY = beacon.originalData?.coordinates?.y?.toFixed(3) || '-';
      const origX = beacon.originalData?.coordinates?.x?.toFixed(3) || '-';
      const newY = beacon.currentCoordinates?.y?.toFixed(3) || '-';
      const newX = beacon.currentCoordinates?.x?.toFixed(3) || '-';
      const distance = beacon.discrepancy?.distance?.toFixed(3) || '-';
      
      this.doc.text(beacon.beaconId, colX[0], this.currentY);
      this.doc.text(origY, colX[1], this.currentY);
      this.doc.text(origX, colX[2], this.currentY);
      this.doc.text(newY, colX[3], this.currentY);
      this.doc.text(newX, colX[4], this.currentY);
      this.doc.text(distance, colX[5], this.currentY);
      
      this.currentY += rowHeight;
    });
    
    this.currentY += 3;
  }

  /**
   * Section 5: Curvilinear Boundaries
   */
  private addSection5(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(30);
    
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('5. CURVILINEAR BOUNDARIES', this.margin, this.currentY);
    this.currentY += this.lineHeight + 2;
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    
    if (!reportData.curvilinearBoundaries.applicable) {
      this.doc.text('Not applicable to this survey.', this.margin + 5, this.currentY);
      this.currentY += this.lineHeight + 5;
      return;
    }
    
    if (reportData.curvilinearBoundaries.method) {
      const methodLabels: Record<string, string> = {
        'previous-survey': 'Previous Survey',
        'taped-traverse': 'Taped Traverse',
        'tacheometric-traverse': 'Tacheometric Traverse',
        'aerial-photography': 'Aerial Photography',
        'various': 'Various Methods'
      };
      
      const methodLabel = methodLabels[reportData.curvilinearBoundaries.method] || reportData.curvilinearBoundaries.method;
      this.doc.text(`Method: ${methodLabel}`, this.margin + 5, this.currentY);
      this.currentY += this.lineHeight;
    }
    
    if (reportData.curvilinearBoundaries.previousSurveySRNumber) {
      this.doc.text(`Previous Survey S.R. Number: ${reportData.curvilinearBoundaries.previousSurveySRNumber}`, this.margin + 5, this.currentY);
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
    this.doc.text(`Date: ${new Date().toLocaleDateString()}`, this.margin, this.currentY);
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
