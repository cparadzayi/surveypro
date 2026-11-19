/**
 * The diagram's CO-ORDINATES heading reads "Lo 29°", the same as the Co-ordinate List and the Outside Figure Data.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramLoLabel
 */
import { test, expect } from '@jest/globals'
import { generateDiagramPDF } from '../diagramPdf.js'

const V = [[2176708.74, -103493.46], [2176762.14, -103494.14], [2176771.37, -103467.09], [2176766.70, -103457.57], [2176725.75, -103443.60]]
const logger = { info() {}, warn() {}, error() {} }

test.each([29, 31])('Lo %i carries its degree sign on the diagram', async (cm) => {
  const r = await generateDiagramPDF({
    parcels: { type: 'FeatureCollection', features: [{
      type: 'Feature',
      properties: { id: 'S', stand: '1345', designation: 'STAND 1345', area_m2: 2225 },
      geometry: { type: 'Polygon', coordinates: [[...V, V[0]]] },
    }] },
    beacons: { type: 'FeatureCollection', features: [] },
    metadata: { subjectParcelId: 'S', designation: 'D', district: 'S', centralMeridian: cm },
    recordOps: true,
  }, logger)
  const texts = r.ops.filter((o) => o.type === 'text').map((o) => o.text.trim())
  expect(texts).toContain(`Lo ${cm}°`)
  expect(texts).not.toContain(`Lo ${cm}`)
}, 60000)
