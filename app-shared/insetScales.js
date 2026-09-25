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
 * FIGURE. A locality diagram carries true positions -- control stations, or
 * the survey mapped among its far reference marks -- so it is a measured
 * drawing and its caption states the scale it was fitted at; these are the
 * rungs a surveyor expects to read on it.
 */

/** Round denominators a surveyor expects to read on a locality diagram. */
export const INSET_SCALE_LADDER = [
  5000, 10000, 20000, 25000, 50000,
  100000, 200000, 250000, 500000, 1000000, 2000000,
];

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
