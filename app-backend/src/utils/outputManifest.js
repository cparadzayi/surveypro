import fs from 'fs';
import path from 'path';
import { readPdfPageCount } from './pdfPageCount.js';

/**
 * Recursively collect every file under the project's output/ and input/ folders.
 * Returns [{ name, relDir }] where relDir is the POSIX directory path relative to
 * absWorkingDir. Missing or unreadable folders are skipped (never throws for absence).
 */
export function collectOutputManifest(absWorkingDir) {
  const out = [];
  for (const rootName of ['output', 'input']) {
    walk(path.join(absWorkingDir, rootName), absWorkingDir, out);
  }
  return out;
}

function walk(dir, base, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // missing or unreadable directory
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
    } else if (entry.isFile()) {
      const relDir = path.relative(base, dir).split(path.sep).join('/');
      // mtime lets callers surface a stale output beside a current one. It cannot
      // decide staleness on its own -- that judgement stays with the surveyor.
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(full).mtimeMs;
      } catch {
        // Unreadable file: keep it in the manifest, just without a usable time.
      }
      out.push({ name: entry.name, relDir, mtimeMs });
    }
  }
}

/** Folder whose PDFs carry a meaningful sheet count. Matched as a path SEGMENT. */
const SHEET_COUNTED_FOLDER = 'general-plans';

/**
 * Fill in `pageCount` for the manifest entries where pages mean sheets.
 *
 * Separate from the walk because `pdf-lib` is async while `collectOutputManifest` is
 * synchronous by design. Mutates and returns the array it is given.
 *
 * Scoped to general-plan PDFs only: a diagram is always one sheet (domain rule) and a project
 * can hold 60 diagrams, so opening each to learn what the rule already states would be the
 * only expensive part of building a manifest. General plans number one to three.
 */
export async function attachPageCounts(absWorkingDir, files) {
  const list = files || [];
  for (const file of list) {
    const segments = (file.relDir || '').split('/').filter(Boolean);
    if (!segments.includes(SHEET_COUNTED_FOLDER)) continue;
    if (!/\.pdf$/i.test(file.name)) continue;
    if (/-summary\.pdf$/i.test(file.name)) continue;

    const abs = path.join(absWorkingDir, ...segments, file.name);
    let size = 0;
    try {
      size = fs.statSync(abs).size;
    } catch {
      continue; // vanished between walk and enrich; leave it uncounted
    }
    const pageCount = await readPdfPageCount(abs, file.mtimeMs ?? 0, size);
    if (typeof pageCount === 'number') file.pageCount = pageCount;
  }
  return list;
}
