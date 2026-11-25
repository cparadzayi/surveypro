import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.fn(async (_url: string, _body?: any) => ({ data: { ok: true, data: { id: 4 } } }))
const clearCoordinatePointsCache = vi.fn()
vi.mock('../api', () => ({ default: { post: (url: string, body?: any) => post(url, body) } }))
vi.mock('../coordinatePointCache', () => ({ clearCoordinatePointsCache: () => clearCoordinatePointsCache() }))

import { adoptCoordinatePoint } from '../adoptedBeacons'

describe('adoptCoordinatePoint', () => {
  beforeEach(() => {
    post.mockClear()
    clearCoordinatePointsCache.mockClear()
  })

  it('posts the source citation and drops the stale coordinate point cache', async () => {
    const row = await adoptCoordinatePoint(12, {
      pointName: '2474a',
      srNumber: '112/2021',
      surveyDate: 'February-21',
    })

    expect(post).toHaveBeenCalledWith('/adopted-beacons/adopt', {
      project_id: 12,
      point_name: '2474a',
      sr_number: '112/2021',
      survey_date: 'February-21',
    })
    expect(clearCoordinatePointsCache).toHaveBeenCalledTimes(1)
    expect(row).toEqual({ id: 4 })
  })
})
