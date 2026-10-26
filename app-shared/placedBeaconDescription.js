/**
 * The description of a placed beacon — the ONLY place the rule exists.
 *
 * Every beacon the surveyor places is a 12mm iron peg set in concrete. Survey
 * data (CSV imports, older projects) carries it as a bare "12mm iron peg", in any
 * letter case, so a placed beacon described that way reads "12mm iron peg in
 * concrete". Nothing else is touched: a found beacon keeps the description it was
 * found with, and so does any placed beacon with a different description (a pipe,
 * a cairn, "12mm iron peg and cairn").
 *
 * Applied at every WRITE door (backend, defensively) and every ENTRY point
 * (frontend, so the typed string equals the stored string) — never at display
 * sites, the same way as the beacon-name rule in beaconName.js.
 */

export const PLACED_BEACON_DESCRIPTION = '12mm iron peg in concrete'

const BARE_PEG = /^\s*12\s*mm\s+iron\s+peg\s*$/i

/** A placed status: "P", or "P/WS" and the like (a placed witness mark). */
export function isPlacedStatus(status) {
  return typeof status === 'string' && /^\s*p(\s*\/.*)?\s*$/i.test(status)
}

/**
 * '12mm iron peg' on a placed beacon → '12mm iron peg in concrete'; anything else
 * is returned unchanged (including null/undefined).
 */
export function placedBeaconDescription(status, description) {
  if (!isPlacedStatus(status)) return description
  return typeof description === 'string' && BARE_PEG.test(description) ? PLACED_BEACON_DESCRIPTION : description
}
