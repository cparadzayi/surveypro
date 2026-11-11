import { describe, it, expect } from 'vitest'
import { buildFieldCsv, fieldCsvFileName, FIELD_CSV_HEADER } from '../fieldCsv'
import { validateAndParseCSV } from '../cadastral-csv'

const pts = [
  { id: '1665A', original: { y: 97538.004, x: 2247107.872 }, status: 'P', description: '12mm iron peg', surveyDate: new Date(2026, 9, 1) },
  { id: 'CP1', original: { y: 97266.71, x: 2247924 }, status: '', description: 'Not beaconed, "town" mark', surveyDate: null },
]

describe('buildFieldCsv', () => {
  it('writes the importer\'s columns, one row per point, current values', () => {
    const csv = buildFieldCsv(pts)
    const lines = csv.trim().split(/\r?\n/)
    expect(lines[0]).toBe(FIELD_CSV_HEADER)
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('1665A,97538.004,2247107.872,P,12mm iron peg,01/10/2026')
  })

  it('quotes a description holding a comma or quote, and leaves a missing date empty', () => {
    const lines = buildFieldCsv(pts).trim().split(/\r?\n/)
    expect(lines[2]).toBe('CP1,97266.71,2247924,,"Not beaconed, ""town"" mark",')
  })

  it('reflects a change made after import (a point removed, a status corrected)', () => {
    const edited = [{ ...pts[0], status: 'F' }]
    const lines = buildFieldCsv(edited).trim().split(/\r?\n/)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain(',F,')
  })

  it('round-trips through the importer', () => {
    const parsed = validateAndParseCSV(buildFieldCsv(pts), 31)
    expect(parsed.errors).toEqual([])
    expect(parsed.summary.totalPoints).toBe(2)
    expect(parsed.preview.map((p) => p.id)).toEqual(['1665A', 'CP1'])
    expect(parsed.preview[0].original).toEqual({ y: 97538.004, x: 2247107.872 })
  })

  it('names the file after the project and the download date', () => {
    expect(fieldCsvFileName('Maglas 1686/Shabani', new Date(2026, 10, 11))).toBe('Maglas_1686_Shabani_field_data_2026-11-11.csv')
  })
})
