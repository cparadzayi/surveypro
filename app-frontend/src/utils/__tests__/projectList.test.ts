import { describe, expect, it } from 'vitest'
import { filterAndSortProjects, matchesQuery } from '../projectList'

const P = (name: string, extra: Record<string, string | null> = {}) => ({ name, ...extra })
const names = (l: { name?: string | null }[]) => l.map((p) => p.name)

describe('matchesQuery', () => {
  const p = P('Maglas 1686', { client_name: 'Moyo Estates', district: 'SHABANI', survey_type: 'subdivision' })
  it('matches any field, any case', () => {
    expect(matchesQuery(p, 'shabani')).toBe(true)
    expect(matchesQuery(p, 'MOYO')).toBe(true)
    expect(matchesQuery(p, 'subdiv')).toBe(true)
  })
  it('needs every word, in any order', () => {
    expect(matchesQuery(p, '1686 moyo')).toBe(true)
    expect(matchesQuery(p, '1686 harare')).toBe(false)
  })
  it('an empty or blank query matches everything', () => {
    expect(matchesQuery(p, '')).toBe(true)
    expect(matchesQuery(p, '   ')).toBe(true)
  })
  it('copes with projects that have no optional fields', () => expect(matchesQuery(P('X'), 'x')).toBe(true))
})

describe('filterAndSortProjects', () => {
  const list = [
    P('Stand 10', { created_at: '2026-01-01', last_used: '2026-03-01' }),
    P('Stand 9', { created_at: '2026-02-01', last_used: null }),
    P('Alpha', { created_at: '2026-03-15', last_used: '2026-02-01' }),
  ]

  it('recently opened first; a never-opened project counts from when it was created', () => {
    expect(names(filterAndSortProjects(list, '', 'recent'))).toEqual(['Stand 10', 'Alpha', 'Stand 9'])
  })
  it('by name, with numbers in numeric order (9 before 10)', () => {
    expect(names(filterAndSortProjects(list, '', 'name'))).toEqual(['Alpha', 'Stand 9', 'Stand 10'])
  })
  it('newest first by creation date', () => {
    expect(names(filterAndSortProjects(list, '', 'created'))).toEqual(['Alpha', 'Stand 9', 'Stand 10'])
  })
  it('filters, and does not reorder or change the input array', () => {
    const copy = [...list]
    expect(names(filterAndSortProjects(list, 'stand', 'name'))).toEqual(['Stand 9', 'Stand 10'])
    expect(list).toEqual(copy)
  })
  it('ignores unreadable dates instead of failing', () => {
    expect(() => filterAndSortProjects([P('A', { created_at: 'garbage' }), P('B')], '', 'recent')).not.toThrow()
  })
})
