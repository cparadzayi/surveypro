/**
 * Field Book Generator for Comprehensive Document
 * Generates Electronic Field Book pages (E1-E99) without cover page
 * Adapted from pdf-generator.ts for use in comprehensive document workflow
 */

import jsPDF from 'jspdf';
import { bankersRound } from './cadastral-precision';

export interface FieldBookPoint {
  id: string;
  y: number;
  x: number;
  status?: string;
  surveyDate?: string;
  description?: string;
}

export interface FieldBookMetadata {
  surveyorName: string;
  surveyDescription?: string;
  surveyDate?: string;
  instruments?: string;
  address?: string;
}

export class FieldBookGenerator {
  private options = {
    format: 'a4' as const,
    orientation: 'portrait' as const,
    unit: 'mm' as const,
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 15,
    marginRight: 15
  };

  private pointPageMap: Record<string, string> = {};

  /**
   * Generate Field Book PDF (E1-E99 pages only, no cover)
   * For use in comprehensive document generation
   * 
   * @param points - Survey points to include in field book
   * @param metadata - Surveyor and project information
   * @returns PDF blob, page count, and point-to-page mapping
   */
  async generateFieldBookPDF(
    points: FieldBookPoint[],
    metadata: FieldBookMetadata
  ): Promise<{ pdf: jsPDF; pageCount: number; pointPageMap: Record<string, string> }> {
    const pdf = new jsPDF(this.options);
    
    // Reset point page map for this generation
    this.pointPageMap = {};
    
    console.log('[FieldBook] Generating field book with', points.length, 'points');
    
    // Calculate pages needed
    const pointsPerPage = 27; // FIXED VALUE - must match all other components
    const totalPages = Math.ceil(points.length / pointsPerPage);
    
    console.log('[FieldBook] Will generate', totalPages, 'pages (E1-E' + totalPages + ')');
    
    // Generate each page
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) {
        pdf.addPage();
      }
      
      const pageNumber = pageIndex + 1;
      const startIndex = pageIndex * pointsPerPage;
      const endIndex = Math.min(startIndex + pointsPerPage, points.length);
      const pagePoints = points.slice(startIndex, endIndex);
      
      // ⭐ Record which page each point appears on
      pagePoints.forEach(pt => {
        this.pointPageMap[pt.id] = `E${pageNumber}`;
      });
      
      this.generateFieldBookPage(pdf, pagePoints, pageNumber, metadata);
      
      console.log(`[FieldBook] Generated page E${pageNumber}: ${pagePoints.length}/${pointsPerPage} points`);
    }
    
    console.log('[FieldBook] ✅ Point page map created:', Object.keys(this.pointPageMap).length, 'points tracked');
    
    return {
      pdf,
      pageCount: totalPages,
      pointPageMap: this.pointPageMap
    };
  }

  /**
   * Generate a single field book page
   */
  private generateFieldBookPage(
    pdf: jsPDF,
    points: FieldBookPoint[],
    pageNumber: number,
    metadata: FieldBookMetadata
  ): void {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const maxYPosition = pageHeight - 30;
    const rowHeight = 7;
    
    // Page header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('ELECTRONIC FIELD BOOK', this.options.marginLeft, 25);
    
    // Page number (E1, E2, etc.)
    const pageLabel = `E${pageNumber}`;
    const pageLabelWidth = pdf.getTextWidth(pageLabel);
    pdf.text(pageLabel, pageWidth - this.options.marginRight - pageLabelWidth, 25);
    
    // Table header
    let yPosition = 45;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    
    // Column positions
    const col1 = this.options.marginLeft;      // Point ID
    const col2 = col1 + 18;                     // Y coordinate
    const col3 = col2 + 28;                     // X coordinate
    const col4 = col3 + 28;                     // Status
    const col5 = col4 + 16;                     // Date
    const col6 = col5 + 22;                     // Description
    
    pdf.text('Point', col1, yPosition);
    pdf.text('Y', col2, yPosition);
    pdf.text('X', col3, yPosition);
    pdf.text('Status', col4, yPosition);
    pdf.text('Date', col5, yPosition);
    pdf.text('Description', col6, yPosition);
    
    yPosition += 3;
    pdf.line(this.options.marginLeft, yPosition, pageWidth - this.options.marginRight, yPosition);
    yPosition += 10;
    
    // Table content
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    
    points.forEach((point) => {
      if (yPosition > maxYPosition) return;
      
      // Point ID
      pdf.text(point.id, col1, yPosition);
      
      // Y coordinate (3 decimal places)
      const yCoord = point.y.toFixed(3);
      pdf.text(yCoord, col2, yPosition);
      
      // X coordinate (3 decimal places)
      const xCoord = point.x.toFixed(3);
      pdf.text(xCoord, col3, yPosition);
      
      // Status
      pdf.text(point.status || '', col4, yPosition);
      
      // Survey date
      let surveyDate = '';
      if (point.surveyDate) {
        try {
          const date = new Date(point.surveyDate);
          surveyDate = date.toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
          });
        } catch {
          surveyDate = '';
        }
      }
      pdf.text(surveyDate, col5, yPosition);
      
      // Description (truncate if too long)
      const description = point.description || '-';
      const remainingWidth = pageWidth - col6 - this.options.marginRight;
      if (pdf.getTextWidth(description) > remainingWidth) {
        const maxChars = Math.floor((remainingWidth / pdf.getTextWidth('M')) * 0.85);
        const wrappedDesc = description.substring(0, maxChars - 3) + '...';
        pdf.text(wrappedDesc, col6, yPosition);
      } else {
        pdf.text(description, col6, yPosition);
      }
      
      yPosition += rowHeight;
    });
    
    // Empty row grid lines (for remaining rows on page)
    const pointsPerPage = 27;
    const currentRowCount = points.length;
    const targetRowCount = Math.min(
      pointsPerPage, 
      Math.floor((maxYPosition - (yPosition - rowHeight)) / rowHeight)
    );
    
    if (currentRowCount < targetRowCount) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(200, 200, 200);
      
      for (let i = currentRowCount; i < targetRowCount; i++) {
        pdf.setLineWidth(0.1);
        pdf.line(col1, yPosition + 3, pageWidth - this.options.marginRight, yPosition + 3);
        yPosition += rowHeight;
      }
      
      pdf.setTextColor(0, 0, 0);
      pdf.setLineWidth(0.2);
    }
    
    // Footer
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const footerY = pageHeight - 15;
    
    // Surveyor name (left)
    if (metadata.surveyorName) {
      pdf.text(metadata.surveyorName, this.options.marginLeft, footerY);
    }
    
    // Page label (center)
    const pageFooter = `Page ${pageLabel}`;
    const pageFooterWidth = pdf.getTextWidth(pageFooter);
    const pageFooterX = (pageWidth - pageFooterWidth) / 2;
    pdf.text(pageFooter, pageFooterX, footerY);
    
    // Date (right)
    const dateText = new Date().toLocaleDateString();
    const dateWidth = pdf.getTextWidth(dateText);
    pdf.text(dateText, pageWidth - this.options.marginRight - dateWidth, footerY);
  }

  /**
   * Calculate expected page count for field book
   */
  calculatePageCount(pointCount: number): number {
    const pointsPerPage = 27;
    return Math.ceil(pointCount / pointsPerPage);
  }
}
