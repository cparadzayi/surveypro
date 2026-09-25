import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'

/**
 * The divided figure: a far mark must not shrink the survey it merely stands
 * near. On AUTO a sheet whose outlying reference marks would force the figure
 * one prescribed scale coarser than the survey alone needs instead draws the
 * survey at the finer scale and carries those marks in the MERGED MAP -- the
 * survey's own footprint with them, drawn to scale together, framed close
 * around them in the inset box -- instead of a separate EXTENSION frame.
 * Control the map cannot hold at that scale is carried on the conventional
 * locality sketch, whose schematic positions never pretend to a scale.
 *
 * The rule that governs it, deliberately narrow:
 *   - Ring vertices never move. A beacon a parcel ring (or the remainder ring)
 *     is built from is a corner of the figure, and removing the corner leaves a
 *     boundary that does not close. Only non-ring marks are eligible.
 *   - Only on AUTO. An explicit scale is the surveyor's instruction for the
 *     whole sheet, not a suggestion.
 *   - Only on a SCALE GAP: the outlier must cost the figure at least one
 *     prescribed scale rung, or the reorganisation buys nothing.
 */

/** Texts on a layer, in the order they appear in the file. */
const texts = (dxf, layer) => {
  const lines = dxf.split('\n')
  const out = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== 'TEXT') continue
    let j = i + 2; const d = {}
    while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
    if ((d['8'] || [])[0] === layer) out.push((d['1'] || [''])[0])
  }
  return out
}

/** Text positions for a given string, anywhere on the sheet. */
const at = (dxf, want) => {
  const lines = dxf.split('\n')
  const sets = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== 'TEXT') continue
    let j = i + 2; const d = {}
    while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
    if ((d['1'] || [''])[0] === want) sets.push([+d['10'][0], +d['20'][0]])
  }
  return sets
}

/** INSERT (beacon block) insertion points. */
const inserts = (dxf) => {
  const lines = dxf.split('\n')
  const out = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === '0' && lines[i + 1] === 'INSERT') {
      let j = i + 2; const d = {}
      while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
      out.push([+d['10'][0], +d['20'][0]])
    }
  }
  return out
}

/** Counts of POLYLINE rings on a layer, by vertex count: { 24: n, 4: m, ... }. */
const rings = (dxf, layer) => {
  const lines = dxf.split('\n')
  const counts = {}
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== 'POLYLINE') continue
    let j = i + 2; let on = false
    while (j < lines.length - 1 && lines[j] !== '0') {
      if (lines[j] === '8') { on = lines[j + 1] === layer; break }
      j += 2
    }
    if (!on) continue
    let n = 0
    for (let k = i + 2; k < lines.length - 1; k++) {
      if (lines[k] === '0') {
        if (lines[k + 1] !== 'VERTEX') break
        n++
      }
    }
    counts[n] = (counts[n] || 0) + 1
  }
  return counts
}

/** The sheet border, as a closed polygon of sheet points. */
const sheetBorder = (dxf) => {
  const lines = dxf.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== 'POLYLINE') continue
    let layer = null
    for (let j = i + 2; j < i + 20; j++) {
      if (lines[j] === '0') break
      if (lines[j] === '8') { layer = lines[j + 1]; break }
    }
    if (layer !== 'SHEET-BORDER') continue
    const v = []
    let inVertex = false
    for (let j = i + 2; j < lines.length - 1; j++) {
      if (lines[j] === '0') {
        if (lines[j + 1] === 'SEQEND') break
        inVertex = lines[j + 1] === 'VERTEX'
      }
      if (inVertex && lines[j] === '10') v.push([+lines[j + 1], +lines[j + 3]])
    }
    return v
  }
  return null
}

/** A small survey: a 100 x 100 m ring, optionally with outlying marks. */
const survey = (rm) => ({
  scale: 'auto',
  beacons: [
    { name: 'A', X: 2144000, Y: -85700, symbol: 'peg', label: 'auto' },
    { name: 'B', X: 2144000, Y: -85600, symbol: 'peg', label: 'auto' },
    { name: 'C', X: 2144100, Y: -85600, symbol: 'peg', label: 'auto' },
    { name: 'D', X: 2144100, Y: -85700, symbol: 'peg', label: 'auto' },
    ...rm,
  ],
  parcels: [{ label: '404', ring: ['A', 'B', 'C', 'D'] }],
  title: ['WORKING PLAN OF', 'Stand 404'],
})

/** Two reference marks 300 m east of the ring: the merged-map case. */
const farMarks = () => [
  { name: 'R1', X: 2144100, Y: -86000, symbol: 'rm', label: 'N' },
  { name: 'R2', X: 2144200, Y: -86000, symbol: 'rm', label: 'S' },
]

describe('generateWorkingPlan — the divided figure', () => {
  test('carries a far non-ring mark in the merged map and draws the survey finer', () => {
    // The 100 m ring alone fits at 1:1000; holding two marks 300 m east it
    // would be 1:4000. The split gives the survey its 1:1000 and maps the
    // survey's footprint with both marks, to scale, in the one inset.
    const out = generateWorkingPlan(survey(farMarks()))
    expect(out.scale).toBe(1000)

    // Not main-figure beacons any more ...
    expect(inserts(out.dxf)).toHaveLength(4)
    expect(texts(out.dxf, 'BEACON-TEXT')).toEqual(expect.not.arrayContaining(['R1', 'R2']))
    // ... they map beside the survey's footprint, and the map says its scale.
    expect(out.dxf).toContain('INSET 1 (1:4000)')
    expect(texts(out.dxf, 'INSET')).toContain('R1')
    expect(texts(out.dxf, 'INSET')).toContain('R2')
    // There is no second frame to number: the map IS the locality diagram.
    expect(out.dxf).not.toContain('EXTENSION')

    // 100 m of ground between them at 1:4000 is 25 mm of paper.
    const p1 = at(out.dxf, 'R1')[0], p2 = at(out.dxf, 'R2')[0]
    const sep = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    expect(sep).toBeCloseTo(25.0, 0)

    // The map is not just the footprint's blank box: the survey's own corners
    // are drawn inside it at the same true positions, one ring sign each, with
    // the two far marks -- six inset signs in all.
    const r = rings(out.dxf, 'INSET')
    expect(r[24]).toBe(6)

    // Both sit inside the inset box, which sits inside the sheet.
    const box = sheetBorder(out.dxf)
    for (const p of [p1, p2]) {
      expect(p[0]).toBeGreaterThan(Math.min(...box.map((q) => q[0])))
      expect(p[0]).toBeLessThan(Math.max(...box.map((q) => q[0])))
      expect(p[1]).toBeGreaterThan(Math.min(...box.map((q) => q[1])))
      expect(p[1]).toBeLessThan(Math.max(...box.map((q) => q[1])))
    }
  })

  test('a lone far mark still gets a measured map, with the survey for a scale', () => {
    // One mark alone cannot define a scale by itself -- but a far mark in the
    // merged map is never alone: the survey's footprint measures with it, so
    // the map can always promise a scale, and does.
    const out = generateWorkingPlan(survey([farMarks()[0]]))
    expect(out.scale).toBe(1000)
    expect(out.dxf).toContain('INSET 1 (1:4000)')
    expect(out.dxf).not.toContain('EXTENSION')
    expect(texts(out.dxf, 'INSET')).toContain('R1')
  })

  test('keeps a mark near the survey on the figure, not in the map', () => {
    // A reference mark within the padded band around the ring (a tenth of the
    // survey's own size, bracketed to 30-150 m) is part of the survey's fabric
    // and stays a figure beacon -- even though it widens the extent.
    const out = generateWorkingPlan(survey([
      { name: 'R1', X: 2144100, Y: -85730, symbol: 'rm', label: 'E' },
    ]))
    expect(out.dxf).not.toContain('EXTENSION')
    expect(out.dxf).not.toContain('INSET 1')
    expect(texts(out.dxf, 'BEACON-TEXT')).toContain('R1')
    expect(inserts(out.dxf)).toHaveLength(5)
  })

  test('does not split when the outlier buys no finer rung', () => {
    // The ring is wide (200 m) but shallow (50 m), so its own scale is set by
    // the easting, and a mark 40 m further east stretches that axis by exactly
    // the amount that still leaves the same rung: 1:2000 with or without it.
    const tall = {
      scale: 'auto',
      beacons: [
        { name: 'A', X: 2144000, Y: -85600, symbol: 'peg', label: 'auto' },
        { name: 'B', X: 2144000, Y: -85400, symbol: 'peg', label: 'auto' },
        { name: 'C', X: 2144050, Y: -85400, symbol: 'peg', label: 'auto' },
        { name: 'D', X: 2144050, Y: -85600, symbol: 'peg', label: 'auto' },
        { name: 'R1', X: 2144050, Y: -85640, symbol: 'rm', label: 'E' },
      ],
      parcels: [{ label: '404', ring: ['A', 'B', 'C', 'D'] }],
      title: ['WORKING PLAN OF', 'Stand 404'],
    }
    const out = generateWorkingPlan(tall)
    expect(out.scale).toBe(2000)
    expect(out.dxf).not.toContain('EXTENSION')
    expect(out.dxf).not.toContain('INSET 1')
    expect(inserts(out.dxf)).toHaveLength(5)
  })

  test('never moves a ring vertex, however far', () => {
    // This ring has a corner 300 m out on its own. It still anchors a boundary
    // -- removing it leaves a ring that does not close -- so the whole figure
    // stays together at the scale that genuine extent demands.
    const long = {
      scale: 'auto',
      beacons: [
        { name: 'A', X: 2144000, Y: -85700, symbol: 'peg', label: 'auto' },
        { name: 'B', X: 2144000, Y: -85600, symbol: 'peg', label: 'auto' },
        { name: 'C', X: 2144100, Y: -85600, symbol: 'peg', label: 'auto' },
        { name: 'E', X: 2144100, Y: -86000, symbol: 'peg', label: 'auto' },
        { name: 'D', X: 2144100, Y: -85700, symbol: 'peg', label: 'auto' },
      ],
      parcels: [{ label: '404', ring: ['A', 'B', 'C', 'E', 'D'] }],
      title: ['WORKING PLAN OF', 'Stand 404'],
    }
    const out = generateWorkingPlan(long)
    expect(out.dxf).not.toContain('EXTENSION')
    expect(inserts(out.dxf)).toHaveLength(5)
    expect(out.scale).toBe(4000)
  })

  test('honours an explicit scale: no reorganisation under the surveyor', () => {
    const out = generateWorkingPlan({
      ...survey(farMarks()),
      scale: 4000,
    })
    expect(out.scale).toBe(4000)
    expect(out.dxf).not.toContain('EXTENSION')
    expect(out.dxf).not.toContain('INSET 1')
    // everything stays on the one figure, far marks included
    expect(inserts(out.dxf)).toHaveLength(6)
    expect(texts(out.dxf, 'BEACON-TEXT')).toContain('R1')
    expect(texts(out.dxf, 'BEACON-TEXT')).toContain('R2')
  })

  test('carries control the map cannot hold on the trig sketch, not a note', () => {
    // A trig ten kilometres out cannot map beside a survey a few hundred
    // metres wide without flattening the survey to a dot, so the merged map
    // holds the marks that measure with it and the control that far out is
    // carried on the conventional locality sketch -- DRAWN as a trig, at the
    // schematic positions one from another, never promised at any scale and
    // never reduced to a footnote of coordinates the reader must convert.
    const spec = {
      ...survey(farMarks()),
      inset: { scale: 250000, beacons: [
        { name: 'T1', X: 2160000, Y: -88000, symbol: 'trig' },
        { name: 'F1', X: 2144050, Y: -85650, symbol: 'found' },
      ] },
    }
    const out = generateWorkingPlan(spec)
    // T1 (kilometres out) is DRAWN on the locality sketch, with F1 beside it.
    expect(texts(out.dxf, 'INSET')).toContain('T1')
    expect(texts(out.dxf, 'INSET')).toContain('F1')
    expect(out.dxf).toContain('INSET 1 (NOT TO SCALE)')
    expect(out.dxf).not.toContain('NATIONAL CONTROL OBSERVED')
    expect(out.dxf).not.toMatch(/T1\s+N/)
    // The far marks keep their measured map, numbered after the sketch.
    expect(out.dxf).toContain('INSET 2 (1:7500)')
    expect(out.dxf).not.toContain('EXTENSION')
  })

  test('keeps every mark inside the sheet when it splits', () => {
    const out = generateWorkingPlan(survey(farMarks()))
    const box = sheetBorder(out.dxf)
    expect(box).not.toBeNull()
    const bx = box.map((q) => q[0]), by = box.map((q) => q[1])
    for (const name of ['A', 'B', 'C', 'D', 'R1', 'R2']) {
      const p = at(out.dxf, name)[0]
      if (!p) throw new Error(`mark ${name} not lettered on the sheet`)
      expect(p[0]).toBeGreaterThan(Math.min(...bx))
      expect(p[0]).toBeLessThan(Math.max(...bx))
      expect(p[1]).toBeGreaterThan(Math.min(...by))
      expect(p[1]).toBeLessThan(Math.max(...by))
    }
  })
})