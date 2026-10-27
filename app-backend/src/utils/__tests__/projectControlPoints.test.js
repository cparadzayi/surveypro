import { describe, test, expect, jest } from '@jest/globals'
import { attachControlPoints } from '../projectControlPoints.js'

describe('attachControlPoints', () => {
  test('uses one query however many projects there are, and groups the rows by project in order', async () => {
    const query = jest.fn(async () => ({
      rows: [
        { project_id: 1, id: 10, monu_num: 'A', monu_name: 'Alpha', point_order: 1 },
        { project_id: 1, id: 11, monu_num: 'B', monu_name: 'Beta', point_order: 2 },
        { project_id: 3, id: 12, monu_num: 'C', monu_name: 'Gamma', point_order: 1 },
      ],
    }))
    const projects = [{ id: 1 }, { id: 2 }, { id: 3 }]
    await attachControlPoints({ query }, projects)

    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][1]).toEqual([[1, 2, 3]])
    expect(projects[0].control_point_ids).toEqual([10, 11])
    expect(projects[0].control_points[1]).toEqual({ id: 11, monu_num: 'B', monu_name: 'Beta', point_order: 2 })
    expect(projects[1]).toMatchObject({ control_points: [], control_point_ids: [] })
    expect(projects[2].control_point_ids).toEqual([12])
  })

  test('an empty list costs no query', async () => {
    const query = jest.fn()
    expect(await attachControlPoints({ query }, [])).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  test('ignores a row for a project that was not asked for', async () => {
    const query = async () => ({ rows: [{ project_id: 99, id: 1, monu_num: 'X', monu_name: 'X', point_order: 1 }] })
    const projects = [{ id: 1 }]
    await attachControlPoints({ query }, projects)
    expect(projects[0].control_points).toEqual([])
  })
})
