/**
 * The Status column, read once, for everything that needs it.
 *
 * A status answers two independent questions:
 *
 *   WHAT KIND of mark it is -- working station, reference mark, trig beacon.
 *   This picks the SI 727 Fifth Schedule conventional sign the working plan
 *   draws, and the heading the point falls under in the Co-ordinate List.
 *
 *   HOW IT CAME TO BE THERE -- found or placed. This is the Co-ordinate List's
 *   own column, which the Surveyor-General's form heads "F = Found P = Placed".
 *
 * The vocabulary could only carry one of them at a time. A station set out for
 * this survey and a station recovered from an earlier one were both "WS", and
 * coding either "P" or "F" instead lost the fact that it was a station at all.
 * The SG's sample coordinate list states both at once: ST1AD sits under the
 * "Working Stations" heading and carries P in the F/P column.
 *
 * So a status may name both halves, separated by a slash -- "WS/P", "WS/F". A
 * bare "WS", "P" or "TRIG" still means precisely what it always meant, so no
 * existing record changes meaning and no file has to be re-coded.
 */

/** Kinds that pick a conventional sign and a Co-ordinate List section. */
export type BeaconKind = 'WS' | 'WSU' | 'RM' | 'TRIG' | 'OCP';

/** How the mark came to be there: the F/P column. */
export type BeaconProvenance = 'F' | 'FN' | 'P';

export interface BeaconStatus {
  /** The kind of mark, or null when the status names only a provenance. */
  kind: BeaconKind | null;
  /** Found / found-not-adopted / placed, or null when not stated. */
  provenance: BeaconProvenance | null;
  /** Exactly what was recorded, for any column that prints it verbatim. */
  raw: string;
}

const KINDS = new Set<string>(['WS', 'WSU', 'RM', 'TRIG', 'OCP']);
const PROVENANCES = new Set<string>(['F', 'FN', 'P']);

/**
 * Split a status into the two facts it can carry.
 *
 * Order is not significant: a surveyor who writes "P/WS" means the same thing
 * as "WS/P", and there is nothing to be gained by refusing one of them. A half
 * that cannot be read is dropped without discarding the half that can.
 */
export function parseBeaconStatus(status: string | null | undefined): BeaconStatus {
  const raw = String(status ?? '');
  const result: BeaconStatus = { kind: null, provenance: null, raw };

  for (const part of raw.split('/')) {
    const token = part.trim().toUpperCase();
    if (!token) continue;
    if (result.kind === null && KINDS.has(token)) {
      result.kind = token as BeaconKind;
    } else if (result.provenance === null && PROVENANCES.has(token)) {
      result.provenance = token as BeaconProvenance;
    }
  }

  return result;
}

/** The kind half, or null. */
export function statusKind(status: string | null | undefined): BeaconKind | null {
  return parseBeaconStatus(status).kind;
}

/** The found/placed half, or null. */
export function statusProvenance(
  status: string | null | undefined,
): BeaconProvenance | null {
  return parseBeaconStatus(status).provenance;
}

/** Every spelling the Status column accepts, for validation and for guidance. */
export const BEACON_STATUS_CODES = [...KINDS, ...PROVENANCES];
