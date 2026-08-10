import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js'
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js'

// sampleRealisticPlan has 12 stands (single-table schedule — doesn't trigger
// the separate, still-open paper-size-escalation gap for SPLIT schedules,
// isScheduleWithFluidFallback in pdfkitGeoPDF.js, which is a different, much
// denser scenario handled by the 'split schedule (Maglas...)' test below (that
// fixture genuinely exhausts every escalation level — see its test for the full
// story)) and no `outsideFigure` field — the exact scenario that originally
// reproduced the reported overlap bug. Checking the returned `warnings` object
// (not raw log text) reflects only the final, actually-returned attempt: if
// escalation resolves the overlap on a retry (as it now does for this fixture,
// ISO_A2→ISO_A1), scheduleOfAreasOverlapsPolygon is correctly never set, even
// though an earlier, superseded attempt did warn transiently.
describe('Schedule of Areas placement no longer collides when outsideFigure is absent', () => {
  test('final returned result has no scheduleOfAreas/figure overlap warning', async () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {} }
    const { warnings } = await generateGeoPDF(sampleRealisticPlan, logger)
    expect(warnings?.scheduleOfAreasOverlapsPolygon).toBeFalsy()
  })

  test('surveyStatement relocates clear of the accurate figure polygon, not just the approximate planner polygon', async () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {} }
    const result = await generateGeoPDF(sampleRealisticPlan, logger)

    expect(result.warnings.surveyStatementOverlapsPolygon).toBeUndefined()
  })

  test('scheduleOfAreas is unaffected by the relocation-pass change (separate escalation-based handling)', async () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {} }
    const result = await generateGeoPDF(sampleRealisticPlan, logger)

    expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeUndefined()
  })

  test(
    'sgSignature has no clear slot on sampleRealisticPlan at its auto-escalated size — ' +
      'documented limitation: the only width-sized gap (below the title block, above the ' +
      'figure) is 119.8pt tall but only 105.8pt usable after clearances, 4.2pt short of the ' +
      '110pt block height; see docs/superpowers/specs/2026-08-09-relocation-pass-figure-accuracy-design.md',
    async () => {
      // Intentionally brittle: 200x110 is sgSignature's configured block size, not a
      // fixture-derived value. If block-definitions.js changes those dimensions, this
      // test breaking is expected — update the expectation deliberately, don't chase it
      // as a mystery failure.
      const logger = { info: () => {}, warn: () => {}, error: () => {} }
      const result = await generateGeoPDF(sampleRealisticPlan, logger)

      expect(result.warnings.sgSignatureOverlapsPolygon).toBeDefined()
      expect(result.warnings.sgSignatureOverlapsPolygon.position).toEqual({
        x: expect.any(Number),
        y: expect.any(Number),
        width: 200,
        height: 110,
      })
    }
  )

  test(
    'split schedule (Maglas, 240 stands) exhausts every escalation level and still overlaps — ' +
      'documented limitation: the fix correctly re-checks and escalates at each step ' +
      '(ISO_A2→ISO_A1→ISO_A0→scale step-up 1:1000→1:1250), but the composite ' +
      '(860×1850pt, ~30×65cm) is genuinely too large to fit anywhere even at the largest ' +
      'sheet; see docs/superpowers/specs/2026-08-10-split-schedule-escalation-gate-design.md',
    async () => {
      // Intentionally brittle: the exact sheetSize/attempts/composite dimensions are
      // this fixture's actual geometry, not incidental values. If block-definitions.js
      // or the fixture's stand count changes, this test breaking is expected — verify
      // the new numbers reflect genuine exhaustion (not a regression in the escalation
      // logic itself) before updating the expectation.
      const logger = { info: () => {}, warn: () => {}, error: () => {} }
      const result = await generateGeoPDF(sampleMaglasPlan, logger)

      expect(result.sheetSize).toBe('ISO_A0')
      expect(result.warnings.scheduleEscalationExhausted).toEqual({
        atSheetSize: 'ISO_A0',
        attempts: 2,
        hint: 'Plan too dense for largest available paper size; some blocks may overlap the figure.',
      })
      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeDefined()
    },
    120000
  )
})
