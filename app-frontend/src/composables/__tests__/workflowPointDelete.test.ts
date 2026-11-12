import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const patch = vi.fn(async () => ({ data: { ok: true } }))
vi.mock('../../services/api', () => ({ default: { patch: (...a: any[]) => (patch as any)(...a), get: vi.fn(), post: vi.fn() } }))
const listCoordinatePoints = vi.fn()
vi.mock('../../services/spatial', () => ({ listCoordinatePoints: (...a: any[]) => listCoordinatePoints(...a) }))
vi.mock('../../stores/surveyLookup', () => ({ useSurveyLookupStore: () => ({}) }))

import { useCadastralWorkflow } from '../useCadastralWorkflow'

// scenic 1: SLA, SLB and SLC were deleted (the registry holds the rest) but the saved import step and the saved
// calculation results still held them, so the next Calculations run put them back in the Field Book and the
// Co-ordinate List.
const names = ['102B', '96C', 'SLA', 'SLB', 'SLC', 'SLE']
const imported = names.map((id) => ({ id, original: { y: -103500, x: 2176600 }, status: 'P', description: '12mm iron peg', surveyDate: null }))
const adjusted = names.map((pointId) => ({ pointId, y: -103500, x: 2176600, status: 'P' }))

function seed() {
  const wf = useCadastralWorkflow()
  wf.workflowState.importedPoints = imported.map((p) => ({ ...p })) as any
  wf.workflowState.adjustedCoordinates = adjusted.map((p) => ({ ...p })) as any
  wf.projectId.value = 3
  return wf
}

describe('deleted points leave every copy the workflow keeps', () => {
  beforeEach(() => { vi.useFakeTimers(); patch.mockClear(); listCoordinatePoints.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  const savedStep = (step: string) => patch.mock.calls.map((c: any) => c[1]).filter((b: any) => b?.step === step).pop()

  it('removePointsFromWorkflow takes the point out of the import step and the adjusted coordinates, and persists both', async () => {
    const wf = seed()
    await wf.removePointsFromWorkflow(['SLA', 'SLB', 'SLC'])
    await vi.advanceTimersByTimeAsync(200)

    expect(wf.workflowState.importedPoints.map((p: any) => p.id)).toEqual(['102B', '96C', 'SLE'])
    expect(wf.workflowState.adjustedCoordinates!.map((p: any) => p.pointId)).toEqual(['102B', '96C', 'SLE'])

    const csv = savedStep('csv-import')
    expect(csv.metadata.points.map((p: any) => p.id)).toEqual(['102B', '96C', 'SLE'])
    const calc = savedStep('calculations-part1')
    expect(calc.metadata.adjusted_coordinates.map((p: any) => p.pointId)).toEqual(['102B', '96C', 'SLE'])
  })

  it('reconcilePointsWithRegistry repairs a project whose deleted points are still in the saved copies', async () => {
    const wf = seed()
    listCoordinatePoints.mockResolvedValue(['102B', '96C', 'SLE'].map((name) => ({ name })))
    const dropped = await wf.reconcilePointsWithRegistry()
    await vi.advanceTimersByTimeAsync(200)

    expect(dropped.sort()).toEqual(['SLA', 'SLB', 'SLC'])
    expect(wf.workflowState.importedPoints.map((p: any) => p.id)).toEqual(['102B', '96C', 'SLE'])
    expect(savedStep('csv-import').metadata.points).toHaveLength(3)
  })

  it('reconcilePointsWithRegistry does nothing when the registry has no rows, or cannot be read', async () => {
    const wf = seed()
    listCoordinatePoints.mockResolvedValue([])
    expect(await wf.reconcilePointsWithRegistry()).toEqual([])
    listCoordinatePoints.mockRejectedValue(new Error('offline'))
    expect(await wf.reconcilePointsWithRegistry()).toEqual([])
    expect(wf.workflowState.importedPoints).toHaveLength(names.length)
    expect(patch).not.toHaveBeenCalled()
  })

  it('reconcilePointsWithRegistry leaves a project that is already in step alone', async () => {
    const wf = seed()
    listCoordinatePoints.mockResolvedValue(names.map((name) => ({ name })))
    expect(await wf.reconcilePointsWithRegistry()).toEqual([])
    expect(patch).not.toHaveBeenCalled()
  })
})
