/**
 * SI 727 plan sheeting resolver — the single source of truth for which
 * (scale, sheet size) a General Plan is drawn at.
 *
 * Returns an ORDERED LADDER of candidates rather than one answer. Whether a
 * plan actually renders depends on whether the Schedule of Areas, coordinate
 * list and endorsement block find real whitespace, which is a function of the
 * figure's SHAPE, not its bounding box — so the renderers stay the final
 * arbiter, walking this ladder instead of improvising their own.
 *
 * Consumed by pdfkitGeoPDF.js (PDF), dxfGenerator.js (DXF) and the
 * surveyPlanPreview route, so none of them can drift from the others.
 *
 * Spec: docs/superpowers/specs/2026-08-31-automatic-scale-and-sheet-selection-design.md
 */

import { SI727_GENERAL_PLAN_SHEET_SIZES } from './si727SheetSizes.js';
import { SI727_SCALE_LADDER } from './si727Scales.js';
import { resolveTownshipScaleMandate } from './block-definitions.js';

/** SI 727 Reg 32(3) mandate threshold: stands at or below this are "small". */
export const TOWNSHIP_MANDATE_THRESHOLD_M2 = 200;

/** The denominator Reg 32(3) mandates for a small-stand township. */
export const MANDATED_DENOMINATOR = 500;

/** Plan types the Reg 32(3) area-majority mandate applies to. */
const MANDATE_PLAN_TYPES = new Set(['general-developed', 'general-undeveloped']);

/**
 * Paper millimetres a stand needs across its narrowest dimension to carry a
 * legible label: 2.5mm of glyph plus 5mm of clearance. Same constant the
 * legacy scaleSelector used — applied here to the real constraint (the
 * narrowest stand) rather than to average beacon spacing.
 */
const MIN_LABEL_MM = 7.5;

// SI 727 Reg 63 margins (mm). The right margin is wide for SG endorsements.
const MARGIN_LEFT = 50, MARGIN_RIGHT = 150, MARGIN_TOP = 50, MARGIN_BOTTOM = 50;

/**
 * Paper millimetres reserved at the top of the sheet for the title block.
 * Deliberately conservative: measured bands are 46.2 mm (DXF) and 51.9 mm (PDF)
 * on sampleRealisticPlan. Each renderer passes its own measured band when it
 * knows it; this estimate serves the preview, which is only ever a hint.
 */
export const TITLE_BAND_ESTIMATE_MM = 55;

/**
 * Share of the available area the figure may occupy. The remainder is the
 * budget for the Schedule of Areas, coordinate list and endorsement blocks.
 *
 * This is pdfkitGeoPDF's MARGIN_FACTOR, promoted rather than deleted. It is not
 * a fudge: it is the only measured block-room reservation in the system, and
 * without it an honest available area sends the resolver straight to a 100%-fill
 * candidate on the smallest sheet, which then fails block placement and
 * escalates — at a full re-render each time.
 */
export const FIGURE_MAX_FRACTION = 0.75;

/**
 * Figure-available drawing area for one sheet, in millimetres: the margin-inset
 * sheet less the title band. Stand-count independent by design.
 *
 * @param {string} sheetName
 * @param {{titleBandMm?: number}} [opts]
 * @returns {{ widthMm: number, heightMm: number }}
 */
export function drawingAreaMm(sheetName, { titleBandMm = TITLE_BAND_ESTIMATE_MM } = {}) {
  const sheet = SI727_GENERAL_PLAN_SHEET_SIZES.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`Unknown SI 727 sheet size: ${sheetName}`);
  return {
    widthMm: sheet.width - MARGIN_LEFT - MARGIN_RIGHT,
    heightMm: sheet.height - MARGIN_TOP - MARGIN_BOTTOM - titleBandMm,
  };
}

/**
 * Narrowest stand width in ground metres — the polygon "thickness": for each
 * edge take the greatest perpendicular distance to any other vertex, then the
 * least of those. Ported from surveyPlanPreview's analyzeParcelGeometry, which
 * uses this rather than min vertex-to-edge distance because collinear vertices
 * make the latter collapse to ~0 for valid parcels.
 *
 * @returns {number} metres, or Infinity when no usable polygon is present
 */
export function narrowestStandWidthM(parcels) {
  let narrowest = Infinity;
  for (const f of parcels?.features ?? []) {
    const ring = f?.geometry?.type === 'Polygon' ? f.geometry.coordinates?.[0] : null;
    if (!ring || ring.length < 4) continue;

    const v = ring.slice(0, -1); // drop the repeated closing vertex
    let thickness = Infinity;
    for (let i = 0; i < v.length; i++) {
      const j = (i + 1) % v.length;
      const dx = v[j][0] - v[i][0];
      const dy = v[j][1] - v[i][1];
      const edgeLen = Math.hypot(dx, dy);
      if (!Number.isFinite(edgeLen) || edgeLen < 1e-9) continue;

      let maxPerp = 0;
      for (let k = 0; k < v.length; k++) {
        if (k === i || k === j) continue;
        const perp = Math.abs((v[k][0] - v[i][0]) * dy - (v[k][1] - v[i][1]) * dx) / edgeLen;
        if (Number.isFinite(perp)) maxPerp = Math.max(maxPerp, perp);
      }
      if (maxPerp > 0) thickness = Math.min(thickness, maxPerp);
    }
    if (Number.isFinite(thickness)) narrowest = Math.min(narrowest, thickness);
  }
  return narrowest;
}

/**
 * Coarsest denominator at which the narrowest stand still carries a legible
 * label. A CEILING on the denominator, not a floor: drawing smaller (a larger
 * denominator) is what destroys legibility.
 *
 * The legacy scaleSelector had this inverted — it derived a denominator FLOOR
 * from average beacon spacing, so a sparsely-beaconed plan was forced coarser
 * the more room it had. That is half of the 1:10000 defect.
 */
export function legibilityMaxDenominator(parcels) {
  const narrowest = narrowestStandWidthM(parcels);
  if (!Number.isFinite(narrowest) || narrowest <= 0) return Infinity;
  return (narrowest * 1000) / MIN_LABEL_MM;
}

/** Sheets eligible for a run, smallest first, honouring an explicit choice. */
function sheetLadder(declaredSheet) {
  const all = SI727_GENERAL_PLAN_SHEET_SIZES.map((s) => s.name);
  if (!declaredSheet) return all;
  const idx = all.indexOf(declaredSheet);
  // An explicit sheet is a starting point, not a cap: rule 2 requires the sheet
  // to stay free to climb when a declared scale will not fit on it.
  return idx === -1 ? all : all.slice(idx);
}

function fitsOn(sheetName, extentM, denominator, titleBandMm) {
  const area = drawingAreaMm(sheetName, { titleBandMm });
  return (extentM.widthM / denominator) * 1000 <= area.widthMm * FIGURE_MAX_FRACTION
      && (extentM.heightM / denominator) * 1000 <= area.heightMm * FIGURE_MAX_FRACTION;
}

/**
 * @param {object}  args
 * @param {{widthM:number, heightM:number}} args.extentM  Ground extent of the outside figure
 * @param {object}  args.parcels        GeoJSON FeatureCollection
 * @param {string}  args.planType
 * @param {number} [args.declaredScale] Surveyor's explicit denominator
 * @param {string} [args.declaredSheet] Surveyor's explicit sheet name
 * @param {number} [args.titleBandMm]   Renderer's measured title band, when known
 * @returns {{ candidates: Array, mandate: object, legibilityMaxDenominator: number }}
 */
export function resolvePlanSheeting({
  extentM,
  parcels,
  planType,
  declaredScale = null,
  declaredSheet = null,
  titleBandMm = TITLE_BAND_ESTIMATE_MM,
}) {
  const applyMandate = MANDATE_PLAN_TYPES.has(planType);
  const { mandatory500 } = applyMandate
    ? resolveTownshipScaleMandate(parcels, TOWNSHIP_MANDATE_THRESHOLD_M2)
    : { mandatory500: false };

  const legibilityMax = legibilityMaxDenominator(parcels);
  const sheets = sheetLadder(declaredSheet);

  // --- Which denominators are permitted, and why ---
  let denominators;
  let basis;
  if (mandatory500) {
    // Regulation, not preference: an explicit scale cannot override it.
    denominators = [MANDATED_DENOMINATOR];
    basis = declaredScale && declaredScale !== MANDATED_DENOMINATOR
      ? `Reg 32(3) mandate (overrides the declared 1:${declaredScale})`
      : 'Reg 32(3) mandate';
  } else if (declaredScale) {
    // An explicit scale is a professional decision: honour it and let the
    // SHEET escalate, rather than silently correcting the scale to fit.
    denominators = [declaredScale];
    basis = 'surveyor-declared scale';
  } else {
    denominators = SI727_SCALE_LADDER.filter((d) => d <= legibilityMax);
    basis = 'auto-fitted';
    if (denominators.length === 0) {
      // The narrowest stand cannot be labelled at any prescribed scale. Take
      // the finest available and let the renderer deal with it rather than
      // returning nothing.
      denominators = [SI727_SCALE_LADDER[0]];
      basis = 'auto-fitted (below the legibility limit at every prescribed scale)';
    }
  }

  const label = (d) => `1:${d}`;
  const make = (d, sheetSize, needsTiling, note) => ({
    scaleDenominator: d,
    scaleLabel: label(d),
    sheetSize,
    needsTiling,
    reason: `${label(d)} on ${sheetSize} — ${basis}${note ? `; ${note}` : ''}`,
  });

  // Non-tiling candidates: smaller sheet first, then larger figure (finer
  // denominator) within a sheet. Ordering decided with the surveyor:
  // avoid tiling > smaller sheet > larger figure.
  const fitting = [];
  for (const sheetSize of sheets) {
    for (const d of denominators) {
      if (fitsOn(sheetSize, extentM, d, titleBandMm)) fitting.push(make(d, sheetSize, false));
    }
  }

  // Tiling fallbacks, appended last: the coarsest permitted denominator on each
  // sheet, which is the least-bad multi-sheet cut.
  const coarsest = denominators[denominators.length - 1];
  const tiling = sheets
    .filter((sheetSize) => !fitsOn(sheetSize, extentM, coarsest, titleBandMm))
    .map((sheetSize) => make(coarsest, sheetSize, true, 'figure exceeds the sheet — multi-sheet required'));

  const candidates = [...fitting, ...tiling];

  return {
    candidates,
    mandate: { mandatory500, thresholdM2: TOWNSHIP_MANDATE_THRESHOLD_M2 },
    legibilityMaxDenominator: legibilityMax,
  };
}
