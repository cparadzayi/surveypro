import ClipperLib from 'clipper-lib'

const PT_SCALE = 100 // points → integer (0.01 pt precision)

/**
 * Planar polygon offset in an arbitrary coordinate space (used here in PDF
 * points). `points` is [[x,y], …]; `deltaPt` negative = inward. Returns the
 * offset ring(s) as [[x,y], …]; [] for a degenerate polygon or an inward offset
 * that collapses it. Orientation-robust: a negative delta always shrinks.
 */
export function offsetPolygonPt(points, deltaPt) {
  const path = (points ?? []).map(([x, y]) => ({ X: Math.round(x * PT_SCALE), Y: Math.round(y * PT_SCALE) }))
  if (path.length < 3) return []

  const run = (p) => {
    const co = new ClipperLib.ClipperOffset(2, 0.25 * PT_SCALE)
    co.AddPath(p, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
    const sol = new ClipperLib.Paths()
    co.Execute(sol, deltaPt * PT_SCALE)
    return sol
  }
  const areaOf = (s) => s.reduce((a, p) => a + Math.abs(ClipperLib.Clipper.Area(p)), 0)

  const inArea = Math.abs(ClipperLib.Clipper.Area(path))
  let sol = run(path)
  const grew = sol.length > 0 && areaOf(sol) > inArea
  const shrank = sol.length > 0 && areaOf(sol) < inArea
  // Negative delta must shrink, positive must grow — retry reversed if the
  // input winding made it behave the opposite way.
  if ((deltaPt < 0 && grew) || (deltaPt > 0 && shrank)) {
    sol = run(path.slice().reverse())
  }
  return sol.map((p) => p.map((pt) => [pt.X / PT_SCALE, pt.Y / PT_SCALE]))
}
