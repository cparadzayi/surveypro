/**
 * Scales a locality inset is drawn at, and how tightly it packs its box.
 *
 * Shared because two sides need the same answer. The frontend picks a scale
 * when it builds the spec, sized to the sheet's whole inset box; the renderer
 * has to pick one again whenever that box is split between several insets, and
 * a locality diagram drawn at the full box's scale inside half the box spills
 * out of its frame and over the figure. Two copies of this ladder would drift,
 * and the symptom -- an inset a little too big -- is the kind that is noticed
 * late, on paper.
 *
 * These are not the SI 727 Reg 32(2) prescribed scales: those govern the
 * FIGURE. The trig locality sketch a working plan must carry is drawn with its
 * positions true to their bearings, one from another, but not to any scale, so
 * its caption says NOT TO SCALE and these rungs are never printed on it; they
 * only govern how the sketch is laid out in its box -- and, on the merged map,
 * how a set of outlying marks is drawn to scale beside the survey's footprint,
 * where the caption does state the rung in use.
 */

/** Round denominators a surveyor expects between a far mark and the survey. */
export const INSET_SCALE_LADDER = [
  5000, 10000, 20000, 25000, 50000,
  100000, 200000, 250000, 500000, 1000000, 2000000,
];

/**
 * Round scales a measured inset (the trig/locality map) may be drawn at, finest first. Every inset is a map to
 * a stated scale now, so the renderer takes the finest of these at which the map fits its cell. It reaches
 * down to 1:500 so a survey whose control is a few hundred metres off is not shrunk to a stamp.
 */
export const MEASURED_INSET_SCALES = [
  500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 10000, 12500, 15000, 20000, 25000, 30000,
  40000, 50000, 60000, 75000, 100000, 125000, 150000, 200000, 250000, 300000, 400000, 500000, 600000,
  750000, 1000000, 1250000, 1500000, 2000000, 3000000, 4000000,
];

/**
 * Round scales a DETAIL inset (an enlargement of marks that plot on top of each other on the figure) may be
 * drawn at. Marks tens of millimetres apart on the ground need an enlargement of 1:1 to 1:250.
 */
export const DETAIL_INSET_SCALES = [1, 1.5, 2, 2.5, 4, 5, 7.5, 10, 15, 20, 25, 40, 50, 75, 100, 150, 200, 250];

/**
 * Margin left around the content, as a multiplier on the span that must fit.
 * Without it the outermost station sits hard against the frame, and its name --
 * drawn centred, above the mark -- crosses it.
 */
export const INSET_SCALE_PADDING = 1.15;

/**
 * The first ladder scale at which `spanE` x `spanN` ground metres fit a box of
 * `boxW` x `boxH` paper millimetres, padding included.
 *
 * Falls back to the coarsest scale on the ladder: an inset drawn slightly too
 * large is still readable, whereas returning nothing would drop the diagram.
 */
export function insetScaleToFit(spanE, spanN, boxW, boxH) {
  const need = Math.max(spanE / boxW, spanN / boxH) * 1000 * INSET_SCALE_PADDING;
  return INSET_SCALE_LADDER.find((s) => s >= need)
    ?? INSET_SCALE_LADDER[INSET_SCALE_LADDER.length - 1];
}
