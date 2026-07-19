import { describe, it, expect } from 'vitest'
import { coordinateToImportedPoint } from '../importedPointFromCoordinate'

describe('coordinateToImportedPoint', () => {
  it('maps a coordinate_points row to the importedPoints element shape', () => {
    const p = coordinateToImportedPoint({
      name: '86B', y: -85728.77, x: 2143972.22, status: 'F', description: 'RM', survey_date: '2026-06-30T00:00:00.000Z',
    })
    expect(p.id).toBe('86B')
    expect(p.original).toEqual({ y: -85728.77, x: 2143972.22 })
    expect(p.fieldBook).toEqual({ y: '-85728.770', x: '2143972.220' })      // 3 dp
    expect(p.coordinateList).toEqual({ y: '-85728.77', x: '2143972.22' })    // 2 dp
    expect(p.status).toBe('F')
    expect(p.description).toBe('RM')
    expect(p.includeInFieldBook).toBe(true)
    expect(p.includeInCoordinateList).toBe(true)
    expect(p.surveyDate instanceof Date).toBe(true)
  })

  it('treats null/absent status and description as undefined', () => {
    const p = coordinateToImportedPoint({ name: 'P1', y: 1, x: 2, status: null, description: null })
    expect(p.status).toBeUndefined()
    expect(p.description).toBeUndefined()
  })

  it('defaults non-finite coordinates to 0', () => {
    const p = coordinateToImportedPoint({ name: 'X', y: NaN as any, x: undefined as any })
    expect(p.original).toEqual({ y: 0, x: 0 })
    expect(p.fieldBook).toEqual({ y: '0.000', x: '0.000' })
  })
})
