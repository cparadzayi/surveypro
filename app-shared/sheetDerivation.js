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

import { pointInRing } from './figureSplit.js'

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
function partHolds(part, ring) {
  return ring.some((p) => pointInRing(part, p)) || pointInRing(part, centroid(ring))
}

/**
 * Which stands belong to which part.
 *
 * Each must land on exactly one. On none means the figure does not cover the
 * survey; on two means a slicing cut got through. Both refuse, naming EVERY
 * offending stand rather than the first, so the surveyor fixes the survey once
 * instead of meeting the next one on the next attempt.
 *
 * A PUBLIC PLACE with no usable ring is skipped rather than refused. Roads are
 * not digitised yet -- the same fact behind Decision 7's exemption -- and
 * refusing every split in a township until they are would make the tool
 * unusable. A non-public stand with no ring is still a refusal: that is missing
 * survey data, not an absent road.
 */
export function assignStands(parts, stands) {
  const bySheet = parts.map(() => [])
  const unplaceable = []
  const holderCount = new Map()

  for (const stand of stands ?? []) {
    if (!stand) continue
    const usable = Array.isArray(stand.ring) && stand.ring.length >= 3
    if (!usable) {
      if (stand.isPublicPlace === true) continue
      unplaceable.push(stand.name)
      holderCount.set(stand.name, 0)
      continue
    }

    const holders = []
    for (let i = 0; i < parts.length; i++) {
      if (partHolds(parts[i], stand.ring)) holders.push(i)
    }
    holderCount.set(stand.name, holders.length)

    if (holders.length === 1) bySheet[holders[0]].push(stand.name)
    else unplaceable.push(stand.name)
  }

  if (unplaceable.length > 0) {
    // Which error it is depends on how the FIRST offender failed: no part held
    // it, or more than one did. Counted while assigning, so this does not redo
    // the containment work.
    const straddles = (holderCount.get(unplaceable[0]) ?? 0) > 1
    return {
      ok: false,
      error: straddles ? 'stand-straddles-sheets' : 'stand-off-plan',
      stands: unplaceable,
    }
  }

  return { ok: true, bySheet }
}
