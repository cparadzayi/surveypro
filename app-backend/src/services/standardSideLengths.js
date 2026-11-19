/**
 * The side lengths a township's stands repeat, so a General Plan can state them once.
 *
 * An undeveloped township is laid out in blocks of stands of the same size, and every side of every stand used to carry
 * its own length: on a 217-stand plan three values (12.00, 25.00, 10.00) were 59% of the 656 lengths printed, and the
 * lengths and bearings together were 54% of all the text on the sheet. A length that repeats this often is stated once
 * in the title block ("unless otherwise shown, the sides of stands measure ...") and left off the sides that equal it.
 *
 * A length is STANDARD when it occurs on at least MIN_REPEATS sides and on at least MIN_SHARE of all of them: a handful
 * of equal sides on an irregular plan is a coincidence, not a layout, and keeps its figures.
 */
export const MIN_REPEATS = 8
export const MIN_SHARE = 0.03

/** A side length as the plan prints it: metres to the centimetre, so 11.999 and 12.001 are both "12.00". */
export function sideLengthKey(d) {
  const n = Number(d)
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : ''
}

const isOutsideFigure = (p) => {
  const props = p?.properties ?? {}
  return props.isOutsideFigure === true || /outside figure/i.test(String(props.stand ?? props.designation ?? props.name ?? ''))
}

/**
 * The standard lengths of a plan's stands, as keys (see sideLengthKey), ascending. `parcels` is the plan's GeoJSON
 * FeatureCollection; the Outside Figure's own sides are not stand sides and are not counted.
 */
export function standardSideLengths(parcels, { minRepeats = MIN_REPEATS, minShare = MIN_SHARE } = {}) {
  const counts = new Map()
  let total = 0
  for (const f of parcels?.features ?? []) {
    if (!f || isOutsideFigure(f)) continue
    for (const e of f.properties?.edges ?? []) {
      const k = sideLengthKey(e?.distanceRounded ?? e?.distance)
      if (!k || k === '0.00') continue
      counts.set(k, (counts.get(k) ?? 0) + 1)
      total++
    }
  }
  if (total === 0) return []
  return [...counts.entries()]
    .filter(([, n]) => n >= minRepeats && n / total >= minShare)
    .map(([k]) => k)
    .sort((a, b) => Number(a) - Number(b))
}

/** "12.00, 25.00 and 10.00": the lengths as they are printed, ascending. */
export function standardLengthsPhrase(keys) {
  const list = Array.isArray(keys) ? keys : []
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}
