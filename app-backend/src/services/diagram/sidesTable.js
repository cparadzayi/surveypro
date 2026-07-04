import { bankersRound, roundBearingSouth } from '../../utils/zim-geo.js'
import { resolveVertexBeaconName } from './beaconName.js'

/** Whole-degree/minute/second breakdown of a decimal-degree bearing. */
export function toDMS(deg) {
  // SI 727: round the arcsecond half-to-even (banker's rounding).
  let total = bankersRound(deg * 3600, 0)
  total = ((total % 1296000) + 1296000) % 1296000
  const d = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return { d, m, s }
}

/**
 * SI 727 area statement value with units, banker's-rounded: below 1 hectare →
 * whole square metres ("4047 square metres"); 1 hectare or more → hectares to
 * 4 decimals ("1.2345 hectares").
 */
export function formatDiagramArea(areaM2) {
  const a = Math.abs(Number(areaM2) || 0)
  const ha = a / 10000
  if (ha >= 1) {
    return `${bankersRound(ha, 4).toFixed(4)} hectares`
  }
  return `${bankersRound(a, 0)} square metres`
}

function signed(value) {
  const v = Number(value)
  const fixed = Math.abs(v).toFixed(2)
  return (v < 0 ? '-' : '+') + fixed
}

function pad2(n) { return String(n).padStart(2, '0') }

/**
 * Build the SIDES / DIRECTIONS / CO-ORDINATES table model. Const row is
 * 0.00/0.00 (full coordinates are carried in the coordinate rows).
 */
export function buildSidesTable(geometry, beacons) {
  const constRow = { y: signed(0), x: signed(0) }
  const coordinateRows = geometry.vertices.map(v => ({
    letter: v.letter,
    y: signed(v.y),
    x: signed(v.x),
    beaconName: resolveVertexBeaconName([v.y, v.x], beacons),
  }))
  const sideRows = geometry.sides.map(s => {
    // SI 727: nearest 10″ for sights under 6000 m, else nearest 1″ (banker's).
    const res = Number(s.distance) < 6000 ? 10 : 1
    const { d, m, s: sec } = toDMS(roundBearingSouth(s.bearingDeg, res))
    return {
      side: s.side,
      metres: Number(s.distance).toFixed(2),
      direction: `${d} ${pad2(m)} ${pad2(sec)}`,
    }
  })
  return { constRow, coordinateRows, sideRows }
}

/** "A.B.C…A." — the closed vertex-letter sequence for the figure statement. */
export function buildFigureRepresents(geometry) {
  const letters = geometry.vertices.map(v => v.letter)
  if (letters.length === 0) return ''
  return letters.concat(letters[0]).join('.') + '.'
}
