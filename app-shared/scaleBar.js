/**
 * SI 727 graphic scale bar — the ONE source of truth.
 *
 * Every renderer (plan PDF, plan DXF, diagram PDF, diagram DXF, frontend
 * preview) walks the primitive list `scaleBarLayout()` returns instead of
 * deriving its own geometry. They used to each work it out, and they disagreed:
 * three segments right of zero on the plans, five subdivisions left on the
 * diagrams, one row on some and two on others, 0.7mm rules against a 2mm gap on
 * the PDF, and a `40 * 2.835 * metersPerPoint` unit mix in between.
 *
 * THE BAR (SI 727)
 *   Two horizontal rules — one at the bottom, one in the middle. Ten
 *   graduations to the left of 0, spanning 20 m, so each is 2 m. Two
 *   graduations to the right of 0, at 20 m and 40 m. Vertical bars at
 *   -20, -10, 0, 20 and 40, each standing twice the distance between the
 *   horizontal rules, so they cross the middle rule and stand as proud of it as
 *   the two rules are apart. No alternating fill: graduations are rules, not
 *   blocks. Labels sit above the bar.
 *
 * WHY THESE PRINT SIZES
 *   The bar's print geometry is a physical object on paper and does NOT scale
 *   with the drawing — only the ground graduations do, and SI 727 pins those.
 *   So the numbers below are chosen for how they print, and the only thing that
 *   changes with the plan scale is how far apart the rules land. Three
 *   constraints set the weights:
 *
 *   1. A rule has to be at least ~0.25mm to reproduce as a LINE rather than a
 *      tint, and to still be one after a photocopy. That is the minor weight.
 *   2. Two parallel rules closer than about 4x the heavier weight merge into one
 *      grey band. At a 0.5mm frame that floors the gap at 2mm; 2.5mm leaves
 *      headroom, which is why the gap is not 2mm.
 *   3. The tiers have to separate by weight alone, so frame : major : minor is
 *      0.5 : 0.4 : 0.25 — a 2:1 spread across the pair, the usual hierarchy.
 *
 *   The consequence worth knowing: the ten 2 m graduations, not the gap, are what
 *   limit the plan scale. Their pitch is 2000/denominator mm, so past about
 *   1:2500 the rules stop separating. The remedy is a SHORTER BAR SPAN, never a
 *   thinner rule — `scaleBarLayout` reports it rather than silently thinning.
 */

export const SI727_SCALE_BAR = {
  // ---- SI 727 ground graduations -----------------------------------------
  minorStepMetres: 2,               // 10 graduations over 20 m
  leftSpanMetres: 20,
  rightMarksMetres: [20, 40],       // no subdivisions right of 0
  majorMarksMetres: [-20, -10, 0, 20, 40],
  unitLabel: 'Metres',
  caption: (denominator) => `Scale 1 : ${denominator}`,

  // ---- print geometry, millimetres on the sheet ---------------------------
  ruleGapMm: 2.5,                   // bottom rule to middle rule
  barHeightMm: 5,                   // = 2 x ruleGapMm, the vertical bars' height
  frameWeightMm: 0.5,               // the two long horizontal rules
  majorWeightMm: 0.4,               // the labelled graduations
  minorWeightMm: 0.25,              // the unlabelled 2 m graduations
  labelHeightMm: 2,
  labelGapMm: 0.8,                  // label baseline above the tallest bar
  captionHeightMm: 2.5,
  captionGapMm: 1.2,                // below the bottom rule
  unitGapMm: 1.2,                   // gap before the unit label

  // ---- scale limits -------------------------------------------------------
  // A minor rule needs about 3x its own width of clear paper either side before
  // the ten rules read as separate lines.
  minMinorPitchMm: 0.75,
  // Below this width:height the bar stops reading as a bar and becomes a block.
  minBarAspect: 3,
};

/** Approximate set-width of mixed-case Helvetica at `heightMm`, for planning. */
export function estimateTextWidthMm(text, heightMm) {
  return String(text).length * heightMm * 0.62;
}

/** "1:2000" / 2000 / { label: '1 : 2000' } -> 2000. Falls back to 1000. */
export function scaleDenominatorOf(scale) {
  if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) return scale;
  const label = typeof scale === 'string' ? scale : scale?.label;
  const m = label ? String(label).match(/(\d+)\s*$/) : null;
  return m ? parseInt(m[1], 10) : 1000;
}

/**
 * The bar's geometry at a plan scale. Pure, all lengths in millimetres on the
 * printed sheet; no renderer-specific units.
 *
 * Origin: x = 0 sits on the 0 graduation, y = 0 on the BOTTOM rule, y increases
 * upward. Renderers that draw downward flip y.
 */
export function scaleBarLayout(scale) {
  const denominator = scaleDenominatorOf(scale);
  const G = SI727_SCALE_BAR;
  const mmPerMetre = 1000 / denominator;
  const xOf = (metres) => metres * mmPerMetre;

  const majors = new Set(G.majorMarksMetres);
  const verticals = [];
  for (let m = 0; m >= -G.leftSpanMetres; m -= G.minorStepMetres) {
    const major = majors.has(m);
    verticals.push({
      metres: m,
      xMm: xOf(m),
      major,
      weightMm: major ? G.majorWeightMm : G.minorWeightMm,
      y0Mm: 0,
      y1Mm: G.barHeightMm,
      label: major ? String(m) : null,
    });
  }
  for (const m of G.rightMarksMetres) {
    verticals.push({
      metres: m,
      xMm: xOf(m),
      major: true,
      weightMm: G.majorWeightMm,
      y0Mm: 0,
      y1Mm: G.barHeightMm,
      label: String(m),
    });
  }
  verticals.sort((a, b) => a.metres - b.metres);

  const x0Mm = xOf(-G.leftSpanMetres);
  const x1Mm = xOf(G.rightMarksMetres[G.rightMarksMetres.length - 1]);
  const widthMm = x1Mm - x0Mm;

  const horizontals = [
    { yMm: 0, x0Mm, x1Mm, weightMm: G.frameWeightMm },
    { yMm: G.ruleGapMm, x0Mm, x1Mm, weightMm: G.frameWeightMm },
  ];

  const unitWidthMm = estimateTextWidthMm(G.unitLabel, G.labelHeightMm);
  const caption = G.caption(denominator);
  const captionWidthMm = estimateTextWidthMm(caption, G.captionHeightMm);

  // Labels above, centred on their rule; the unit beside the right end,
  // centred on the bar; the caption below, centred under the bar.
  const labels = verticals
    .filter((v) => v.label !== null)
    .map((v) => ({
      text: v.label,
      xMm: v.xMm,
      yMm: G.barHeightMm + G.labelGapMm,
      heightMm: G.labelHeightMm,
      align: 'center',
    }));
  const unitLabel = {
    text: G.unitLabel,
    xMm: x1Mm + G.unitGapMm,
    yMm: (G.barHeightMm - G.labelHeightMm) / 2,
    heightMm: G.labelHeightMm,
    align: 'left',
    widthMm: unitWidthMm,
  };
  const captionText = {
    text: caption,
    xMm: (x0Mm + x1Mm) / 2,
    yMm: -G.captionGapMm,
    heightMm: G.captionHeightMm,
    align: 'center',
    widthMm: captionWidthMm,
  };

  const warnings = [];
  const minorPitchMm = G.minorStepMetres * mmPerMetre;
  if (minorPitchMm < G.minMinorPitchMm) {
    warnings.push(
      `1:${denominator}: the ${G.minorStepMetres} m graduations are ` +
      `${minorPitchMm.toFixed(2)}mm apart, under the ${G.minMinorPitchMm}mm the ` +
      `${G.minorWeightMm}mm rules need to stay separate. Shorten the bar span; do ` +
      `not thin the rules.`
    );
  }
  if (widthMm / G.barHeightMm < G.minBarAspect) {
    warnings.push(
      `1:${denominator}: the bar is ${widthMm.toFixed(1)}mm x ${G.barHeightMm}mm, ` +
      `too stubby to read as a bar. Use a smaller denominator.`
    );
  }

  return {
    denominator,
    mmPerMetre,
    minorPitchMm,
    // the bar itself
    x0Mm, x1Mm, widthMm, heightMm: G.barHeightMm,
    verticals,
    horizontals,
    labels,
    unitLabel,
    caption: captionText,
    // the slot a planner must reserve: bar + labels above + caption below, and
    // the bar plus the unit label to its right
    reserved: {
      xMm: x0Mm,
      yMm: -(G.captionGapMm + G.captionHeightMm),
      widthMm: widthMm + G.unitGapMm + unitWidthMm,
      heightMm: G.labelHeightMm + G.labelGapMm + G.barHeightMm
        + G.captionGapMm + G.captionHeightMm,
    },
    warnings,
  };
}

export default scaleBarLayout;

/**
 * Fit a layout into a reserved slot, returning converters from the layout's
 * millimetres to the caller's POINTS. Every page-space renderer (plan PDF,
 * diagram PDF, diagram DXF) used to re-derive the origin and the y flip on its
 * own — the y flip is the easy one to get backwards, since the layout measures
 * y UP from the caption while every page measures y DOWN, so it lives here once.
 *
 * The layout is centred in the slot. Note the 0 graduation is NOT the bar's
 * centre: SI 727 runs 20 m left of 0 and 40 m right, so 0 sits off-centre, and
 * a renderer that centres on 0 puts the whole bar out to one side.
 */
export function scaleBarFrame(layout, slot) {
  const pt = (mm) => mm * (72 / 25.4);
  const widthPt = pt(layout.reserved.widthMm);
  const heightPt = pt(layout.reserved.heightMm);
  const originX = slot.x + (slot.width - widthPt) / 2 - pt(layout.reserved.xMm);
  const originY = slot.y + (slot.height - heightPt) / 2 + pt(layout.reserved.yMm);
  return {
    widthPt,
    heightPt,
    pt,
    /** millimetres from the 0 graduation -> page x */
    X: (mmX) => originX + pt(mmX),
    /** millimetres measured UP from the caption's bottom edge -> page y */
    Y: (mmY) => originY - pt(mmY),
    /** page y for the TOP of a text box whose BOTTOM edge is at mmY */
    textTop: (mmY, mmHeight) => originY - pt(mmY + mmHeight),
  };
}
