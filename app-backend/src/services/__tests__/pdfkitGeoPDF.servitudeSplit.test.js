import { describe, test, expect } from '@jest/globals'
import PDFDocument from 'pdfkit'
import { planServitudePieces } from '../pdfkitGeoPDF.js'

const rows = Array.from({ length: 40 }, (_, i) => ({ stands: `${1000 + i} - ${1001 + i}`, boundary: `${i + 1}-${i + 2}` }))
const doc = new PDFDocument()
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

describe('planServitudePieces', () => {
  test('splits a long statement into tables that together carry every row once', () => {
    // paper with no pocket tall enough for the whole table: each box may be at most 300 high
    const place = (w, h, trial) => {
      if (h > 300) return null
      let y = 0
      while (trial.some((t) => overlap({ x: 0, y, width: w, height: h }, t))) y += 10
      return { x: 0, y }
    }
    const pieces = planServitudePieces({ doc, rows, place })
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.flatMap((p) => p.rows)).toEqual(rows)
    expect(pieces[0].heading).toBe('Party-wall servitudes data')
    expect(pieces.slice(1).every((p) => /cont'd/.test(p.heading))).toBe(true)
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) expect(overlap(pieces[i], pieces[j])).toBe(false)
  })

  test('is narrower than the one-box statement’s 250pt minimum when its content allows', () => {
    const pieces = planServitudePieces({ doc, rows, place: (w, h, t) => ({ x: 0, y: t.length * 1000 }) })
    expect(pieces[0].width).toBeLessThan(250)
  })

  test('returns null when no split finds room, and for a single row', () => {
    expect(planServitudePieces({ doc, rows, place: () => null })).toBeNull()
    expect(planServitudePieces({ doc, rows: rows.slice(0, 1), place: () => ({ x: 0, y: 0 }) })).toBeNull()
  })
})
