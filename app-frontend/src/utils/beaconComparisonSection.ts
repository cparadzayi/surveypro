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
import {
  compareCoordinates67, comparisonConclusion, PARA_7_5_K, type ComparisonResult67,
} from '../../../app-shared/coordinateComparison67';

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

/**
 * Is this saved comparison decided by Second Schedule para 7(5) on the lines between the beacons: a comparison
 * of co-ordinates, or the edge check (which decides the same way since its made-up direction limit and
 * severity cut were retired, so an edge comparison saved under them prints the para 7(5) verdict)? Not a
 * Helmert/W-test. Older saves carry only their summary ("SI 727 §67(5) co-ordinate comparison — class B, ...").
 */
export function isCoordinateComparison(comparison?: { checkMethod?: string; adjustmentSummary?: string } | null): boolean {
  if (!comparison) return false;
  if (comparison.checkMethod) return comparison.checkMethod === 'coords' || comparison.checkMethod === 'edges';
  return /67\(5\)\s*(co-ordinate comparison|comparison of co-ordinates)/i.test(comparison.adjustmentSummary ?? '');
}

/**
 * How the saved comparison's verdict is worked out again: the edge check also holds each line to para 7(5)'s
 * tolerance ACROSS it (sideways, after the common swing of the beacons kept); the comparison of co-ordinates
 * holds the distance only.
 */
export function comparisonOptions(comparison?: { checkMethod?: string } | null): { sideways: boolean } {
  return { sideways: comparison?.checkMethod === 'edges' };
}

/** The survey class the comparison was judged in: saved, else read from the summary, else B. */
export function comparisonClass(comparison?: { surveyClass?: string; adjustmentSummary?: string } | null): 'A' | 'B' | 'C' {
  const c = (comparison?.surveyClass ?? /class\s+([ABC])\b/.exec(comparison?.adjustmentSummary ?? '')?.[1] ?? 'B').toUpperCase();
  return c === 'A' || c === 'C' ? c : 'B';
}

/**
 * The comparison of co-ordinates in steps a junior examiner can follow, every figure checkable against SI 727:
 * section 67(5) asks for the schedule (black and red) and sets no co-ordinate limit; Second Schedule para 7(5)
 * limits the difference in the distance between two beacons. Plain text apart from the square-root sign written
 * out: the built-in PDF font cannot print a Greek delta or a radical, and jsPDF then letter-spaces the line.
 */
export function coordsComparisonExplanation(cls: 'A' | 'B' | 'C' = 'B'): { heading: string; steps: string[] } {
  const k = PARA_7_5_K[cls].toFixed(2).replace('.', ',');
  return {
    heading: `How the found beacons were checked (SI 727 section 67(5) and Second Schedule para 7(5), class ${cls} survey):`,
    steps: [
      "Schedule: each beacon's co-ordinates from the original data (black) are set beside those from this survey (red), as section 67(5) requires. dY and dX are the differences.",
      'Section 67(5) sets no limit on dY and dX. A survey may sit shifted or swung against the original data while its beacons agree with each other, so a beacon is not judged by its own dY and dX.',
      `What the regulations do limit is the distance between two beacons. For every pair of found beacons, the distance from the original co-ordinates and the distance from this survey's co-ordinates are worked out; by para 7(5) their difference must not exceed ${k} x square root of (0,075f + 0,000 15f squared) metres, f being the distance in metres. A shift or a swing leaves every distance unchanged.`,
      'A beacon has moved when lines to it fail para 7(5) while the lines among the other beacons pass. Such a beacon is set aside; every other found beacon is adopted. Where a single line fails on its own, it does not show which end moved, and that is stated for the surveyor to decide.',
      "For information only, the survey's common shift and swing against the original data are given, and each beacon's difference once they are removed. No limit is applied to these figures.",
    ],
  };
}

/**
 * The annexure that sets out the method of a comparison of co-ordinates, for the end of the Complete Survey
 * Record: a page of its own, headed with the annexure's name, then the same steps the section would print inline.
 * Null when the saved comparison is not a comparison of co-ordinates (another method keeps its own summary).
 */
export async function comparisonMethodAnnexurePDF(
  reportData: ReportOnSurveyData | null | undefined,
  annexure = 'Annexure A',
): Promise<Blob | null> {
  const comparison = reportData?.beaconComparison;
  if (!comparison || !hasBeaconComparisonData(reportData) || !isCoordinateComparison(comparison)) return null;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const cursor: BeaconComparisonCursor = {
    doc, margin: 20, lineHeight: 6.5,
    pageWidth: doc.internal.pageSize.getWidth(), pageHeight: doc.internal.pageSize.getHeight(), y: 25,
  };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${annexure.toUpperCase()}: METHOD OF THE BEACON COMPARISON`, cursor.margin, cursor.y);
  cursor.y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  renderExplanation(cursor, coordsComparisonExplanation(comparisonClass(comparison)));
  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
}

/** Numbered steps with a hanging indent, wrapped to the page. */
function renderExplanation(cursor: BeaconComparisonCursor, e: { heading: string; steps: string[] }): void {
  const left = cursor.margin + 5;
  const width = cursor.pageWidth - cursor.margin * 2 - 10;
  const headingLines = cursor.doc.splitTextToSize(e.heading, width);
  headingLines.forEach((line: string) => {
    checkPageBreak(cursor, 10);
    cursor.doc.text(line, left, cursor.y);
    cursor.y += cursor.lineHeight;
  });
  e.steps.forEach((step, i) => {
    const lines = cursor.doc.splitTextToSize(step, width - 7);
    checkPageBreak(cursor, 10);
    cursor.doc.text(`${i + 1}.`, left + 1, cursor.y);
    lines.forEach((line: string) => {
      checkPageBreak(cursor, 10);
      cursor.doc.text(line, left + 7, cursor.y);
      cursor.y += cursor.lineHeight;
    });
  });
}

/** Render the comparison block, advancing `cursor.y`. */
export function renderBeaconComparison(
  cursor: BeaconComparisonCursor,
  reportData: ReportOnSurveyData,
  /**
   * In the Complete Survey Record the method of a comparison of co-ordinates is set out once, in an annexure at
   * the end (comparisonMethodAnnexurePDF); the section then says where, e.g. "Annexure A". A document printed on
   * its own (no annexure) keeps the steps inline.
   */
  opts: { methodInAnnexure?: string } = {},
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

  // A comparison of co-ordinates is explained in plain steps and judged here, from the printed co-ordinates, by
  // para 7(5) on the lines between the beacons: the saved summary and conclusion of an older save carried a
  // co-ordinate limit (0.079 m) and a 1.25 x median rule that are not in SI 727. Any other method keeps its
  // summary (Helmert LSQ + W-test, edge compliance), or the legacy tolerance line.
  const coords = isCoordinateComparison(comparison) ? comparisonClass(comparison) : null;
  const judged = coords ? compareCoordinates67(comparisonPoints(reportData), coords, comparisonOptions(comparison)) : null;
  if (coords && opts.methodInAnnexure) {
    const ref = `How the found beacons were checked (SI 727 section 67(5) and Second Schedule para 7(5), class ${coords} survey): see ${opts.methodInAnnexure} at the end of this record.`;
    cursor.doc.splitTextToSize(ref, cursor.pageWidth - cursor.margin * 2 - 10).forEach((line: string) => {
      cursor.doc.text(line, cursor.margin + 5, cursor.y);
      cursor.y += cursor.lineHeight;
    });
  } else if (coords) {
    renderExplanation(cursor, coordsComparisonExplanation(coords));
  } else {
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
  }
  cursor.y += 3;

  if (comparison.method === 'tabulation' || comparison.method === 'both') {
    renderBeaconComparisonTable(cursor, reportData, judged);
  }

  if (judged) renderLineCheck(cursor, judged);

  renderBeaconComparisonSketch(cursor, reportData);

  const conclusion = judged ? comparisonConclusion(judged) : comparison.conclusion;
  if (conclusion) {
    cursor.y += 5;
    cursor.doc.setFont('helvetica', 'bold');
    cursor.doc.text('Conclusion:', cursor.margin + 5, cursor.y);
    cursor.y += cursor.lineHeight;

    cursor.doc.setFont('helvetica', 'normal');
    const lines = cursor.doc.splitTextToSize(
      conclusion,
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

/** The compared beacons as original (H) and survey (S) co-ordinates, from the printed schedule's data. */
export function comparisonPoints(reportData: ReportOnSurveyData): { name: string; yH: number; xH: number; yS: number; xS: number }[] {
  return (reportData.beacons || []).flatMap((b) => {
    const o = b.originalData?.coordinates, c = b.currentCoordinates;
    if (!o || !c || ![o.y, o.x, c.y, c.x].every((v) => Number.isFinite(v))) return [];
    return [{ name: b.beaconId, yH: o.y, xH: o.x, yS: c.y, xS: c.x }];
  });
}

const signed3 = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(3)}`;

/**
 * Second Schedule para 7(5) on every line between the compared beacons: the distance from the original
 * co-ordinates, the distance from this survey's, their difference, the limit and the result. Preceded by the
 * survey's common shift and swing (information only).
 */
function renderLineCheck(cursor: BeaconComparisonCursor, r: ComparisonResult67): void {
  if (!r.lines.length) return;
  const left = cursor.margin + 5;
  const width = cursor.pageWidth - cursor.margin * 2 - 10;
  checkPageBreak(cursor, 40);
  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(9);
  // When the original co-ordinates are in another system (a local one, say), the "shift" and "swing" describe
  // that system, not the survey: they are not reported as the survey's.
  const info = r.otherSystem
    ? `For information: the original co-ordinates are in a different co-ordinate system from this survey's (they lie about ${(Math.hypot(r.shift.dY, r.shift.dX) / 1000).toFixed(1)} km away, turned ${(Math.abs(r.swingSec) / 3600).toFixed(1)} degrees). `
      + 'Distances do not depend on the system, which is why the beacons are compared by their distances below. The Residual column above is each beacon\'s difference after the two are fitted together, for information only.'
    : `For information: this survey sits ${signed3(r.shift.dY)} m in Y and ${signed3(r.shift.dX)} m in X `
      + `from the original data, with a swing of ${Math.abs(r.swingSec).toFixed(1)} seconds. `
      + 'The Residual column above is each beacon\'s difference once that shift and swing are removed. No limit applies to either.';
  cursor.doc.splitTextToSize(info, width).forEach((line: string) => {
    cursor.doc.text(line, left, cursor.y);
    cursor.y += 5;
  });
  cursor.y += 3;

  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(10);
  cursor.doc.text(r.sideways
    ? `Second Schedule para 7(5), class ${r.surveyClass}: the lines between the found beacons, along and across`
    : `Second Schedule para 7(5), class ${r.surveyClass}: distances between the found beacons`, left, cursor.y);
  cursor.y += 6;

  // With the sideways test a Sideways column (the movement across the line after the common swing of the
  // beacons kept) goes in before the limit, which both are held to.
  const cols = (r.sideways ? [0, 26, 50, 74, 98, 120, 142] : [0, 30, 58, 86, 112, 136, 156]).map((d) => left + d);
  const heads = r.sideways
    ? ['Line', 'Original (m)', 'This survey (m)', 'Difference (m)', 'Sideways (m)', 'Limit (m)', 'Result']
    : ['Line', 'Original (m)', 'This survey (m)', 'Difference (m)', 'Limit (m)', 'Result'];
  const head = () => {
    cursor.doc.setFont('helvetica', 'bold');
    cursor.doc.setFontSize(8.5);
    heads.forEach((h, i) => cursor.doc.text(h, cols[i], cursor.y));
    cursor.y += 2;
    horizontalLine(cursor);
    cursor.y += 4.5;
    cursor.doc.setFont('helvetica', 'normal');
    cursor.doc.setFontSize(8);
  };
  head();
  for (const l of r.lines) {
    if (cursor.y + 6 > cursor.pageHeight - cursor.margin) {
      cursor.doc.addPage();
      cursor.y = cursor.margin;
      head();
    }
    const result = !l.judged ? 'Not judged' : l.pass ? 'Within' : 'Outside';
    (r.sideways
      ? [`${l.from} - ${l.to}`, l.fH.toFixed(3), l.fS.toFixed(3), signed3(l.diff), signed3(l.side ?? 0), l.limit.toFixed(3), result]
      : [`${l.from} - ${l.to}`, l.fH.toFixed(3), l.fS.toFixed(3), signed3(l.diff), l.limit.toFixed(3), result])
      .forEach((c, i) => cursor.doc.text(c, cols[i], cursor.y));
    cursor.y += 4.5;
  }
  cursor.y += 2;
  cursor.doc.setFontSize(9);
  const tally = `${r.lines.length - r.linesFailing} of ${r.lines.length} lines within the limit; `
    + (r.networkWide
      ? 'the failing lines run through the network, so no single beacon can be set aside.'
      : r.setAside.length ? `set aside: ${r.setAside.join(', ')}.` : 'no beacon set aside.')
    + ' The limit is worked out with f the shorter of the two distances.'
    + (r.sideways
      ? ` Sideways is how far one end moved across the line relative to the other once the common swing of the beacons kept (${Math.abs(r.keptSwingSec ?? 0).toFixed(1)} seconds) is taken out; it is held to the same limit. SI 727 states para 7(5) along the line only: applying it across the line is this record's extension, because a beacon's error has no preferred direction.`
      : '');
  cursor.doc.splitTextToSize(tally, width).forEach((line: string) => {
    cursor.doc.text(line, left, cursor.y);
    cursor.y += 5;
  });
  cursor.y += 2;
}

function renderBeaconComparisonTable(
  cursor: BeaconComparisonCursor,
  reportData: ReportOnSurveyData,
  judged: ComparisonResult67 | null = null,
): void {
  const beaconsWithOriginal = (reportData.beacons || []).filter(
    (b) => b.originalData && b.originalData.coordinates
  );
  if (beaconsWithOriginal.length === 0) return;

  checkPageBreak(cursor, 80);

  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(9);

  // Uniform column grid: a beacon column plus six numeric columns. Layout is
  // derived from the page so the table survives width changes without manual
  // per-column tuning.
  const startX = cursor.margin + 5;
  const endX = cursor.pageWidth - cursor.margin - 5;
  const beaconCol = 20;
  // A comparison of co-ordinates adds the Residual column (difference after the common shift and swing).
  const residualOf = new Map((judged?.beacons ?? []).map((b) => [b.name, b.residual]));
  const numericCols = judged ? 7 : 6;
  const numericW = (endX - startX - beaconCol) / numericCols;
  const colX = [
    startX,
    ...Array.from({ length: numericCols }, (_, i) => startX + beaconCol + i * numericW),
  ];
  const rowHeight = 6;

  // Survey (Y/X) columns are rendered red per SI 727 §67(5) — headers included.
  cursor.doc.setTextColor(...BLACK);
  cursor.doc.text('Beacon', colX[0], cursor.y);
  cursor.doc.text('Previous Y', colX[1], cursor.y);
  cursor.doc.text('Previous X', colX[2], cursor.y);
  cursor.doc.setTextColor(...RED);
  cursor.doc.text('Survey Y', colX[3], cursor.y);
  cursor.doc.text('Survey X', colX[4], cursor.y);
  cursor.doc.setTextColor(...BLACK);
  cursor.doc.text('dY (m)', colX[5], cursor.y);
  cursor.doc.text('dX (m)', colX[6], cursor.y);
  if (judged) cursor.doc.text('Residual (m)', colX[7], cursor.y);

  cursor.y += rowHeight - 2;
  horizontalLine(cursor);
  // Room under the rule for the first row's lettering: a baseline 2 mm below it put the tops of the figures
  // through the line.
  cursor.y += 5;

  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(7.5);

  beaconsWithOriginal.forEach((beacon) => {
    checkPageBreak(cursor, 15);

    const prevY = beacon.originalData?.coordinates?.y?.toFixed(3) || '-';
    const prevX = beacon.originalData?.coordinates?.x?.toFixed(3) || '-';
    const survY = beacon.currentCoordinates?.y?.toFixed(3) || '-';
    const survX = beacon.currentCoordinates?.x?.toFixed(3) || '-';
    const dY = beacon.discrepancy?.dy?.toFixed(3) || '-';
    const dX = beacon.discrepancy?.dx?.toFixed(3) || '-';

    cursor.doc.setTextColor(...BLACK);
    cursor.doc.text(beacon.beaconId, colX[0], cursor.y);
    cursor.doc.text(prevY, colX[1], cursor.y);
    cursor.doc.text(prevX, colX[2], cursor.y);
    cursor.doc.setTextColor(...RED);
    cursor.doc.text(survY, colX[3], cursor.y);
    cursor.doc.text(survX, colX[4], cursor.y);
    cursor.doc.setTextColor(...BLACK);
    cursor.doc.text(dY, colX[5], cursor.y);
    cursor.doc.text(dX, colX[6], cursor.y);
    const residual = residualOf.get(beacon.beaconId);
    if (judged) cursor.doc.text(residual != null ? residual.toFixed(3) : '-', colX[7], cursor.y);

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
    // The swing is circled when the line's sideways movement exceeds para 7(5)'s tolerance across the line (the
    // edge check). A comparison saved before that test, or one without it, carries no sideOk: never circled.
    if (row.sideOk === false) {
      const w = cursor.doc.getTextWidth(swingText);
      cursor.doc.setDrawColor(...RED);
      cursor.doc.setLineWidth(0.15);
      cursor.doc.ellipse(base.mmX + w / 2, base.mmY + 4.4 - 1, w / 2 + 1, 1.8, 'S');
    }
  });

  cursor.y = sketchTop + areaMm.height + 6;

  cursor.doc.setTextColor(...BLACK);
  cursor.doc.setFontSize(8);
  const sideways = ec.rows.some((r) => r.sideOk != null);
  cursor.doc.text(sideways
    ? 'Black = historical, Red = current survey, Circled = outside Second Schedule para 7(5): a distance along the line, a swing across it'
    : 'Black = historical, Red = current survey, Circled = distance outside Second Schedule para 7(5); swings for information', cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight;

  // Counted from the rows, so a comparison saved when directions were also judged prints the para 7(5) count.
  const within = ec.rows.filter((r) => r.distOk && r.sideOk !== false).length;
  cursor.doc.text(
    `SI 727 Class ${ec.surveyClass} · ${within} of ${ec.rows.length} lines within Second Schedule para 7(5)${sideways ? ' along and across the line' : ''}`,
    cursor.margin, cursor.y,
  );
  cursor.y += cursor.lineHeight + 3;
}
