import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js'
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js'
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js'
import { sampleDevelopedLargeStandsPlan } from './fixtures/sampleDevelopedLargeStandsPlan.js'
import { sampleUndevelopedSmallStandsPlan } from './fixtures/sampleUndevelopedSmallStandsPlan.js'

/**
 * A coordinate cross drawn across an SI 727 block obscures the authoritative record.
 * Reported from a real plan (Maglas Township of Shabani, stands 207-279/340-345), where
 * the Y/X grid crosses were struck straight through the Schedule of Areas -- over the
 * DIAGRAM NUMBER header and down the DEED column.
 *
 * Ticks are rendered last, after every block is placed, so the renderer knows exactly
 * where the blocks landed. It just never consulted them: its candidate test covered the
 * figure outline, parcel boundaries and stand-number rects, and otherwise deferred to
 * collisionDetector -- which only ever holds text labels, never the tables. blockPositions
 * was passed into the renderer and used for nothing but a log line.
 *
 * warnings.tickMarksOverlapBlocks compares what was actually drawn against where the
 * blocks actually landed, so it cannot go stale against the bounds reserved earlier.
 */
const fixtures = {
  sampleMinimalPlan,
  sampleRealisticPlan,
  sampleMaglasPlan,
  sampleDevelopedLargeStandsPlan,
  sampleUndevelopedSmallStandsPlan,
}

describe('coordinate ticks never cross an SI 727 block', () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    test(`${name}: no tick mark is drawn over a block`, async () => {
      const logger = { info: () => {}, warn: () => {}, error: () => {} }
      const { warnings } = await generateGeoPDF(fixture, logger)

      const hit = warnings?.tickMarksOverlapBlocks
      const detail = hit
        ? `${hit.count} tick(s) over: ` +
          [...new Set(hit.hits.map((h) => h.block))].sort().join(', ')
        : ''
      expect(detail).toBe('')
    }, 300000)
  }

  test('the schedule of areas in particular is never struck through', async () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {} }
    const { warnings } = await generateGeoPDF(sampleDevelopedLargeStandsPlan, logger)

    const blocks = (warnings?.tickMarksOverlapBlocks?.hits ?? []).map((h) => h.block)
    expect(blocks).not.toContain('scheduleOfAreas')
  }, 300000)
})
