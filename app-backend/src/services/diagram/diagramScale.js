import { normalizeCapeLoYX } from '../pdfkitGeoPDF/geometry.js'

const PT_PER_MM = 72 / 25.4

// SI 727 prescribed base ladder (denominators), ascending.
const SCALE_LADDER = [
  100, 125, 150, 200, 250, 300, 400, 500, 600, 750,
  1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500,
  10000, 12500, 15000, 20000, 25000,
]

/**
 * Beacon-circle radius in POINTS (page-relative), so vertices stay visible at
 * the print scale regardless of 1:N. Mirrors the developed-plan log-scaled
 * sizing (0.75 mm base, gentle growth with the denominator) but clamped a touch
 * larger for the single-parcel diagram. Returns 2.0–3.5 pt (~1.4–2.5 mm dia).
 */
export function beaconRadiusPt(denom) {
  const d = Number(denom) || 500
  const baseRadiusMM = 0.75
  const scaleFactor = 1 + 0.15 * Math.log10(Math.max(500, d) / 500)
  const r = baseRadiusMM * scaleFactor * PT_PER_MM
  return Math.max(2.0, Math.min(3.5, r))
}

export function parcelExtent(subjectFeature) {
  const ring = subjectFeature?.geometry?.coordinates?.[0] ?? []
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity
  for (const p of ring) {
    // Normalize to canonical [Y=Westing, X=Southing] before measuring.
    const [y, x] = normalizeCapeLoYX(p[0], p[1])
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  return { minY, maxY, minX, maxX, widthM: maxY - minY, heightM: maxX - minX }
}

/** metres → points at scale 1:denom. */
function metresToPt(metres, denom) {
  return (metres / denom) * 1000 * PT_PER_MM
}

export function pickDiagramScale(extent, figureAreaPt, requestedScale) {
  const fits = (denom) =>
    metresToPt(extent.widthM, denom) <= figureAreaPt.width &&
    metresToPt(extent.heightM, denom) <= figureAreaPt.height

  // A requested scale is a FLOOR, not a licence to overflow.
  //
  // This branch used to return the request verbatim, without ever consulting
  // `fits`. A 1:1000 request over a 291 x 282 m extent draws 291 x 282 mm of
  // paper — wider than A4 is — and `makeTransform` CENTRES the result, so the
  // overflow came off equally on both sides: the top ran off the sheet and the
  // bottom landed squarely on the scale bar, which sits just under the figure
  // box. The figure box cannot clip, because nothing draws a clip path here, so
  // the figure and the bar ended up printed on top of each other.
  //
  // The fix is the same rule the plan path already uses for a declared sheet
  // size: honour the request when it fits, otherwise step up the ladder to the
  // smallest scale that does. A diagram at 1:1250 is a correct diagram; one with
  // the scale bar through the middle of it is not.
  const m = typeof requestedScale === 'string' && requestedScale.match(/1\s*:\s*(\d+)/)
  if (m) {
    const requested = Number(m[1])
    if (fits(requested)) return { denom: requested, label: `1:${requested}` }
    // Step UP (larger denominator = smaller drawing) until it fits. If even the
    // coarsest rung overflows, that is a genuinely unplottable extent; return the
    // coarsest rather than something that runs off the page.
    const coarser = SCALE_LADDER.filter((d) => d >= requested)
    const denom = coarser.find(fits) ?? SCALE_LADDER[SCALE_LADDER.length - 1]
    return { denom, label: `1:${denom}`, escalatedFrom: requested }
  }
  const denom = SCALE_LADDER.find(fits) ?? SCALE_LADDER[SCALE_LADDER.length - 1]
  return { denom, label: `1:${denom}` }
}

/**
 * Map Cape Lo coordinates to points inside figureAreaPt ({x,y,width,height}),
 * north-up and east-right. Input may be raw [Southing, Westing] or canonical
 * [Y=Westing, X=Southing]; it is normalized first. Easting (=−Westing) → horizontal
 * (east to the right), Southing → vertical (south downward, so north is up). Centred.
 */
export function makeTransform(extent, figureAreaPt, denom) {
  const drawW = metresToPt(extent.widthM || 1, denom)
  const drawH = metresToPt(extent.heightM || 1, denom)
  const ox = figureAreaPt.x + (figureAreaPt.width - drawW) / 2
  const oy = figureAreaPt.y + (figureAreaPt.height - drawH) / 2
  // Stays a plain callable — every caller uses it as `tf(coord)` — with the
  // true extent of the drawing hung off it. Exposed because the overlap that
  // motivated pickDiagramScale's escalation is otherwise silent: nothing here
  // clips, so a drawing larger than the figure box simply overruns it, and the
  // caller has no way to notice except by trusting the scale picker.
  const tf = (coord) => {
    const [y, x] = normalizeCapeLoYX(coord[0], coord[1])
    return {
      // East to the right: most-west maps to the left edge, most-east to the right.
      px: ox + ((extent.maxY - y) / (extent.widthM || 1)) * drawW,
      // North up: increasing Southing goes downward.
      py: oy + ((x - extent.minX) / (extent.heightM || 1)) * drawH,
    }
  }
  tf.drawW = drawW
  tf.drawH = drawH
  tf.bottomPt = oy + drawH   // must stay above the scale bar
  tf.topPt = oy
  tf.overflows =
    drawW > figureAreaPt.width + 0.5 || drawH > figureAreaPt.height + 0.5
  return tf
}
