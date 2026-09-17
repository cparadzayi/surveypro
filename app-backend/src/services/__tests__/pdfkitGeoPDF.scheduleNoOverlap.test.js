import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js'
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js'

// sampleRealisticPlan has 12 stands (single-table schedule — doesn't trigger
// the separate SPLIT-schedule escalation gap, isScheduleWithFluidFallback in
// pdfkitGeoPDF.js, which is a different, much denser scenario handled by the
// 'split schedule (Maglas...)' test below (that fixture genuinely exhausts
// every escalation level — see its test for the full story)) and no
// `outsideFigure` field — the exact scenario that originally reproduced the
// reported overlap bug. Checking the returned `warnings` object (not raw log
// text) reflects only the final, actually-returned attempt: escalation
// resolves the overlap on the real (smaller) SI 727 paper via the accurate-
// polygon escalation gate fix (see
// docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md),
// so scheduleOfAreasOverlapsPolygon is correctly never set in the final
// result, even though an earlier, superseded attempt may warn transiently.
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
    'split schedule (Maglas, 240 stands) seats cleanly in the figure’s side strips — ' +
      'previously a documented limitation (the schedule was sized as ONE contiguous ' +
      '860×1850pt composite, too wide for either 567pt gutter a centred figure leaves, ' +
      'so every escalation level was exhausted and it was dropped over the figure; see ' +
      'docs/superpowers/specs/2026-08-10-split-schedule-escalation-gate-design.md). The ' +
      'schedule is now seated BEFORE the other blocks as one capped column per gutter ' +
      'plus a remainder, so nothing overlaps and no escalation is needed.',
    async () => {
      const logger = { info: () => {}, warn: () => {}, error: () => {} }
      const result = await generateGeoPDF(sampleMaglasPlan, logger)

      // Still the largest sheet: 240 stands at 1:1250 genuinely need it. What
      // changed is that the layout now RESOLVES there instead of exhausting.
      expect(result.sheetSize).toBe('SI727_1000x800')
      expect(result.warnings.scheduleEscalationExhausted).toBeUndefined()
      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeUndefined()
    },
    300000
  )
})
