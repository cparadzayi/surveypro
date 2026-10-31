import { describe, test, expect } from '@jest/globals'
import { createDxfWriter } from '../dxfPrimitives.js'
import { generateDiagramDXF } from '../../diagramDxf.js'

/**
 * The diagram DXF declares Release 12 (AC1009). A program reading an old-release file is
 * strict: one group code or header variable the release does not define makes it list
 * errors ("Press ENTER to continue") and discard the drawing. So these tests hold the file
 * to what Release 12 defines, and to a view that opens on the drawing.
 */
const LAYERS = [{ name: 'A', color: 7 }, { name: 'B', color: 103, trueColor: [94, 228, 129] }]
const far = { min: { x: 103402.2567, y: -2176848.5883 }, max: { x: 103522.258, y: -2176648.3381 } }

const pairs = (text) => {
  const lines = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([lines[i].trim(), lines[i + 1]])
  return out
}

// Header variables Release 12 defines, of the ones the writer uses.
const R12_HEADER_VARS = new Set(['$ACADVER', '$EXTMIN', '$EXTMAX', '$LIMMIN', '$LIMMAX', '$VIEWCTR', '$VIEWSIZE'])
// Group codes that exist only in later releases: handles, subclass markers, owners, true colour.
const LATER_RELEASE_CODES = new Set(['5', '100', '102', '105', '330', '360', '370', '390', '420', '430', '440'])

function assertRelease12(text) {
  const ps = pairs(text)
  const vars = ps.filter(([c]) => c === '9').map(([, v]) => v)
  for (const v of vars) expect(R12_HEADER_VARS.has(v)).toBe(true)
  const later = ps.filter(([c]) => LATER_RELEASE_CODES.has(c)).map(([c]) => c)
  expect(later).toEqual([])
}

describe('the diagram DXF is Release 12 throughout', () => {
  test('the writer, with a true-colour layer, emits nothing later than Release 12', () => {
    const text = createDxfWriter(LAYERS).finish(far.min, far.max).toString('utf8')
    assertRelease12(text)
  })

  test('a whole generated diagram does too', async () => {
    const subject = {
      type: 'Feature', properties: { id: 'A', stand: '302', designation: 'STAND 302', area_m2: 5019 },
      geometry: { type: 'Polygon', coordinates: [[[2176708, -103493], [2176762, -103494], [2176771, -103467], [2176725, -103443], [2176708, -103493]]] },
    }
    const r = await generateDiagramDXF({ dxfVersion: 'r12',
      parcels: { type: 'FeatureCollection', features: [subject] },
      beacons: { type: 'FeatureCollection', features: [] },
      metadata: {
        subjectParcelId: 'A', designation: 'STAND 302', centralMeridian: 29, diagramSgNo: '468/2026',
        sideAnnotations: [{ side: 'AB', role: 'road', label: 'Garden Road', widthM: 15 }],
      },
      projection: 'EPSG:22289', scale: 'auto', sheetSize: 'A4', orientation: 'portrait',
    }, { info() {}, warn() {}, error() {} })
    assertRelease12(r.dxfBuffer.toString('utf8'))
  })
})

// A DXF has no "zoom extents": a diagram in real Lo coordinates (~1e5 east, ~2e6 south) opens on
// the program's default window at the origin and looks EMPTY unless the file names a view.
describe('the view the drawing opens on', () => {
  const text = () => createDxfWriter(LAYERS).finish(far.min, far.max).toString('utf8')
  const vpOf = (t) => {
    const ps = pairs(t)
    const k = ps.findIndex(([c, v]) => c === '2' && v === '*ACTIVE')
    const end = ps.findIndex(([c, v], i) => i > k && c === '0' && v === 'ENDTAB')
    return ps.slice(k, end)
  }
  const num = (ps, code) => Number(ps.find(([c]) => c === String(code))?.[1])

  test('an active viewport is centred on the drawing, however far from the origin', () => {
    const vp = vpOf(text())
    expect(num(vp, 12)).toBeCloseTo((far.min.x + far.max.x) / 2, 3)
    expect(num(vp, 22)).toBeCloseTo((far.min.y + far.max.y) / 2, 3)
  })

  test('the window holds the whole drawing at its aspect', () => {
    const vp = vpOf(text())
    expect(num(vp, 40)).toBeGreaterThanOrEqual(far.max.y - far.min.y)
    expect(num(vp, 40) * num(vp, 41)).toBeGreaterThanOrEqual(far.max.x - far.min.x)
  })

  test('the header carries the same view and the drawing limits', () => {
    const t = text()
    const hdr = t.slice(0, t.indexOf('ENDSEC'))
    for (const v of ['$VIEWCTR', '$VIEWSIZE', '$LIMMIN', '$LIMMAX']) expect(hdr).toContain(v)
  })

  test('layer 0 is declared and the declared layer count matches', () => {
    const ps = pairs(text())
    const k = ps.findIndex(([c, v]) => c === '2' && v === 'LAYER')
    expect(Number(ps[k + 1][1])).toBe(3)                      // 0 + the two given
    const names = ps.filter(([c], i) => c === '2' && ps[i - 1]?.[1] === 'LAYER').map(([, v]) => v)
    expect(names).toEqual(['0', 'A', 'B'])
  })

  test('a drawing at the origin still gets a sane window', () => {
    const t = createDxfWriter(LAYERS).finish({ x: 0, y: 0 }, { x: 210, y: 297 }).toString('utf8')
    expect(num(vpOf(t), 40)).toBeGreaterThanOrEqual(297)
  })
})
