/**
 * Beacon Comparison (SI 727 Section 67(5)) — shared renderer.
 *
 * Single source of truth for the s.67(5) comparison block: it is rendered both
 * inline by the structured Report on Survey and standalone by the Beacon
 * Comparison Report that is collated into Comprehensive_Latest.pdf.
 */

import type { jsPDF } from 'jspdf';
import type { ReportOnSurveyData } from '../types/cadastral';
import { computeExtent, pickSketchScale, makeSketchTransform, midpointOffset } from './beaconComparisonSketchLayout';
import { formatDMS } from './surveyMath.js';

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

  renderBeaconComparisonSketch(cursor, reportData);

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

const SKETCH_HEIGHT_MM = 140;
const RED: [number, number, number] = [220, 0, 0];
const BLACK: [number, number, number] = [0, 0, 0];

/** Signed DMS: formatDMS() wraps into [0,360), which loses the sign of a swing value
 *  (already wrapped to (-180,180] by si727.js's edgeCompliance) -- prefix the sign
 *  ourselves and format the magnitude. */
export function formatSignedDMS(deg: number): string {
  const sign = deg < 0 ? '-' : '';
  return `${sign}${formatDMS(Math.abs(deg))}`;
}

function renderBeaconComparisonSketch(
  cursor: BeaconComparisonCursor,
  reportData: ReportOnSurveyData,
): void {
  const comparison = reportData.beaconComparison;
  const ec = comparison?.edgeCompliance;
  if (!ec || ec.rows.length === 0) return;

  // Resolve each ray endpoint to its beacon's HISTORICAL position — the ray geometry is the
  // nominal network; the actual discrepancy is expressed entirely through the annotations.
  const byName = new Map<string, { y: number; x: number }>();
  for (const b of reportData.beacons || []) {
    if (b.originalData?.coordinates) byName.set(b.beaconId, b.originalData.coordinates);
  }
  const names = new Set<string>();
  for (const row of ec.rows) { names.add(row.from); names.add(row.to); }
  const points = Array.from(names)
    .map((name) => ({ name, pt: byName.get(name) }))
    .filter((p): p is { name: string; pt: { y: number; x: number } } => !!p.pt);
  if (points.length < 2) return;

  checkPageBreak(cursor, SKETCH_HEIGHT_MM + 20);

  const areaWidth = cursor.pageWidth - cursor.margin * 2;
  const extent = computeExtent(points.map((p) => p.pt));
  const areaMm = { width: areaWidth, height: SKETCH_HEIGHT_MM - 20 };
  const { denom, label } = pickSketchScale(extent, areaMm);

  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(10);
  cursor.doc.setTextColor(...BLACK);
  cursor.doc.text('BEACON COMPARISON SKETCH', cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight;

  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(8);
  cursor.doc.text(`Scale ${label}`, cursor.margin, cursor.y);

  // North arrow, top-right of the sketch band.
  const naX = cursor.pageWidth - cursor.margin - 8;
  const naYTop = cursor.y - 3;
  const naYBottom = naYTop + 10;
  cursor.doc.setDrawColor(...BLACK);
  cursor.doc.setLineWidth(0.2);
  cursor.doc.line(naX, naYBottom, naX, naYTop);
  cursor.doc.line(naX - 1.5, naYTop + 3, naX, naYTop);
  cursor.doc.line(naX + 1.5, naYTop + 3, naX, naYTop);
  cursor.doc.setFontSize(6);
  cursor.doc.text('N', naX + 2, naYTop + 1);

  cursor.y += cursor.lineHeight;
  const sketchTop = cursor.y;
  const originMm = { x: cursor.margin, y: sketchTop };
  const transform = makeSketchTransform(extent, areaMm, denom, originMm);
  const positioned = new Map(points.map((p) => [p.name, transform(p.pt)]));

  // Rays — always plain black, drawn before annotations so text sits on top.
  cursor.doc.setDrawColor(...BLACK);
  cursor.doc.setLineWidth(0.2);
  for (const row of ec.rows) {
    const a = positioned.get(row.from);
    const b = positioned.get(row.to);
    if (!a || !b) continue;
    cursor.doc.line(a.mmX, a.mmY, b.mmX, b.mmY);
  }

  // Beacon circles + outward-offset name labels.
  const cx = points.reduce((s, p) => s + (positioned.get(p.name)?.mmX ?? 0), 0) / points.length;
  const cy = points.reduce((s, p) => s + (positioned.get(p.name)?.mmY ?? 0), 0) / points.length;
  cursor.doc.setFontSize(8);
  cursor.doc.setTextColor(...BLACK);
  for (const p of points) {
    const pos = positioned.get(p.name)!;
    cursor.doc.setDrawColor(...BLACK);
    cursor.doc.circle(pos.mmX, pos.mmY, 1.5, 'S');
    let ux = pos.mmX - cx, uy = pos.mmY - cy;
    const ulen = Math.hypot(ux, uy) || 1;
    ux /= ulen; uy /= ulen;
    cursor.doc.text(p.name, pos.mmX + ux * 4, pos.mmY + uy * 4);
  }

  // Per-ray annotations: historical distance (black), survey distance (red), swing (black),
  // stacked beside the ray midpoint, alternating sides to reduce overlap in a dense network.
  cursor.doc.setFontSize(6);
  ec.rows.forEach((row, idx) => {
    const a = positioned.get(row.from);
    const b = positioned.get(row.to);
    if (!a || !b) return;
    const side: 1 | -1 = idx % 2 === 0 ? 1 : -1;
    const base = midpointOffset(a, b, 2.5, side);

    const histText = row.dH.toFixed(3);
    const survText = row.dS.toFixed(3);
    const swingText = formatSignedDMS(row.dirDiffSec / 3600);

    cursor.doc.setTextColor(...BLACK);
    cursor.doc.text(histText, base.mmX, base.mmY);
    cursor.doc.setTextColor(...RED);
    cursor.doc.text(survText, base.mmX, base.mmY + 2.2);
    cursor.doc.setTextColor(...BLACK);
    cursor.doc.text(swingText, base.mmX, base.mmY + 4.4);

    if (!row.distOk) {
      const w = cursor.doc.getTextWidth(survText);
      cursor.doc.setDrawColor(...RED);
      cursor.doc.setLineWidth(0.15);
      cursor.doc.ellipse(base.mmX + w / 2, base.mmY + 2.2 - 1, w / 2 + 1, 1.8, 'S');
    }
    if (!row.dirOk) {
      const w = cursor.doc.getTextWidth(swingText);
      cursor.doc.setDrawColor(...RED);
      cursor.doc.setLineWidth(0.15);
      cursor.doc.ellipse(base.mmX + w / 2, base.mmY + 4.4 - 1, w / 2 + 1, 1.8, 'S');
    }
  });

  cursor.y = sketchTop + areaMm.height + 6;

  cursor.doc.setTextColor(...BLACK);
  cursor.doc.setFontSize(8);
  cursor.doc.text('Black = historical, Red = current survey, Circled = outside SI 727 tolerance', cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight;

  const s = ec.summary;
  cursor.doc.text(
    `SI 727 Class ${ec.surveyClass} · ${s.bothPass} of ${s.totalLines} lines pass both checks`,
    cursor.margin, cursor.y,
  );
  cursor.y += cursor.lineHeight + 3;
}
