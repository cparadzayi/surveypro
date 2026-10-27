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
    const y = toFinite(pt.y), x = toFinite(pt.x)
    if (y === null) seen(row, name, 'Y is not a number')
    else if (!inRange(y)) seen(row, name, `Y is beyond ${MAX_COORDINATE_M / 1e6} million metres, which cannot be a survey position`)
    if (x === null) seen(row, name, 'X is not a number')
    else if (!inRange(x)) seen(row, name, `X is beyond ${MAX_COORDINATE_M / 1e6} million metres, which cannot be a survey position`)
    if (pt.elevation !== undefined && pt.elevation !== null && pt.elevation !== '' && toFinite(pt.elevation) === null) seen(row, name, 'the elevation is not a number')
  })
  return problems
}

/**
 * Largest magnitude any projected survey coordinate can have (a UTM northing tops out at 10 million
 * metres). Zimbabwe's Lo systems sit far inside it; anything beyond is a typo or a wrong column,
 * not a place. Deliberately loose: it rejects the impossible, not the merely unusual.
 */
export const MAX_COORDINATE_M = 1e7

const inRange = (n) => Math.abs(n) <= MAX_COORDINATE_M

/** A parcel boundary's problems as sentences; empty = a usable Polygon/MultiPolygon. */
export function describeGeometryProblems(geom) {
  if (geom && geom.type === 'Feature') geom = geom.geometry
  if (!geom || typeof geom !== 'object') return ['the boundary is missing']
  let polygons
  if (geom.type === 'Polygon') polygons = [geom.coordinates]
  else if (geom.type === 'MultiPolygon') polygons = geom.coordinates
  else return [`the boundary must be a Polygon, not ${geom.type ?? 'something else'}`]
  if (!Array.isArray(polygons) || polygons.length === 0) return ['the boundary has no rings']
  const problems = []
  polygons.forEach((rings, p) => {
    const where = polygons.length > 1 ? ` (part ${p + 1})` : ''
    if (!Array.isArray(rings) || rings.length === 0) return problems.push(`the boundary${where} has no rings`)
    rings.forEach((ring, r) => {
      const label = r === 0 ? `the outer ring${where}` : `hole ${r}${where}`
      if (!Array.isArray(ring) || ring.length < 4) return problems.push(`${label} needs at least 3 distinct corners (4 points, closed)`)
      const first = ring[0], last = ring[ring.length - 1]
      if (first?.[0] !== last?.[0] || first?.[1] !== last?.[1]) problems.push(`${label} is not closed (it must end where it starts)`)
      if (!ring.every((c) => Array.isArray(c) && c.length >= 2 && toFinite(c[0]) !== null && toFinite(c[1]) !== null)) {
        return problems.push(`${label} has a point that is not a pair of numbers`)
      }
      if (!ring.every((c) => inRange(toFinite(c[0])) && inRange(toFinite(c[1])))) problems.push(`${label} has a coordinate beyond ${MAX_COORDINATE_M / 1e6} million metres, which cannot be a survey position`)
    })
  })
  return problems
}
