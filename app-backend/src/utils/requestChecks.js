/**
 * Checks that turn "Postgres choked on it" (a 500) into "you sent something wrong" (a 400),
 * before a query is ever built.
 */

const MAX_INT4 = 2147483647

/** A database row id as it arrives in a URL or query string: digits only, within int4. */
export function isRowId(value) {
  if (typeof value === 'number') value = String(value)
  return typeof value === 'string' && /^[0-9]{1,10}$/.test(value) && Number(value) <= MAX_INT4
}

/** Finite number from a number or a plain numeric string; null when it is neither. */
export function toFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(value)) return Number(value)
  return null
}

/**
 * Problems in a batch of coordinate points, one sentence each, naming the row. Empty = fine.
 * Row numbers are 1-based, as the surveyor counts them in the CSV.
 */
export function describePointProblems(points, { max = 20 } = {}) {
  const problems = []
  const seen = (row, name, what) => {
    if (problems.length < max) problems.push(`Row ${row}${name ? ` (${name})` : ''}: ${what}`)
  }
  points.forEach((pt, i) => {
    const row = i + 1
    if (pt === null || typeof pt !== 'object') return seen(row, '', 'is not a point')
    const name = pt.name === undefined || pt.name === null ? '' : String(pt.name).trim()
    if (!name) seen(row, '', 'the beacon name is blank')
    if (toFinite(pt.y) === null) seen(row, name, 'Y is not a number')
    if (toFinite(pt.x) === null) seen(row, name, 'X is not a number')
    if (pt.elevation !== undefined && pt.elevation !== null && pt.elevation !== '' && toFinite(pt.elevation) === null) seen(row, name, 'the elevation is not a number')
  })
  return problems
}
