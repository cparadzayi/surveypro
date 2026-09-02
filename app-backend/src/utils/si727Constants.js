/**
 * SI 727 of 1979 - Zimbabwe Land Survey Rules and Regulations
 * Constants for automated survey plan production
 */

// SI 727 Section 62(1) prescribed General Plan sheet sizes — single source
// of truth in app-shared/si727SheetSizes.js, re-exported here under the
// same name so every existing importer of SI727_SHEET_SIZES is unaffected.
export { SI727_GENERAL_PLAN_SHEET_SIZES as SI727_SHEET_SIZES } from '../../../app-shared/si727SheetSizes.js'

// Fixed footer statement required on every General Plan, centred near the bottom
// margin. The trailing blank is where the Surveyor-General's survey record number
// is entered. Shared by the PDF (pdfkitGeoPDF) and DXF (dxfGenerator) renderers.
export const GENERAL_PLAN_RECORD_STATEMENT =
  'THE CO-ORDINATES OF ALL POINTS DEPICTED ON THIS GENERAL PLAN ARE FILED IN SURVEY RECORD NUMBER          '

// General Plan bottom-margin footer line (drawn in the margin BELOW the drawing
// space): three fill-in fields spread left / centre / right. Shared by the PDF
// and DXF renderers.
export const GENERAL_PLAN_MARGIN_FOOTER = {
  left: 'B...',
  center: 'S.R.',
  right: 'COMPILATION .......',
}

// Regulation 63 - Margins
export const SI727_MARGINS = {
  left: 50,      // mm
  right: 150,    // mm (for Surveyor-General endorsements)
  top: 50,       // mm
  bottom: 50     // mm
}

// Regulation 32(2) - Prescribed Scales
// Base scales: 1:1000, 1:1250, 1:1500, 1:2000, 1:2500, 1:3000, 1:4000, 1:5000, 1:6000, 1:7500
// Plus any of these scales multiplied or divided by an integral power of 10
export const SI727_BASE_SCALES = [1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500]

// Reg 32(2) prescribed scales — single source of truth in
// app-shared/si727Scales.js. Imported (not bare re-exported) because the
// helpers below use it locally, then re-exported under the same name so every
// existing importer of SI727_PRESCRIBED_SCALES is unaffected.
import { SI727_PRESCRIBED_SCALES, SI727_SCALE_LADDER } from '../../../app-shared/si727Scales.js'
export { SI727_PRESCRIBED_SCALES, SI727_SCALE_LADDER }

// Helper function to check if a scale is SI 727 compliant
export function isValidSI727Scale(scale) {
  return SI727_PRESCRIBED_SCALES.some(s => s.value === scale)
}

/**
 * NOT part of scale resolution. The shared resolver used by both generators
 * for the actual PDF/DXF scale + sheet-size decision is
 * `app-shared/planSheeting.js`; that module — not this one — is what keeps
 * PDF and DXF in lockstep.
 *
 * This function survives only because dxfGenerator.js still calls it to
 * compute `minScaleToFit` / `fitScale` for a single diagnostic log line.
 * pdfkitGeoPDF.js does not import it at all. Its `reserveW` / `reserveH`
 * reserve fractions are historical leftovers from the pre-planSheeting
 * approach this branch replaced — do not reuse them elsewhere; the current
 * reserve/budget logic lives in app-shared/planSheeting.js.
 *
 * Select the SI 727 scale that ENLARGES the figure to dominate the sheet —
 * the largest prescribed scale (smallest denominator) whose drawing still fits
 * the sheet's available drawing area. A declared scale is honoured only when it
 * also fits; otherwise the figure is enlarged (declared too small) or shrunk
 * (declared overflows) to the best-fitting prescribed scale.
 *
 * @param {Object}  p
 * @param {number}  p.drawWidthM    Figure width in ground metres
 * @param {number}  p.drawHeightM   Figure height in ground metres
 * @param {number}  p.paperWmm      Sheet width (mm)
 * @param {number}  p.paperHmm      Sheet height (mm)
 * @param {number} [p.reserveW=0.72] Fraction of content width available to the figure (historical)
 * @param {number} [p.reserveH=0.85] Fraction of content height available to the figure (historical)
 * @returns {{ S:number, minScaleToFit:number, fitScale:number, honoredDeclared:boolean }}
 */
export function selectFigureScale({
  drawWidthM, drawHeightM, paperWmm, paperHmm,
  reserveW = 0.72, reserveH = 0.85,
}) {
  // SI 727 margins: 50 left, 150 right (SG endorsements), 50 top/bottom (mm).
  const contentW = paperWmm - 50 - 150;
  const contentH = paperHmm - 50 - 50;
  const availW = contentW * reserveW; // remainder reserved for schedule/co-ord blocks
  const availH = contentH * reserveH; // remainder reserved for the title strip
  const minScaleToFit = Math.max(
    (drawWidthM * 1000) / availW,
    (drawHeightM * 1000) / availH,
    1, // guard against zero-extent degenerate input
  );
  const ladder = SI727_PRESCRIBED_SCALES.map((s) => s.value).sort((a, b) => a - b);
  const fitScale = ladder.find((v) => v >= minScaleToFit) || ladder[ladder.length - 1];
  return {
    S: fitScale,
    minScaleToFit,
    fitScale,
    honoredDeclared: false,
  };
}

// Helper function to get the nearest valid SI 727 scale
export function getNearestValidScale(targetScale) {
  return SI727_PRESCRIBED_SCALES.reduce((nearest, current) => {
    const currentDiff = Math.abs(current.value - targetScale)
    const nearestDiff = Math.abs(nearest.value - targetScale)
    return currentDiff < nearestDiff ? current : nearest
  })
}

// Regulation 32(2) - Minimum figure size
export const MIN_FIGURE_SIZE_MM2 = 650

// Surveyor-General relaxation (2026): the mandatory 1:500 General Plan scale
// applies only when the majority of a township's stands are at or below this
// area. Townships (developed or undeveloped) where the majority of stands
// exceed this threshold may use any SI 727 prescribed scale.
export const TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2 = 200

// Layout component dimensions
export const LAYOUT_COMPONENTS = {
  titleBlock: { heightSmall: 60, heightMedium: 80, heightLarge: 100 },
  beaconDescriptions: { minHeight: 40, lineHeight: 12, indent: 20 },
  scaleBar: { width: 300, height: 30 },
  scheduleOfAreas: { width: 300, minHeight: 70, rowHeight: 8 },
  keyPlanInset: { size: 120 },
  northArrow: { size: 40 }
}
