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
 *   the two rules are apart; the unlabelled 2 m ones stand at 60% of that, as
 *   subdivision. No alternating fill: graduations are rules, not blocks. Labels
 *   sit above the bar, and carry MAGNITUDES — they read 20, 10, 0, 20, 40, not
 *   -20, -10, 0, 20, 40.
 *
 * WHY THESE PRINT SIZES
 *   The bar's print geometry is a physical object on paper and does NOT scale
 *   with the drawing — only the ground graduations do, and SI 727 pins those.
 *   So the numbers below are chosen for how they print, and the only thing that
 *   changes with the plan scale is how far apart the rules land. Three
 *   constraints set the weights:
 *
 *   1. A rule has to be wide enough to reproduce as a LINE rather than a tint.
 *      0.2 mm is the practical floor for a graduation tick and holds up on a
 *      decent plot; it is the first thing a photocopy degrades, so it is the
 *      tier to revisit if these ever get faxed.
 *   2. Two parallel rules closer than about 4x the heavier weight merge into one
 *      grey band. At a 0.4mm frame that floors the gap at 1.6mm; 2.5mm leaves
 *      generous headroom, which is why the gap is comfortably not 2mm.
 *   3. The tiers have to separate by weight alone, so frame : major : minor is
 *      0.4 : 0.3 : 0.2 — a 2:1 spread across the pair, the usual hierarchy.
 *
 *   The consequence worth knowing: the ten 2 m graduations, not the gap, are what
 *   limit the plan scale. Their pitch is 2000/denominator mm, and a minor rule
 *   needs about 3x its own width of clear paper either side to read as separate
 *   lines — 0.6mm of pitch at this weight. Past about 1:3000 they stop
 *   separating. The remedy is a SHORTER BAR SPAN, never a thinner rule —
 *   `scaleBarLayout` reports it rather than silently thinning.
 */

export const SI727_SCALE_BAR = {
  // ---- SI 727 ground graduations -----------------------------------------
  minorStepMetres: 2,               // 10 graduations over 20 m
  leftSpanMetres: 20,
  rightMarksMetres: [20, 40],       // no subdivisions right of 0
  majorMarksMetres: [-20, -10, 0, 20, 40],
  // A bar scale's labels are MAGNITUDES, not signed distances: left of 0 the
  // labels read 20, 10, 0, 20, 40. The minus sign would be a claim about the
  // sheet's coordinate frame that the bar is not making, and it reads as a
  // negative length to anyone measuring off the paper. What distinguishes the
  // left of 0 from the right is the graduation density — ten minor rules to the
  // left, none to the right — never the sign of the text.
  unsignedLabels: true,
  unitLabel: 'Metres',
  caption: (denominator) => `Scale 1 : ${denominator}`,

  // ---- print geometry, millimetres on the sheet ---------------------------
  ruleGapMm: 2.5,                   // bottom rule to middle rule
  barHeightMm: 5,                   // = 2 x ruleGapMm, the vertical bars' height
  frameWeightMm: 0.4,               // the two long horizontal rules
  majorWeightMm: 0.3,               // the labelled graduations
  minorWeightMm: 0.2,               // the unlabelled 2 m graduations
  // The unlabelled graduations stand at 60% of the labelled ones' height, so the
  // eye counts the labelled points and reads the rest as subdivision. They still
  // start on the bottom rule and still cross the middle one — 3mm clears a 2.5mm
  // gap — so the two horizontals read as continuous across the whole bar.
  minorHeightFactor: 0.6,
  // The graduation labels and the unit label are set to the SAME size as the
  // statement block's area figure ("4 049 square metres"), which the renderers
  // draw at Helvetica 9pt. 9pt expressed in the millimetres this module works
  // in: 9 / (72/25.4) = 3.175mm. Matching it is what makes the bar read as part
  // of the sheet's typography rather than as a stamped-on graphic.
  //
  // This is a big step up from the 2mm (5.67pt) the bar used to carry, and it is
  // not free: at 1:2500 the whole bar is only 24mm wide, so the labels are now
  // the dominant feature and they crowd each other. `minLabelPitchMm` is the
  // guard, and scaleBarLayout reports rather than silently overlapping.
  labelHeightMm: 3.175,             // == 9pt
  labelGapMm: 0.8,                  // label baseline above the tallest bar
  captionHeightMm: 2.5,
  captionGapMm: 1.2,                // below the bottom rule
  unitGapMm: 1.2,                   // gap before the unit label

  // ---- scale limits -------------------------------------------------------
  // ~3x the minor rule's own width, so ten rules still read as ten rules.
  minMinorPitchMm: 0.6,
  // Clear paper two adjacent graduation labels must keep between them. Half a
  // label width reads as a gap rather than as a run-together number.
  minLabelClearMm: 1.5,
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
  // Bar-scale labels are magnitudes, so -20 and +20 both print as "20". Which
  // side of 0 a graduation sits on is carried by `metres` and by the
  // subdivision density, never by the text.
  const labelFor = (m) => (G.unsignedLabels ? String(Math.abs(m)) : String(m));
  const verticals = [];
  for (let m = 0; m >= -G.leftSpanMetres; m -= G.minorStepMetres) {
    const major = majors.has(m);
    verticals.push({
      metres: m,
      xMm: xOf(m),
      major,
      weightMm: major ? G.majorWeightMm : G.minorWeightMm,
      y0Mm: 0,
      y1Mm: major ? G.barHeightMm : G.barHeightMm * G.minorHeightFactor,
      label: major ? labelFor(m) : null,
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
      label: labelFor(m),
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
  //
  // `atMm` is the graduation a label belongs to, and it is signed while `text` is
  // not — with magnitudes, "20" names two different graduations, so anything that
  // needs to get from a label back to its rule (tests, a renderer's hit-testing,
  // a future SI 727 variation) must go via this, not the text.
  const labels = verticals
    .filter((v) => v.label !== null)
    .map((v) => ({
      text: v.label,
      atMm: v.metres,
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
  // Label crowding, measured on the ACTUAL label positions rather than on a
  // multiplier worked out by hand. The majors are not evenly spaced — 0 to 10 m
  // and 10 to 20 m are one minor step each, 0 to 20 m and 20 to 40 m are two —
  // so the pair that decides legibility is the tightest pair that exists, and the
  // only reliable way to find it is to read the labels' own x values. Deriving it
  // from `minorStepMetres` instead gets it wrong by a factor of five.
  const sortedLabels = [...labels].sort((a, b) => a.xMm - b.xMm);
  const minLabelGapMm = sortedLabels.length < 2
    ? Infinity
    : Math.min(...sortedLabels.slice(1).map((t, i) => t.xMm - sortedLabels[i].xMm));
  const widestLabelMm = Math.max(
    ...labels.map((t) => estimateTextWidthMm(t.text, G.labelHeightMm))
  );
  if (minLabelGapMm < widestLabelMm + G.minLabelClearMm) {
    warnings.push(
      `1:${denominator}: the tightest graduation labels are ${minLabelGapMm.toFixed(1)}mm ` +
      `apart at ${G.labelHeightMm}mm (9pt) but are ${widestLabelMm.toFixed(1)}mm wide, so ` +
      `they will touch. Use a smaller denominator.`
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
