/** Whole-degree/minute/second breakdown of a decimal-degree bearing. */
export function toDMS(deg) {
  let total = Math.round(deg * 3600) // total arc-seconds, rounded
  total = ((total % 1296000) + 1296000) % 1296000
  const d = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return { d, m, s }
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
export function buildSidesTable(geometry) {
  const constRow = { y: '0.00', x: '0.00' }
  const coordinateRows = geometry.vertices.map(v => ({
    letter: v.letter,
    y: signed(v.y),
    x: signed(v.x),
  }))
  const sideRows = geometry.sides.map(s => {
    const { d, m, s: sec } = toDMS(s.bearingDeg)
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
