/**
 * What counts as a calculated point, decided once.
 *
 * A calculated point is derived rather than visited: no beacon was placed and
 * nothing was measured on the ground. That distinction decides which documents
 * it may appear in — it belongs in the Calculations and the Co-ordinate List,
 * and never in the Field Book, which records observations.
 *
 * This existed as three different predicates, each stricter than the last:
 *
 *   TwoPassDocumentGenerator  description contains "calculated"
 *   comprehensive-document    ...or status C / CALC
 *   coordinate-list           ...or description contains "not beaconed"
 *
 * So a point recorded as status "C" with description "Not Beaconed" — which is
 * how 87DNew reached this project — was calculated to two of them and observed
 * to the weakest, and duly appeared in a field book of observations. The three
 * spellings are not alternatives to choose between; they are all in real data,
 * and the union of them is the definition.
 */
export interface CalculatedPointLike {
  status?: string | null;
  description?: string | null;
}

export function isCalculatedPoint(point: CalculatedPointLike | null | undefined): boolean {
  const status = (point?.status ?? '').trim().toLowerCase();
  const description = (point?.description ?? '').trim().toLowerCase();

  return (
    status === 'c' ||
    status === 'calc' ||
    status.includes('calculated') ||
    description.includes('calculated') ||
    // "Not beaconed" says the same thing from the other side: a position with no
    // peg in the ground was computed, not observed.
    description.includes('not beaconed')
  );
}
