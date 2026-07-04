import { normalizeCapeLoYX } from '../pdfkitGeoPDF/geometry.js'

/**
 * Infer a beacon's description from its name when the data carries none.
 * Mirrors the name-pattern rules in block-definitions.js `classifyBeaconGroups`.
 */
function inferDescription(name) {
  const n = String(name || '')
  if (/^M\d+/i.test(n)) return 'Not beaconed'
  if (/^[A-Z]\d+$/i.test(n) || /^[A-Z]{2,}$/i.test(n)) return '50mm Iron Pipe in Concrete'
  return '12mm iron peg in concrete'
}

/**
 * Beacon-description lines for the SUBJECT parcel only. For each subject vertex,
 * pick the beacon coincident with it (nearest within `tolM` metres), take its
 * proper description (`properties.description`/`beacon_type`, else inferred from
 * the name), and group by description in vertex order. Returns
 * `[{ names, description }]`; a single entry means every subject beacon shares one
 * description (the renderer shows it as "All"). Beacons elsewhere in the dataset
 * (other parcels) are excluded.
 *
 * `geometry.vertices` are canonical [Y=Westing, X=Southing]; beacon points may be
 * raw [Southing, Westing] and are normalized here.
 */
export function buildBeaconDescription(geometry, beacons, tolM = 0.5) {
  const features = beacons?.features ?? []
  const vertices = geometry?.vertices ?? []
  const order = []              // descriptions in first-seen (vertex) order
  const namesByDesc = new Map()
  const used = new Set()

  for (const v of vertices) {
    let best = null
    let bestDist = tolM
    for (const f of features) {
      const c = f?.geometry?.coordinates
      if (!Array.isArray(c)) continue
      const [by, bx] = normalizeCapeLoYX(c[0], c[1])
      const d = Math.hypot(by - v.y, bx - v.x)
      if (d <= bestDist) { best = f; bestDist = d }
    }
    if (!best || used.has(best)) continue
    used.add(best)
    const p = best.properties ?? {}
    const name = String(p.name ?? p.beacon_name ?? p.id ?? '')
    const desc = String(p.description ?? p.beacon_type ?? '').trim() || inferDescription(name)
    if (!namesByDesc.has(desc)) { namesByDesc.set(desc, []); order.push(desc) }
    namesByDesc.get(desc).push(name)
  }

  return order.map((desc) => ({ names: namesByDesc.get(desc).join(', '), description: desc }))
}
