/**
 * Vertical arithmetic for the lodgement letter's enclosed-documents list.
 *
 * Extracted from cover-page.ts because the generator can only be asserted as "produced a
 * non-empty blob" — positions inside a rendered PDF are not readable from a test. Keeping the
 * arithmetic here is what makes the page-break decision verifiable.
 *
 * All units are millimetres, matching the jsPDF document's unit.
 */

/** Baseline step for a row's own line. */
export const ROW_HEIGHT_MM = 6.5;

/** Baseline step for each indented detail line under a row. */
export const DETAIL_LINE_HEIGHT_MM = 5;

/**
 * Space kept free below the list for "Yours Faithfully", the signature rule and the name.
 * Without this the enclosed list could consume the page and push the signature off it.
 */
export const RESERVED_CLOSING_MM = 45;

export const ROW_FONT_SIZE = 11;
export const DETAIL_FONT_SIZE = 9;

/** Total height a row occupies, including its detail lines. */
export function rowBlockHeight(detailLineCount: number): number {
  return ROW_HEIGHT_MM + Math.max(0, detailLineCount) * DETAIL_LINE_HEIGHT_MM;
}

/**
 * Would drawing this row here leave too little room for the closing block?
 *
 * Measured against the reserved band rather than the paper edge, because running into the
 * signature is the failure we are preventing, not running off the paper.
 */
export function rowNeedsPageBreak(
  yPosition: number,
  blockHeight: number,
  pageHeight: number,
  reserved: number = RESERVED_CLOSING_MM,
): boolean {
  return yPosition + blockHeight > pageHeight - reserved;
}
