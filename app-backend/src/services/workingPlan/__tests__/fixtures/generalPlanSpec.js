/**
 * A General Plan's working plan, modelled on the Surveyor General's sample (FCMAG3, Maglas Township, 1:2500):
 * the outside figure alone (eight beacons M21-M27 round a roadway), one label naming every stand it holds,
 * and the party-wall servitude table. The corners are read off the sample's grid, so the figure is the same
 * L-shaped outline at the same scale.
 */

// Pixel positions on the sample at 130 dpi, converted through its grid (1 px = 0.49 m; X 2247500 at y 600 px,
// Y +97600 at x 330 px).
const px = (name, x, y) => ({
  name,
  X: Math.round((2247500 + (y - 600) * 0.489) * 100) / 100,
  Y: Math.round((97600 - (x - 330) * 0.4918) * 100) / 100,
  symbol: 'placed',
  label: 'auto',
})

export const generalBeacons = [
  px('M21', 718, 808), px('M18', 873, 897), px('M25', 768, 1078), px('M26', 939, 1186),
  px('M27', 836, 1362), px('M24', 361, 1078), px('M23', 468, 903), px('M22', 613, 987),
]

export const generalRing = ['M21', 'M18', 'M25', 'M26', 'M27', 'M24', 'M23', 'M22']

/** Rows in the sample's table: stands paired as semi-detached houses, the wall's beacon pair beside them. */
export function partyWallRows(n = 56) {
  const rows = []
  for (let i = 0; i < n; i++) {
    const a = 1295 + i * 2
    rows.push({ stands: `${a}, ${a + 1}`, boundary: `${a + 18}A – ${a}A` })
  }
  return rows
}

export function generalPlanSpec(rows = partyWallRows()) {
  return {
    kind: 'general',
    scale: 'auto',
    orientation: 'portrait',
    beacons: generalBeacons,
    parcels: [{ label: 'STANDS 1294 - 1421, 1423, 1425, 1427 - 1437, 1869', ring: generalRing }],
    title: ['WORKING PLAN OF', 'STANDS 1294 - 1421, 1423, 1425, 1427 - 1437, 1869 MAGLAS TOWNSHIP',
      'OF SHABANI MINE SURFACE RIGTHS A: SHABANI DISTRICT'],
    certificate: { line1: 'Surveyed in April 2021 by me,', line2: 'Land Surveyor' },
    approvalBox: true,
    roads: generalRing.map((from, i) => ({ name: 'Road', from, to: generalRing[(i + 1) % generalRing.length], part: 'name' })),
    partyWalls: rows,
    inset: { scale: 25000, beacons: [{ name: 'ST1', X: 2246800, Y: 97900, symbol: 'ws' }] },
  }
}

/**
 * The Maglas General Plan as a surveyor's real project (FCMAG3, Shabani): the eight beacons of the outside
 * figure, the long side tagged "Road", no locality inset. Coordinates as the project stores them.
 */
export function maglasNoInsetSpec() {
  const P = (name, y, x) => ({ name, X: x, Y: y, symbol: 'placed', label: 'auto' })
  const beacons = [
    P('M18', 97333.44, 2247645.31), P('M21', 97408.7, 2247602.54), P('M22', 97460.67, 2247689.71),
    P('M23', 97531.6, 2247646.94), P('M24', 97584.11, 2247733.56), P('M25', 97385.41, 2247734.11),
    P('M26', 97301.26, 2247785.72), P('M27', 97352.41, 2247873.21),
  ]
  const g = (n) => beacons.find((b) => b.name === n)
  const mx = (g('M24').X + g('M27').X) / 2, my = (g('M24').Y + g('M27').Y) / 2
  return {
    kind: 'general', scale: 'auto', orientation: 'portrait', beacons,
    parcels: [{ label: 'STANDS 1294 - 1421, 1423, 1425, 1427 - 1437, 1869', ring: ['M21', 'M18', 'M25', 'M26', 'M27', 'M24', 'M23', 'M22'] }],
    title: ['WORKING PLAN OF', 'STANDS 1294 - 1421, 1423, 1425, 1427 - 1437, 1869 MAGLAS TOWNSHIP', 'OF SHABANI MINE SURFACE RIGHTS A', 'SHABANI DISTRICT'],
    certificate: { line1: 'Surveyed in May 2021 by me,', line2: 'Land Surveyor' }, approvalBox: true,
    notes: [{ text: 'Road', X: mx + 14, Y: my + 20 }],
    partyWalls: partyWallRows(56),
  }
}
