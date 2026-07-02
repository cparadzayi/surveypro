import { normalizeCapeLoYX } from '../pdfkitGeoPDF/geometry.js'

const PT_PER_MM = 72 / 25.4

// SI 727 prescribed base ladder (denominators), ascending.
const SCALE_LADDER = [
  100, 125, 150, 200, 250, 300, 400, 500, 600, 750,
  1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500,
  10000, 12500, 15000, 20000, 25000,
]

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
  const m = typeof requestedScale === 'string' && requestedScale.match(/1\s*:\s*(\d+)/)
  if (m) {
    const denom = Number(m[1])
    return { denom, label: `1:${denom}` }
  }
  const fits = (denom) =>
    metresToPt(extent.widthM, denom) <= figureAreaPt.width &&
    metresToPt(extent.heightM, denom) <= figureAreaPt.height
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
  return (coord) => {
    const [y, x] = normalizeCapeLoYX(coord[0], coord[1])
    return {
      // East to the right: most-west maps to the left edge, most-east to the right.
      px: ox + ((extent.maxY - y) / (extent.widthM || 1)) * drawW,
      // North up: increasing Southing goes downward.
      py: oy + ((x - extent.minX) / (extent.heightM || 1)) * drawH,
    }
  }
}
