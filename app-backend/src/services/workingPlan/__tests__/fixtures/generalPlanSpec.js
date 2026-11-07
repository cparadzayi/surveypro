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
