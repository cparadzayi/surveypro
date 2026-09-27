/**
 * What each sheet of a multi-part general plan states about itself.
 *
 * Every point here is { y, x } in Lo metres -- y easting, x southing -- the same
 * shape figureSplit.js produces and a coordinate_points row carries.
 *
 * This module consumes the part rings splitFigure returns. Those rings share
 * point OBJECTS with each other and with the caller's figure, so nothing here
 * writes to a point; lettering comes back as a separate array.
 *
 * See docs/superpowers/specs/2026-09-26-multi-sheet-outside-figure-split-design.md
 */

import { pointInRing, segmentIntersection } from './figureSplit.js'

/**
 * Area-weighted centroid of an open ring.
 *
 * Not the mean of the vertices: on an L-shaped figure that lands in the notch,
 * outside the figure, and a sheet ordered by it would sort by where its corners
 * happen to be rather than where its land is.
 */
export function centroid(ring) {
  let twiceArea = 0
  let cy = 0
  let cx = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]
    const b = ring[i]
    const cross = a.y * b.x - b.y * a.x
    twiceArea += cross
    cy += (a.y + b.y) * cross
    cx += (a.x + b.x) * cross
  }
  if (twiceArea === 0) {
    // A degenerate ring has no area to weight by. Fall back to the mean so this
    // can never return NaN into a sort comparator.
    const n = ring.length || 1
    return {
      y: ring.reduce((s, p) => s + p.y, 0) / n,
      x: ring.reduce((s, p) => s + p.x, 0) / n,
    }
  }
  return { y: cy / (3 * twiceArea), x: cx / (3 * twiceArea) }
}

/**
 * The sheet number for each part, in the order the parts were given.
 *
 * Spec Decision 10: north to south, then west to east, BY CENTROID -- which is a
 * two-key sort, southing first. `x` is southing, so the smaller `x` sorts first;
 * `y` is easting, so within one southing the smaller `y` sorts first.
 *
 * An earlier version grouped parts into bands of overlapping southing RANGE and
 * ordered west to east inside a band, meaning to give a reader tidy rows. It was
 * wrong, and not subtly: one part spanning the southing extent of two otherwise
 * disjoint rows chained them into a single band, and the sheets then interleaved
 * the rows -- north-west, south-west, north-east, south-east. A cut that leaves
 * one wide part beside two stacked narrower ones produces exactly that, so it was
 * ordinary geometry, not a contrivance. Sorting on the centroid cannot interleave
 * rows, because the sequence it produces is monotonic in southing by
 * construction.
 *
 * The cost is the case that motivated the banding: two parts in one visual row
 * whose centroids differ slightly in southing are ordered by that difference
 * rather than west to east. That is a left-right swap within a row, against a
 * whole-plan zigzag, and it is what Decision 10's wording actually asks for --
 * the primary key is north to south, and a part whose middle lies further north
 * IS further north.
 */
export function orderSheets(parts) {
  return parts
    .map((ring, index) => ({ index, c: centroid(ring) }))
    .sort((a, b) => a.c.x - b.c.x || a.c.y - b.c.y)
    .reduce((sheetOf, p, i) => {
      sheetOf[p.index] = i + 1
      return sheetOf
    }, new Array(parts.length))
}

/**
 * Whether `part` holds the stand bounded by `ring`.
 *
 * Any vertex inside is enough, and the centroid is checked too so a stand larger
 * than the part it sits in is still placed. A stand cannot legitimately be half
 * in: standsCrossedBy refuses a cut that would slice one, so a stand matching two
 * parts is a symptom, not a case to resolve.
 */
const CROSSING_EPS = 1e-9

/** Whether two segments cross at a point interior to BOTH of them.
 *
 *  `segmentIntersection`'s bounds are inclusive by design -- figureSplit needs a
 *  touch at a ring vertex to register -- so it reports two rings that merely
 *  ABUT as intersecting. Two stands either side of the cut share that boundary
 *  without sharing any area, and treating the touch as overlap refused every one
 *  of them: every real split, in other words. So the endpoints are excluded here.
 */
function crossesProperly(a1, a2, b1, b2) {
  const hit = segmentIntersection(a1, a2, b1, b2)
  if (!hit) return false
  for (const end of [a1, a2, b1, b2]) {
    if (Math.abs(hit.y - end.y) < CROSSING_EPS && Math.abs(hit.x - end.x) < CROSSING_EPS) {
      return false
    }
  }
  return true
}

/**
 * Whether two rings share AREA, not merely a boundary.
 *
 * Three ways in, because no one of them is sufficient:
 *
 *   A vertex of either lying strictly inside the other. `pointInRing` is already
 *   strict -- a point on an edge is not inside -- which is what keeps two
 *   abutting stands apart.
 *
 *   The centroid of either lying inside the other. This is what catches
 *   CONTAINMENT: a stand covering the whole of a part, but extending past it,
 *   has no vertex strictly inside the part and shares three boundary lines with
 *   it, so nothing else notices. That case used to be refused as missing from the
 *   plan -- a valid survey rejected.
 *
 *   A proper crossing of edges. Two rings can overlap with no vertex of either
 *   inside the other and neither centroid inside the other.
 */
function ringsOverlap(a, b) {
  if (a.some((p) => pointInRing(b, p))) return true
  if (b.some((p) => pointInRing(a, p))) return true
  if (pointInRing(b, centroid(a))) return true
  if (pointInRing(a, centroid(b))) return true
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]
    for (let k = 0; k < b.length; k++) {
      if (crossesProperly(a1, a2, b[k], b[(k + 1) % b.length])) return true
    }
  }
  return false
}

export function assignStands(parts, stands) {
  const bySheet = parts.map(() => [])
  const unplaceable = []
  const holderCount = new Map()

  let anyStraddles = false

  for (const stand of stands ?? []) {
    if (!stand) continue

    // A PUBLIC PLACE is exempt entirely -- not assigned, not refused, whether it
    // carries a ring or not. A road legitimately spans the cut: that is what the
    // cut runs down. `standsCrossedBy` exempts it unconditionally for the same
    // reason, and an earlier version of this function exempted it only when the
    // ring was ABSENT, so the moment roads were digitised the two rules
    // contradicted each other -- the split was accepted and then the road it ran
    // along was reported as straddling. Public places also carry no schedule row
    // (the Seventh Schedule sentence describes them collectively), so they have
    // no place in `bySheet` either.
    if (stand.isPublicPlace === true) continue

    if (!Array.isArray(stand.ring) || stand.ring.length < 3) {
      unplaceable.push(stand.name)
      holderCount.set(stand.name, 0)
      continue
    }

    const holders = []
    for (let i = 0; i < parts.length; i++) {
      if (ringsOverlap(parts[i], stand.ring)) holders.push(i)
    }
    holderCount.set(stand.name, holders.length)

    if (holders.length === 1) bySheet[holders[0]].push(stand.name)
    else {
      unplaceable.push(stand.name)
      if (holders.length > 1) anyStraddles = true
    }
  }

  if (unplaceable.length > 0) {
    // When the offenders are of mixed kinds, report the more serious one. A
    // straddling stand is lodged twice and has its area counted twice; an
    // off-plan stand is merely absent. Reporting by the FIRST offender, as an
    // earlier version did, told a surveyor to go looking for missing geometry
    // when the real fault was a cut needing to be moved.
    return {
      ok: false,
      error: anyStraddles ? 'stand-straddles-sheets' : 'stand-off-plan',
      stands: unplaceable,
    }
  }

  return { ok: true, bySheet }
}

/**
 * The letter for a 0-based vertex position: A..Z, then AA, AB, ...
 *
 * A developed township's outside figure runs past 26 vertices. The fallback
 * elsewhere in this codebase is String.fromCharCode(65 + i), which yields '[' at
 * 26 -- do not copy it.
 */
export function vertexLetter(index) {
  // A negative or fractional index used to return '@' and similar, which would
  // have been lettered onto a lodged sheet with nothing to say it was wrong. A
  // bad index here is a programming error, so it is loud.
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`vertexLetter: index must be a non-negative integer, got ${index}`)
  }
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/**
 * The letter for each vertex of ONE part, by position.
 *
 * Returned as an array rather than written onto the points, because a part ring
 * shares its point objects with the other part and with the caller's figure.
 * Spec Part 4 requires the same physical point to carry a different letter on
 * each sheet, which is exactly what annotating a shared object cannot do: the
 * second part would overwrite the first, and the surveyor's own figure would be
 * mutated too. Index this array with the vertex's position.
 */
export function letterPart(part) {
  return part.map((_, i) => vertexLetter(i))
}

/** Spec Decision 11. Both forms contain "outside figure", so the substring
 *  predicate every consumer uses keeps working unchanged. */
export function figureLabel(sheetNumber, totalSheets) {
  return totalSheets > 1 ? `Outside Figure Sheet ${sheetNumber}` : 'Outside Figure'
}

/**
 * The other sheets this one is read with, for multiSheetTemplate's
 * {otherSheets}. Empty string when there are none.
 *
 * An empty return is a SIGNAL, not a value to interpolate. A single-sheet plan
 * uses `figureDescription.template`, not `multiSheetTemplate` -- they are
 * siblings on the same block. Interpolating '' into the multi-sheet sentence
 * produces "the figures on , represents", which would be lodged as written.
 * `figureLabel(1, 1)` returning the plain name is for Decision 11's naming rule;
 * it is not permission to use the multi-sheet wording for one sheet.
 */
export function otherSheetsPhrase(sheetNumber, totalSheets) {
  const others = []
  for (let n = 1; n <= totalSheets; n++) if (n !== sheetNumber) others.push(String(n))
  if (others.length === 0) return ''
  if (others.length === 1) return `Sheet ${others[0]}`
  return `Sheets ${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`
}

/**
 * The plan's stand range, for {standRange}.
 *
 * Compared as NUMBERS: this survey carries 87 and 1720 together, and a string
 * sort reads 1720 before 87, and 100 before 99. A stand with a letter sorts on
 * its number first, so 2833A follows 2469.
 */
/**
 * A stand's identity for ranging: its leading number, then whatever follows.
 *
 * So '087' and '87' are one stand, and a trailing space is not a second one --
 * but '2833A' and '2833' stay distinct, because a lettered stand is its own
 * parcel. A name with no leading digits keys on its text alone.
 */
function standKey(text) {
  const digits = text.match(/^\d+/)
  return digits ? `${parseInt(digits[0], 10)}|${text.slice(digits[0].length)}` : `~|${text}`
}

/**
 * The plan's stand range, for {standRange}.
 *
 * Compared as NUMBERS: this survey carries 87 and 1720 together, and a string
 * sort reads 1720 before 87, and 100 before 99. A stand with a letter sorts on
 * its number first, so 2833A follows 2469.
 *
 * Names are deduplicated on `standKey`, not on their literal text. An earlier
 * version deduplicated on the string, which was one character away from useless:
 * ['1686', '1686 '] still produced "1686 to 1686 " -- the very self-range the
 * dedupe was added to remove -- and ['087', '87'] reported one stand as a
 * two-stand range. The numeric key was already being computed two lines below for
 * the sort; now both use it.
 *
 * Blank and nullish names are dropped rather than printed: "null to 1686" and
 * " to 1686" both used to reach the sentence. A non-array argument yields an
 * empty string instead of throwing.
 *
 * Names are expected to be NUMBERED stands. A remainder or an outside figure is
 * not one, and the caller excludes those already -- `isRemainderParcel` and
 * `isOutsideFigureParcel` in `app-frontend/src/utils/designationParcels.ts`. This
 * function does not second-guess that: a non-numeric name sorts last and prints
 * as given, so it is visible rather than silently dropped.
 */
export function standRange(names) {
  if (!Array.isArray(names)) return ''

  const firstByKey = new Map()
  for (const raw of names) {
    const text = String(raw ?? '').trim()
    if (text === '') continue
    const key = standKey(text)
    if (!firstByKey.has(key)) firstByKey.set(key, text)
  }

  const sorted = [...firstByKey.values()].sort((a, b) => {
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b)
    return na !== nb ? na - nb : a.localeCompare(b)
  })

  if (sorted.length === 0) return ''
  if (sorted.length === 1) return sorted[0]
  return `${sorted[0]} to ${sorted[sorted.length - 1]}`
}

