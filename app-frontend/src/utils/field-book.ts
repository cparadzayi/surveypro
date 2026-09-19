/**
 * Field Book Generator for Comprehensive Document
 * Generates Electronic Field Book pages (E1-E99) without cover page
 * Adapted from pdf-generator.ts for use in comprehensive document workflow
 */

import jsPDF from 'jspdf';
import { bankersRound } from './cadastral-precision';
import type { SiteCalibration } from './siteCalibration';
import { paginateFieldBook, FIELD_BOOK_POINTS_PER_PAGE } from './fieldBookPagination';

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
  /** What was surveyed, as printed on the cover. */
  surveyOf?: string;
  /** Field assistant. */
  assistedBy?: string;
  instrumentDescription?: string;
  instrumentBaseSerial?: string;
  instrumentRoverSerial?: string;
}

/**
 * The month a survey was carried out, as the cover states it: "July 2026".
 *
 * A field book records when the work was done, not the day a form was filled
 * in, and the SG sample reads "June 2020." accordingly. Project setup stores an
 * ISO date because that is what a date input yields, so the conversion happens
 * here at render time rather than the workflow keeping a second display-shaped
 * copy that could drift from the real one.
 *
 * Anything that is not an ISO date is printed exactly as entered: projects
 * predating the date input hold free text such as "June 2020", and mangling it
 * into "Invalid Date" would be worse than leaving it alone.
 */
const surveyedIn = (surveyDate?: string): string => {
  if (!surveyDate) return '';

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(surveyDate);
  if (!iso) return surveyDate;

  const [, year, month] = iso;
  // Built from the parts rather than `new Date(...)`: parsing an ISO date as
  // local time in a timezone behind UTC rolls 1 January back into December of
  // the previous year, which would print the wrong month AND the wrong year.
  const monthName = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][Number(month) - 1];

  return monthName ? `${monthName} ${year}` : surveyDate;
};

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
   * Generate Field Book PDF (cover, then the calibration at E1, then the point pages)
   * For use in comprehensive document generation
   *
   * @param points - Survey points to include in field book
   * @param metadata - Surveyor and project information
   * @returns PDF blob, page count, and point-to-page mapping
   */
  async generateFieldBookPDF(
    points: FieldBookPoint[],
    metadata: FieldBookMetadata,
    /**
     * Optional GNSS site calibration. Rendered FIRST, as E1, with the point pages
     * following from E2. Every E-number therefore depends on whether a survey has
     * a calibration, which is why pagination is decided once in
     * fieldBookPagination.ts and read from there by every consumer.
     */
    calibration?: SiteCalibration
  ): Promise<{ pdf: jsPDF; pageCount: number; pointPageMap: Record<string, string> }> {
    const pdf = new jsPDF(this.options);

    const pagination = paginateFieldBook(points, {
      hasCalibration: Boolean(calibration),
      hasCover: true,
    });
    this.pointPageMap = pagination.pointPageMap;

    console.log('[FieldBook] Generating field book with', points.length, 'points');

    let isFirstPage = true;
    const startPage = () => {
      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;
    };

    // The cover comes first and carries no number.
    startPage();
    this.generateCoverPage(pdf, metadata);

    // The calibration opens the numbered book: it is the evidence the GNSS
    // observations were tied to the local grid, so it precedes the observations
    // themselves.
    if (calibration) {
      startPage();
      this.generateCalibrationPage(pdf, calibration, 1, metadata);
      console.log('[FieldBook] Generated calibration page E1');
    }

    const totalPointPages = Math.ceil(points.length / FIELD_BOOK_POINTS_PER_PAGE);
    for (let pageIndex = 0; pageIndex < totalPointPages; pageIndex++) {
      startPage();

      const startIndex = pageIndex * FIELD_BOOK_POINTS_PER_PAGE;
      const pagePoints = points.slice(startIndex, startIndex + FIELD_BOOK_POINTS_PER_PAGE);

      // Derived from this page's own position, not looked up by id: a
      // re-observed beacon can carry the same id on an earlier AND a later
      // page (Calculations Part 1's duplicate analysis exists for exactly
      // this), and pointPageMap keeps only the last write for that id -- a
      // by-id lookup here would print that page's number on every page the
      // id appears on, leaving another page with no number at all.
      const offset = calibration ? 1 : 0;
      const pageNumber = pageIndex + 1 + offset;

      this.generateFieldBookPage(pdf, pagePoints, pageNumber, metadata);
      console.log(`[FieldBook] Generated page E${pageNumber}: ${pagePoints.length} points`);
    }

    console.log('[FieldBook] ✅ Point page map created:', Object.keys(this.pointPageMap).length, 'points tracked');

    return {
      pdf,
      pageCount: pagination.physicalPageCount,
      pointPageMap: this.pointPageMap,
    };
  }

  /**
   * Render the cover, modelled on cadastral-standard/1 fieldbook cover.pdf.
   *
   * A title page: no E-number, because the calibration owns E1. Rows whose value
   * is absent are dropped rather than printed empty, so a project that predates
   * the structured instrument fields still produces an honest cover.
   */
  private generateCoverPage(pdf: jsPDF, metadata: FieldBookMetadata): void {
    const left = this.options.marginLeft;
    const pageWidth = pdf.internal.pageSize.getWidth();

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(16);
    pdf.text('ELECTRONIC FIELD BOOK', left + 9, 12 + 10);

    // Instruments read from the structured fields; an older project has them only
    // in the free-text column, so that is the fallback and its only reader.
    const instrumentLines: string[] = [];
    if (metadata.instrumentDescription) {
      instrumentLines.push(`1. ${metadata.instrumentDescription}`);
      if (metadata.instrumentBaseSerial) {
        instrumentLines.push(`Base  Serial Number S/N ${metadata.instrumentBaseSerial}`);
      }
      if (metadata.instrumentRoverSerial) {
        instrumentLines.push(`Rover Serial Number S/N ${metadata.instrumentRoverSerial}`);
      }
    } else if (metadata.instruments) {
      instrumentLines.push(...metadata.instruments.split('\n'));
    }

    const rows: { label: string; lines: string[] }[] = [
      { label: 'Land Surveyor', lines: [metadata.surveyorName || ''] },
      { label: 'Assisted by', lines: [metadata.assistedBy || ''] },
      { label: 'Survey of', lines: (metadata.surveyOf || '').split('\n') },
      { label: 'Surveyed in', lines: [surveyedIn(metadata.surveyDate)] },
      { label: 'Instruments', lines: instrumentLines },
      { label: 'Address', lines: (metadata.address || '').split('\n') },
    ];

    // The value column is derived from the widest label, not a constant: a
    // fixed guess (18mm) let "Land Surveyor" -- the widest label -- run past
    // it and overprint its own colon and value. Measured in the same bold
    // 9pt the labels are actually drawn in, since getTextWidth depends on
    // the font that is current when it is called.
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    const labelGap = 3; // mm of clear space between the widest label and the colon
    const widestLabel = Math.max(...rows.map(row => pdf.getTextWidth(row.label)));
    const valueX = left + widestLabel + labelGap;

    let y = 21 + 10;
    const lineHeight = 4.5;
    const rowGap = 4;

    for (const row of rows) {
      const lines = row.lines.filter(line => line.trim().length > 0);
      if (lines.length === 0) continue; // absent value: no label, no colon

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(row.label, left, y);
      const labelWidth = pdf.getTextWidth(row.label);
      pdf.line(left, y + 0.8, left + labelWidth, y + 0.8); // underlined, as the sample

      pdf.setFont('helvetica', 'normal');
      // The colon is its own text run, not glued to the value: a searchable
      // record (and a test) should find "O Saunyama", not ": O Saunyama".
      const colonGap = pdf.getTextWidth(': ');
      const textX = valueX + colonGap;
      // As in the reference, the Base/Rover serial lines are indented under
      // the "1. <description>" line, list-style.
      const instrumentIndent = pdf.getTextWidth('1. ');
      const isInstruments = row.label === 'Instruments';

      // A Zimbabwe designation (Survey of) or a multi-line Address can run
      // well past 100 characters on one line, which would otherwise run off
      // the page. Each explicit '\n' break (already split into `lines`) is
      // wrapped independently, so a hard break never gets glued to the next
      // one -- splitTextToSize is a no-op for a line that already fits.
      const maxValueWidth = pageWidth - this.options.marginRight - textX;
      const wrappedLines = isInstruments
        ? lines
        : lines.flatMap(line => pdf.splitTextToSize(line, maxValueWidth) as string[]);

      wrappedLines.forEach((line, index) => {
        const lineY = y + index * lineHeight;
        if (index === 0) {
          pdf.text(':', valueX, lineY);
        }
        // Instrument lines mix a fixed label ("...S/N") with a serial number
        // that a reader -- or a cross-reference -- needs to find on its own,
        // structured field or free-text fallback alike, so those lines are
        // drawn word by word instead of as one run.
        if (isInstruments) {
          const lineX = index === 0 ? textX : textX + instrumentIndent;
          this.renderWords(pdf, line.trim(), lineX, lineY);
        } else {
          pdf.text(line, textX, lineY);
        }
      });

      y += wrappedLines.length * lineHeight + rowGap;
    }
  }

  /** Draw space-separated words as independent text runs, left to right. */
  private renderWords(pdf: jsPDF, line: string, x: number, y: number): void {
    let cursor = x;
    for (const word of line.split(/\s+/).filter(Boolean)) {
      pdf.text(word, cursor, y);
      cursor += pdf.getTextWidth(`${word} `);
    }
  }

  /**
   * Render the GNSS site calibration page.
   *
   * A site calibration is the evidence that the GNSS observations were tied to
   * the local grid, so the field book carries both halves of it: the adjusted
   * parameters, and the residual at every control point. Parameters alone would
   * not let a reader judge whether the fit was actually good.
   */
  private generateCalibrationPage(
    pdf: jsPDF,
    cal: SiteCalibration,
    pageNumber: number,
    metadata: FieldBookMetadata
  ): void {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const maxYPosition = pageHeight - 30;
    const left = this.options.marginLeft;
    const right = pageWidth - this.options.marginRight;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('ELECTRONIC FIELD BOOK', left, 25);

    const pageLabel = `E${pageNumber}`;
    pdf.text(pageLabel, right - pdf.getTextWidth(pageLabel), 25);

    pdf.setFontSize(12);
    pdf.text('GNSS SITE CALIBRATION', left, 38);

    let y = 48;

    // ── Adjusted parameters ──
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Adjusted parameters', left, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);

    const h = cal.horizontal;
    if (h) {
      // Two columns of label/value so the block stays compact.
      const rows: Array<[string, string]> = [
        ['Rotation origin (Y)', h.rotationCentreEasting.toFixed(3)],
        ['Rotation origin (X)', h.rotationCentreNorthing.toFixed(3)],
        ['Rotation', `${h.rotationDegrees.toFixed(6)}°`],
        ['Translation north', `${h.translationNorth.toFixed(4)} m`],
        ['Translation east', `${h.translationEast.toFixed(4)} m`],
        ['Scale Factor', h.scaleFactor.toFixed(9)],
      ];
      for (const [label, value] of rows) {
        if (y > maxYPosition) break;
        pdf.text(label, left, y);
        pdf.text(value, left + 55, y);
        y += 6;
      }
    } else {
      pdf.text('No horizontal adjustment recorded.', left, y);
      y += 6;
    }

    y += 2;

    // A horizontal-only calibration must SAY so. Silence would read as
    // "the vertical residuals were all zero", which is a different and much
    // stronger claim than "no vertical adjustment was performed".
    if (!cal.hasVertical) {
      pdf.setFont('helvetica', 'italic');
      pdf.text('Horizontal-only calibration — no vertical adjustment was performed.', left, y);
      pdf.setFont('helvetica', 'normal');
      y += 8;
    }

    // ── Summary ──
    const s = cal.summary;
    if (s.maxHorizontalResidual !== null) {
      const worst = `${s.maxHorizontalResidual.toFixed(3)} m`;
      const rms = s.rmsHorizontal !== null ? `${s.rmsHorizontal.toFixed(3)} m` : '—';
      pdf.text(`Largest horizontal residual: ${worst}     RMS: ${rms}`, left, y);
      y += 10;
    }

    // ── Per-pair residuals ──
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Control points', left, y);
    y += 7;

    pdf.setFontSize(9);
    const cPoint = left;
    const cCtrlY = left + 24;
    const cCtrlX = cCtrlY + 32;
    const cCalcY = cCtrlX + 32;
    const cCalcX = cCalcY + 32;
    const cRes = cCalcX + 32;

    pdf.text('Point', cPoint, y);
    pdf.text('Control Y', cCtrlY, y);
    pdf.text('Control X', cCtrlX, y);
    pdf.text('Calculated Y', cCalcY, y);
    pdf.text('Calculated X', cCalcX, y);
    pdf.text('Residual', cRes, y);
    y += 3;
    pdf.line(left, y, right, y);
    y += 6;

    pdf.setFont('helvetica', 'normal');
    for (const pair of cal.pairs) {
      if (y > maxYPosition) {
        // Never silently truncate: a table that drops control points reads as a
        // complete record and is worse than no table at all.
        pdf.setFont('helvetica', 'italic');
        pdf.text('… continued — remaining control points omitted for space.', left, y);
        break;
      }
      pdf.text(pair.pointId, cPoint, y);
      pdf.text(pair.controlEasting.toFixed(3), cCtrlY, y);
      pdf.text(pair.controlNorthing.toFixed(3), cCtrlX, y);
      pdf.text(pair.calculatedEasting.toFixed(3), cCalcY, y);
      pdf.text(pair.calculatedNorthing.toFixed(3), cCalcX, y);
      // Metres to three decimals, matching how the Trimble report itself states
      // residuals, so the field book and the source can be compared line by line.
      pdf.text(`${pair.horizontalResidual.toFixed(3)} m`, cRes, y);
      y += 6;
    }

    // Footer, matching the point pages.
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(metadata.surveyorName || '', left, pageHeight - 15);
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
    const pointsPerPage = FIELD_BOOK_POINTS_PER_PAGE;
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
}
