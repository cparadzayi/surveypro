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

function southingRange(ring) {
  let min = Infinity
  let max = -Infinity
  for (const p of ring) {
    if (p.x < min) min = p.x
    if (p.x > max) max = p.x
  }
  return { min, max }
}

/**
 * The sheet number for each part, in the order the parts were given.
 *
 * Spec Decision 10: north to south, then west to east. Those are two orderings,
 * and one sort cannot express both -- two parts side by side would be ordered by
 * whichever centroid southing was smaller, so a left-right pair could come out
 * either way on a millimetre. Parts are therefore BANDED first: two share a band
 * when their southing ranges overlap, which needs no sheet size to decide. Bands
 * run north to south; parts run west to east inside a band.
 */
export function orderSheets(parts) {
  const described = parts.map((ring, index) => ({
    index,
    c: centroid(ring),
    range: southingRange(ring),
  }))

  const northFirst = [...described].sort((a, b) => a.c.x - b.c.x)

  const bands = []
  for (const part of northFirst) {
    const band = bands[bands.length - 1]
    // Strict: two ranges that merely touch at a shared boundary (e.g. [0,50]
    // and [50,100]) are adjacent, not overlapping, and must stay in separate
    // bands. A non-strict <=/>= here collapses touching bands into one.
    const overlaps = band && part.range.min < band.max && part.range.max > band.min
    if (overlaps) {
      band.parts.push(part)
      band.min = Math.min(band.min, part.range.min)
      band.max = Math.max(band.max, part.range.max)
    } else {
      bands.push({ parts: [part], min: part.range.min, max: part.range.max })
    }
  }

  const sheetOf = new Array(parts.length)
  let sheet = 1
  for (const band of bands) {
    for (const part of [...band.parts].sort((a, b) => a.c.y - b.c.y)) {
      sheetOf[part.index] = sheet++
    }
  }
  return sheetOf
}
