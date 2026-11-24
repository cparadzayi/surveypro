import { describe, it, expect } from 'vitest'
import { buildMergePayload } from '../mergePayload'

// A re-import's smart merge used to send only { id, y, x }, so new points were stored with no status or
// description and a matched point could never take the file's corrected status (goodyear2026).
describe('buildMergePayload', () => {
  const file = [
    { id: '1237A', original: { y: -76000.1, x: 2146000.2 }, status: 'P', description: '12mm iron peg in concrete', surveyDate: '2026-10-14' },
    { id: '48/T', original: { y: -78195.17, x: 2144227.55 }, status: 'F', description: 'Trig beacon' },
    { id: 'NEW1', original: { y: -76010, x: 2146010 }, status: 'P', description: 'Iron peg', surveyDate: null },
  ]
  const analysis = {
    matched: [
      { oldId: '1237a', oldDbId: 7, newId: '1237A', coordinate: { y: -76000.1, x: 2146000.2 }, distance: 0 },
      { oldId: '48/T', oldDbId: 8, newId: '48/T', coordinate: { y: -78195.17, x: 2144227.55 }, distance: 0 },
    ],
    newPoints: [{ id: 'NEW1', coordinate: { y: -76010, x: 2146010 } }],
  }

  it('carries each point’s status, description and survey date from the file', () => {
    const p = buildMergePayload(file, analysis)
    expect(p.matched_points[0]).toMatchObject({ oldDbId: 7, newId: '1237A', status: 'P', description: '12mm iron peg in concrete', surveyDate: '2026-10-14' })
    expect(p.matched_points[1]).toMatchObject({ oldDbId: 8, status: 'F', description: 'Trig beacon' })
    expect(p.new_points).toEqual([{ id: 'NEW1', y: -76010, x: 2146010, status: 'P', description: 'Iron peg' }])
  })

  it('leaves out what the file does not state, so the server keeps the stored value', () => {
    const p = buildMergePayload(file, analysis)
    expect('surveyDate' in p.matched_points[1]).toBe(false)
    expect('surveyDate' in p.new_points[0]).toBe(false)
  })

  it('finds a point whose name differs only in case', () => {
    const p = buildMergePayload([{ id: 'abc', status: 'F' }], { matched: [{ oldId: 'ABC', oldDbId: 1, newId: 'ABC', coordinate: { y: 0, x: 0 }, distance: 0 }], newPoints: [] })
    expect(p.matched_points[0].status).toBe('F')
  })
})
