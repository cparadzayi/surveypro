import jsPDF from 'jspdf';
import { LODGEMENT_DOCUMENTS, type LodgementDocumentStatus } from './lodgementDocuments';

/**
 * Cover Page Generator for Surveyor General Submission
 * Generates a formal cover letter with project information page
 */

export interface CoverPageInfo {
  // Surveyor/Firm Information
  firmName?: string;
  firmSubtitle?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  address?: string;
  
  // Letter Information
  date?: string;
  
  // Project Information
  projectTitle: string;
  surveyorName: string;
  licenseNumber: string;
  surveyDate: string;
  district?: string;
  
  // Survey Details
  surveyType?: string; // e.g., "SURVEY OF LOTS 1-12 OF LOT 84 OF SUBDIVISION B..."
  pointsAnalyzed?: number;

  // Enclosed-documents tick state (present ⇒ ticked). Absent ⇒ all unticked.
  documents?: LodgementDocumentStatus[];
}

export class CoverPageGenerator {
  private readonly marginLeft = 20;
  private readonly marginRight = 20;
  private readonly marginTop = 20;
  
  /**
   * Generate cover page PDF with letter and project information
   */
  generateCoverPage(info: CoverPageInfo): Blob {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    // Page 1: Formal Letter to Surveyor General
    this.generateLetterPage(pdf, info);
    
    // Page 2: Project Information (moved from Calculations Part 1)
    pdf.addPage();
    this.generateProjectInfoPage(pdf, info);
    
    return new Blob([pdf.output('blob')], { type: 'application/pdf' });
  }
  
  /**
   * Generate formal letter page (Page 1)
   */
  private generateLetterPage(pdf: jsPDF, info: CoverPageInfo): void {
    const pageWidth = pdf.internal.pageSize.getWidth();
    let yPosition = this.marginTop;
    
    // Firm Header (if provided)
    if (info.firmName) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(0, 128, 0); // Green
      const firmNameWidth = pdf.getTextWidth(info.firmName);
      pdf.text(info.firmName, (pageWidth - firmNameWidth) / 2, yPosition);
      yPosition += 8;
      
      if (info.firmSubtitle) {
        pdf.setFontSize(11);
        pdf.setTextColor(0, 0, 255); // Blue
        const subtitleWidth = pdf.getTextWidth(info.firmSubtitle);
        pdf.text(info.firmSubtitle, (pageWidth - subtitleWidth) / 2, yPosition);
        yPosition += 6;
      }
      
      // Contact Information
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      
      if (info.phone || info.email) {
        yPosition += 3;
        let contactY = yPosition;
        
        if (info.phone) {
          pdf.text(`📞 ${info.phone}`, this.marginLeft, contactY);
        }
        if (info.email) {
          pdf.text(`📧 ${info.email}`, pageWidth - this.marginRight - pdf.getTextWidth(`📧 ${info.email}`), contactY);
        }
        yPosition += 5;
      }
      
      if (info.address || info.website) {
        let contactY = yPosition;
        
        if (info.address) {
          pdf.text(`📍 ${info.address}`, this.marginLeft, contactY);
        }
        if (info.website) {
          pdf.text(`🌐 ${info.website}`, pageWidth - this.marginRight - pdf.getTextWidth(`🌐 ${info.website}`), contactY);
        }
        yPosition += 8;
      }
      
      // Separator line
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);
      pdf.line(this.marginLeft, yPosition, pageWidth - this.marginRight, yPosition);
      yPosition += 10;
    }
    
    // Date
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text(info.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), this.marginLeft, yPosition);
    yPosition += 15;
    
    // Recipient Address
    pdf.setFont('helvetica', 'bold');
    pdf.text('The Department of the Surveyor General', this.marginLeft, yPosition);
    yPosition += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.text('Tredgold Building', this.marginLeft, yPosition);
    yPosition += 5;
    pdf.text('Leopold Takawira Ave.', this.marginLeft, yPosition);
    yPosition += 5;
    pdf.text('P.O. Box 1580', this.marginLeft, yPosition);
    yPosition += 5;
    pdf.text('Bulawayo', this.marginLeft, yPosition);
    yPosition += 15;
    
    // Salutation
    pdf.text('Dear Sir/Madam', this.marginLeft, yPosition);
    yPosition += 10;
    
    // Subject Line
    pdf.setFont('helvetica', 'bold');
    const subjectText = `RE: ${info.surveyType || `SURVEY OF ${info.projectTitle.toUpperCase()}`}`;
    
    // Word wrap for long subject lines
    const maxWidth = pageWidth - this.marginLeft - this.marginRight;
    const subjectLines = pdf.splitTextToSize(subjectText, maxWidth);
    subjectLines.forEach((line: string) => {
      pdf.text(line, this.marginLeft, yPosition);
      yPosition += 6;
    });
    yPosition += 5;
    
    // Body
    pdf.setFont('helvetica', 'normal');
    pdf.text('Please find enclosed herewith the following documents for your examination and approval:', this.marginLeft, yPosition);
    yPosition += 10;
    
    // Document List with tick boxes (ticked when the record exists on disk)
    const docItems: LodgementDocumentStatus[] =
      info.documents && info.documents.length
        ? info.documents
        : LODGEMENT_DOCUMENTS.map((label) => ({ label, present: false }));

    const boxSize = 3.5;
    docItems.forEach((doc) => {
      const boxX = this.marginLeft + 5;
      const boxY = yPosition - boxSize; // align box bottom near the text baseline
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.3);
      pdf.rect(boxX, boxY, boxSize, boxSize);
      if (doc.present) {
        pdf.setLineWidth(0.5);
        // simple check mark inside the box
        pdf.line(boxX + 0.7, boxY + boxSize * 0.55, boxX + boxSize * 0.42, boxY + boxSize - 0.6);
        pdf.line(boxX + boxSize * 0.42, boxY + boxSize - 0.6, boxX + boxSize - 0.5, boxY + 0.5);
      }
      pdf.text(doc.label, this.marginLeft + 12, yPosition);
      yPosition += 6.5;
    });

    yPosition += 10;
    
    // Closing
    pdf.text('Yours Faithfully', this.marginLeft, yPosition);
    yPosition += 20;
    
    // Signature line
    pdf.text('...........................', this.marginLeft, yPosition);
    yPosition += 5;
    pdf.text(info.surveyorName || 'C. Paradzayi', this.marginLeft, yPosition);
  }
  
  /**
   * Generate project information page (Page 2)
   * This content was previously the first page of Calculations Part 1
   */
  private generateProjectInfoPage(pdf: jsPDF, info: CoverPageInfo): void {
    const pageWidth = pdf.internal.pageSize.getWidth();
    
    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    const title = 'CALCULATIONS PART 1';
    const titleWidth = pdf.getTextWidth(title);
    pdf.text(title, (pageWidth - titleWidth) / 2, 40);
    
    // Subtitle
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    const subtitle = 'Duplicate Point Analysis and Mean Coordinate Calculations';
    const subtitleWidth = pdf.getTextWidth(subtitle);
    pdf.text(subtitle, (pageWidth - subtitleWidth) / 2, 55);
    
    // Project Information
    let yPosition = 80;
    pdf.setFontSize(12);
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Project:', this.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(info.projectTitle, this.marginLeft + 30, yPosition);
    yPosition += 15;
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Surveyor:', this.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(info.surveyorName, this.marginLeft + 30, yPosition);
    yPosition += 10;
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('License:', this.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(info.licenseNumber, this.marginLeft + 30, yPosition);
    yPosition += 15;
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Survey Date:', this.marginLeft, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(info.surveyDate, this.marginLeft + 30, yPosition);
    yPosition += 15;
    
    if (info.pointsAnalyzed) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Points Analyzed:', this.marginLeft, yPosition);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${info.pointsAnalyzed} points with duplicate observations`, this.marginLeft + 30, yPosition);
    }
    
    // Footer
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'italic');
    const footerText = 'SurveyPro - Professional Cadastral Survey Calculations';
    const footerWidth = pdf.getTextWidth(footerText);
    pdf.text(footerText, (pageWidth - footerWidth) / 2, pdf.internal.pageSize.getHeight() - 20);
  }
}
