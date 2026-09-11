import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

/**
 * Page counts keyed by path + mtime + size. A regenerated plan changes its mtime, which
 * invalidates the entry naturally, so nothing has to be evicted by hand.
 */
const cache = new Map();

/**
 * Pages in a PDF, or null when it cannot be read.
 *
 * For a survey plan this IS the sheet count: _mergePDFBuffers in pdfkitGeoPDF.js merges one
 * single-page document per sheet, so pages and sheets are the same number by construction.
 * Returning null rather than a guess matters — the letter omits its sheet clause when the
 * count is unknown instead of under-reporting a multi-sheet plan to the Surveyor-General.
 */
export async function readPdfPageCount(absPath, mtimeMs, size) {
  const key = `${absPath}:${mtimeMs}:${size}`;
  if (cache.has(key)) return cache.get(key);

  let pageCount = null;
  try {
    const bytes = fs.readFileSync(absPath);
    // ignoreEncryption lets a permissions-flagged (but readable) plan still report its pages;
    // updateMetadata:false keeps this a pure read.
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    pageCount = doc.getPageCount();
  } catch {
    // Corrupt, truncated, locked, or not a PDF at all. Unknown, never fatal.
    pageCount = null;
  }

  cache.set(key, pageCount);
  return pageCount;
}
