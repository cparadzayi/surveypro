import { describe, it, expect } from 'vitest'
import { letterAt, subjectSides, upsertAnnotation, removeAnnotation, type SideAnnotation, annotationsForSubject, withSubjectAnnotations, hydrateAnnotationsMap } from '../sideAnnotations'

describe('letterAt', () => {
  it('is A..Z then AA', () => {
    expect(letterAt(0)).toBe('A')
    expect(letterAt(25)).toBe('Z')
    expect(letterAt(26)).toBe('AA')
  })
})

describe('subjectSides', () => {
  const square: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]] // closed
  it('gives AB,BC,CD,DA with endpoints, dropping the closing duplicate', () => {
    const sides = subjectSides(square)
    expect(sides.map(s => s.side)).toEqual(['AB', 'BC', 'CD', 'DA'])
    expect(sides[0]).toMatchObject({ side: 'AB', from: 'A', to: 'B', a: [0, 0], b: [0, 10] })
    expect(sides[3]).toMatchObject({ side: 'DA', from: 'D', to: 'A', a: [10, 0], b: [0, 0] })
  })
  it('handles an open ring (no closing duplicate) the same', () => {
    const open: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]]
    expect(subjectSides(open).map(s => s.side)).toEqual(['AB', 'BC', 'CD', 'DA'])
  })
  it('returns [] for a degenerate ring (<3 points)', () => {
    expect(subjectSides([[0, 0], [1, 1]])).toEqual([])
  })
})

describe('upsertAnnotation / removeAnnotation', () => {
  it('adds, replaces by side, and removes', () => {
    let list: SideAnnotation[] = []
    list = upsertAnnotation(list, { side: 'AB', role: 'road', label: 'Klein Road' })
    expect(list).toHaveLength(1)
    list = upsertAnnotation(list, { side: 'AB', role: 'servitude', widthM: 3 }) // replace AB
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ side: 'AB', role: 'servitude', widthM: 3 })
    list = upsertAnnotation(list, { side: 'BC', role: 'contiguous', label: 'STAND 86' })
    expect(list).toHaveLength(2)
    list = removeAnnotation(list, 'AB')
    expect(list.map(a => a.side)).toEqual(['BC'])
  })
})

describe('annotationsForSubject', () => {
  const map = { '5': [{ side: 'AB', role: 'road' as const }] }
  it('returns the subject list (by string or number id) or [] / [] for null', () => {
    expect(annotationsForSubject(map, 5)).toEqual([{ side: 'AB', role: 'road' }])
    expect(annotationsForSubject(map, '5')).toHaveLength(1)
    expect(annotationsForSubject(map, 9)).toEqual([])
    expect(annotationsForSubject(map, null)).toEqual([])
  })
})

describe('withSubjectAnnotations', () => {
  it('immutably sets the subject key, leaving others', () => {
    const map = { '5': [] as any[] }
    const next = withSubjectAnnotations(map, 7, [{ side: 'BC', role: 'servitude', widthM: 3 }])
    expect(next).not.toBe(map)
    expect(next['7']).toHaveLength(1)
    expect(next['5']).toEqual([])
  })
})

describe('hydrateAnnotationsMap', () => {
  it('passes a valid map and coerces junk to {}', () => {
    expect(hydrateAnnotationsMap({ '5': [{ side: 'AB', role: 'road' }] }))
      .toEqual({ '5': [{ side: 'AB', role: 'road' }] })
    expect(hydrateAnnotationsMap(undefined)).toEqual({})
    expect(hydrateAnnotationsMap('nope')).toEqual({})
    expect(hydrateAnnotationsMap({ '5': 'notarray', '6': [] })).toEqual({ '6': [] })
  })
})
