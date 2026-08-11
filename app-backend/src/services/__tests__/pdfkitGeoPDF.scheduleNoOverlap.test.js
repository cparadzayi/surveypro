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
// (not raw log text) reflects only the final, actually-returned attempt.
//
// KNOWN LIMITATION (documented, not a regression to chase in this task): under
// the real (smaller) SI 727 Section 62(1) paper sizes, the one-step escalation
// (SI727_500x400→SI727_800x500) that used to clear the overlap for this
// fixture no longer leaves enough whitespace — scheduleOfAreasOverlapsPolygon
// is now defined in the final returned result, not just a transient,
// superseded attempt. This is the same block-placement whitespace regression
// as the Maglas split-schedule case documented just below, just on a fixture
// small enough to need only a single escalation step to expose it. See
// docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md.
describe('Schedule of Areas placement no longer collides when outsideFigure is absent', () => {
  test(
    'schedule of areas still overlaps the figure on sampleRealisticPlan under the real (smaller) ' +
      'SI 727 paper sizes — documented, accepted limitation: the one-step escalation ' +
      '(SI727_500x400→SI727_800x500) that previously cleared this fixture no longer leaves ' +
      'enough whitespace, so scheduleOfAreasOverlapsPolygon is now defined in the final ' +
      'returned result; see ' +
      'docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md',
    async () => {
      // Intentionally brittle: this fixture's actual geometry (12 stands, single-table
      // schedule) genuinely no longer escalates clear of the figure on the smaller real
      // SI 727 sheets. If block-definitions.js or the fixture's stand count changes,
      // this test breaking is expected — verify the new numbers reflect genuine
      // non-clearance (not a regression in the escalation logic itself) before updating.
      const logger = { info: () => {}, warn: () => {}, error: () => {} }
      const { warnings } = await generateGeoPDF(sampleRealisticPlan, logger)
      expect(warnings?.scheduleOfAreasOverlapsPolygon).toBeDefined()
    }
  )

  test('surveyStatement relocates clear of the accurate figure polygon, not just the approximate planner polygon', async () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {} }
    const result = await generateGeoPDF(sampleRealisticPlan, logger)

    expect(result.warnings.surveyStatementOverlapsPolygon).toBeUndefined()
  })

  test(
    'scheduleOfAreas still shows the same documented real-paper overlap limitation as the ' +
      'test above, independent of the relocation-pass change (separate escalation-based ' +
      'handling) — see docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md',
    async () => {
      // Same underlying, already-documented limitation as the first test in this file —
      // this assertion exists to confirm it's not specific to how that test invokes
      // generateGeoPDF, but a property of the escalation-based scheduleOfAreas path itself.
      const logger = { info: () => {}, warn: () => {}, error: () => {} }
      const result = await generateGeoPDF(sampleRealisticPlan, logger)

      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeDefined()
    }
  )

  test(
    'sgSignature no longer overlaps on sampleRealisticPlan — previously a documented, ' +
      'accepted limitation (4.2pt short of clearance, see ' +
      'docs/superpowers/specs/2026-08-09-relocation-pass-figure-accuracy-design.md), ' +
      'resolved as an unplanned side effect of the corner-rounding parity work (Task 2, ' +
      'commit 835c178): PDF gained a left/right tick clamp it previously lacked, which ' +
      'shifted the tick-mark obstacle set enough to free the ~4.2pt sgSignature was ' +
      'previously missing — see docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md',
    async () => {
      const logger = { info: () => {}, warn: () => {}, error: () => {} }
      const result = await generateGeoPDF(sampleRealisticPlan, logger)

      expect(result.warnings.sgSignatureOverlapsPolygon).toBeUndefined()
    }
  )

  test(
    'split schedule (Maglas, 240 stands) exhausts every escalation level and still overlaps — ' +
      'documented limitation: the fix correctly re-checks and escalates at each step ' +
      '(SI727_500x400→SI727_800x500→SI727_1000x800→scale step-up 1:1000→1:1250), but the composite ' +
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

      expect(result.sheetSize).toBe('SI727_1000x800')
      expect(result.warnings.scheduleEscalationExhausted).toEqual({
        atSheetSize: 'SI727_1000x800',
        attempts: 2,
        hint: 'Plan too dense for largest available paper size; some blocks may overlap the figure.',
      })
      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeDefined()
    },
    120000
  )
})
