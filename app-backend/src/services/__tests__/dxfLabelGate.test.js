import { describe, test, expect, beforeAll } from '@jest/globals'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { generateDXF } from '../dxfGenerator.js'
import { summariseDxfLabels } from '../dxfLabelMetrics.js'
import { buildSurveyPlan } from './helpers/buildSurveyPlan.js'

/**
 * DXF LABEL GATE.
 *
 * The DXF counterpart of pdfkitGeoPDF.labelGate.test.js: the surveyor's label rules, counted off
 * what generateDXF() actually placed (labelMetrics), on the same surveyed plan (stands 1294-2060,
 * narrow stands along a diagonal road, where labelling is hardest).
 *
 * BUDGETS ONLY TIGHTEN. Each number is what the DXF achieves today; a change that improves a rule
 * lowers its number in the same commit, and a change that makes one worse fails here. The hard
 * rules the PDF holds at zero (a letter never over a boundary line, never in a foreign stand, an
 * outside-figure name wholly outside the figure) are the targets; see docs/DXF_LABEL_PARITY_PLAN.md.
 */
const quiet = { info() {}, warn() {}, error() {} }
const here = path.dirname(fileURLToPath(import.meta.url))
const survey = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'labelGateSurvey.json'), 'utf8'))

// History (surveyed plan: 357 letters, 8 beacon names, drawn at 1:500).
//   Phase 0 baseline, 28 Oct 2026: 36 letters over lines, 3 in a foreign stand, 5 figure names over the
//   figure, furthest letter 8.8 m from its beacon.
//   Phase 1 (letters through the PDF's shared fit): letters are now at zero on every rule.
//   Phase 2 (figure-corner names by the PDF's outside-vertex rule): names wholly outside the figure (5 -> 0),
//   at 19 pt from their beacons, inside the PDF's 30 pt bound.
const BUDGET = {
  lettersOverLines: 0,
  lettersNotInOwnStand: 0,
  lettersInForeignStand: 0,
  crampedLetters: 0,             // nothing needs an inset at this scale
  figureNamesOverFigure: 0,      // was 5 of 5 before Phase 2
  figureNamesMaxDistPt: 30,      // paper points, name centre to its beacon: the PDF's own bound
  lettersMaxDist: 3.4,           // metres, letter centre to its beacon (was 8.8)
}
const FLOOR_PT = 4.3 // cap height of the PDF's 6 pt floor (0.71 x 6)

// Generated once and shared by the first and last describe blocks: each generation is several seconds.
let auto

describe('DXF label gate: surveyed plan', () => {
  let s
  beforeAll(() => {
    const r = generateDXF({ ...buildSurveyPlan(survey), projection: 'EPSG:22291' }, quiet)
    auto = r
    expect(r.labelMetrics).toBeDefined()
    s = summariseDxfLabels(r.labelMetrics)
  }, 120000)

  test('the generator reports what it placed', () => {
    expect(s.letterCount).toBeGreaterThan(300)
    expect(s.nameCount).toBeGreaterThan(0)
  })

  test('no letter is smaller than the readability floor', () => {
    expect(s.minLetterCapPt).toBeGreaterThanOrEqual(FLOOR_PT)
  })

  test('no letter is over a boundary line', () => {
    expect(s.lettersOverLines.length).toBeLessThanOrEqual(BUDGET.lettersOverLines)
  })

  test('every letter is inside its own stand', () => {
    expect(s.lettersNotInOwnStand.length).toBeLessThanOrEqual(BUDGET.lettersNotInOwnStand)
  })

  test('no letter is in a foreign stand', () => {
    expect(s.lettersInForeignStand.length).toBeLessThanOrEqual(BUDGET.lettersInForeignStand)
  })

  test('every outside-figure beacon name lies wholly outside the figure', () => {
    expect(s.figureNamesOverFigure).toEqual([])
  })

  test('outside-figure names stay beside their beacons (<= 30 pt, as in the PDF)', () => {
    expect(s.figureNamesMaxDistPt).toBeLessThanOrEqual(BUDGET.figureNamesMaxDistPt)
  })

  test('no letter is so squeezed that the PDF would send it to an inset', () => {
    expect(s.crampedLetters).toBeLessThanOrEqual(BUDGET.crampedLetters)
  })

  test('letters stay near their beacons', () => {
    expect(s.lettersMaxDist).toBeLessThanOrEqual(BUDGET.lettersMaxDist)
  })

  test('beacon names at shared corners are not over a boundary line', () => {
    expect(s.otherNamesOverLines).toEqual([])
  })
})

// A coarser scale than the DXF chooses for this plan. The PDF magnifies the letters that no longer
// fit in insets; the DXF has none yet (docs/DXF_LABEL_PARITY_PLAN.md, section 8), so what it owes the
// surveyor at these scales is the TRUTH: the letters it could not seat are counted and reported.
// Budgets are what the DXF does today at 1:1000 and only tighten; the day insets exist, the
// over-lines and cramped numbers go to 0 as at 1:500.
const BUDGET_1000 = {
  crampedLetters: 11,
  lettersOverLines: 10,
}

describe('DXF label gate: the same plan at a declared 1:1000', () => {
  let r, s
  beforeAll(() => {
    r = generateDXF({ ...buildSurveyPlan(survey, { scale: 1000 }), projection: 'EPSG:22291' }, quiet)
    s = summariseDxfLabels(r.labelMetrics)
  }, 120000)

  test('is drawn at the declared scale', () => {
    expect(r.scale).toBe('1:1000')
  })

  test('letters in a wrong stand never happen, whatever the scale', () => {
    expect(s.lettersNotInOwnStand).toEqual([])
    expect(s.lettersInForeignStand).toEqual([])
    expect(s.figureNamesOverFigure).toEqual([])
    expect(s.minLetterCapPt).toBeGreaterThanOrEqual(FLOOR_PT)
  })

  test('cramped letters and letters over lines do not grow (target 0 with insets)', () => {
    expect(s.crampedLetters).toBeLessThanOrEqual(BUDGET_1000.crampedLetters)
    expect(s.lettersOverLines.length).toBeLessThanOrEqual(BUDGET_1000.lettersOverLines)
  })

  test('every letter that is over a line is one the generator reported as cramped', () => {
    const cramped = new Set(r.labelMetrics.labels.filter((l) => l.inside && l.cramped).map((l) => l.name))
    for (const name of s.lettersOverLines) expect(cramped.has(name)).toBe(true)
  })

  test('the cramped letters are reported in the DXF warnings, with the right count', () => {
    expect(s.crampedLetters).toBeGreaterThan(0)
    expect(r.warnings.summary.crampedLetters).toBe(s.crampedLetters)
    expect(r.warnings.count).toBeGreaterThanOrEqual(s.crampedLetters)
  })
})

describe('DXF label gate: no warning when nothing is cramped', () => {
  test('at the chosen 1:500 the summary says 0 and adds nothing to the count', () => {
    expect(auto.warnings.summary.crampedLetters).toBe(0)
    expect(auto.warnings.count).toBe(0)
  })
})
