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

// Phase 0 baseline, measured 28 October 2026 on the surveyed plan (357 letters, 8 beacon names).
const BUDGET = {
  lettersOverLines: 36,          // target 0
  lettersNotInOwnStand: 3,       // target 0
  lettersInForeignStand: 3,      // target 0
  figureNamesOverFigure: 5,      // target 0
  lettersMaxDist: 8.8,           // metres, letter centre to its beacon; the PDF keeps letters beside the circle
}
const FLOOR_PT = 4.3 // cap height of the PDF's 6 pt floor (0.71 x 6)

describe('DXF label gate: surveyed plan', () => {
  let s
  beforeAll(() => {
    const r = generateDXF({ ...buildSurveyPlan(survey), projection: 'EPSG:22291' }, quiet)
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

  test('letters over boundary lines do not grow (target 0)', () => {
    expect(s.lettersOverLines.length).toBeLessThanOrEqual(BUDGET.lettersOverLines)
  })

  test('letters outside their own stand do not grow (target 0)', () => {
    expect(s.lettersNotInOwnStand.length).toBeLessThanOrEqual(BUDGET.lettersNotInOwnStand)
  })

  test('letters in a foreign stand do not grow (target 0)', () => {
    expect(s.lettersInForeignStand.length).toBeLessThanOrEqual(BUDGET.lettersInForeignStand)
  })

  test('outside-figure beacon names over the figure do not grow (target 0)', () => {
    expect(s.figureNamesOverFigure.length).toBeLessThanOrEqual(BUDGET.figureNamesOverFigure)
  })

  test('letters stay near their beacons', () => {
    expect(s.lettersMaxDist).toBeLessThanOrEqual(BUDGET.lettersMaxDist)
  })

  test('beacon names at shared corners are not over a boundary line', () => {
    expect(s.otherNamesOverLines).toEqual([])
  })
})
