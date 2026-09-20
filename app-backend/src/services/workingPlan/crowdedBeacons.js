/**
 * Beacons that plot on top of each other at the sheet's scale.
 *
 * Crowding is a fact about the paper, not the ground. 87D and 87DNew of
 * Brackenhurst Township are 0.061 m apart; at 1:2000 that is 0.03 mm, so both
 * conventional signs land inside the same dot and the two names print over each
 * other. The same 0.061 m drawn as a detail is perfectly legible. Nothing about
 * the ground changed -- only the scale did -- so the test has to be made in
 * paper millimetres converted to ground at the scale actually chosen.
 *
 * What the caller does with a cluster is draw it as its own inset, which is the
 * only way to show a reader that two marks exist where the figure has room for
 * one.
 */

/**
 * How close, in paper millimetres, is too close.
 *
 * A found-beacon sign is 2.5 mm across, so two signs whose centres are nearer
 * than this touch or overlap outright, and their names have nowhere to go. It
 * is deliberately a little wider than the sign: a pair that merely grazes is
 * still unreadable once both are lettered.
 */
export const INSET_CROWD_MM = 4

/**
 * Group beacons that lie within `minSeparation` ground metres of each other.
 *
 * Single-link, and deliberately so: if A crowds B and B crowds C, all three
 * belong to one inset. Splitting them into the pairs (A,B) and (B,C) would draw
 * B twice and still leave a figure where B sits under both its neighbours.
 *
 * Returns clusters of two or more, each ordered by name, the list itself
 * ordered by its first name, so the same sheet always numbers its insets the
 * same way. A lone beacon is not crowded and is not returned.
 *
 * @param {Array<{name: string, e: number, n: number}>} beacons ground east/north
 * @param {number} minSeparation ground metres; below this, two beacons collide
 * @returns {Array<Array<{name: string, e: number, n: number}>>}
 */
export function crowdedClusters(beacons, minSeparation) {
  const pts = (beacons ?? []).filter(
    (b) => b && Number.isFinite(b.e) && Number.isFinite(b.n),
  )
  if (pts.length < 2 || !(minSeparation > 0)) return []

  // Union-find over "is within minSeparation of", which gives single-link
  // grouping without having to reason about merge order.
  const parent = pts.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a, b) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].e - pts[j].e, pts[i].n - pts[j].n)
      if (d < minSeparation) union(i, j)
    }
  }

  const groups = new Map()
  pts.forEach((p, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(p)
  })

  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => String(a.name).localeCompare(String(b.name))))
    .sort((a, b) => String(a[0].name).localeCompare(String(b[0].name)))
}
