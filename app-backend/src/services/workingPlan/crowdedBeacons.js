/**
 * Beacons that plot on top of each other at the sheet's scale.
 *
 * Crowding is a fact about the paper, not the ground. 87D and 87DNew of
 * Brackenhurst Township are 0.061 m apart; at 1:2000 that is 0.03 mm, so both
 * conventional signs land inside the same dot and the two names print over each
 * other. Nothing about the ground changed -- only the scale did -- so the test
 * has to be made in paper millimetres converted to ground at the scale actually
 * chosen.
 *
 * The test, though, is whether ONE sign has been swallowed by the other: two
 * adjacent point symbols earn their own inset only when they overlap by more
 * than half. Two identical signs reach exactly that once one centre passes
 * inside the other -- d < r -- and for a small sign against a large one the
 * same rule (d < the LARGER radius) buries more than half of it too. Any pair
 * merely near each other, or merely touching, still reads as two marks and
 * stays on the figure.
 *
 * What the caller does with a cluster is draw it as its own inset, which is the
 * only way to show a reader that two marks exist where the figure has room for
 * one.
 */

/**
 * Group beacons whose signs overlap by more than half.
 *
 * `radiusOf` answers, for each beacon, how far its conventional sign reaches in
 * the same units as `e` and `n` (ground metres once the caller has converted
 * the paper radius at the sheet's scale). Two beacons crowd when the distance
 * between their centres is less than the larger reach -- the centre of one lies
 * inside the other's sign. At exactly the larger reach the overlap is half, not
 * more than half, so the test is strict.
 *
 * Single-link, and deliberately so: if A crowds B and B crowds C, all three
 * belong to one inset. Splitting them into the pairs (A,B) and (B,C) would draw
 * B twice and still leave a figure where B sits under both its neighbours.
 *
 * Returns clusters of two or more, each ordered by name, the list itself
 * ordered by its first name, so the same sheet always numbers its insets the
 * same way. A lone beacon is not crowded and is not returned.
 *
 * @param {Array<{name: string, e: number, n: number, symbol: string}>} beacons
 * @param {(b) => number} radiusOf ground units; per-sign reach of the beacon
 * @returns {Array<Array<{name: string, e: number, n: number}>>}
 */
export function crowdedClusters(beacons, radiusOf) {
  const radius = typeof radiusOf === 'function' ? radiusOf : () => 0
  const pts = (beacons ?? []).filter(
    (b) => b && Number.isFinite(b.e) && Number.isFinite(b.n),
  )
  if (pts.length < 2) return []

  // Union-find over "is more than half overlapped by", which gives single-link
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
      const ri = radius(pts[i]), rj = radius(pts[j])
      const reach = Math.max(
        Number.isFinite(ri) && ri > 0 ? ri : 0,
        Number.isFinite(rj) && rj > 0 ? rj : 0,
      )
      if (reach > 0 && d < reach) union(i, j)
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