import { jest } from '@jest/globals'
import {
  letterAt,
  sideToEdgeIndex,
  drawSubjectAdjoiningFeatures,
} from '../adjoiningFeatures.js'

// A recording fake PDFKit doc: every method returns `this` (chainable) and logs
// its name so we can assert which drawing primitives fired for each role.
function fakeDoc() {
  const calls = []
  const rec = (name) => (...args) => { calls.push({ name, args }); return doc }
  const doc = {
    calls,
    save: rec('save'),
    restore: rec('restore'),
    fillColor: rec('fillColor'),
    fillOpacity: rec('fillOpacity'),
    strokeColor: rec('strokeColor'),
    lineWidth: rec('lineWidth'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    closePath: rec('closePath'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    dash: rec('dash'),
    undash: rec('undash'),
    font: rec('font'),
    fontSize: rec('fontSize'),
    rotate: rec('rotate'),
    text: rec('text'),
    widthOfString: () => 30,
  }
  return doc
}

const has = (doc, name) => doc.calls.some((c) => c.name === name)
const texts = (doc) => doc.calls.filter((c) => c.name === 'text').map((c) => c.args[0])

// Unit square, letters A(0,0) B(0,10) C(10,10) D(10,0) by ring index.
const square = [
  { x: 0, y: 0 },
  { x: 0, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: 0 },
]

describe('letterAt', () => {
  it('A..Z then AA, AB', () => {
    expect(letterAt(0)).toBe('A')
    expect(letterAt(25)).toBe('Z')
    expect(letterAt(26)).toBe('AA')
    expect(letterAt(27)).toBe('AB')
  })
})

describe('sideToEdgeIndex', () => {
  it('resolves side keys to the edge start index', () => {
    expect(sideToEdgeIndex('AB', 4)).toBe(0)
    expect(sideToEdgeIndex('BC', 4)).toBe(1)
    expect(sideToEdgeIndex('DA', 4)).toBe(3) // wrap edge
  })
  it('returns -1 for a non-adjacent / unknown side', () => {
    expect(sideToEdgeIndex('AC', 4)).toBe(-1)
    expect(sideToEdgeIndex('ZZ', 4)).toBe(-1)
  })
})

describe('drawSubjectAdjoiningFeatures — role behaviour', () => {
  it('road is LABEL-ONLY: no fill strip, name (+width) drawn', () => {
    const doc = fakeDoc()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing: square,
      annotations: [{ side: 'AB', role: 'road', label: 'MAIN ROAD', widthM: 12 }],
      ptPerGroundM: 1,
    })
    expect(has(doc, 'fill')).toBe(false)   // no burnt-sienna / no strip fill
    expect(has(doc, 'dash')).toBe(false)
    expect(has(doc, 'rotate')).toBe(true)  // read along the edge
    expect(texts(doc)[0]).toBe('MAIN ROAD 12,00m')
  })

  it('servitude draws a blue defined-width strip (fill) plus label', () => {
    const doc = fakeDoc()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing: square,
      annotations: [{ side: 'BC', role: 'servitude', label: 'SEWER SERVITUDE', widthM: 3 }],
      ptPerGroundM: 1,
    })
    expect(has(doc, 'fill')).toBe(true)
    expect(doc.calls.some((c) => c.name === 'fillColor' && c.args[0] === '#1F6FB2')).toBe(true)
    expect(texts(doc)[0]).toBe('SEWER SERVITUDE')
  })

  it('contiguous draws dashed stubs plus label, no fill', () => {
    const doc = fakeDoc()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing: square,
      annotations: [{ side: 'CD', role: 'contiguous', label: 'STAND 500' }],
      ptPerGroundM: 1,
    })
    expect(has(doc, 'dash')).toBe(true)
    expect(has(doc, 'fill')).toBe(false)
    expect(texts(doc)[0]).toBe('STAND 500')
  })

  it('skips an unresolved side and warns', () => {
    const doc = fakeDoc()
    const warn = jest.fn()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing: square,
      annotations: [{ side: 'AC', role: 'road', label: 'X' }],
      ptPerGroundM: 1,
    }, { warn })
    expect(warn).toHaveBeenCalled()
    expect(has(doc, 'text')).toBe(false)
  })

  it('no annotations → draws nothing', () => {
    const doc = fakeDoc()
    drawSubjectAdjoiningFeatures(doc, { ptRing: square, annotations: [], ptPerGroundM: 1 })
    expect(doc.calls).toHaveLength(0)
  })
})

// Minimal chainable PDFKit stand-in that records moveTo/lineTo/text.
function fakeDocNewStyle() {
  const calls = { moveTo: [], lineTo: [], text: [] }
  const doc = new Proxy({}, {
    get(_t, k) {
      if (k === 'widthOfString') return () => 10
      if (k === 'moveTo') return (x, y) => { calls.moveTo.push([x, y]); return doc }
      if (k === 'lineTo') return (x, y) => { calls.lineTo.push([x, y]); return doc }
      if (k === 'text') return (t, x, y) => { calls.text.push([t, x, y]); return doc }
      return () => doc  // save/restore/dash/undash/lineWidth/strokeColor/fillColor/font/fontSize
    },
  })
  return { doc, calls }
}

// Square subject ring in PDF points; side 'AB' = edge 0→1, a=(0,0) b=(100,0).
const ptRing = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]

describe('drawSubjectAdjoiningFeatures — contiguous terminal offsets', () => {
  test("end:'both' draws two stubs", () => {
    const { doc, calls } = fakeDocNewStyle()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing, ptPerGroundM: 1,
      annotations: [{ side: 'AB', role: 'contiguous', label: 'N', end: 'both' }],
    })
    expect(calls.moveTo).toHaveLength(2)
  })

  test('missing end draws two stubs (back-compat)', () => {
    const { doc, calls } = fakeDocNewStyle()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing, ptPerGroundM: 1,
      annotations: [{ side: 'AB', role: 'contiguous', label: 'N' }],
    })
    expect(calls.moveTo).toHaveLength(2)
  })

  test("end:'from' draws one stub, starting at terminal A", () => {
    const { doc, calls } = fakeDocNewStyle()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing, ptPerGroundM: 1,
      annotations: [{ side: 'AB', role: 'contiguous', label: 'N', end: 'from' }],
    })
    expect(calls.moveTo).toHaveLength(1)
    expect(calls.moveTo[0]).toEqual([0, 0])
  })

  test("end:'to' draws one stub, starting at terminal B", () => {
    const { doc, calls } = fakeDocNewStyle()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing, ptPerGroundM: 1,
      annotations: [{ side: 'AB', role: 'contiguous', label: 'N', end: 'to' }],
    })
    expect(calls.moveTo).toHaveLength(1)
    expect(calls.moveTo[0]).toEqual([100, 0])
  })
})
