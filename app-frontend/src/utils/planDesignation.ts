/**
 * Builds the lodgement cover-letter subject. Unlike the general-plan title
 * wording (which clips the " of ..." clause) this keeps the full township
 * phrase — inclusive of the parent-property clause — so the letter states the
 * same designation as the accompanying documents.
 */

/** Compress stand names into "a - b, c" ranges. Port of the backend formatStandRanges. */
export function formatStandRanges(standNames: string[]): string {
  if (!standNames || standNames.length === 0) return '';

  const numeric: number[] = [];
  const nonNumeric: string[] = [];
  for (const name of standNames) {
    const n = parseInt(name, 10);
    if (!isNaN(n) && String(n) === String(name).trim()) numeric.push(n);
    else if (name != null && String(name).trim() !== '') nonNumeric.push(String(name));
  }

  numeric.sort((a, b) => a - b);

  const parts: string[] = [];
  let i = 0;
  while (i < numeric.length) {
    let j = i;
    while (j + 1 < numeric.length && numeric[j + 1] === numeric[j] + 1) j++;
    parts.push(j === i ? String(numeric[i]) : `${numeric[i]} - ${numeric[j]}`);
    i = j + 1;
  }
  for (const name of nonNumeric) parts.push(name);
  return parts.join(', ');
}

/** Extract the township phrase from a surveyOf string. Mirrors _buildTitleBlockTexts. */
export function extractTownship(surveyOf: string): string {
  const raw = (surveyOf || '').trim();
  const withoutStandsPrefix = raw.replace(/^Stands?\s+[\d,\s\-–]+/i, '').trim();
  return withoutStandsPrefix.replace(/\s+of\s+.+$/i, '').trim();
}

/**
 * The township phrase a certificate header shows: the designation with its
 * leading stand ranges stripped but the " of ..." clause kept, e.g.
 * "STANDS 271-339, 346-349 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A"
 * → "MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A".
 *
 * Narrower than extractTownship (which clips the " of ..." clause for the
 * general-plan title block) and deliberately not the project's short name.
 */
export function townshipPhrase(surveyOf: string): string {
  const raw = (surveyOf || '').trim();
  return raw.replace(/^Stands?\s+[\d,\s\-–]+/i, '').trim();
}

/** Build the plan-title subject, e.g. "STANDS 207 - 270, 340 - 345 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A". */
export function buildPlanDesignation(standNames: string[], surveyOf: string): string {
  const ranges = formatStandRanges(standNames);
  const township = townshipPhrase(surveyOf);
  let out: string;
  if (ranges) out = township ? `Stands ${ranges} ${township}` : `Stands ${ranges}`;
  else if (township) out = township;
  else return '';
  return out.toUpperCase();
}

/**
 * Compose the township phrase from the structured project fields — e.g.
 * "BRACKENHURST TOWNSHIP OF STAND 87 BRACKENHURST TOWNSHIP". Stand ranges are
 * deliberately absent: the sheet builders rebuild them from the surveyed
 * parcels. An empty township yields '' so callers can fall back to the stored
 * designation/surveyOf for legacy projects; an empty parent yields just the
 * township (the checkbox-off "whole township" case).
 */
export function composeSurveySource(township: string, parentProperty?: string): string {
  const t = String(township || '').trim().replace(/\s+/g, ' ');
  const p = String(parentProperty || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return p ? `${t} OF ${p}` : t;
}

/** Build the designation subject from the structured fields: "STANDS <range> <TOWNSHIP> OF <PARENT>". */
export function composeDesignation(standNames: string[], township: string, parentProperty?: string): string {
  return buildPlanDesignation(standNames, composeSurveySource(township, parentProperty));
}

/** Collapse stray whitespace so a pasted surveyOf string prints cleanly. */
export function normalizeDesignation(surveyOf: string): string {
  return (surveyOf || '').trim().replace(/\s+/g, ' ');
}

/**
 * The one parcel-designation phrase shared by the Coordinate List, General
 * Plans, Working Plan and Dispensation Certificate. Mirrors the backend
 * general-plan title block (pdfkitGeoPDF.js _buildTitleBlockTexts): when the
 * actual stand names of the sheet are known the phrase is rebuilt from the
 * stand ranges + township, so every document states the designation the same
 * way the general plan does. Without stands the authored surveyOf is the
 * designation, used as written.
 */
export function designationPhrase(surveyOf: string, standNames: string[] = []): string {
  const ranges = formatStandRanges(standNames);
  const township = extractTownship(surveyOf);
  let out: string;
  if (ranges) out = township ? `Stands ${ranges} ${township}` : `Stands ${ranges}`;
  else out = normalizeDesignation(surveyOf);
  return out ? out.toUpperCase() : '';
}

/**
 * The lodgement-designation phrase with the parent-property clause kept, in
 * caps, e.g. "STANDS 271 - 288, 290 - 339, 346 - 349 MAGLAS TOWNSHIP OF SHABANI
 * MINE SURFACE RIGHTS A". Used by the Coordinate List and Field Book cover so
 * the lodged documents state the same full designation as the cover letter.
 * When the actual stand names of the sheet are known the phrase is rebuilt from
 * the stand ranges + full township phrase; without stands the authored surveyOf
 * is used as written.
 */
export function fullDesignationPhrase(surveyOf: string, standNames: string[] = []): string {
  const ranges = formatStandRanges(standNames);
  const township = townshipPhrase(surveyOf);
  let out: string;
  if (ranges) out = township ? `Stands ${ranges} ${township}` : `Stands ${ranges}`;
  else out = normalizeDesignation(surveyOf);
  return out ? out.toUpperCase() : '';
}

/**
 * "SURVEY OF <designation>" — the dispensation certificate title. Unlike the
 * general-plan phrase (designationPhrase) it keeps the full township name, e.g.
 * "SURVEY OF STANDS 271 - 339, 346 - 349 MAGLAS TOWNSHIP OF SHABANI MINE
 * SURFACE RIGHTS A": the certificate is a legal document, names the parent land
 * in full, and has no separate parent-property line to carry it.
 */
export function surveyOfTitle(surveyOf: string, standNames: string[] = []): string {
  const phrase = fullDesignationPhrase(surveyOf, standNames);
  return phrase ? `SURVEY OF ${phrase.toUpperCase()}` : '';
}
