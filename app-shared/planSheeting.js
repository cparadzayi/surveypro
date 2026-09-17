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
 * Elevation a renderer may hand the shared resolver ONLY when its topology
 * engine has certified that whitespace pockets inside the figure can hold the
 * Schedule of Areas / coordinate / endorsement blocks at the candidate rung.
 *
 * 0.75 leaves a flat 25% budget for those blocks by construction (see
 * FIGURE_MAX_FRACTION). The certified gate proves the whitespace exists as a
 * measured fact rather than a reserved guess, so the figure may claim nearly
 * all of the drawing area — which on SI727_1000x800 landscape admits the
 * 1:750 rung that a flat quarter-budget forbids.
 *
 * It is NOT a second swing at block-room tuning (BLOCK_ROOM_BUDGETS / the
 * attempt-escalation ladder already own that; a renderer hands figureMaxFraction
 * as-is and the resolver's retry ladder still tightens it on placement
 * failure). It is a scale WINDOW: topology-verified renderings may use an
 * extra scale-in step that unverified ones may not.
 *
 * Default callers that do not verify whitespace never see this value — they
 * keep FIGURE_MAX_FRACTION, so existing plans are byte-identical until a
 * renderer turns the gate on for itself.
 */
export const TOPOLOGY_GATED_FRACTION = 0.98;

/**
 * Block-room budget per sheet-escalation attempt, indexed by attempt number.
 *
 * A renderer escalates the sheet BECAUSE the Schedule of Areas / coordinate
 * list / endorsement blocks could not be placed. Re-resolving on the bigger
 * sheet at the default 0.75 takes the finest candidate that now fits, so the
 * figure grows to eat exactly the room just gained and the blocks are no better
 * off (measured: sampleRealisticPlan ran 1:1500 on 500x400 -> 1:1000 on
 * 800x500 -> 1:500 on 1000x800, failing placement every time). Pinning the
 * scale instead walks the figure off the resolver's ladder and strands a
 * postage stamp on a big sheet (measured: 1:2500 on 1000x800, 0.26 fill).
 *
 * So the retry keeps the resolver authoritative and simply DEMANDS MORE ROOM.
 * Both renderers index this same array with their own escalation counter, so
 * they apply the SAME BUDGET AT A GIVEN ATTEMPT NUMBER. That is what holds by
 * construction -- not that they reach the same outcome, since the two measure
 * block placement differently and can need different numbers of escalations.
 * The parity suite asserts the outcome on fixtures whose counts do match.
 *
 * WHY THE LADDER IS [0.75, 0.55] AND NOT THE [0.75, 0.6, 0.5] FIRST PROPOSED.
 * Both retry rungs were measured, not computed. On sampleRealisticPlan the PDF
 * cannot place its blocks around a 1:1000 figure on SI727_800x500 but can
 * around 1:1250 (the DXF manages 1:1000 — the two measure placement against
 * their own emitted block footprints). A 0.6 budget yields 1:1000 there, so the
 * first retry would fail on the PDF side and the two formats would land on
 * different sheets. The budgets that yield 1:1250 on that sheet are
 * [0.452, 0.565).
 *
 * At the other end, sampleMaglasPlan exhausts the ladder: its 240-row Schedule
 * of Areas needs more column height than even SI727_1000x800 offers, so it
 * always lands on the largest sheet and the LAST rung decides its figure size.
 * The budgets that keep it at 1:1250 (0.521 fill) rather than 1:1500 (0.434,
 * under the 0.5 postage-stamp floor that guards the originally reported bug)
 * are [0.521, 0.625).
 *
 * 0.55 is the only round value inside both windows, so one retry rung serves
 * both and attempts past it clamp to it. Tightening further was measured to buy
 * nothing: Maglas's schedule is unplaceable at 0.6, 0.55 AND 0.5 alike.
 *
 * Attempts past the end of the array clamp to the last (tightest) rung.
 */
export const BLOCK_ROOM_BUDGETS = [0.75, 0.55];

/** The budget for a given escalation attempt, clamped to the ladder. */
export function blockRoomFraction(attempt = 0) {
  const i = Number.isFinite(attempt) ? Math.max(0, Math.trunc(attempt)) : 0;
  return BLOCK_ROOM_BUDGETS[Math.min(i, BLOCK_ROOM_BUDGETS.length - 1)];
}

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

function fitsOn(sheetName, extentM, denominator, titleBandMm, figureMaxFraction) {
  const area = drawingAreaMm(sheetName, { titleBandMm });
  return (extentM.widthM / denominator) * 1000 <= area.widthMm * figureMaxFraction
      && (extentM.heightM / denominator) * 1000 <= area.heightMm * figureMaxFraction;
}

/**
 * @param {object}  args
 * @param {{widthM:number, heightM:number}} args.extentM  Ground extent of the outside figure
 * @param {object}  args.parcels        GeoJSON FeatureCollection
 * @param {string}  args.planType
 * @param {number} [args.declaredScale] Surveyor's explicit denominator
 * @param {string} [args.declaredSheet] Surveyor's explicit sheet name
 * @param {number} [args.titleBandMm]   Renderer's measured title band, when known
 * @param {number} [args.figureMaxFraction] Share of the available area the figure
 *   may occupy. Defaults to FIGURE_MAX_FRACTION. A renderer that has already
 *   FAILED block placement on a smaller sheet passes a tighter value on the
 *   retry (see BLOCK_ROOM_BUDGETS), so escalating the sheet actually buys the
 *   blocks room instead of handing it straight back to a finer figure.
 * @returns {{ candidates: Array, legibilityMaxDenominator: number }}
 */
export function resolvePlanSheeting({
  extentM,
  parcels,
  planType,
  declaredScale = null,
  declaredSheet = null,
  titleBandMm = TITLE_BAND_ESTIMATE_MM,
  figureMaxFraction = FIGURE_MAX_FRACTION,
  topologyGatedFraction = null,
}) {
  // Topology gate: a renderer that has CERTIFIED (via its whitespace-zones /
  // block-placement engine, not by assumption) that the schedule/coordinate/
  // endorsement blocks actually sit inside polygon whitespace pockets may hand
  // over a HIGHER figure fraction than the default reserve. That is the lever
  // that admits the finer prescribed scale (e.g. 1:750 on SI727_1000x800
  // landscape) that a flat 25% reserve would otherwise strand at today's
  // coarser auto answer. Both PDF and DXF thread the SAME value, so parity is
  // by construction; .gpkg derives from the DXF buffer and inherits it.
  const effectiveFigureFraction =
    topologyGatedFraction != null ? topologyGatedFraction : figureMaxFraction;
  const legibilityMax = legibilityMaxDenominator(parcels);
  const sheets = sheetLadder(declaredSheet);

  // --- Which denominators are permitted, and why ---
  let denominators;
  let basis;
  if (declaredScale) {
    // An explicit scale is a professional decision: honour it and let the
    // SHEET escalate rather than silently correcting the scale to fit.
    denominators = [declaredScale];
    basis = 'surveyor-declared scale';
  } else {
    // Auto-fit. There is deliberately NO plan-type ceiling: the old Reg 32(3)
    // developed-township mandate that forced 1:500 on small-stand townships
    // was removed. Legibility is what bounds the COARSE end (a coarser figure
    // would leave the narrowest stand unlabelled); the finest end is bounded
    // by the figure fitting the sheet. planType is accepted for API stability
    // but no longer constrains anything.
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

  // Single-sheet candidates: smaller sheet first, then larger figure (finer
  // denominator) within a sheet. Ordering decided with the surveyor:
  // avoid tiling > smaller sheet > larger figure.
  const fitting = [];
  for (const sheetSize of sheets) {
    for (const d of denominators) {
      if (fitsOn(sheetSize, extentM, d, titleBandMm, effectiveFigureFraction)) fitting.push(make(d, sheetSize, false));
    }
  }

  // Multi-sheet is retired for General Plans. If nothing fits even at the
  // coarsest legible scale on the largest sheet, still return ONE best-effort
  // single-sheet candidate (coarsest permitted denominator, largest sheet)
  // instead of emitting a needsTiling fallback — renderers always get at
  // least one answer and stay on a single sheet.
  const candidates = fitting.length > 0
    ? fitting
    : [make(denominators[denominators.length - 1], sheets[sheets.length - 1], false, 'figure exceeds the largest sheet — best-effort single sheet')];

  return {
    candidates,
    legibilityMaxDenominator: legibilityMax,
  };
}
