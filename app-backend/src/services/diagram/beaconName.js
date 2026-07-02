import { normalizeCapeLoYX } from '../pdfkitGeoPDF/geometry.js'

/**
 * Name of the beacon coincident with a subject vertex, matched by nearest
 * coordinate within `tolM` metres. `vertexYX` is canonical [Y=Westing, X=Southing];
 * beacon points may be raw [Southing, Westing] (normalized here). Returns '' if none.
 */
export function resolveVertexBeaconName(vertexYX, beacons, tolM = 0.5) {
  const features = beacons?.features ?? []
  if (!features.length || !Array.isArray(vertexYX)) return ''
  const [vy, vx] = vertexYX
  let best = ''
  let bestDist = tolM
  for (const f of features) {
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c)) continue
    const [by, bx] = normalizeCapeLoYX(c[0], c[1])
    const d = Math.hypot(by - vy, bx - vx)
    if (d <= bestDist) {
      const p = f.properties ?? {}
      const name = p.name ?? p.beacon_name ?? p.id
      best = name == null ? '' : String(name)
      bestDist = d
    }
  }
  return best
}
