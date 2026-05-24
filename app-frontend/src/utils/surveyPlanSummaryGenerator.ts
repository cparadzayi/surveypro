/**
 * Survey Plan Summary PDF Generator
 * Generates a summary document with survey details, surveyor info,
 * and printing instructions for true-to-scale output
 */

import { jsPDF } from 'jspdf';

export interface SurveyPlanSummaryData {
  // Survey details
  designation: string;
  district: string;
  township?: string;
  surveyDate: string;
  
  // Plan details
  standCount: number;
  totalArea: number; // in square meters
  beaconCount: number;
  outsideFigureVertices?: string; // e.g., "M8, 2836B, 2835D, ..., M8"
  
  // Printing details
  scale: string; // e.g., "1:2000"
  scaleValue: number; // e.g., 2000
  paperSize: string; // e.g., "SI727_500x400"
  paperDimensions: { width: number; height: number }; // in mm
  orientation: 'portrait' | 'landscape';
  
  // Surveyor details
  surveyorName: string;
  licenseNumber: string;
  firm?: string;
  address?: string;
}

export class SurveyPlanSummaryGenerator {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number = 20;
  private currentY: number = 20;
  private lineHeight: number = 6;
  private labelWidth: number = 55;

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
   * Generate complete Survey Plan Summary PDF
   */
  async generate(data: SurveyPlanSummaryData): Promise<{ pdf: Blob; pageCount: number }> {
    console.log('[SurveyPlanSummary] Generating PDF...', data);

    // Title
    this.addTitle();
    
    // Survey Details Section
    this.addSectionTitle('SURVEY DETAILS');
    this.addSurveyDetails(data);
    
    // Plan Statistics Section
    this.addSectionTitle('PLAN STATISTICS');
    this.addPlanStatistics(data);
    
    // Surveyor Details Section
    this.addSectionTitle('SURVEYOR DETAILS');
    this.addSurveyorDetails(data);
    
    // Printing Details Section
    this.addSectionTitle('PRINTING SPECIFICATIONS');
    this.addPrintingDetails(data);
    
    // Printing Instructions Section
    this.addSectionTitle('PRINTING INSTRUCTIONS');
    this.addPrintingInstructions(data);
    
    // Verification Section
    this.addSectionTitle('SCALE VERIFICATION');
    this.addScaleVerification(data);
    
    // Footer
    this.addFooter(data);

    const pageCount = this.doc.getNumberOfPages();
    const pdfBlob = this.doc.output('blob');

    console.log('[SurveyPlanSummary] PDF generated:', pageCount, 'pages');
    return { pdf: pdfBlob, pageCount };
  }

  /**
   * Add main title
   */
  private addTitle(): void {
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('SURVEY PLAN SUMMARY', this.pageWidth / 2, this.currentY, { align: 'center' });
    
    this.currentY += 5;
    
    // Subtitle
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text('Reference Document for Plan Printing & Verification', this.pageWidth / 2, this.currentY, { align: 'center' });
    
    this.currentY += 10;
    
    // Horizontal line
    this.doc.setDrawColor(0);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, this.currentY, this.pageWidth - this.margin, this.currentY);
    
    this.currentY += 8;
  }

  /**
   * Add section title
   */
  private addSectionTitle(title: string): void {
    this.checkPageBreak(20);
    
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(30, 64, 175); // Blue color
    this.doc.text(title, this.margin, this.currentY);
    this.doc.setTextColor(0); // Reset to black
    
    this.currentY += 2;
    
    // Underline
    this.doc.setDrawColor(30, 64, 175);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.margin, this.currentY, this.margin + this.doc.getTextWidth(title), this.currentY);
    this.doc.setDrawColor(0);
    
    this.currentY += 6;
  }

  /**
   * Add survey details section
   */
  private addSurveyDetails(data: SurveyPlanSummaryData): void {
    this.doc.setFontSize(10);
    
    this.addLabelValuePair('Designation', data.designation || 'N/A');
    this.addLabelValuePair('District', data.district || 'N/A');
    if (data.township) {
      this.addLabelValuePair('Township', data.township);
    }
    this.addLabelValuePair('Survey Date', data.surveyDate || 'N/A');
    
    this.currentY += 4;
  }

  /**
   * Add plan statistics section
   */
  private addPlanStatistics(data: SurveyPlanSummaryData): void {
    this.doc.setFontSize(10);
    
    this.addLabelValuePair('Number of Stands', data.standCount.toString());
    this.addLabelValuePair('Total Area', `${data.totalArea.toFixed(2)} m² (${(data.totalArea / 10000).toFixed(4)} ha)`);
    this.addLabelValuePair('Number of Beacons', data.beaconCount.toString());
    
    if (data.outsideFigureVertices) {
      this.addLabelValuePair('Figure Boundary', data.outsideFigureVertices);
    }
    
    this.currentY += 4;
  }

  /**
   * Add surveyor details section
   */
  private addSurveyorDetails(data: SurveyPlanSummaryData): void {
    this.doc.setFontSize(10);
    
    this.addLabelValuePair('Land Surveyor', data.surveyorName || 'N/A');
    this.addLabelValuePair('License Number', data.licenseNumber || 'N/A');
    if (data.firm) {
      this.addLabelValuePair('Firm', data.firm);
    }
    if (data.address) {
      this.addLabelValuePair('Address', data.address);
    }
    
    this.currentY += 4;
  }

  /**
   * Add printing details section
   */
  private addPrintingDetails(data: SurveyPlanSummaryData): void {
    this.doc.setFontSize(10);
    
    // Format paper size name nicely
    const paperSizeName = this.formatPaperSizeName(data.paperSize);
    
    this.addLabelValuePair('Map Scale', data.scale);
    this.addLabelValuePair('Paper Size', paperSizeName);
    this.addLabelValuePair('Paper Dimensions', `${data.paperDimensions.width} mm × ${data.paperDimensions.height} mm`);
    this.addLabelValuePair('Orientation', data.orientation.charAt(0).toUpperCase() + data.orientation.slice(1));
    
    // Add scale explanation
    this.currentY += 2;
    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'italic');
    this.doc.setTextColor(100);
    const scaleExplanation = `At ${data.scale} scale: 1 mm on paper = ${(data.scaleValue / 1000).toFixed(1)} metres on ground`;
    this.doc.text(scaleExplanation, this.margin + 5, this.currentY);
    this.doc.setTextColor(0);
    this.doc.setFont('helvetica', 'normal');
    
    this.currentY += 8;
  }

  /**
   * Add printing instructions section
   */
  private addPrintingInstructions(data: SurveyPlanSummaryData): void {
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    
    const instructions = [
      '1. Open the Survey Plan PDF in Adobe Acrobat Reader (recommended) or similar PDF viewer.',
      '',
      '2. Go to File → Print (or press Ctrl+P / Cmd+P).',
      '',
      '3. In the Print dialog, locate the "Page Sizing & Handling" or "Size" section.',
      '',
      '4. CRITICAL: Select "Actual size" or "100%" scaling.',
      '   • Do NOT select "Fit to page" or "Shrink to fit"',
      '   • Do NOT select "Scale to fit"',
      '   • The scale percentage must show exactly 100%',
      '',
      '5. Select the correct paper size:',
      `   • Paper: ${this.formatPaperSizeName(data.paperSize)}`,
      `   • Dimensions: ${data.paperDimensions.width} mm × ${data.paperDimensions.height} mm`,
      `   • Orientation: ${data.orientation.charAt(0).toUpperCase() + data.orientation.slice(1)}`,
      '',
      '6. If your printer does not support this paper size:',
      '   • Use a professional print shop or plotter service',
      '   • Request printing at 100% scale on the specified paper size',
      '',
      '7. Verify the printed scale using the scale bar or verification box (see below).'
    ];
    
    instructions.forEach(line => {
      this.checkPageBreak(8);
      
      if (line.startsWith('4. CRITICAL')) {
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(220, 38, 38); // Red for emphasis
      } else if (line === '') {
        this.currentY += 2;
        return;
      } else {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(0);
      }
      
      // Handle indented lines
      const indent = line.startsWith('   ') ? 8 : 0;
      const text = line.trim();
      
      const lines = this.doc.splitTextToSize(text, this.pageWidth - this.margin * 2 - indent);
      lines.forEach((wrappedLine: string, idx: number) => {
        this.doc.text(wrappedLine, this.margin + indent, this.currentY);
        this.currentY += this.lineHeight;
      });
    });
    
    this.doc.setTextColor(0);
    this.currentY += 4;
  }

  /**
   * Add scale verification section with a verification box
   */
  private addScaleVerification(data: SurveyPlanSummaryData): void {
    this.checkPageBreak(50);
    
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    
    this.doc.text('Print this page and measure the verification box below:', this.margin, this.currentY);
    this.currentY += 8;
    
    // Draw a 50mm x 50mm verification box
    const boxSize = 50; // mm
    const boxX = this.margin;
    const boxY = this.currentY;
    
    this.doc.setDrawColor(0);
    this.doc.setLineWidth(0.5);
    this.doc.rect(boxX, boxY, boxSize, boxSize);
    
    // Add diagonal lines for visual reference
    this.doc.setLineWidth(0.2);
    this.doc.line(boxX, boxY, boxX + boxSize, boxY + boxSize);
    this.doc.line(boxX + boxSize, boxY, boxX, boxY + boxSize);
    
    // Label the box
    this.doc.setFontSize(8);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('50 mm', boxX + boxSize / 2, boxY + boxSize + 4, { align: 'center' });
    
    // Rotated text for height (simulate with positioning)
    this.doc.text('50 mm', boxX - 3, boxY + boxSize / 2, { angle: 90 });
    
    // Verification instructions next to box
    const instructionX = boxX + boxSize + 15;
    let instructionY = boxY + 5;
    
    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('VERIFICATION:', instructionX, instructionY);
    instructionY += 6;
    
    this.doc.setFont('helvetica', 'normal');
    const verifyInstructions = [
      '• Measure this box with a ruler',
      '• It should measure exactly 50mm × 50mm',
      '• If correct, your plan is printed to scale',
      '',
      'If the box does not measure 50mm:',
      '• Your print settings are incorrect',
      '• Reprint with "Actual size" / "100%"',
      '• Do not use "Fit to page"'
    ];
    
    verifyInstructions.forEach(line => {
      if (line === '') {
        instructionY += 3;
        return;
      }
      if (line.startsWith('If the box')) {
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(220, 38, 38);
      } else if (line.startsWith('• Your') || line.startsWith('• Reprint') || line.startsWith('• Do not')) {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(220, 38, 38);
      } else {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(0);
      }
      this.doc.text(line, instructionX, instructionY);
      instructionY += 5;
    });
    
    this.doc.setTextColor(0);
    this.currentY = boxY + boxSize + 15;
  }

  /**
   * Add footer with generation info
   */
  private addFooter(data: SurveyPlanSummaryData): void {
    this.checkPageBreak(25);
    
    this.currentY += 5;
    
    // Horizontal line
    this.doc.setDrawColor(150);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.margin, this.currentY, this.pageWidth - this.margin, this.currentY);
    
    this.currentY += 5;
    
    this.doc.setFontSize(8);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(100);
    
    const generatedDate = new Date().toLocaleString();
    this.doc.text(`Generated: ${generatedDate}`, this.margin, this.currentY);
    this.doc.text('SurveyPro Cadastral System', this.pageWidth - this.margin, this.currentY, { align: 'right' });
    
    this.currentY += 5;
    this.doc.text(`Survey Plan: ${data.designation}`, this.margin, this.currentY);
    this.doc.text(`Scale: ${data.scale}`, this.pageWidth - this.margin, this.currentY, { align: 'right' });
    
    this.doc.setTextColor(0);
  }

  /**
   * Add label-value pair
   */
  private addLabelValuePair(label: string, value: string): void {
    this.checkPageBreak(8);
    
    const x = this.margin;
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(`${label}:`, x, this.currentY);
    
    this.doc.setFont('helvetica', 'normal');
    const valueX = x + this.labelWidth;
    
    // Handle long values with word wrap
    const maxValueWidth = this.pageWidth - this.margin - valueX;
    const lines = this.doc.splitTextToSize(value, maxValueWidth);
    
    lines.forEach((line: string, index: number) => {
      this.doc.text(line, valueX, this.currentY + (index * this.lineHeight));
    });
    
    this.currentY += Math.max(lines.length, 1) * this.lineHeight;
  }

  /**
   * Format paper size name for display
   * Note: System uses ISO A-series paper sizes as approved by Surveyor General
   * Returns just the paper name without dimensions (dimensions shown separately)
   */
  private formatPaperSizeName(paperSize: string): string {
    const sizeMap: Record<string, string> = {
      'ISO_A0': 'ISO A0',
      'ISO_A1': 'ISO A1',
      'ISO_A2': 'ISO A2',
      'A0': 'ISO A0',
      'A1': 'ISO A1',
      'A2': 'ISO A2',
      'A3': 'ISO A3',
      'A4': 'ISO A4'
    };
    
    return sizeMap[paperSize] || paperSize;
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
 * Generate Survey Plan Summary PDF
 */
export async function generateSurveyPlanSummaryPDF(
  data: SurveyPlanSummaryData
): Promise<{ pdf: Blob; pageCount: number }> {
  const generator = new SurveyPlanSummaryGenerator();
  return await generator.generate(data);
}
