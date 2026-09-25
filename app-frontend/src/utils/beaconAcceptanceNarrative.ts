/**
 * Automatic composition of the "Found Beacons" clause of a Report on Survey.
 *
 * Mirrors the wording used by Zimbabwe A.T.C. survey reports, e.g.
 *   "Beacons 86B, 86C, 87A ... and reference marks RM15 and RM16 from previous
 *    survey (SR 11418), were found. After comparison, positions of all the found
 *    beacons/stations except 87D and RM15 were accepted after the comparison of
 *    coordinates. The coordinates of all found and accepted beacons were adopted
 *    as final coordinates."
 *
 * The accepted/rejected split is computed from the s.67(5) comparison result
 * already carried on each FoundBeacon — useFoundBeaconsComparison.ts's
 * buildFoundBeacons() sets `adopted` and `discrepancy.withinTolerance` straight
 * from the engine's ACCEPT/REJECT verdict — plus the surveyor's own exercise of
 * `adopted`/`rejectionReason` on imported beacons.
 */

import type { FoundBeacon, ReportOnSurveyData } from '../types/cadastral';

export interface FoundBeaconsNarrative {
  /** Found beacons whose positions were accepted. */
  acceptedFound: FoundBeacon[];
  /** Found beacons NOT adopted (the exceptions). */
  rejectedFound: FoundBeacon[];
  /** Previous-survey reference (SR ../GP ../Deed) when known. */
  previousSurveySR?: string;
  /** Sentence 1: "Beacons A, B and reference marks RM1 were found (from SR ...)." */
  foundSentence: string;
  /** Sentence 2: acceptance verdict after comparison, naming exceptions. */
  comparisonSentence: string;
  /** Sentence 3: adoption of final coordinates. */
  adoptionSentence: string;
  /** The three sentences concatenated into one paragraph. */
  fullText: string;
}

const REF_MARK_PATTERN = /^rm[-\s]?/i;

/** True when the beacon id denotes a reference mark (RM15, RM-3, ...). */
export function isReferenceMark(beaconId: string): boolean {
  return REF_MARK_PATTERN.test(beaconId.trim());
}

/** Natural-language list: ["A","B","C"] -> "A, B, and C" (serial comma, as the
 *  sample reports use: "… 87D, 88X2 and reference marks …"). */
export function joinNatural(items: string[]): string {
  const cleaned = items.filter((i) => i.trim().length > 0);
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

/**
 * True when a found beacon was NOT adopted. A beacon is taken to be rejected
 * when the surveyor said so (`adopted === false`) or, when the decision is
 * unset, the s.67(5) comparison or an explicit rejection reason flags it.
 * An untouched beacon (no engine verdict, no decision) is kept as accepted —
 * the report should not invent exceptions the surveyor never recorded.
 */
export function isFoundBeaconRejected(beacon: FoundBeacon): boolean {
  if (beacon.adopted === true) return false;
  if (beacon.adopted === false) return true;
  return beacon.discrepancy?.withinTolerance === false || !!beacon.rejectionReason;
}

/** Compose the full Found Beacons paragraph from comparison-derived data. */
export function buildFoundBeaconsNarrative(
  reportData: ReportOnSurveyData
): FoundBeaconsNarrative {
  const found = (reportData.beacons ?? []).filter((b) => b.status === 'found');
  const rejectedFound = found.filter(isFoundBeaconRejected);
  const acceptedFound = found.filter((b) => !isFoundBeaconRejected(b));

  const previousSurveySR =
    reportData.beaconComparison?.originalSRNumber?.trim() ||
    found
      .map((b) => b.originalData?.srNumber?.trim() || '')
      .find((sr) => sr.length > 0) ||
    undefined;

  const allNames = found.map((b) => b.beaconId.trim()).filter((n) => n.length > 0);
  const beaconNames = allNames.filter((n) => !isReferenceMark(n));
  const rmNames = allNames.filter((n) => isReferenceMark(n));

  // The sample reports comma-separate the beacon list without a conjunction
  // ("Beacons 86B, 86C, 87A, 87B, 87C, 87D, 88X2 and reference marks RM15 and
  // RM16"); "and" only joins the beacon group to the reference-mark group.
  const parts: string[] = [];
  if (beaconNames.length) parts.push(`${beaconNames.length === 1 ? 'Beacon' : 'Beacons'} ${beaconNames.join(', ')}`);
  if (rmNames.length) parts.push(`${rmNames.length === 1 ? 'reference mark' : 'reference marks'} ${joinNatural(rmNames)}`);

  let foundSentence: string;
  if (parts.length === 0) {
    foundSentence = 'No beacons were found.';
  } else {
    // "... Beacons A, B and reference marks RM1 from previous survey (SR ...),
    //  were found." — the previous-survey clause qualifies the beacon list, so
    //  it sits before the "were found" clause, matching the report's wording.
    foundSentence = parts.join(' and ');
    if (previousSurveySR) foundSentence += ` from previous survey (${previousSurveySR})`;
    const itemCount = beaconNames.length + rmNames.length;
    foundSentence += itemCount === 1 ? ', was found.' : ', were found.';
  }

  const rejectedNames = rejectedFound.map((b) => b.beaconId.trim()).filter((n) => n.length > 0);
  const comparisonSentence = rejectedNames.length
    ? `After comparison, positions of all the found beacons/stations except ${joinNatural(rejectedNames)} were accepted after the comparison of coordinates.`
    : 'After comparison, positions of all the found beacons/stations were accepted after the comparison of coordinates.';

  const adoptionSentence =
    'The coordinates of all found and accepted beacons were adopted as final coordinates.';

  return {
    acceptedFound,
    rejectedFound,
    previousSurveySR,
    foundSentence,
    comparisonSentence,
    adoptionSentence,
    fullText: `${foundSentence} ${comparisonSentence} ${adoptionSentence}`,
  };
}