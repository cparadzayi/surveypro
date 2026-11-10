/**
 * Connecting data: the tie from a newly placed beacon to a parent beacon of the
 * survey being subdivided. The Surveyor-General requires the connection, and
 * the diagram shows it as a ray with an arrowhead, the distance lettered along
 * it, and a letter beyond the tip.
 *
 * Distance and bearing are COMPUTED from the two coordinates, never typed. The
 * numbers then cannot disagree with the coordinate list, and they follow the
 * coordinates if the survey is re-adjusted.
 */

import { bankersRound } from '@/utils/dms'

/** One connection, stored against beacon NAMES.
 *
 *  Not vertex letters: letters are assigned by ring index, so re-digitising a
 *  parcel silently reassigns them and a connection stored as 'B' would jump to
 *  a different corner. `side: 'AB'` already carries that weakness; this does
 *  not extend it. */
export interface Connection {
  /** The figure beacon the ray leaves. */
  fromBeacon: string
  /** The parent beacon it points at. */
  toBeacon: string
  /** Metres, computed. Carried so the renderer letters exactly what was shown
   *  when the surveyor approved it. */
  distanceM: number
  /** South-oriented degrees (0 = South, clockwise S→W→N→E) -- the SG/Cape
   *  cadastral convention the sides table already uses. Stored for the record;
   *  the renderers aim the ray from the coordinates themselves. */
  bearingDeg: number
}

/** A point in canonical Cape Lo terms: Y westing, X southing. */
export interface LoPoint { Y: number; X: number }

/**
 * Put a Cape Lo pair into canonical order, whichever way round it arrived.
 *
 * This is not defensiveness for its own sake: a parcel ring comes out of PostGIS
 * as [Southing, Westing] while a coordinate point arrives as y=Westing,
 * x=Southing. Comparing the two raw compares a westing against a southing, and
 * every match silently fails -- which is exactly what happened, leaving corners
 * that plainly had beacons reported as having none.
 *
 * A Southing is millions; a Westing is tens of thousands. That difference is
 * what tells them apart, and it mirrors the backend's normalizeCapeLoYX.
 */
export function toLoPoint(a: number, b: number): LoPoint {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { Y: a, X: b }
  const aa = Math.abs(a), ab = Math.abs(b)
  if ((aa > 1_000_000 && ab < 1_000_000) || aa > ab * 2) return { Y: b, X: a }
  return { Y: a, X: b }
}

/**
 * Name the beacon coincident with each ring vertex, in ring order, matching on
 * coordinate within `tolM` metres -- the same rule the backend uses to name
 * beacons in the sides table, so a corner named here is the corner named there.
 * A vertex with no beacon within tolerance gets '' rather than a wrong guess.
 */
export function vertexBeaconNames(
  ring: Array<[number, number]>,
  points: Map<string, LoPoint>,
  tolM = 0.5,
): string[] {
  const closed = ring.length > 1
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1]
  const pts = closed ? ring.slice(0, -1) : ring
  const named = [...points.entries()]
  return pts.map(([a, b]) => {
    const v = toLoPoint(a, b)
    let best = tolM
    let name = ''
    for (const [n, q] of named) {
      const d = Math.hypot(q.Y - v.Y, q.X - v.X)
      if (d <= best) { best = d; name = n }
    }
    return name
  })
}

const RAD = 180 / Math.PI

/** 0..360, south-oriented — mirrors the backend's normalizeBearingSouth. */
export function normalizeBearingSouth(deg: number): number {
  let d = deg % 360
  if (d < 0) d += 360
  return d
}

/**
 * South-oriented bearing from one point to another: 0 = South (increasing X),
 * 90 = West (increasing Y). Mirrors the backend `bearingSouthBetween`, so a
 * connection's bearing is in the same convention as the DIRECTIONS column of
 * the sides table on the same sheet.
 */
export function bearingSouthBetween(from: LoPoint, to: LoPoint): number {
  return normalizeBearingSouth(Math.atan2(to.Y - from.Y, to.X - from.X) * RAD)
}

/** Ground distance in metres. Lo coordinates are already metric and planar. */
export function distanceBetween(from: LoPoint, to: LoPoint): number {
  return Math.hypot(to.Y - from.Y, to.X - from.X)
}

/**
 * Build the stored record for a connection between two named beacons.
 * Returns null when either beacon is unknown, or when they coincide — there is
 * no direction to point, and an arrow drawn anyway would assert something false.
 */
export function makeConnection(
  fromBeacon: string,
  toBeacon: string,
  points: Map<string, LoPoint>,
): Connection | null {
  const a = points.get(fromBeacon)
  const b = points.get(toBeacon)
  if (!a || !b) return null
  const distanceM = distanceBetween(a, b)
  if (!(distanceM > 0)) return null
  return {
    fromBeacon,
    toBeacon,
    distanceM,
    bearingDeg: bearingSouthBetween(a, b),
  }
}

/** Replace any existing connection from the same beacon, keeping the rest.
 *  A beacon connects to one parent; recording a second for the same beacon
 *  means the surveyor changed their mind, not that both should be drawn. */
export function upsertConnection(list: Connection[], next: Connection): Connection[] {
  const rest = (list ?? []).filter(c => c.fromBeacon !== next.fromBeacon)
  return [...rest, next]
}

export function removeConnection(list: Connection[], fromBeacon: string): Connection[] {
  return (list ?? []).filter(c => c.fromBeacon !== fromBeacon)
}

/** Degrees to the ° ′ ″ the surveyor reads in the sides table. */
export function formatBearingDMS(deg: number): string {
  const total = Math.round(normalizeBearingSouth(deg) * 3600)
  const d = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${d} ${String(m).padStart(2, '0')} ${String(s).padStart(2, '0')}`
}

/* ------------------------------------------------------------------------------------------------------------
 * Connecting data, generated.
 *
 * A new subdivision parcel whose side, carried on past its corner, runs to a beacon that already stands on the
 * remaining extent is tied to that beacon: the Surveyor-General needs the distance along the side to the old
 * beacon, lettered where the dashed ray ends. Surveyors had to name each of these by hand; they follow from
 * the coordinates, so they are generated and the surveyor only overrides.
 * ---------------------------------------------------------------------------------------------------------- */

/** How far off a side's line an old beacon may stand and still be taken to lie on it, in metres. */
export const CONNECTION_LINE_TOL_M = 0.10

/** A connection can be marked dismissed: the surveyor cleared one the app had generated, and it stays cleared. */
export interface StoredConnection extends Connection { dismissed?: boolean }

export interface AutoConnectionInput {
  /** The figure's corners, in ring order, by beacon name ('' for a corner with no coordinated beacon). */
  corners: string[]
  /** The beacons of the remaining extent's ring. */
  remainder: string[]
  /** Every corner of every NEW parcel of the subdivision. A remainder corner among them is new, not old, and
   *  is no beacon to connect to: only beacons that stood before the subdivision qualify. */
  newBeacons: Iterable<string>
  points: Map<string, LoPoint>
  tolM?: number
}

/**
 * The connections a figure needs, one per corner at most.
 *
 * For each corner V, each of its two sides is carried on past V; an OLD remainder beacon E qualifies when it
 * stands on that line (within `tolM`), ahead of V, with no new beacon between. The nearest qualifying beacon
 * wins, and where both sides of a corner qualify, the nearer of the two. The distance is rounded to 2 decimal
 * places by banker's rounding, as every other figure on the diagram is, so what is lettered is what is stored.
 */
export function autoConnections(input: AutoConnectionInput): Connection[] {
  const { corners, remainder, points } = input
  const tol = input.tolM ?? CONNECTION_LINE_TOL_M
  const news = new Set([...input.newBeacons].map(String))
  const olds = [...new Set(remainder.map(String))].filter(n => !news.has(n) && points.has(n))
  const out: Connection[] = []
  const n = corners.length
  if (n < 3 || olds.length === 0) return out

  for (let i = 0; i < n; i++) {
    const v = corners[i]
    const V = v ? points.get(v) : undefined
    if (!V) continue
    // The two sides at V, as the directions they run in when carried on past V.
    const rays: LoPoint[] = []
    for (const j of [(i + n - 1) % n, (i + 1) % n]) {
      const P = corners[j] ? points.get(corners[j]) : undefined
      if (!P) continue
      const len = Math.hypot(V.Y - P.Y, V.X - P.X)
      if (!(len > 0)) continue
      rays.push({ Y: (V.Y - P.Y) / len, X: (V.X - P.X) / len })
    }
    let best: { name: string; along: number } | null = null
    for (const dir of rays) {
      for (const name of olds) {
        const E = points.get(name)!
        const dy = E.Y - V.Y, dx = E.X - V.X
        const along = dy * dir.Y + dx * dir.X
        if (!(along > tol)) continue
        if (Math.abs(dy * dir.X - dx * dir.Y) > tol) continue
        // a new beacon between V and E means the line runs into the subdivision first, not to the old beacon
        let blocked = false
        for (const w of news) {
          if (w === v) continue
          const W = points.get(w)
          if (!W) continue
          const wy = W.Y - V.Y, wx = W.X - V.X
          const wa = wy * dir.Y + wx * dir.X
          if (wa > tol && wa < along - tol && Math.abs(wy * dir.X - wx * dir.Y) <= tol) { blocked = true; break }
        }
        if (blocked) continue
        if (!best || along < best.along) best = { name, along }
      }
    }
    if (!best) continue
    const conn = makeConnection(v, best.name, points)
    if (conn) out.push({ ...conn, distanceM: bankersRound(conn.distanceM, 2) })
  }
  return out
}

/**
 * What a figure draws: the generated connections, with the surveyor's own over them. A stored connection from
 * a beacon replaces the generated one from it; a stored dismissal removes it. A stored connection from a beacon
 * the app would not generate stands as it was entered.
 */
export function mergeConnections(auto: Connection[], stored: StoredConnection[]): Connection[] {
  const have = new Set((stored ?? []).map(c => c.fromBeacon))
  const mine = (stored ?? []).filter(c => !c.dismissed)
  return [...mine, ...(auto ?? []).filter(c => !have.has(c.fromBeacon))]
}

/** Clear a connection. One the app generated cannot simply be removed (it would come straight back), so a
 *  dismissal is stored in its place; one the surveyor entered is just removed. */
export function dismissConnection(
  stored: StoredConnection[],
  fromBeacon: string,
  generated: boolean,
): StoredConnection[] {
  const rest = (stored ?? []).filter(c => c.fromBeacon !== fromBeacon)
  return generated
    ? [...rest, { fromBeacon, toBeacon: '', distanceM: 0, bearingDeg: 0, dismissed: true }]
    : rest
}
