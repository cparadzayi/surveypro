/**
 * The site calibration belongs to the project it was loaded for. Opening another project used to keep the
 * previous project's calibration on screen (unsaved for the new one, gone on reload, and saved INTO it by
 * "Save & Continue"), and a save that was skipped or failed was reported only in the browser console.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const patch = vi.fn(async () => ({ data: { ok: true, workflow_state: {} } }))
const get = vi.fn()
vi.mock('../../services/api', () => ({ default: { patch: (...a: any[]) => (patch as any)(...a), get: (...a: any[]) => (get as any)(...a), post: vi.fn() } }))
vi.mock('../../services/spatial', () => ({ listCoordinatePoints: vi.fn(async () => []) }))
vi.mock('../../stores/surveyLookup', () => ({ useSurveyLookupStore: () => ({ setFieldBookPageLookup: vi.fn() }) }))

import { useCadastralWorkflow } from '../useCadastralWorkflow'

const CAL = { pairs: [{ pointId: 'ST1' }], summary: { maxHorizontalResidual: 0.01 } } as any
const projectWith = (stepData: any) => ({ data: { ok: true, workflow_state: { step_data: stepData, completed_steps: [] } } })

describe('the site calibration and the project it belongs to', () => {
  beforeEach(() => { patch.mockClear(); get.mockReset() })

  it("opening a project with no calibration does not keep the previous project's", async () => {
    const wf = useCadastralWorkflow()
    get.mockResolvedValueOnce(projectWith({ 'site-calibration': { site_calibration: CAL } }))
    await wf.loadWorkflowState(13)
    expect(wf.workflowState.documents.siteCalibration).toEqual(CAL)

    get.mockResolvedValueOnce(projectWith({}))
    await wf.loadWorkflowState(8)
    expect(wf.workflowState.documents.siteCalibration).toBeUndefined()
  })

  it('reports a calibration saved with its project', async () => {
    const wf = useCadastralWorkflow()
    wf.projectId.value = 13
    expect(await wf.setSiteCalibration(CAL)).toEqual({ saved: true })
    const body = patch.mock.calls.map((c: any) => c[1]).find((b: any) => b?.step === 'site-calibration')
    expect(body.metadata.site_calibration).toEqual(CAL)
  })

  it('says when it could not be saved: no project open, or the server did not take it', async () => {
    const wf = useCadastralWorkflow()
    wf.projectId.value = null as any
    expect((await wf.setSiteCalibration(CAL)).saved).toBe(false)

    wf.projectId.value = 13
    patch.mockRejectedValueOnce(new Error('network down'))
    const r = await wf.setSiteCalibration(CAL)
    expect(r.saved).toBe(false)
    expect(r.reason).toMatch(/server did not save/)
  })
})
