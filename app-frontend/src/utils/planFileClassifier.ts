/**
 * What a file sitting in a plan output folder actually is, and how many sheets it carries.
 *
 * One generation writes up to three files into one folder — `<base>.pdf`, `<base>.dxf` and
 * `<base>-summary.pdf` — so "count the files" is never the same as "count the plans". This
 * module is the single place that decides which is which.
 */

/** A file from the project output/input manifest. relDir is POSIX, e.g. "output/field-book". */
export interface ManifestFile {
  name: string;
  relDir: string;
  /** Last-modified epoch ms, for surfacing stale outputs. Absent on older callers. */
  mtimeMs?: number;
  /**
   * PDF pages, which for a survey plan IS its sheet count — the backend merges one
   * single-page document per sheet. Present only for general-plan PDFs; absent when the
   * file was never opened or could not be read.
   */
  pageCount?: number;
}

/** The two plan families whose contents the letter counts. Working plans are not counted. */
export type PlanFileFamily = 'diagram' | 'general';

export type PlanFileRole = 'sheet' | 'cad' | 'summary';

export interface ClassifiedPlanFile {
  role: PlanFileRole;
  /** Sheets carried. Meaningful only for role 'sheet'; null when undeterminable. */
  sheets: number | null;
}

/** Copies of each plan physically lodged with the Surveyor-General. */
const COPIES_PER_PLAN: Record<PlanFileFamily, number> = {
  diagram: 3,
  general: 1,
};

/**
 * Classify one file. Returns null when it is not a plan product at all (a .jpg scan, a note).
 *
 * A diagram is ALWAYS one sheet — a domain rule, not a measurement. The letter never prints a
 * diagram sheet count, so this assumption cannot produce a wrong number; it can only omit one
 * that was never wanted. It is what lets a 60-diagram project be tallied without opening 60 PDFs.
 */
export function classifyPlanFile(
  file: ManifestFile,
  family: PlanFileFamily,
): ClassifiedPlanFile | null {
  const name = file?.name || '';

  if (/\.dxf$/i.test(name)) return { role: 'cad', sheets: 0 };
  // Checked before the general .pdf case: the summary is a PDF, and is never lodged.
  if (/-summary\.pdf$/i.test(name)) return { role: 'summary', sheets: 0 };
  if (/\.pdf$/i.test(name)) {
    const sheets = family === 'diagram'
      ? 1
      : (typeof file.pageCount === 'number' ? file.pageCount : null);
    return { role: 'sheet', sheets };
  }
  return null;
}

export interface PlanFamilyTally {
  /** Files with role 'sheet' — i.e. distinct lodged plans. */
  plans: number;
  /** Sheets summed across them. null if ANY contributing plan's count is unknown. */
  sheets: number | null;
  /** plans x copies-per-plan. */
  copies: number;
  /** Files with role 'cad'. */
  dxf: number;
}

/**
 * Tally one family's files.
 *
 * Receives the already folder-and-keyword-filtered files for a letter row, not the whole
 * manifest — deciding which folder a row owns stays in DOCUMENT_RULES where it already lives.
 */
export function tallyPlanFamily(
  files: ManifestFile[],
  family: PlanFileFamily,
): PlanFamilyTally {
  let plans = 0;
  let dxf = 0;
  let sheets: number | null = 0;

  for (const file of files || []) {
    const classified = classifyPlanFile(file, family);
    if (!classified) continue;
    if (classified.role === 'cad') {
      dxf++;
      continue;
    }
    if (classified.role !== 'sheet') continue;
    plans++;
    // Once unknown, stay unknown: a partial sum would read as authoritative while being short.
    if (sheets !== null) {
      sheets = classified.sheets === null ? null : sheets + classified.sheets;
    }
  }

  return { plans, sheets, copies: plans * COPIES_PER_PLAN[family], dxf };
}
