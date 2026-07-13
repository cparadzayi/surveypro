/**
 * Reproduces the backend general-plan title wording (pdfkitGeoPDF.js:
 * formatStandRanges + the township extraction in _buildTitleBlockTexts) so the
 * lodgement-letter subject reads identically to the general plan.
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

/** Build the plan-title subject, e.g. "STANDS 207 - 270, 340 - 345 MAGLAS TOWNSHIP". */
export function buildPlanDesignation(standNames: string[], surveyOf: string): string {
  const ranges = formatStandRanges(standNames);
  const township = extractTownship(surveyOf);
  let out: string;
  if (ranges) out = township ? `Stands ${ranges} ${township}` : `Stands ${ranges}`;
  else if (township) out = township;
  else return '';
  return out.toUpperCase();
}
