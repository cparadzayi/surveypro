/**
 * Unit tests for LabelingSystem — planType edge-annotation behavior
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { LabelingSystem } from '../../services/pdfkitLabeling.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal PDFKit document mock — only the methods LabelingSystem calls */
function makeMockDoc() {
  const mockDoc = {
    text:         jest.fn(),
    font:         jest.fn().mockImplementation(() => mockDoc),
    fontSize:     jest.fn().mockImplementation(() => mockDoc),
    save:         jest.fn(),
    restore:      jest.fn(),
    moveTo:       jest.fn().mockImplementation(() => mockDoc),
    lineTo:       jest.fn().mockImplementation(() => mockDoc),
    stroke:       jest.fn(),
    rect:         jest.fn().mockImplementation(() => mockDoc),
    fill:         jest.fn(),
    fillColor:    jest.fn().mockImplementation(() => mockDoc),
    strokeColor:  jest.fn().mockImplementation(() => mockDoc),
    lineWidth:    jest.fn().mockImplementation(() => mockDoc),
    widthOfString: jest.fn().mockReturnValue(20),
    dash:         jest.fn().mockImplementation(() => mockDoc),
    undash:       jest.fn().mockImplementation(() => mockDoc),
    translate:    jest.fn().mockImplementation(() => mockDoc),
    rotate:       jest.fn().mockImplementation(() => mockDoc),
  }
  return mockDoc
}

/** A 100m × 100m square parcel in Cape Lo coords with 4 edges */
const TEST_PARCEL = {
  geometry: {
    coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]
  },
  properties: {
    stand: '1234',
    edges: [
      { bearing: 90.0,  distance: 100.0, distanceRounded: 100.0, directionDMS: "90°00'00\"",  from: 'A', to: 'B' },
      { bearing: 180.0, distance: 100.0, distanceRounded: 100.0, directionDMS: "180°00'00\"", from: 'B', to: 'C' },
      { bearing: 270.0, distance: 100.0, distanceRounded: 100.0, directionDMS: "270°00'00\"", from: 'C', to: 'D' },
      { bearing: 0.0,   distance: 100.0, distanceRounded: 100.0, directionDMS: "0°00'00\"",   from: 'D', to: 'A' },
    ]
  }
}

/** PDF coordinate equivalents for the 4 corners + closing vertex */
const TEST_PDF_COORDS = [
  { x: 50,  y: 350 },
  { x: 450, y: 350 },
  { x: 450, y: 50  },
  { x: 50,  y: 50  },
  { x: 50,  y: 350 },
]

const MOCK_EXTENT    = { minY: -18000, maxY: -17900, minX: -20000, maxX: -19900 }
const MOCK_MAP_BOUNDS = { x: 50, y: 50, width: 400, height: 300 }
const MOCK_SCALE     = 1000
// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LabelingSystem — planType edge-annotation behavior', () => {

  let mockCollision, mockLogger

  beforeEach(() => {
    mockCollision = { hasCollision: jest.fn().mockReturnValue(false), addRegion: jest.fn() }
    mockLogger    = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  })

  describe('general-developed: edge annotations are suppressed', () => {

    test('renderEdgeLabels does not call doc.text() for any edge', () => {
      const doc = makeMockDoc()
      const ls = new LabelingSystem(
        doc, MOCK_EXTENT, MOCK_MAP_BOUNDS, MOCK_SCALE,
        mockCollision, mockLogger, 'general-developed'
      )
      ls.identifySharedEdges({ features: [TEST_PARCEL] }, null)
      ls.renderEdgeLabels(TEST_PARCEL, TEST_PDF_COORDS)

      expect(doc.text).not.toHaveBeenCalled()
    })

    test('renderSecondPassBearings returns 0', () => {
      const doc = makeMockDoc()
      const ls = new LabelingSystem(
        doc, MOCK_EXTENT, MOCK_MAP_BOUNDS, MOCK_SCALE,
        mockCollision, mockLogger, 'general-developed'
      )
      const rendered = ls.renderSecondPassBearings()
      expect(rendered).toBe(0)
    })

  })

  describe('general-undeveloped: edge annotations are rendered', () => {

    test('renderEdgeLabels calls doc.text() at least once for a valid parcel', () => {
      const doc = makeMockDoc()
      const ls = new LabelingSystem(
        doc, MOCK_EXTENT, MOCK_MAP_BOUNDS, MOCK_SCALE,
        mockCollision, mockLogger, 'general-undeveloped'
      )
      ls.identifySharedEdges({ features: [TEST_PARCEL] }, null)
      ls.renderEdgeLabels(TEST_PARCEL, TEST_PDF_COORDS)

      expect(doc.text).toHaveBeenCalled()
    })

  })

  describe('default planType behaves like general-undeveloped', () => {

    test('renderSecondPassBearings does not take the general-developed early-return path', () => {
      const doc = makeMockDoc()
      const ls = new LabelingSystem(
        doc, MOCK_EXTENT, MOCK_MAP_BOUNDS, MOCK_SCALE,
        mockCollision, mockLogger
        // planType omitted → defaults to 'general-undeveloped'
      )
      ls.renderSecondPassBearings()
      // The general-developed branch logs a specific message and returns 0.
      // If we're on the undeveloped path, that message must NOT have been logged.
      const infoCalls = mockLogger.info.mock.calls.map(args => args[0])
      const tookDevBranch = infoCalls.some(msg =>
        typeof msg === 'string' && msg.includes('Second-pass bearings skipped') && msg.includes('developed')
      )
      expect(tookDevBranch).toBe(false)
    })

  })

})
