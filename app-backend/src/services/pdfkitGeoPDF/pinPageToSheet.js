/**
 * Nothing the renderer draws may start a page of its own.
 *
 * pdfkit breaks a text line onto a NEW page when it would end below the page's `maxY()`, and the plan is drawn at
 * absolute positions, so text placed below the sheet (an inset that found no room, a label beyond the edge) used to
 * produce an extra page: a General Plan of 217 stands came out as 15 pages, nine of them insets alone on a sheet, and
 * the same plan at 1:600 as 144. With `maxY()` unbounded, text below the sheet is simply clipped by the sheet, as every
 * other mark below it already was, and the pages the renderer ADDS ON PURPOSE (the Outside Figure Data's continuation
 * pages) are unaffected: they decide for themselves where a page ends.
 *
 * `doc` is the pdfkit document; the first page exists already and later ones are pinned as they are added.
 */
export function pinPageToSheet(doc) {
  const pin = () => {
    if (doc.page && typeof doc.page.maxY === 'function') doc.page.maxY = () => Number.POSITIVE_INFINITY
  }
  pin()
  doc.on('pageAdded', pin)
  return doc
}
