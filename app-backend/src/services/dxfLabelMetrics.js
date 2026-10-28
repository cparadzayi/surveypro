/**
 * The DXF beacon labels, counted against the surveyor's label rules.
 *
 * generateDXF() returns `labelMetrics` (every label it placed, with the stands and figure it
 * placed them against). This turns that into numbers, the way pdfkitGeoPDF's labelMetrics feeds
 * the PDF label gate, so a change to the DXF placement that breaks a rule fails a test instead of
 * being found on a printed plan.
 *
 * Frame: DXF ground metres, y up. A TEXT entity is inserted at its baseline-left point; its ink is
 * `capHeight` tall and `width` wide (the width is the placer's estimate: characters x height x the
 * 0.55 width factor every entity carries), turned `rot` degrees counter-clockwise about that point.
 *
 * Pure: no I/O, no module state.
 */
import { isPointInPolygon } from './dxfGeometry.js'
import { rotatedBoxClear } from './pdfkitGeoPDF/beaconClusterInset.js'

const DEG = Math.PI / 180

/** Ground metres -> typographic points on paper at 1:scale. */
export const groundToPt = (m, scaleDenominator) => (m * 1000 / scaleDenominator) * (72 / 25.4)

/** Centre of a label's ink box. */
export function inkCentre(l) {
  const r = (l.rot || 0) * DEG
  const hw = l.width / 2, hh = l.capHeight / 2
  return {
    x: l.x + Math.cos(r) * hw - Math.sin(r) * hh,
    y: l.y + Math.sin(r) * hw + Math.cos(r) * hh,
  }
}

/** Every side of a ring as {x1,y1,x2,y2}, closing side included. */
export function ringSegments(ring) {
  const out = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  return out
}

/**
 * @param {{scaleDenominator:number, beaconRadius:number,
 *          labels:Array<object>, parcels:Array<{stand:string, ring:Array<{x:number,y:number}>}>,
 *          figure:Array<{x:number,y:number}>|null}} m  generateDXF().labelMetrics
 */
export function summariseDxfLabels(m) {
  const S = m.scaleDenominator
  const letters = m.labels.filter((l) => l.inside)
  const names = m.labels.filter((l) => !l.inside)
  const allSegments = m.parcels.flatMap((p) => ringSegments(p.ring))
  const ringOf = new Map(m.parcels.map((p) => [p.stand, p.ring]))
  const figureSegments = m.figure ? ringSegments(m.figure) : []

  const lettersOverLines = []
  const lettersNotInOwnStand = []
  const lettersInForeignStand = []
  let lettersMaxDist = 0
  for (const l of letters) {
    const c = inkCentre(l)
    if (!rotatedBoxClear(c.x, c.y, l.width, l.capHeight, l.rot || 0, allSegments, 0)) lettersOverLines.push(l.name)
    const own = l.standKey != null ? ringOf.get(l.standKey) : null
    if (!own || !isPointInPolygon(c, own)) lettersNotInOwnStand.push(l.name)
    if (m.parcels.some((p) => p.stand !== l.standKey && isPointInPolygon(c, p.ring))) lettersInForeignStand.push(l.name)
    lettersMaxDist = Math.max(lettersMaxDist, Math.hypot(c.x - l.beacon.x, c.y - l.beacon.y))
  }

  // A beacon-name label at a corner of the outside figure must lie wholly outside it.
  const figureNamesOverFigure = []
  let figureNamesMaxDist = 0
  for (const l of names) {
    if (!l.onFigure || !m.figure) continue
    const c = inkCentre(l)
    const touches = isPointInPolygon(c, m.figure) || !rotatedBoxClear(c.x, c.y, l.width, l.capHeight, l.rot || 0, figureSegments, 0)
    if (touches) figureNamesOverFigure.push(l.name)
    figureNamesMaxDist = Math.max(figureNamesMaxDist, Math.hypot(c.x - l.beacon.x, c.y - l.beacon.y))
  }

  // A beacon name anywhere else (a corner shared by stands) should not be over a boundary line either.
  const otherNamesOverLines = []
  for (const l of names) {
    if (l.onFigure) continue
    const c = inkCentre(l)
    if (!rotatedBoxClear(c.x, c.y, l.width, l.capHeight, l.rot || 0, allSegments, 0)) otherNamesOverLines.push(l.name)
  }

  return {
    letterCount: letters.length,
    nameCount: names.length,
    lettersOverLines,
    lettersNotInOwnStand,
    lettersInForeignStand,
    minLetterCapPt: letters.length ? Math.min(...letters.map((l) => groundToPt(l.capHeight, S))) : Infinity,
    // Letters the shared fit could only place squeezed or shrunk well below size: in the PDF these go to an inset.
    crampedLetters: letters.filter((l) => l.cramped).length,
    lettersMaxDist,
    lettersMaxDistOverRadius: m.beaconRadius ? lettersMaxDist / m.beaconRadius : 0,
    figureNamesOverFigure,
    figureNamesMaxDist,
    otherNamesOverLines,
  }
}
