import { describe, it, expect } from 'vitest'
import {
  sheetSubjectId, parseSheetSubjectId, buildSheetSubjects, pointInRing,
  sheetSubjectAt, adjoiningSubjectsFor,
} from '../sheetSubjects'
import type { SideAnnotation } from '../sideAnnotations'

// Two halves of a 100 x 100 figure, cut at y = 50. y westing, x southing.
const sheets = [
  { sheetNumber: 1, totalSheets: 2, ring: [{ y: 0, x: 0 }, { y: 50, x: 0 }, { y: 50, x: 100 }, { y: 0, x: 100 }] },
  { sheetNumber: 2, totalSheets: 2, ring: [{ y: 50, x: 0 }, { y: 100, x: 0 }, { y: 100, x: 100 }, { y: 50, x: 100 }] },
]
const road: SideAnnotation = { side: 'AB', role: 'road', label: 'Klein Road', widthM: 20 }

describe('sheet subject ids', () => {
  it('round-trips the sheet number and never matches a plain parcel id', () => {
    expect(sheetSubjectId(7, 2)).toBe('7#sheet2')
    expect(parseSheetSubjectId('7#sheet2')).toBe(2)
    expect(parseSheetSubjectId(7)).toBeNull()
    expect(parseSheetSubjectId(null)).toBeNull()
  })
})

describe('buildSheetSubjects', () => {
  it('makes one labelled subject per sheet, ring in parcel geom order and closed', () => {
    const subs = buildSheetSubjects(7, sheets)
    expect(subs.map(s => s.id)).toEqual(['7#sheet1', '7#sheet2'])
    expect(subs.map(s => s.label)).toEqual(['Outside Figure Sheet 1', 'Outside Figure Sheet 2'])
    // [Southing, Westing] = [x, y]
    expect(subs[1].ring[0]).toEqual([0, 50])
    expect(subs[1].ring[subs[1].ring.length - 1]).toEqual(subs[1].ring[0])
  })
  it('is empty for a single sheet or no figure: single-sheet behaviour is unchanged', () => {
    expect(buildSheetSubjects(7, [sheets[0]])).toEqual([])
    expect(buildSheetSubjects(7, undefined)).toEqual([])
    expect(buildSheetSubjects(null, sheets)).toEqual([])
  })
})

describe('picking a sheet by click', () => {
  const subs = buildSheetSubjects(7, sheets)
  it('point-in-ring', () => {
    expect(pointInRing([10, 10], [[0, 0], [20, 0], [20, 20], [0, 20]])).toBe(true)
    expect(pointInRing([30, 10], [[0, 0], [20, 0], [20, 20], [0, 20]])).toBe(false)
  })
  it('returns the sheet the click falls in (frame: [x, y])', () => {
    expect(sheetSubjectAt([40, 20], subs)).toBe('7#sheet1')
    expect(sheetSubjectAt([40, 80], subs)).toBe('7#sheet2')
    expect(sheetSubjectAt([40, 500], subs)).toBeNull()
  })
})

describe('adjoiningSubjectsFor (what reaches the PDF/DXF)', () => {
  const subs = buildSheetSubjects(7, sheets)
  const ringFor = (id: string) =>
    subs.find(s => s.id === id)?.ring ?? (id === '7' ? [[0, 0], [0, 100], [100, 100], [100, 0], [0, 0]] as [number, number][] : null)

  it('keeps each sheet\'s tags apart and stamps the sheet number', () => {
    const out = adjoiningSubjectsFor(
      { '7#sheet1': [road], '7#sheet2': [{ ...road, label: 'Other Road' }] },
      ringFor, { outsideFigureId: 7, sheetSubjects: subs })
    expect(out.map(o => [o.subjectId, o.sheetNumber, o.annotations[0].label])).toEqual([
      ['7#sheet1', 1, 'Klein Road'], ['7#sheet2', 2, 'Other Road']])
  })
  it('drops the unsplit figure\'s tags once split, and tags of a sheet the cut no longer makes', () => {
    const out = adjoiningSubjectsFor(
      { '7': [road], '7#sheet2': [road], '7#sheet3': [road] },
      ringFor, { outsideFigureId: 7, sheetSubjects: subs })
    expect(out.map(o => o.subjectId)).toEqual(['7#sheet2'])
  })
  it('single sheet: the outside figure and stands go out exactly as before, with no sheetNumber', () => {
    const out = adjoiningSubjectsFor({ '7': [road] }, ringFor, { outsideFigureId: 7, sheetSubjects: [] })
    expect(out).toHaveLength(1)
    expect(out[0].sheetNumber).toBeUndefined()
  })
})
