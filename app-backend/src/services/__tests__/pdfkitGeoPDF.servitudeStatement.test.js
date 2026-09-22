import { describe, it, expect } from '@jest/globals'
import { drawServitudeStatement } from '../pdfkitGeoPDF.js'

// Recording fake PDFKit doc: every method returns `this` (chainable) and logs
// its name so we can assert which drawing primitives fired for each role. Mirrors
// the fake in adjoiningFeatures.test.js, extended with the primitives the
// statement drawer uses (rect, moveTo, lineTo).
function fakeDoc() {
  const calls = []
  const rec = (name) => (...args) => { calls.push({ name, args }); return doc }
  const doc = {
    calls,
    save: rec('save'),
    restore: rec('restore'),
    fillColor: rec('fillColor'),
    lineWidth: rec('lineWidth'),
    strokeColor: rec('strokeColor'),
    rect: rec('rect'),
    stroke: rec('stroke'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    font: rec('font'),
    fontSize: rec('fontSize'),
    text: rec('text'),
    widthOfString: () => 40,
  }
  return doc
}

const has = (doc, name) => doc.calls.some((c) => c.name === name)
const count = (doc, name) => doc.calls.filter((c) => c.name === name).length
const texts = (doc) => doc.calls.filter((c) => c.name === 'text').map((c) => c.args[0])

// A placed rect the planner would have produced for a single data row, carrying
// the content-fit column widths it measured (planner ↔ drawer must agree).
const position = {
  x: 100, y: 200,
  width: 300, height: 56,
  columns: [160, 132],
}

const metadata = {
  planType: 'general-developed',
  servitudeStatement: {
    rows: [
      { stands: '2833, 2469', boundary: '2833A - 2833B' },
    ],
  },
}

describe('drawServitudeStatement', () => {
  it('draws the bordered box, heading, table header and data row', () => {
    const doc = fakeDoc()
    drawServitudeStatement(doc, metadata, { x: 0, y: 0 }, position)
    // Outer border.
    expect(has(doc, 'rect')).toBe(true)
    expect(count(doc, 'stroke')).toBeGreaterThan(1)
    // Heading + "STAND NUMBER" + "BOUNDARY" + the data row = 4 texts.
    expect(texts(doc)[0]).toMatch(/party-wall servitudes/)
    expect(texts(doc).slice(1, 3)).toEqual(['STAND NUMBER', 'BOUNDARY'])
    expect(texts(doc).slice(3)).toEqual(['2833, 2469', '2833A - 2833B'])
    // Header divider + vertical column divider; no row divider for one row.
    expect(count(doc, 'lineTo')).toBe(2)
  })

  it('adds a row divider between each pair of data rows', () => {
    const doc = fakeDoc()
    drawServitudeStatement(doc, {
      ...metadata,
      servitudeStatement: {
        rows: [
          metadata.servitudeStatement.rows[0],
          { stands: '4701, 4702', boundary: '4701A - 4701B' },
        ],
      },
    }, { x: 0, y: 0 }, position)
    // 1 header divider + 1 vertical divider + 1 row divider = 3.
    expect(count(doc, 'lineTo')).toBe(3)
  })

  it('renders a row whose stands/boundary are missing rather than crashing', () => {
    const doc = fakeDoc()
    drawServitudeStatement(doc, { ...metadata, servitudeStatement: { rows: [{ stands: '', boundary: '' }] } }, { x: 0, y: 0 }, position)
    expect(has(doc, 'text')).toBe(true)
  })

  it('no-ops when there are no rows, no position, or no position dims', () => {
    const empty = { ...metadata, servitudeStatement: { rows: [] } }
    const docNoRows = fakeDoc()
    drawServitudeStatement(docNoRows, empty, { x: 0, y: 0 }, position)
    expect(docNoRows.calls).toHaveLength(0)

    const docNoPos = fakeDoc()
    drawServitudeStatement(docNoPos, metadata, { x: 0, y: 0 }, null)
    expect(docNoPos.calls).toHaveLength(0)

    const docNoDims = fakeDoc()
    drawServitudeStatement(docNoDims, metadata, { x: 0, y: 0 }, { x: 1, y: 1, width: 0, height: 0 })
    expect(docNoDims.calls).toHaveLength(0)
  })

  it('falls back to an even column split when columns metadata is missing', () => {
    const doc = fakeDoc()
    drawServitudeStatement(doc, metadata, { x: 0, y: 0 }, { x: 100, y: 200, width: 300, height: 56 })
    // Heading + header pair + 2 data cells still rendered without columns metadata.
    expect(texts(doc)).toHaveLength(5)
  })
})