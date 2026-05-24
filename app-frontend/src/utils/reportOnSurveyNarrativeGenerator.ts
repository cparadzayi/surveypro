/**
 * Narrative Report on Survey PDF Generator
 * Generates professional narrative-style Report on Survey documents
 * Based on Zimbabwe cadastral survey standards
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
  district?: string;
  assistant?: string;
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
    options: ReportGenerationOptions
  ): Promise<{ pdf: Blob; pageCount: number }> {
    console.log('[NarrativeReportOnSurvey] Generating PDF...', reportData);

    // Title
    this.addTitle();
    
    // Header section with survey details
    this.addHeaderSection(reportData, options);
    
    // Purpose section
    this.addPurposeSection(reportData);
    
    // Survey Based On section (narrative)
    this.addSurveyBasisNarrative(reportData);
    
    // Found Beacons section
    this.addFoundBeaconsNarrative(reportData);
    
    // Placed Beacons section
    this.addPlacedBeaconsNarrative(reportData);
    
    // Comments/Unusual Occurrences
    this.addCommentsSection(reportData);
    
    // Signature section
    this.addSignatureSection(options);

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
    
    // Survey of
    this.addLabelValuePair('Survey of', options.surveyOf || 'N/A');
    
    // District
    if (options.district) {
      this.addLabelValuePair('', options.district);
    }
    
    this.currentY += 3;
    
    // Date of Survey
    this.addLabelValuePair('Date of Survey', options.surveyDate || 'N/A');
    
    this.currentY += 3;
    
    // Land Surveyor
    this.addLabelValuePair('Land Surveyor', options.surveyorName || 'N/A');
    
    this.currentY += 3;
    
    // Assistant
    this.addLabelValuePair('Assistant', options.assistant || 'N/A');
    
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
    
    // Build purpose text
    let purposeText = '';
    
    const typeLabels: Record<string, string> = {
      'state-land': 'Survey of State Land',
      'municipal-land': 'Survey of Municipal Land',
      'private-land': 'Survey of Private Land',
      'amended-title': 'Amended Title',
      'servitude': 'Survey of Servitude',
      'replacement': 'Replacement Diagram',
      'other': reportData.purpose.otherDescription || 'Other'
    };
    
    purposeText = typeLabels[reportData.purpose.type] || 'Survey';
    
    if (reportData.purpose.reference) {
      purposeText += ` vide ${reportData.purpose.reference}.`;
    }
    
    const lines = this.doc.splitTextToSize(purposeText, this.pageWidth - this.margin * 2 - this.labelWidth - 5);
    lines.forEach((line: string, index: number) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + this.labelWidth + 5, this.currentY + (index * this.lineHeight));
    });
    
    this.currentY += lines.length * this.lineHeight + 8;
  }

  /**
   * Add Survey Based On section (narrative style)
   */
  private addSurveyBasisNarrative(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(40);
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Survey based on', this.margin, this.currentY);
    this.doc.text(':', this.margin + this.labelWidth, this.currentY);
    
    this.doc.setFont('helvetica', 'normal');
    
    // Build narrative text
    let narrativeText = '';
    const basis = reportData.surveyBasis;
    
    // Trig stations
    if (basis.trigStations && basis.trigStationNames && basis.trigStationNames.length > 0) {
      narrativeText += 'Trig system through the use of Trigs ';
      narrativeText += basis.trigStationNames.join(', ');
      narrativeText += '. ';
    }
    
    // Town survey marks
    if (basis.townSurveyMarks && basis.townSurveyMarkNames && basis.townSurveyMarkNames.length > 0) {
      narrativeText += 'Town Survey Marks ';
      narrativeText += basis.townSurveyMarkNames.join(', ');
      narrativeText += '. ';
    }
    
    // Official control points
    if (basis.officialControlPoints && basis.controlPointNames && basis.controlPointNames.length > 0) {
      narrativeText += 'Official Control Points ';
      narrativeText += basis.controlPointNames.join(', ');
      narrativeText += '. ';
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
   * Add Found Beacons section (narrative)
   */
  private addFoundBeaconsNarrative(reportData: ReportOnSurveyData): void {
    this.checkPageBreak(30);
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Found beacons', this.margin, this.currentY);
    this.doc.text(':', this.margin + this.labelWidth, this.currentY);
    
    this.doc.setFont('helvetica', 'normal');
    
    const foundBeacons = reportData.beacons?.filter(b => b.status === 'found') || [];
    
    let narrativeText = '';
    
    if (foundBeacons.length === 0) {
      narrativeText = 'NIL.';
    } else {
      // Build narrative for found beacons
      const beaconDescriptions: string[] = [];
      
      foundBeacons.forEach(beacon => {
        let desc = `Beacon ${beacon.beaconId}`;
        
        if (beacon.condition) {
          desc += ` (${beacon.condition} condition)`;
        }
        
        if (beacon.circumstances) {
          desc += ` - ${beacon.circumstances}`;
        }
        
        if (beacon.adopted) {
          desc += ' was measured and adopted';
        } else if (beacon.rejectionReason) {
          desc += ` was not adopted (${beacon.rejectionReason})`;
        }
        
        beaconDescriptions.push(desc);
      });
      
      narrativeText = beaconDescriptions.join('. ') + '.';
    }
    
    const lines = this.doc.splitTextToSize(narrativeText, this.pageWidth - this.margin * 2 - this.labelWidth - 5);
    lines.forEach((line: string, index: number) => {
      this.checkPageBreak(10);
      this.doc.text(line, this.margin + this.labelWidth + 5, this.currentY + (index * this.lineHeight));
    });
    
    this.currentY += lines.length * this.lineHeight + 8;
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
      narrativeText = 'NIL.';
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
    this.doc.text(`Date: ${new Date().toLocaleDateString()}`, this.margin, this.currentY);
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
 */
export async function generateNarrativeReportOnSurveyPDF(
  reportData: ReportOnSurveyData,
  options: ReportGenerationOptions
): Promise<{ pdf: Blob; pageCount: number }> {
  const generator = new NarrativeReportOnSurveyGenerator();
  return await generator.generate(reportData, options);
}
