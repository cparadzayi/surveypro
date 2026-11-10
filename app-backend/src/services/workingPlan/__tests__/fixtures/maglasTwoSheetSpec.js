/**
 * A two-sheet General Plan's working plan, from a surveyor's real project (maglas1686, Shabani): the outside
 * figure M26-M42-M75-M43-M44-M27, the cut CP3-CP2-CP1-M27 that divides it into Sheet 1 and Sheet 2, and each
 * sheet's stands. Sheet polygons and stand assignment are what the app's own split (app-shared figureSplit and
 * sheetDerivation) produced from the stored cut. Coordinates as the project stores them (Y westing, X southing).
 */
import { partyWallRows } from './generalPlanSpec.js'

const P = (name, y, x) => ({ name, X: x, Y: y, symbol: 'placed', label: 'auto' })
const beacons = [
  P('CP1', 97266.71, 2247924),
  P('CP2', 97319.01, 2248011.25),
  P('CP3', 97198.25, 2248084.45),
  P('M26', 97297.16, 2247788.25),
  P('M27', 97349.68, 2247874.87),
  P('M42', 97093.05, 2247909.18),
  P('M43', 97249.88, 2248170.46),
  P('M44', 97456.77, 2248046.44),
  P('M75', 97131.04, 2247972.47),
]
const poly = (pts) => pts.map(([y, x]) => ({ X: x, Y: y }))

export function maglasTwoSheetSpec() {
  return {
    kind: 'general', scale: 'auto', orientation: 'portrait', beacons,
    parcels: [{ label: 'STANDS 1213, 1665 - 1737, 1868, 1870 - 1897, 1899 - 2060', ring: ['M26', 'M42', 'M75', 'M43', 'M44', 'M27'] }],
    sheets: [
      { number: 1, stands: 'STANDS 1665 - 1685, 1868, 1870 - 1897, 1899 - 1995', polygon: poly([[97198.25, 2248084.45], [97319.01, 2248011.25], [97266.71, 2247924], [97349.68, 2247874.87], [97297.16, 2247788.25], [97093.05, 2247909.18], [97131.04, 2247972.47]]) },
      { number: 2, stands: 'STANDS 1213, 1686 - 1737, 1996 - 2060', polygon: poly([[97349.68, 2247874.87], [97266.71, 2247924], [97319.01, 2248011.25], [97198.25, 2248084.45], [97249.88, 2248170.46], [97456.77, 2248046.44]]) },
    ],
    splitLines: [poly([[97198.25, 2248084.45], [97319.01, 2248011.25], [97266.71, 2247924], [97349.68, 2247874.87]])],
    title: ['WORKING PLAN OF', 'STANDS 1213, 1665 - 1737, 1868, 1870 - 1897, 1899 - 2060 MAGLAS TOWNSHIP', 'OF SHABANI MINE SURFACE RIGHTS A', 'SHABANI DISTRICT'],
    certificate: { line1: 'Surveyed in July 2021 by me,', line2: 'Land Surveyor' },
    approvalBox: true,
    partyWalls: partyWallRows(56),
  }
}
