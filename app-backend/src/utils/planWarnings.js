/**
 * The plan renderer's structured warnings, as short plain sentences a surveyor can read.
 *
 * The renderer raises warnings such as "Plan too dense for the largest paper; some
 * blocks may overlap the figure" or "Coordinate tick marks drawn over a plan block".
 * Each already carries a human `hint`; nothing used to send them anywhere except the
 * server log, so a plan with a known fault was delivered without a word. They now travel
 * in the X-Plan-Warnings response header (see routes/geopdf-vector.js), the way the DXF
 * warnings already travel in X-DXF-Warnings.
 */

/**
 * What the plan's blocks are called on the plan. The generators' hints name them by their
 * internal key ("scheduleOfAreas block rendered over the parcel figure"); a surveyor
 * reads them by their heading.
 */
const BLOCK_LABELS = {
  outsideFigureData: 'Outside Figure Data',
  scheduleOfAreas: 'Schedule of Areas',
  beaconDescription: 'Beacon Description',
  surveyStatement: 'Survey Statement',
  servitudeStatement: 'Servitude Statement',
  sgSignature: "Surveyor-General's signature",
}

/** One sentence per warning: its `hint`, plus a count when it has one. */
export function warningHints(warnings, prefix = '') {
  if (!warnings || typeof warnings !== 'object') return []
  return Object.entries(warnings).map(([key, w]) => {
    const raw = typeof w?.hint === 'string' && w.hint.trim() ? w.hint.trim() : key
    const hint = raw.replace(/^([A-Za-z]+) block /, (m, name) => `${BLOCK_LABELS[name] ?? name} block `)
    const count = typeof w?.count === 'number' && w.count > 1 ? ` (${w.count} places)` : ''
    return `${prefix}${hint}${count}`
  })
}

/**
 * The header value for a list of warnings, or null when there is nothing to say.
 * HTTP header values are limited in size and must be plain ASCII, so each sentence is
 * cut and cleaned, the list is capped, and the cut is stated ("+3 more").
 */
export function encodeWarningsHeader(list, { maxItems = 8, maxChars = 220 } = {}) {
  const clean = [...new Set((list ?? []).filter((s) => typeof s === 'string' && s.trim()))]
    .map((s) => s.replace(/[^\x20-\x7E]/g, '?').slice(0, maxChars))
  if (clean.length === 0) return null
  const shown = clean.slice(0, maxItems)
  if (clean.length > maxItems) shown.push(`+${clean.length - maxItems} more`)
  return JSON.stringify(shown)
}
