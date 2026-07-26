import { describe, it, test, expect } from 'vitest'
import { letterAt, subjectSides, upsertAnnotation, removeAnnotation, type SideAnnotation, annotationsForSubject, withSubjectAnnotations, hydrateAnnotationsMap, fractionAlongSide, endFromFraction } from '../sideAnnotations'

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

describe('contiguous end keying', () => {
  test('two contiguous neighbours coexist on one side (from + to)', () => {
    let list: SideAnnotation[] = []
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'N1', end: 'from' })
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'N2', end: 'to' })
    const ab = list.filter(a => a.side === 'AB')
    expect(ab).toHaveLength(2)
    expect(ab.map(a => a.end).sort()).toEqual(['from', 'to'])
  })

  test("'both' is exclusive: it replaces any single-end entries on the side", () => {
    let list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'N1', end: 'from' },
      { side: 'AB', role: 'contiguous', label: 'N2', end: 'to' },
    ]
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'N3', end: 'both' })
    const ab = list.filter(a => a.side === 'AB')
    expect(ab).toHaveLength(1)
    expect(ab[0]).toMatchObject({ end: 'both', label: 'N3' })
  })

  test('adding a single end replaces an existing both on the side', () => {
    let list: SideAnnotation[] = [{ side: 'AB', role: 'contiguous', label: 'B', end: 'both' }]
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'F', end: 'from' })
    const ab = list.filter(a => a.side === 'AB')
    expect(ab).toHaveLength(1)
    expect(ab[0]).toMatchObject({ end: 'from', label: 'F' })
  })

  test('re-tagging the same end replaces just that entry', () => {
    let list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'F1', end: 'from' },
      { side: 'AB', role: 'contiguous', label: 'T1', end: 'to' },
    ]
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'F2', end: 'from' })
    const ab = list.filter(a => a.side === 'AB')
    expect(ab).toHaveLength(2)
    expect(ab.find(a => a.end === 'from')).toMatchObject({ label: 'F2' })
    expect(ab.find(a => a.end === 'to')).toMatchObject({ label: 'T1' })
  })

  test('tagging a side as road drops any contiguous entries on it', () => {
    let list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'F', end: 'from' },
      { side: 'AB', role: 'contiguous', label: 'T', end: 'to' },
    ]
    list = upsertAnnotation(list, { side: 'AB', role: 'road', label: 'Klein Road' })
    expect(list.filter(a => a.side === 'AB')).toEqual([{ side: 'AB', role: 'road', label: 'Klein Road' }])
  })

  test('removeAnnotation with end removes only the matching contiguous entry', () => {
    const list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'F', end: 'from' },
      { side: 'AB', role: 'contiguous', label: 'T', end: 'to' },
    ]
    const out = removeAnnotation(list, 'AB', 'from')
    expect(out).toEqual([{ side: 'AB', role: 'contiguous', label: 'T', end: 'to' }])
  })

  test('removeAnnotation without end removes all entries on the side (legacy)', () => {
    const list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'F', end: 'from' },
      { side: 'BC', role: 'road', label: 'R' },
    ]
    expect(removeAnnotation(list, 'AB')).toEqual([{ side: 'BC', role: 'road', label: 'R' }])
  })
})

describe('click-fraction math', () => {
  test('projects a point onto the side and clamps to [0,1]', () => {
    expect(fractionAlongSide([0, 0], [100, 0], [50, 10])).toBeCloseTo(0.5, 5)
    expect(fractionAlongSide([0, 0], [100, 0], [-20, 5])).toBe(0)
    expect(fractionAlongSide([0, 0], [100, 0], [120, 5])).toBe(1)
  })

  test('degenerate zero-length side returns 0', () => {
    expect(fractionAlongSide([10, 10], [10, 10], [10, 10])).toBe(0)
  })

  test('thirds classifier maps t to end', () => {
    expect(endFromFraction(0.1)).toBe('from')
    expect(endFromFraction(0.5)).toBe('both')
    expect(endFromFraction(0.9)).toBe('to')
    expect(endFromFraction(1 / 3)).toBe('both')  // boundary inclusive to middle
    expect(endFromFraction(2 / 3)).toBe('both')
  })
})
