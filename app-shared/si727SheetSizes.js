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

/**
 * SI 727 drawing-area CONTENT box (paper size minus margins) shared by the
 * topology gate so PDF and DXF/.gpkg compute an identical metre-basis box.
 * Margins mirror the renderers' layout constants: 50mm left/top/bottom,
 * 150mm right (the endorsement-strip margin).
 *
 * Expressed as widths/heights in paper millimetres. The gate converts them to
 * ground metres via the SAME scale constant both renderers use (1:1000 basis,
 * scale-invariant per certifyTopologyGate's docstring).
 */
export function sheetContentMm(name) {
  const size = findSheetSize(name);
  if (!size) return null;
  return { width: size.width - 200, height: size.height - 100 };
}

/**
 * The Surveyor-General's reference series of a General Plan, by prescribed sheet size:
 * BCT for the smallest, BCG for the medium, BDG for the largest. The office gives the
 * number after preliminary examination and it is written after this code at the foot of
 * the sheet. (Per the surveyor's reading of the prescribed sizes; the smallest and
 * largest codes are not in the sample drawing, only BCG is.)
 */
export const GP_OFFICE_CODES = {
  SI727_500x400: 'BCT',
  SI727_800x500: 'BCG',
  SI727_1000x800: 'BDG',
};

/** The code for a sheet size name ('SI727_800x500' or 'SI727 800x500'), or '' when unknown. */
export function gpOfficeCode(sheetName) {
  if (typeof sheetName !== 'string') return '';
  return GP_OFFICE_CODES[sheetName.trim().replace(/\s+/g, '_')] || '';
}
