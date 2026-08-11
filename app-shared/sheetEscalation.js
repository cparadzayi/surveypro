import { SI727_GENERAL_PLAN_SHEET_SIZES } from './si727SheetSizes.js';

/**
 * SI 727 paper-size escalation ladder. Shared between pdfkitGeoPDF.js and
 * dxfGenerator.js so both formats follow the same smallest→largest SI 727
 * sheet-size sequence when the planner returns needsScaleUp.
 *
 * Spec: docs/superpowers/specs/2026-06-12-three-way-planner-alignment-design.md
 */

export const SHEET_ORDER = SI727_GENERAL_PLAN_SHEET_SIZES.map((s) => s.name);

export const MAX_SHEET_UP_ATTEMPTS = 2;

/**
 * Returns the next sheet size in the escalation ladder, or null if the
 * current sheet is already the largest or not in the ladder.
 *
 * @param {string} currentSheet
 * @returns {string | null}
 */
export function nextSheetUp(currentSheet) {
  const idx = SHEET_ORDER.indexOf(currentSheet);
  if (idx < 0 || idx >= SHEET_ORDER.length - 1) return null;
  return SHEET_ORDER[idx + 1];
}
