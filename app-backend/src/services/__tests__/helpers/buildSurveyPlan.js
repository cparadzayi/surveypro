/**
 * Build a generateGeoPDF() request from a survey probe (fixtures/labelGateSurvey.json):
 * the stands, the outside figure and the beacons as the app holds them, turned
 * into the plan the renderer takes. Kept apart from the tests so the label gate
 * and any ad-hoc probe script build the plan the same way.
 *
 * Probe shape: { pj: {designation, township, district, central_meridian},
 *   par: [{ stand, area_m2, g: GeoJSON Polygon in [southing, westing] }],
 *   of:  { g: GeoJSON Polygon },   pts: [{ name, y, x }] }
 */
const swapXY = ([x, y]) => [y, x] // GeoJSON [Southing, Westing] -> planner [y, x]

export function buildSurveyPlan(d, { sheetSize = 'SI727_1000x800', scale = null } = {}) {
  const stands = d.par.map((r) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [r.g.coordinates[0].map(swapXY)] },
    properties: { stand: String(r.stand), area_m2: Number(r.area_m2) },
  }))
  const closed = d.of.g.coordinates[0].map(swapXY)
  const ring = closed.slice(0, -1)
  const nameAt = (v) => {
    const p = d.pts.find((q) => Math.abs(q.y - v[0]) < 0.6 && Math.abs(q.x - v[1]) < 0.6)
    return p ? p.name : null
  }
  const names = ring.map((v, i) => nameAt(v) || `V${i}`)
  const bearing = (a, b) => {
    let t = (Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) * 180) / Math.PI
    if (t < 0) t += 360
    const D = Math.floor(t)
    const m = Math.floor((t - D) * 60)
    const s = Math.round(((t - D) * 60 - m) * 60)
    return `${D}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`
  }
  const edges = ring.map((v, i) => {
    const w = ring[(i + 1) % ring.length]
    return {
      side: `${names[i]}-${names[(i + 1) % ring.length]}`,
      metres: Math.hypot(w[0] - v[0], w[1] - v[1]).toFixed(2),
      direction: bearing(v, w), constants: '', y: v[0], x: v[1],
    }
  })
  const plan = {
    metadata: {
      designation: d.pj.designation, township: d.pj.township, district: d.pj.district,
      standCount: stands.length, wholePortion: 'A portion', beaconSequence: names.join(''),
      date: '2026-01-01', surveyor: 'Test', surveyorLicense: 'LS-1',
      centralMeridian: Number(d.pj.central_meridian),
    },
    planType: 'general-developed',
    parcels: { type: 'FeatureCollection', features: stands },
    beacons: {
      type: 'FeatureCollection',
      features: d.pts.map((q) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [q.y, q.x] },
        properties: { name: q.name, type: 'iron-peg' },
      })),
    },
    outsideFigureData: { edges, coordinates: ring.map((v, i) => ({ name: names[i], y: v[0], x: v[1] })) },
    outsideFigure: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [closed] } }],
    },
    sheetSize,
  }
  // The renderer reads the declared scale as a string ("1:500"), not an object.
  if (scale) plan.scale = `1:${scale}`
  return plan
}
