/**
 * SI 727, para (5) of the section on beacons on a boundary: is a new beacon on the line between the parent
 * property's beacons?
 *
 *   "a beacon shall be deemed to be not on the true and correct boundary when its perpendicular displacement
 *    from such boundary exceeds 0,06 + 0,000 25d metre, with a maximum of one metre, where "d" is the distance
 *    in metres from such a beacon to the nearest terminal ...
 *    Provided that -- (i) a beacon need not be moved to correct its alignment when its displacement does not
 *    exceed 0,06 + 0,000 5d metre, with a maximum of one metre; (ii) when it is necessary to correct alignment,
 *    a beacon, if not replaced on line, shall be used to indicate the unbeaconed point adopted as a corner of
 *    the land under survey."
 *
 * So three bands: 'on-line' (within the first limit), 'may-stay' (deemed off the true boundary, but within
 * proviso (i)'s limit, so it need not be moved), and 'correct' (proviso (ii): replace it on line, or use it to
 * indicate the unbeaconed corner).
 *
 * Which line: a NEW beacon (placed in this survey) whose neighbours include two PARENT beacons (found, from the
 * previous survey) on either side of it -- the parent's boundary runs between those two, and the new beacon
 * should be on it. Its neighbours are the beacons next to it on any parcel boundary, the beacons its connections
 * tie to, and, for each side through it, the nearest parent beacon on that side carried on (within one metre,
 * para (5)'s maximum). That last one is what catches a beacon too far off line to have been given a connection.
 * A beacon more than one metre off every such line is a corner of the figure, not a beacon on a line, and is not
 * reported.
 */

/** Para (5)'s maximum displacement, metres. */
export const ALIGNMENT_MAX_M = 1

/** The two limits for a beacon `d` metres from the nearest terminal: [deemed off the boundary, must be moved]. */
export function alignmentLimits(d) {
  return {
    limit: Math.min(0.06 + 0.00025 * d, ALIGNMENT_MAX_M),
    moveLimit: Math.min(0.06 + 0.0005 * d, ALIGNMENT_MAX_M),
  }
}

/** The band a displacement falls in. */
export function alignmentBand(offset, d) {
  const { limit, moveLimit } = alignmentLimits(d)
  if (offset <= limit) return 'on-line'
  if (offset <= moveLimit) return 'may-stay'
  return 'correct'
}

const yx = (p) => (p ? { y: Number(p.y ?? p.Y), x: Number(p.x ?? p.X) } : null)

/**
 * @param {object} input
 * @param {string[][]} input.rings          every parcel's ring of beacon names (the remainder's included)
 * @param {Map<string,{y?:number,x?:number,Y?:number,X?:number}>} input.points  coordinates by name (3 dp)
 * @param {(name:string) => boolean} input.isParent  true for a beacon of the parent property (found, not placed)
 * @param {{fromBeacon:string,toBeacon:string}[]} [input.connections]  connections drawn on the diagrams
 * @returns {{beacon:string,from:string,to:string,offset:number,d:number,nearest:string,limit:number,moveLimit:number,band:'on-line'|'may-stay'|'correct'}[]}
 */
export function beaconAlignment({ rings, points, isParent, connections = [] }) {
  const at = (n) => {
    const p = yx(points.get(n))
    return p && Number.isFinite(p.y) && Number.isFinite(p.x) ? p : null
  }
  const neighbours = new Map()
  const add = (a, b) => {
    if (!a || !b || a === b) return
    if (!neighbours.has(a)) neighbours.set(a, new Set())
    neighbours.get(a).add(b)
  }
  const parents = [...points.keys()].filter((n) => isParent(n) && at(n))

  for (const ring of rings ?? []) {
    const r = (ring ?? []).filter(Boolean)
    const n = r.length
    if (n < 3) continue
    for (let i = 0; i < n; i++) {
      const v = r[i]
      add(v, r[(i + 1) % n])
      add(v, r[(i + n - 1) % n])
      // Each side through v, carried on past it: the nearest parent beacon ahead, within para (5)'s maximum.
      const V = at(v)
      if (!V || isParent(v)) continue
      for (const p of [r[(i + n - 1) % n], r[(i + 1) % n]]) {
        const P = at(p)
        if (!P) continue
        const len = Math.hypot(V.y - P.y, V.x - P.x)
        if (!(len > 0)) continue
        const uy = (V.y - P.y) / len, ux = (V.x - P.x) / len
        let best = null
        for (const e of parents) {
          if (e === v || e === p) continue
          const E = at(e)
          const along = (E.y - V.y) * uy + (E.x - V.x) * ux
          if (!(along > 0)) continue
          if (Math.abs((E.y - V.y) * ux - (E.x - V.x) * uy) > ALIGNMENT_MAX_M) continue
          if (!best || along < best.along) best = { e, along }
        }
        if (best) add(v, best.e)
      }
    }
  }
  for (const c of connections ?? []) add(c?.fromBeacon, c?.toBeacon)

  const out = []
  for (const [v, set] of neighbours) {
    const V = at(v)
    if (!V || isParent(v)) continue
    const olds = [...set].filter((n) => isParent(n) && at(n))
    let best = null
    for (let i = 0; i < olds.length; i++) {
      for (let j = i + 1; j < olds.length; j++) {
        const A = at(olds[i]), B = at(olds[j])
        const ly = B.y - A.y, lx = B.x - A.x, L = Math.hypot(ly, lx)
        if (!(L > 0)) continue
        const t = ((V.y - A.y) * ly + (V.x - A.x) * lx) / (L * L)
        if (t <= 0 || t >= 1) continue
        const offset = Math.abs((V.y - A.y) * lx - (V.x - A.x) * ly) / L
        if (offset > ALIGNMENT_MAX_M) continue
        if (best && best.offset <= offset) continue
        const dA = Math.hypot(V.y - A.y, V.x - A.x), dB = Math.hypot(V.y - B.y, V.x - B.x)
        const [from, to] = [olds[i], olds[j]].sort()
        best = { beacon: v, from, to, offset, d: Math.min(dA, dB), nearest: dA <= dB ? olds[i] : olds[j] }
      }
    }
    if (!best) continue
    const { limit, moveLimit } = alignmentLimits(best.d)
    out.push({ ...best, limit, moveLimit, band: alignmentBand(best.offset, best.d) })
  }
  return out.sort((a, b) => a.beacon.localeCompare(b.beacon, undefined, { numeric: true }))
}

/** One sentence for a result, as the Calculations and the Report on Survey state it. */
export function describeAlignment(r) {
  const mm = (v) => `${(v * 1000).toFixed(0)} mm`
  const head = `${r.beacon} is ${mm(r.offset)} off the line ${r.from} - ${r.to} (d = ${r.d.toFixed(2)} m to ${r.nearest}; limit ${mm(r.limit)})`
  if (r.band === 'on-line') return `${head}: on line.`
  if (r.band === 'may-stay') return `${head}: deemed not on the true boundary, but within ${mm(r.moveLimit)}, so it need not be moved (proviso (i)).`
  return `${head}: more than ${mm(r.moveLimit)}, so its alignment must be corrected -- replace it on line, or use it to indicate the unbeaconed corner (proviso (ii)).`
}
