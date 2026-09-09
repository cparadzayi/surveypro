import { describe, test, expect } from '@jest/globals'
import { generateDiagramDXF } from '../diagramDxf.js'

/**
 * Where the vertex letters land. A letter names ONE corner, so it has to sit
 * near enough to that corner to be read as its label, and it must not be
 * printed over the road or servitude shading.
 *
 * Two faults put letters on the shading. The DXF drew its lettering BEFORE the
 * adjoining features, so every letter was placed against an empty obstacle list
 * and never saw the bands at all -- the PDF had always drawn them the other way
 * round. And the placement search itself could only step straight outward, so a
 * letter that found nothing clear along that one line fell back to its first
 * candidate, shading and all.
 *
 * Coordinates sit well away from the origin: points reach the buffer through
 * normalizeCapeLoYX, which transposes a pair whose first component is more than
 * twice its second, and a fixture hung off (0,0) trips that on some vertices
 * and not others.
 */
const subject = {
  type: 'Feature',
  properties: { id: 'S', stand: '404', designation: 'STAND 404 BRACKENHURST', area_m2: 4800 },
  geometry: { type: 'Polygon', coordinates: [[
    [100, 200], [100, 260], [180, 260], [180, 200], [100, 200],
  ]] },
}
const bcn = (name, y, x) => ({
  type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: [y, x] },
})
const beacons = {
  type: 'FeatureCollection',
  features: [
    bcn('62Bx', 100, 200), bcn('1B', 100, 260),
    bcn('1A', 180, 260), bcn('62Ax', 180, 200),
  ],
}
const logger = { info() {}, warn() {}, error() {} }

/** Every side carries a road, so the shading wraps the whole figure and every
 *  letter has to negotiate it. */
const allSidesRoad = [
  { side: 'AB', role: 'road', label: 'Main Road', widthM: 12 },
  { side: 'BC', role: 'road', label: 'Klein Road', widthM: 10 },
  { side: 'CD', role: 'servitude', label: 'Sewer', widthM: 3 },
]
const sheet = (sideAnnotations) => ({
  parcels: { type: 'FeatureCollection', features: [subject] },
  beacons,
  metadata: {
    subjectParcelId: 'S', designation: 'STAND 404 BRACKENHURST', centralMeridian: 29,
    sideAnnotations,
  },
  projection: 'EPSG:22289', scale: 'auto', sheetSize: 'A4', orientation: 'portrait',
})

/** Entities of one kind, as raw group-code maps. */
function entities(dxf, kind, layerRe) {
  const lines = dxf.split('\n').map((l) => l.trim())
  const out = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== kind) continue
    let j = i + 2; const d = {}
    while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
    if (!layerRe.test((d['8'] || [''])[0])) continue
    out.push(d)
  }
  return out
}
/** Helvetica cap widths, as a fraction of the text height. */
const W = { A: 0.667, B: 0.667, C: 0.722, D: 0.722, E: 0.667, F: 0.611 }

async function sheetGeometry(annotations) {
  const dxf = (await generateDiagramDXF(sheet(annotations), logger)).dxfBuffer.toString('utf8')
  const letters = entities(dxf, 'TEXT', /^FIGURE_LABELS$/)
    .filter((d) => /^[A-Z]$/.test((d['1'] || [''])[0]))
    .map((d) => {
      const h = +d['40'][0], t = d['1'][0]
      // A DXF TEXT insertion is the baseline, i.e. the box's bottom-left.
      return { t, x: +d['10'][0], y: +d['20'][0], w: h * (W[t] || 0.667), h }
    })
  const circles = entities(dxf, 'CIRCLE', /^BEACONS$/)
    .map((d) => ({ x: +d['10'][0], y: +d['20'][0], r: +d['40'][0] }))
  const bands = entities(dxf, 'LINE', /DIAGRAM_ROAD|ADJOINING_SERVITUDE/)
    .map((d) => [[+d['10'][0], +d['20'][0]], [+d['11'][0], +d['21'][0]]])
  return { letters, circles, bands }
}

const segRect = ([a, b], r) => {
  const inR = (p) => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h
  if (inR(a) || inR(b)) return true
  const ss = (p1, p2, p3, p4) => {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0])
    if (d === 0) return false
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d
    const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d
    return t >= 0 && t <= 1 && u >= 0 && u <= 1
  }
  const c1 = [r.x, r.y], c2 = [r.x + r.w, r.y], c3 = [r.x + r.w, r.y + r.h], c4 = [r.x, r.y + r.h]
  return ss(a, b, c1, c2) || ss(a, b, c2, c3) || ss(a, b, c3, c4) || ss(a, b, c4, c1)
}

describe('vertex letters — near their beacon, off the shading', () => {
  test('no letter is printed over the road or servitude shading', async () => {
    const { letters, bands } = await sheetGeometry(allSidesRoad)
    expect(letters.length).toBeGreaterThan(0)
    expect(bands.length).toBeGreaterThan(0)
    for (const L of letters) {
      const box = { x: L.x, y: L.y, w: L.w, h: L.h }
      expect(bands.filter((s) => segRect(s, box))).toHaveLength(0)
    }
  })

  test('each letter sits nearer its own beacon than any other', async () => {
    // A letter that drifts closer to the next corner names the wrong one. The
    // claims must form a bijection: one letter, one beacon, no sharing.
    const { letters, circles } = await sheetGeometry(allSidesRoad)
    const claimed = letters.map((L) => {
      const cx = L.x + L.w / 2, cy = L.y + L.h / 2
      let best = -1, bd = Infinity
      circles.forEach((c, i) => {
        const d = Math.hypot(cx - c.x, cy - c.y)
        if (d < bd) { bd = d; best = i }
      })
      return best
    })
    expect(new Set(claimed).size).toBe(letters.length)
  })

  test('a letter stays within its own height of the beacon it names', async () => {
    // Close enough to read as that corner's label. The letter is pushed out by
    // whatever it has to clear, so this is a ceiling, not a target.
    const { letters, circles } = await sheetGeometry(allSidesRoad)
    for (const L of letters) {
      const cx = L.x + L.w / 2, cy = L.y + L.h / 2
      const near = circles
        .map((c) => Math.hypot(cx - c.x, cy - c.y) - c.r)
        .sort((a, b) => a - b)[0]
      const reach = Math.hypot(L.w, L.h) / 2
      expect(near - reach).toBeLessThan(L.h)
    }
  })

  test('the shading is actually taken into account', async () => {
    // Guard on the fixture. Without it the tests above could be passing on a
    // sheet that never had shading to avoid. Note what is NOT asserted: that
    // the shaded letters end up further out. They mostly do not, and that is
    // the point -- a letter steps AROUND the band at the same distance from
    // its beacon rather than retreating from it.
    const bare = await sheetGeometry([])
    const shaded = await sheetGeometry(allSidesRoad)
    expect(bare.bands).toHaveLength(0)
    expect(shaded.bands.length).toBeGreaterThan(0)
    const at = ({ letters }) => letters.map((L) => `${L.t}@${L.x.toFixed(2)},${L.y.toFixed(2)}`).join(' ')
    expect(at(shaded)).not.toBe(at(bare))
  })
})
