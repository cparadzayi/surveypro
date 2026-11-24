import { describe, it, expect } from 'vitest'
import { validateAndParseCSV } from '../cadastral-csv'

// goodyear2026's field data headed the name column "NAMES " (and "DESCRIPTION " with a trailing space).
// Only "point" was read, so all 453 points imported with no name and none could be stored as a beacon.
const GOODYEAR_HEAD = 'NAMES ,Y,X,STATUS,DESCRIPTION ,DATE\r\n'
  + '48/T    ,-78195.17,2144227.55,TRIG ,CHESHIEE,9/8/2026\r\n'
  + 'CTM3,-76174.791,2146093.441,P/WS,1233 IRON Peg,\r\n'
  + '44NEW,-78200.588,2145228.65,F,12mm iron peg in concrete ,\r\n'

describe('the point-name column', () => {
  it('reads the names from a column headed "NAMES " (goodyear2026)', () => {
    const r = validateAndParseCSV(GOODYEAR_HEAD)
    expect(r.isValid).toBe(true)
    expect(r.preview.map(p => p.id)).toEqual(['48/T', 'CTM3', '44NEW'])
    expect(r.preview[2].status).toBe('F')
    expect(r.preview[2].description).toBe('12mm iron peg in concrete')
  })

  it.each(['Point', 'Name', 'Point Name', 'Station', 'Beacon'])('accepts a column headed "%s"', (head) => {
    const r = validateAndParseCSV(`${head},Y,X,Status,Description\nA1,-76000.1,2146000.2,F,peg\n`)
    expect(r.isValid).toBe(true)
    expect(r.preview[0].id).toBe('A1')
  })

  it('refuses a file with no name column, saying what the header reads', () => {
    const r = validateAndParseCSV('Label,Y,X\nA1,-76000.1,2146000.2\n')
    expect(r.isValid).toBe(false)
    expect(r.errors[0].message).toMatch(/No point-name column found\. The header reads "Label, Y, X"/)
    expect(r.preview).toHaveLength(0)
  })

  it('refuses rows that have co-ordinates but no name, naming the rows', () => {
    const r = validateAndParseCSV('Point,Y,X\nA1,-76000.1,2146000.2\n,-76001.1,2146001.2\n,-76002.1,2146002.2\n')
    expect(r.isValid).toBe(false)
    expect(r.errors.some(e => /2 rows have no point name \(rows 3, 4\)/.test(e.message))).toBe(true)
  })
})

describe('the goodyear2026 file itself', () => {
  it('parses every one of its 453 points with a name', async () => {
    const fs = await import('fs')
    const file = 'C:/Users/Dr Paradzayi/Downloads/GOOD YEAR FIELD DATA .csv'
    if (!fs.existsSync(file)) return
    const r = validateAndParseCSV(fs.readFileSync(file, 'utf8'))
    expect(r.isValid).toBe(true)
    expect(r.preview).toHaveLength(453)
    expect(r.preview.filter(p => !p.id)).toHaveLength(0)
    expect(new Set(r.preview.map(p => p.id)).size).toBeGreaterThan(400)
  })
})
