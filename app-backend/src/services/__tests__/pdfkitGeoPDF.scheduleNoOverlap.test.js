import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js'

// sampleRealisticPlan has 12 stands (single-table schedule — doesn't trigger
// the separate, still-open paper-size-escalation gap for SPLIT schedules,
// isScheduleWithFluidFallback in pdfkitGeoPDF.js, which is a different,
// not-yet-fixed bug) and no `outsideFigure` field — the exact scenario that
// originally reproduced the reported overlap bug. Checking the returned
// `warnings` object (not raw log text) reflects only the final, actually-
// returned attempt: if escalation resolves the overlap on a retry (as it
// now does for this fixture, ISO_A2→ISO_A1), scheduleOfAreasOverlapsPolygon
// is correctly never set, even though an earlier, superseded attempt did
// warn transiently.
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
})
