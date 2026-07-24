/**
 * Beacon Comparison (SI 727 Section 67(5)) — shared renderer.
 *
 * Single source of truth for the s.67(5) comparison block: it is rendered both
 * inline by the structured Report on Survey and standalone by the Beacon
 * Comparison Report that is collated into Comprehensive_Latest.pdf.
 */

import type { jsPDF } from 'jspdf';
import type { ReportOnSurveyData } from '../types/cadastral';

/** Layout state threaded through the renderer; `y` is mutated as content is emitted. */
export interface BeaconComparisonCursor {
  doc: jsPDF;
  margin: number;
  lineHeight: number;
  pageWidth: number;
  pageHeight: number;
  y: number;
}

const METHOD_LABELS: Record<string, string> = {
  tabulation: 'Tabulation of Co-ordinates',
  sketch: 'Comparison Sketch',
  both: 'Both Tabulation and Sketch',
};

/**
 * True when there is enough data to render a meaningful comparison:
 * a comparison config plus at least one beacon carrying original coordinates.
 */
export function hasBeaconComparisonData(
  reportData?: ReportOnSurveyData | null
): boolean {
  if (!reportData?.beaconComparison) return false;
  return (reportData.beacons || []).some((b) => !!b.originalData?.coordinates);
}

function checkPageBreak(cursor: BeaconComparisonCursor, requiredSpace: number): void {
  if (cursor.y + requiredSpace > cursor.pageHeight - cursor.margin) {
    cursor.doc.addPage();
    cursor.y = cursor.margin;
  }
}

function horizontalLine(cursor: BeaconComparisonCursor): void {
  cursor.doc.line(cursor.margin, cursor.y, cursor.pageWidth - cursor.margin, cursor.y);
}

/** Render the comparison block, advancing `cursor.y`. */
export function renderBeaconComparison(
  cursor: BeaconComparisonCursor,
  reportData: ReportOnSurveyData
): void {
  const comparison = reportData.beaconComparison;
  if (!comparison) return;

  checkPageBreak(cursor, 60);

  cursor.doc.setFontSize(11);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.text('BEACON COMPARISON (SI 727 Section 67(5))', cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight + 2;

  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(10);

  cursor.doc.text(
    `Method: ${METHOD_LABELS[comparison.method] || comparison.method}`,
    cursor.margin + 5,
    cursor.y
  );
  cursor.y += cursor.lineHeight;

  if (comparison.currentSRNumber) {
    cursor.doc.text(`Current Survey: ${comparison.currentSRNumber}`, cursor.margin + 5, cursor.y);
    cursor.y += cursor.lineHeight;
  }

  if (comparison.originalSRNumber) {
    cursor.doc.text(`Original Survey: ${comparison.originalSRNumber}`, cursor.margin + 5, cursor.y);
    cursor.y += cursor.lineHeight;
  }

  // Prefer an explicit adjustment summary (Helmert LSQ + W-test); fall back to the legacy tolerance line.
  const adjustmentLine =
    comparison.adjustmentSummary ||
    `Tolerance Threshold: ±${(comparison.toleranceThreshold ?? 0).toFixed(3)}m`;
  const adjustmentLines = cursor.doc.splitTextToSize(
    adjustmentLine,
    cursor.pageWidth - cursor.margin * 2 - 10
  );
  adjustmentLines.forEach((line: string) => {
    cursor.doc.text(line, cursor.margin + 5, cursor.y);
    cursor.y += cursor.lineHeight;
  });
  cursor.y += 3;

  if (comparison.method === 'tabulation' || comparison.method === 'both') {
    renderBeaconComparisonTable(cursor, reportData);
  }

  if (comparison.conclusion) {
    cursor.y += 5;
    cursor.doc.setFont('helvetica', 'bold');
    cursor.doc.text('Conclusion:', cursor.margin + 5, cursor.y);
    cursor.y += cursor.lineHeight;

    cursor.doc.setFont('helvetica', 'normal');
    const lines = cursor.doc.splitTextToSize(
      comparison.conclusion,
      cursor.pageWidth - cursor.margin * 2 - 10
    );
    lines.forEach((line: string) => {
      checkPageBreak(cursor, 10);
      cursor.doc.text(line, cursor.margin + 10, cursor.y);
      cursor.y += cursor.lineHeight;
    });
  }

  cursor.y += 5;
}

function renderBeaconComparisonTable(
  cursor: BeaconComparisonCursor,
  reportData: ReportOnSurveyData
): void {
  const beaconsWithOriginal = (reportData.beacons || []).filter(
    (b) => b.originalData && b.originalData.coordinates
  );
  if (beaconsWithOriginal.length === 0) return;

  checkPageBreak(cursor, 80);

  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(9);

  const colX = [cursor.margin + 5, 40, 70, 100, 130, 155];
  const rowHeight = 6;

  cursor.doc.text('Beacon', colX[0], cursor.y);
  cursor.doc.text('Original Y', colX[1], cursor.y);
  cursor.doc.text('Original X', colX[2], cursor.y);
  cursor.doc.text('New Y', colX[3], cursor.y);
  cursor.doc.text('New X', colX[4], cursor.y);
  cursor.doc.text('Δ (m)', colX[5], cursor.y);

  cursor.y += rowHeight;
  horizontalLine(cursor);
  cursor.y += 2;

  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(8);

  beaconsWithOriginal.forEach((beacon) => {
    checkPageBreak(cursor, 15);

    const origY = beacon.originalData?.coordinates?.y?.toFixed(3) || '-';
    const origX = beacon.originalData?.coordinates?.x?.toFixed(3) || '-';
    const newY = beacon.currentCoordinates?.y?.toFixed(3) || '-';
    const newX = beacon.currentCoordinates?.x?.toFixed(3) || '-';
    const distance = beacon.discrepancy?.distance?.toFixed(3) || '-';

    cursor.doc.text(beacon.beaconId, colX[0], cursor.y);
    cursor.doc.text(origY, colX[1], cursor.y);
    cursor.doc.text(origX, colX[2], cursor.y);
    cursor.doc.text(newY, colX[3], cursor.y);
    cursor.doc.text(newX, colX[4], cursor.y);
    cursor.doc.text(distance, colX[5], cursor.y);

    cursor.y += rowHeight;
  });

  cursor.y += 3;
}
