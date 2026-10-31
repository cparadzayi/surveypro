/**
 * SI 727 graphic scale bar — the ONE source of truth.
 *
 * Every renderer (plan PDF, plan DXF, diagram PDF, diagram DXF, frontend
 * preview) walks the primitive list `scaleBarLayout()` returns instead of
 * deriving its own geometry.
 *
 * THE BAR is a fixed object on the PAPER and its figures follow the scale (this
 * is the Surveyor-General's own template, "lot 1 CORR.dwg", and their written
 * comment that the units must relate to the scale):
 *   - 20 mm to the left of 0, in ten 2 mm subdivisions;
 *   - labelled marks 20 mm and 40 mm to the right of 0;
 *   - each label is the GROUND distance that paper length stands for, so a plan
 *     at 1:1250 reads  25 | 12,5 | 0 | 25 | 50  and one at 1:1500 reads
 *     30 | 15 | 0 | 30 | 60 (the template itself shows 30 0 30 60 at 1:1500);
 *   - labels are magnitudes, never signed.
 *   Two horizontal rules (bottom and middle); the labelled bars stand twice the
 *   rule gap, the unlabelled subdivisions 60% of that.
 *
 * WHY PAPER-FIXED
 *   The previous bar fixed the GROUND graduations (20 m / 40 m) and let its paper
 *   length follow the scale, so every plan carried the same figures whatever its
 *   scale, and the bar became unreadable beyond about 1:1500 as its labels ran
 *   into each other. A bar of constant length on paper has no such limit, and its
 *   figures tell the reader the scale at a glance. It is also the usual
 *   cartographic practice: choose a convenient length on paper, label it with the
 *   ground distance it represents, and subdivide the extension left of zero.
 *
 *   The weights are chosen for how a bar prints: frame : major : minor is
 *   0.4 : 0.3 : 0.2 mm (a rule under 0.2 mm is the first thing a photocopy
 *   loses) and the rule gap is at least 4x the frame weight, so two parallel rules
 *   never merge into a grey band.
 */

export const SI727_SCALE_BAR = {
  // ---- graduations, millimetres ON THE PAPER -------------------------------
  leftSpanMm: 20,                   // 0 to the left end
  minorDivisions: 10,               // ten subdivisions, so each is 2 mm
  rightMarksMm: [20, 40],           // labelled marks right of 0
  // The left end, its midpoint and 0 are labelled; the other graduations subdivide.
  labelMidLeft: true,
  // Labels are MAGNITUDES, not signed distances: what marks the left of 0 is the
  // graduation density (ten rules to the left, none to the right), not a minus sign.
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
  // Ground metres a paper length stands for, free of float noise (1:1250 x 20 mm = 25).
  const groundOf = (mm) => Math.round((mm * denominator / 1000) * 1e6) / 1e6;
  // "12,5" -- SI 727 uses the decimal comma.
  const fmt = (m) => String(Math.abs(m)).replace('.', ',');
  const labelFor = (m) => (G.unsignedLabels ? fmt(m) : fmt(m));

  const stepMm = G.leftSpanMm / G.minorDivisions;
  const midIdx = G.minorDivisions / 2;
  const verticals = [];
  for (let i = 0; i <= G.minorDivisions; i++) {
    const xMm = -G.leftSpanMm + i * stepMm;
    const major = i === 0 || i === G.minorDivisions || (G.labelMidLeft && i === midIdx);
    const metres = i === G.minorDivisions ? 0 : -groundOf(Math.abs(xMm));
    verticals.push({
      metres,
      xMm,
      major,
      weightMm: major ? G.majorWeightMm : G.minorWeightMm,
      y0Mm: 0,
      y1Mm: major ? G.barHeightMm : G.barHeightMm * G.minorHeightFactor,
      label: major ? labelFor(metres) : null,
    });
  }
  for (const xMm of G.rightMarksMm) {
    const metres = groundOf(xMm);
    verticals.push({
      metres,
      xMm,
      major: true,
      weightMm: G.majorWeightMm,
      y0Mm: 0,
      y1Mm: G.barHeightMm,
      label: labelFor(metres),
    });
  }
  verticals.sort((a, b) => a.xMm - b.xMm);

  const x0Mm = -G.leftSpanMm;
  const x1Mm = G.rightMarksMm[G.rightMarksMm.length - 1];
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
  // The subdivisions are a fixed paper distance now, so this can only trip if the
  // constants are edited -- kept as the guard for exactly that edit.
  const minorPitchMm = stepMm;
  if (minorPitchMm < G.minMinorPitchMm) {
    warnings.push(
      `the ${minorPitchMm.toFixed(2)}mm graduations are under the ${G.minMinorPitchMm}mm ` +
      `the ${G.minorWeightMm}mm rules need to stay separate. Shorten the bar span; do ` +
      `not thin the rules.`
    );
  }
  if (widthMm / G.barHeightMm < G.minBarAspect) {
    warnings.push(
      `1:${denominator}: the bar is ${widthMm.toFixed(1)}mm x ${G.barHeightMm}mm, ` +
      `too stubby to read as a bar. Use a smaller denominator.`
    );
  }
  // Label crowding, measured on the ACTUAL label positions. The majors are not evenly
  // spaced (the left end, its midpoint and 0 are 10 mm apart, 0 to 20 and 20 to 40 are
  // 20 mm), so the tightest pair is read off the labels' own x values.
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
      `they will touch. The figures are the ground length of 20 mm of paper at this scale; ` +
      `choose a scale that gives shorter figures.`
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
  // The layout's y runs UP from the bar's bottom rule, with the caption at negative
  // y: the reserved box spans [yMm, yMm + heightMm]. Its TOP is the labels, and on
  // the page that top must sit at the slot's top (plus any centring slack), so the
  // origin is that far DOWN -- yMm + heightMm. Using yMm alone put the origin a full
  // bar-height too high: the bar printed in the strip ABOVE its slot, over whatever
  // the planner had kept that slot clear of (a figure vertex, in the field).
  const originY = slot.y + (slot.height - heightPt) / 2 + pt(layout.reserved.yMm + layout.reserved.heightMm);
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
