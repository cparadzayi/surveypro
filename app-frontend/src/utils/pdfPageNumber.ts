/**
 * Shared page-number stamping for jsPDF section generators.
 * Matches the Calculations Part 1 style: helvetica 10pt, top-right, y = 15.
 */

import type { jsPDF } from 'jspdf';

/**
 * Stamp an in-sequence page number on every page of the document.
 * Page 1 gets `startingPage`, page 2 `startingPage + 1`, and so on.
 * Leaves the document positioned on its last page.
 */
export function stampSequentialPageNumbers(
  doc: jsPDF,
  startingPage: number,
  marginRight: number = 20
): void {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const pageText = String(startingPage + i - 1);
    const textWidth = doc.getTextWidth(pageText);
    doc.text(pageText, doc.internal.pageSize.getWidth() - marginRight - textWidth, 15);
  }
}
