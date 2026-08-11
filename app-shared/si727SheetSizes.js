/**
 * SI 727 Section 62(1) prescribed General Plan sheet sizes — the ONLY
 * three sizes the regulation allows: 500x400mm, 800x500mm, 1000x800mm.
 * Single source of truth for the PDF generator, DXF generator, sheet
 * escalation ladder, and the frontend paper-size picker, so none of them
 * can drift from the real SI 727 dimensions (or from each other) again.
 *
 * Does NOT cover the Diagram plan type's A4/A3 sizes (a different SI 727
 * provision, genuine ISO sizes) — those remain defined where they already
 * are (dxfGenerator.js's PAPER_SIZES, paperSizeOptions.ts's DIAGRAM list).
 *
 * Ordered smallest to largest — sheetEscalation.js's SHEET_ORDER derives
 * its ladder directly from this array's order.
 */
export const SI727_GENERAL_PLAN_SHEET_SIZES = [
  { name: 'SI727_500x400',  width: 500,  height: 400,  area: 200000 },
  { name: 'SI727_800x500',  width: 800,  height: 500,  area: 400000 },
  { name: 'SI727_1000x800', width: 1000, height: 800,  area: 800000 },
];

/** Look up a size by name, or undefined if not found. */
export function findSheetSize(name) {
  return SI727_GENERAL_PLAN_SHEET_SIZES.find((s) => s.name === name);
}
