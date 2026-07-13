import fs from 'fs';
import path from 'path';

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
      out.push({ name: entry.name, relDir });
    }
  }
}
