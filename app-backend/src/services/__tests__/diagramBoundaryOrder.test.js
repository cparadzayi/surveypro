/**
 * The examiners: boundary lines of different thickness. The black boundary used to be painted before the translucent
 * road ribbon, which covered the outer half of the stroke along a road, so that side read thinner than the sides
 * without one. The ring must be drawn after every road / servitude fill, and at one width.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramBoundaryOrder
 */
import { test, expect } from '@jest/globals'
import { generateDiagramPDF } from '../diagramPdf.js'

const V = [[2176708.74, -103493.46], [2176762.14, -103494.14], [2176771.37, -103467.09], [2176766.70, -103457.57], [2176725.75, -103443.60]]
const logger = { info() {}, warn() {}, error() {} }

test('the black boundary is drawn after the road colour, at one width', async () => {
  const r = await generateDiagramPDF({
    parcels: { type: 'FeatureCollection', features: [{
      type: 'Feature',
      properties: { id: 'S', stand: '1345', designation: 'STAND 1345 OF SEBANGA POORT', area_m2: 2225 },
      geometry: { type: 'Polygon', coordinates: [[...V, V[0]]] },
    }] },
    beacons: { type: 'FeatureCollection', features: [] },
    metadata: {
      subjectParcelId: 'S', designation: 'D', district: 'S', centralMeridian: 29,
      sideAnnotations: [{ side: 'DE', role: 'road', label: 'Garden Road' }],
    },
    recordOps: true,
  }, logger)

  const ring = r.ops.map((o, i) => ({ o, i })).filter(({ o }) => o.layer === 'FIGURE' && o.type === 'stroke' && o.closed)
  const colour = r.ops.map((o, i) => ({ o, i })).filter(({ o }) => o.type === 'fill' && /ROAD|SERVITUDE/.test(o.layer ?? ''))
  expect(ring).toHaveLength(1)
  expect(colour.length).toBeGreaterThan(0)
  for (const c of colour) expect(ring[0].i).toBeGreaterThan(c.i)
  expect(ring[0].o.width).toBe(1.2)
}, 60000)
