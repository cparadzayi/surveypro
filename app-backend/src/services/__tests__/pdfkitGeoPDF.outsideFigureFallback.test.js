import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js'

function polyVerts(logs) {
  const hit = logs.find(m => typeof m === 'object' && m.msg === '[PLANNER-INPUT] PDF → planSheetLayout')
  return hit?.polyVerts
}

function captureLogger() {
  const logs = []
  return {
    logs,
    logger: {
      info: (m) => logs.push(m),
      warn: (m) => logs.push(m),
      error: (m) => logs.push(m),
    },
  }
}

describe('generateGeoPDF — outsideFigure fallback to extent bbox', () => {
  test('no outsideFigure, has parcels + outsideFigureData: fallback populates the collision polygon', async () => {
    const { logs, logger } = captureLogger()
    await generateGeoPDF(sampleRealisticPlan, logger)
    expect(polyVerts(logs)).toBe(4)
    const fallbackLog = logs.find(m => typeof m === 'string' && m.includes('using the extent bbox as the collision-avoidance figure boundary'))
    expect(fallbackLog).toBeDefined()
  })

  test('outsideFigure present: behavior unchanged, fallback never triggers', async () => {
    const withOF = {
      ...sampleRealisticPlan,
      outsideFigure: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[50000, 2200000], [50200, 2200000], [50200, 2200150], [50000, 2200150], [50000, 2200000]]] },
          properties: {},
        }],
      },
    }
    const { logs, logger } = captureLogger()
    await generateGeoPDF(withOF, logger)
    expect(polyVerts(logs)).toBe(4)
    const fallbackLog = logs.find(m => typeof m === 'string' && m.includes('using the extent bbox as the collision-avoidance figure boundary'))
    expect(fallbackLog).toBeUndefined()
  })

  test('neither outsideFigureData nor outsideFigure, but parcels exist: still resolves via the parcels-only bbox', async () => {
    const parcelsOnly = { ...sampleRealisticPlan, outsideFigureData: undefined }
    const { logs, logger } = captureLogger()
    await generateGeoPDF(parcelsOnly, logger)
    expect(polyVerts(logs)).toBe(4)
  })
})
