import jsPDF from 'jspdf';
import { LODGEMENT_DOCUMENTS, type LodgementDocumentStatus } from './lodgementDocuments';
import { drawContactItem, contactItemWidth } from './contactIcons';
import {
  rowBlockHeight,
  rowNeedsPageBreak,
  ROW_HEIGHT_MM,
  DETAIL_LINE_HEIGHT_MM,
  ROW_FONT_SIZE,
  DETAIL_FONT_SIZE,
} from './letterRowLayout';

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
  /** The firm's logo (a PNG data URL with its pixel size), drawn at the left of the header. */
  logo?: { dataUrl: string; width: number; height: number };

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
    
    // The cover is the letter alone: the "CALCULATIONS PART 1" project-information page that followed it repeated
    // what the letter and the documents already state, and is left out of the record.
    
    return new Blob([pdf.output('blob')], { type: 'application/pdf' });
  }
  
  /** Tallest the logo is drawn, mm, and the widest (a wide logo is scaled down to this). */
  private readonly logoMaxHeight = 22;
  private readonly logoMaxWidth = 40;

  /**
   * Draws the logo at the left margin, its top just above the firm name's cap height so the two read as one
   * line. Returns the y of its bottom edge, or null when there is no logo (or it cannot be drawn: a bad
   * image must not stop the letter from being produced).
   */
  private drawLogo(pdf: jsPDF, logo: CoverPageInfo['logo'], nameBaselineY: number): number | null {
    if (!logo || !(logo.width > 0) || !(logo.height > 0)) return null;
    const scale = Math.min(this.logoMaxHeight / logo.height, this.logoMaxWidth / logo.width);
    const w = logo.width * scale, h = logo.height * scale;
    const top = nameBaselineY - 6; // the 16 pt name's cap height is about 4 mm, so this sits a touch above it
    try {
      pdf.addImage(logo.dataUrl, 'PNG', this.marginLeft, top, w, h);
    } catch (error) {
      console.warn('[CoverPage] could not draw the logo', error);
      return null;
    }
    return top + h;
  }

  /**
   * Generate formal letter page (Page 1)
   */
  private generateLetterPage(pdf: jsPDF, info: CoverPageInfo): void {
    const pageWidth = pdf.internal.pageSize.getWidth();
    let yPosition = this.marginTop;
    
    // Firm Header (if provided)
    if (info.firmName) {
      // The logo stands at the left, level with the firm name; the contact lines start below it.
      const logoBottom = this.drawLogo(pdf, info.logo, yPosition);

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
      if (logoBottom !== null) yPosition = Math.max(yPosition, logoBottom + 3);

      // Contact Information
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      
      if (info.phone || info.email) {
        yPosition += 3;
        let contactY = yPosition;
        
        if (info.phone) {
          drawContactItem(pdf, 'phone', info.phone, this.marginLeft, contactY);
        }
        if (info.email) {
          drawContactItem(pdf, 'email', info.email, pageWidth - this.marginRight - contactItemWidth(pdf, info.email), contactY);
        }
        yPosition += 5;
      }

      if (info.address || info.website) {
        let contactY = yPosition;

        if (info.address) {
          drawContactItem(pdf, 'address', info.address, this.marginLeft, contactY);
        }
        if (info.website) {
          drawContactItem(pdf, 'website', info.website, pageWidth - this.marginRight - contactItemWidth(pdf, info.website), contactY);
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
        : LODGEMENT_DOCUMENTS.map((label) => ({ label, displayLabel: label, present: false }));

    const boxSize = 3.5;
    const pageHeight = pdf.internal.pageSize.getHeight();

    docItems.forEach((doc) => {
      const detail = doc.detail ?? [];

      // Keep the closing block on the same page as the end of the list. Without this guard the
      // detail lines can consume the remaining space and push the signature off the sheet.
      if (rowNeedsPageBreak(yPosition, rowBlockHeight(detail.length), pageHeight)) {
        pdf.addPage();
        yPosition = this.marginTop;
      }

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

      pdf.setFontSize(ROW_FONT_SIZE);
      pdf.text(doc.displayLabel ?? doc.label, this.marginLeft + 12, yPosition);
      yPosition += ROW_HEIGHT_MM;

      // Detail lines sit under the row, indented past the tick box and set smaller, so the
      // row itself still reads as the enclosed document.
      if (detail.length) {
        pdf.setFontSize(DETAIL_FONT_SIZE);
        for (const line of detail) {
          pdf.text(line, this.marginLeft + 18, yPosition);
          yPosition += DETAIL_LINE_HEIGHT_MM;
        }
        pdf.setFontSize(ROW_FONT_SIZE);
      }
    });

    yPosition += 10;
    
    // Closing
    pdf.text('Yours Faithfully', this.marginLeft, yPosition);
    yPosition += 20;
    
    // Signature line
    pdf.text('...........................', this.marginLeft, yPosition);
    yPosition += 5;
    // The surveyor's own name, or nothing: never another surveyor's (this fell back to "C. Paradzayi", so a
    // letter with no name set went out signed by the wrong person). A blank leaves the line for a hand signature.
    const signer = (info.surveyorName ?? '').trim();
    if (signer) pdf.text(signer, this.marginLeft, yPosition);
  }
  
}
