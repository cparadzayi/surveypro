/**
 * The single decision the route has to make: is this plan one sheet, several
 * sheets the surveyor has divided, or several sheets the surveyor HAS NOT
 * divided and therefore cannot be rendered?
 *
 * The three inputs to it all come from code that already exists:
 *   - `recommendedSheetSize` is `nextLargerSheet`'s answer from the ladder run
 *     by the resolver (dxfScheduleHelpers.js), where 'multi-sheet-required' is
 *     the "already at the top of the sheet ladder" ceiling.
 *   - `cuts` is the surveyor's stored cut polyline(s) — a plan with cuts has
 *     SheetPayloads waiting to be built; a plan without them has nothing that
 *     says where one sheet ends and the next begins.
 *
 * The refusal is the point. Before Task 6, "does not fit one sheet" fell back
 * to a rectangular tile grid computed by extent arithmetic. Tiling decides
 * where a sheet boundary falls by math; a surveyor decides it as a matter of
 * survey judgement. The replacement path refuses politely instead of inventing
 * a boundary, because a multi-sheet plan cut in the wrong place is a plan that
 * has to be re-cut — whereas a refusal that says "draw the cuts" costs one
 * click.
 */
export function chooseSheeting({ recommendedSheetSize, cuts }) {
  if (recommendedSheetSize !== 'multi-sheet-required') {
    return { ok: true, mode: 'single' }
  }

  if (Array.isArray(cuts) && cuts.length > 0) {
    return { ok: true, mode: 'sheeted' }
  }

  return {
    ok: false,
    error: 'cuts-required',
    message:
      'This figure does not fit on one sheet, and you have not drawn the lines ' +
      'that divide it. Where one sheet ends and the next begins is a survey ' +
      'judgement, so SurveyPro will not invent it for you. Draw the cut lines ' +
      'across the figure, then generate the plan again.',
  }
}