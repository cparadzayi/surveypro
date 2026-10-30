import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF, GENERATION_CANCELLED } from '../pdfkitGeoPDF.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js'
import { buildSurveyPlan } from './helpers/buildSurveyPlan.js'

/**
 * A render used to be one unbroken synchronous stretch, so a client that had gone away (Cancel, closed
 * tab) was never noticed and the server ground on to the end -- minutes, on a large plan -- for nobody.
 * The render now gives the event loop a turn between beacons and stops when its signal is aborted.
 */
const quiet = { info() {}, warn() {}, error() {} }

describe('generateGeoPDF honours an abort signal', () => {
  test('a signal already aborted stops the render with GenerationCancelled', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(generateGeoPDF({ ...sampleRealisticPlan, signal: ac.signal }, quiet))
      .rejects.toMatchObject({ name: GENERATION_CANCELLED })
  }, 60000)

  // The surveyed plan (142 stands, 365 beacons) takes minutes to render under Jest, nearly all of it in
  // the beacon loop. The abort is noticed at the first beacon after the setup before that loop (about 15 s
  // under Jest, where nothing can yield), so it must land long before a full render would have ended.
  test('a signal aborted mid-render on a large plan stops it long before the render would end', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const survey = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'labelGateSurvey.json'), 'utf8'))
    const ac = new AbortController()
    const abortAt = 4000
    setTimeout(() => ac.abort(), abortAt)
    const t0 = Date.now()
    await expect(generateGeoPDF({ ...buildSurveyPlan(survey), signal: ac.signal }, quiet))
      .rejects.toMatchObject({ name: GENERATION_CANCELLED })
    expect(Date.now() - t0).toBeLessThan(60000)
  }, 120000)

  test('with no signal the render completes as before', async () => {
    const r = await generateGeoPDF({ ...sampleRealisticPlan }, quiet)
    expect(r.pdfBuffer?.length ?? r.length).toBeGreaterThan(1000)
  }, 60000)
})
