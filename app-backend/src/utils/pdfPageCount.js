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

  // Only cache a successful read. A failure here is usually transient (a file lock during or
  // just after generation, e.g. a Windows AV scanner or indexer holding the plan PDF open) — if
  // we cached the null, that momentary lock would look permanent for the life of the process,
  // since the key (path:mtime:size) would not change on retry. A retry costs one read of one
  // file, and there are only ever one to three general plans, so the safe default is to just
  // try again next time rather than remember the failure.
  if (pageCount !== null) cache.set(key, pageCount);
  return pageCount;
}
