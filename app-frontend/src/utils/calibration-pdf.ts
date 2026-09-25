import jsPDF from 'jspdf';
import type { SiteCalibration } from './siteCalibration';

/**
 * Render the body of a GNSS site calibration: the adjusted parameters, the
 * horizontal-only notice, the summary and the residual at every control point.
 *
 * Shared by the field book's E1 page and the standalone calibration report so
 * the two can never drift apart: the field book headers (ELECTRONIC FIELD BOOK,
 * E1) belong to the field book, and the report's title block belongs to the
 * report, but the evidence itself is identical in both.
 */
export interface CalibrationContentBounds {
  left: number;
  right: number;
  /** Bottom of the usable page, in the same units as `left`/`right`. */
  maxY: number;
  /** Where to start the first line of content. */
  startY: number;
}

export function renderCalibrationContent(
  pdf: jsPDF,
  cal: SiteCalibration,
  bounds: CalibrationContentBounds
): void {
  const { left, right, maxY } = bounds;
  let y = bounds.startY;

  // ── Adjusted parameters ──
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Adjusted parameters', left, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);

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
      if (y > maxY) break;
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
    pdf.text('Horizontal-only calibration - no vertical adjustment was performed.', left, y);
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

  pdf.setFontSize(10);
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
    if (y > maxY) {
      // Never silently truncate: a table that drops control points reads as a
      // complete record and is worse than no table at all.
      pdf.setFont('helvetica', 'italic');
      pdf.text('... continued - remaining control points omitted for space.', left, y);
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
}

export interface CalibrationReportMeta {
  /** Surveyor's name, printed if known. */
  surveyorName?: string;
  /** Project/description, printed if known. */
  projectTitle?: string;
  /** Date the calibration was carried out, printed if known. */
  date?: string;
}

/**
 * Build the standalone GNSS Site Calibration PDF document.
 *
 * The same content as the field book's E1 page (via renderCalibrationContent),
 * so the filed report and the field book can never disagree, fronted by a
 * title block naming the report and, when known, the survey.
 */
export function buildCalibrationReportPDF(
  cal: SiteCalibration,
  meta: CalibrationReportMeta = {}
): jsPDF {
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 15;
  const right = pageWidth - 15;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('GNSS SITE CALIBRATION', left, 25);

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  let y = 33;

  if (cal.reportName) {
    pdf.text(cal.reportName, left, y);
    y += 5;
  }
  if (cal.projectIdentifier) {
    pdf.text(`Project: ${cal.projectIdentifier}`, left, y);
    y += 5;
  }
  if (meta.surveyorName) {
    pdf.text(`Surveyor: ${meta.surveyorName}`, left, y);
    y += 5;
  }
  if (meta.projectTitle) {
    pdf.text(meta.projectTitle, left, y);
    y += 5;
  }
  if (meta.date) {
    pdf.text(meta.date, left, y);
    y += 5;
  }
  y += 4;

  renderCalibrationContent(pdf, cal, {
    left,
    right,
    maxY: pageHeight - 30,
    startY: y,
  });

  return pdf;
}

export function generateCalibrationReportPDF(
  cal: SiteCalibration,
  meta: CalibrationReportMeta = {}
): { blob: Blob; pageCount: number } {
  const pdf = buildCalibrationReportPDF(cal, meta);
  return { blob: pdf.output('blob'), pageCount: 1 };
}