/**
 * Designations for the points a cut creates.
 *
 * splitFigure returns newPoints as bare { y, x }. A point needs a designation
 * before it can be a row in the Coordinate List, an entry in the Calculations
 * pages, or anything a surveyor can refer to. The LETTER each sheet gives it is
 * a different thing, per sheet, and letterPart already supplies that.
 *
 * Every point returned carries provenance '-' (spec Decision 6): defined by a
 * click, so neither found nor placed. Coordinates pass through untouched --
 * figureSplit rounded them once at creation, and rounding again is how the
 * outside-figure table and the Coordinate List come to disagree in the last
 * digit.
 *
 * New objects are returned. The inputs are shared with the part rings and with
 * the caller's own figure, so writing a name onto one would travel.
 */
export function nameCutPoints(newPoints, takenNames, prefix = 'C') {
  const points = Array.isArray(newPoints) ? newPoints : []
  const taken = new Set(
    (Array.isArray(takenNames) ? takenNames : [])
      .map((n) => String(n ?? '').trim().toUpperCase())
      .filter((n) => n !== ''),
  )

  let next = 1
  return points.map((p) => {
    let name = `${prefix}${next}`
    while (taken.has(name.toUpperCase())) {
      next += 1
      name = `${prefix}${next}`
    }
    taken.add(name.toUpperCase())
    next += 1
    return { y: p.y, x: p.x, name, status: '-' }
  })
}
