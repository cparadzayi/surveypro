import { describe, test, expect, beforeAll } from '@jest/globals'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { buildSurveyPlan } from './helpers/buildSurveyPlan.js'
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js'
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js'
import { sampleDevelopedLargeStandsPlan } from './fixtures/sampleDevelopedLargeStandsPlan.js'
import { sampleUndevelopedSmallStandsPlan } from './fixtures/sampleUndevelopedSmallStandsPlan.js'

/**
 * LABEL REGRESSION GATE.
 *
 * Every label rule the surveyor has set, as a number counted off what the renderer
 * actually placed (result.labelMetrics), so a change that quietly breaks one fails
 * here instead of being found on a printed plan.
 *
 * Two kinds of check:
 *  - HARD rules, budget zero: they hold on every plan, always.
 *      * an outside-figure vertex label lies wholly outside the figure;
 *      * no in-parcel letter is drawn below the readability floor (6pt);
 *      * an inset label is never in a stand its beacons do not belong to;
 *      * an inset label is never below 5pt, the smallest a road name shrinks to
 *        (it takes the size of the nearest road name, clamped to 5-8pt, so it fits
 *        the same narrow road).
 *  - QUALITY budgets, capped at what the surveyed plan achieves TODAY. They only
 *    ever tighten: an improvement passes, a regression fails. When a change makes
 *    the plan genuinely better, lower the number here in the same commit.
 *
 * The survey fixture (fixtures/labelGateSurvey.json) is a real plan with narrow
 * stands along a diagonal road, which is where labelling is hardest.
 */

const quiet = { info() {}, warn() {}, error() {} }
const FLOOR_PT = 6 // 75% of the 8pt base letter
const INSET_FLOOR_PT = 5 // an inset label takes the nearest road name's size, 5-8pt

const here = path.dirname(fileURLToPath(import.meta.url))
const survey = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'labelGateSurvey.json'), 'utf8'))

const summarise = (m) => {
  const v = m.vertexLabels
  const il = m.insetLabels
  return {
    vertexStraddling: v.filter((x) => x.straddlesFigure).length,
    vertexMaxDist: v.length ? Math.max(...v.map((x) => x.distance)) : 0,
    minLetterFont: m.minSuffixFont,
    cramped: m.crampedLetters,
    insets: m.insetClusters,
    lettersInPlaceAfterCap: m.crampedInPlace,
    insetForeign: il.filter((l) => l.foreignStands.length > 0).length,
    insetMinFont: il.length ? Math.min(...il.map((l) => l.fontSize)) : Infinity,
    insetFar: il.filter((l) => l.gap > 12).length,          // not beside its beacon
    insetMaxDist: il.length ? Math.max(...il.map((l) => l.distance)) : 0, // label centre to nearest beacon, pt
    insetOffRoad: il.filter((l) => Math.abs(l.rotation - l.align) > 10).length, // not along its road
    insetInStand: il.filter((l) => !l.outsideAll).length,
  }
}

function expectHardRules(s) {
  expect(s.vertexStraddling).toBe(0)
  expect(s.minLetterFont).toBeGreaterThanOrEqual(FLOOR_PT - 1e-9)
  expect(s.insetForeign).toBe(0)
  expect(s.insetMinFont).toBeGreaterThanOrEqual(INSET_FLOOR_PT - 1e-9)
}

describe('label gate — hard rules on every sample plan', () => {
  const samples = {
    sampleMinimalPlan,
    sampleRealisticPlan,
    sampleDevelopedLargeStandsPlan,
    sampleUndevelopedSmallStandsPlan,
  }
  for (const [name, plan] of Object.entries(samples)) {
    test(`${name}`, async () => {
      const { labelMetrics } = await generateGeoPDF(plan, quiet)
      expect(labelMetrics).toBeDefined()
      expectHardRules(summarise(labelMetrics))
    }, 120000)
  }
})

describe('label gate — surveyed plan (stands 1294–2060, diagonal road)', () => {
  let auto, fine

  beforeAll(async () => {
    // As the app generates it: the renderer picks the scale that fits one sheet.
    auto = await generateGeoPDF(buildSurveyPlan(survey), quiet)
    // A surveyor-declared finer scale (what cutting into sheets would give each sheet).
    fine = await generateGeoPDF(buildSurveyPlan(survey, { scale: 500 }), quiet)
  }, 240000)

  test('the renderer reports what it placed', () => {
    expect(auto.labelMetrics.insetLabels.length).toBeGreaterThan(0)
    expect(auto.labelMetrics.vertexLabels.length).toBeGreaterThan(0)
  })

  describe('at the auto-fitted scale (1:600)', () => {
    test('hard rules', () => expectHardRules(summarise(auto.labelMetrics)))

    test('no cramped letter is left drawn across lines (the inset cap is not hit)', () => {
      expect(summarise(auto.labelMetrics).lettersInPlaceAfterCap).toBe(0)
    })

    test('outside-figure labels stay close to their points (<= 30pt, was 36pt)', () => {
      expect(summarise(auto.labelMetrics).vertexMaxDist).toBeLessThanOrEqual(30)
    })

    test('inset count and cramped letters do not grow (today: 9 insets, 14 letters)', () => {
      const s = summarise(auto.labelMetrics)
      expect(s.insets).toBeLessThanOrEqual(9)
      expect(s.cramped).toBeLessThanOrEqual(14)
    })

    test('every inset label sits beside its beacons and along its road (today: 9 of 9, furthest 17pt)', () => {
      const s = summarise(auto.labelMetrics)
      expect(s.insetFar).toBe(0)
      expect(s.insetOffRoad).toBe(0)
      expect(s.insetInStand).toBe(0)
      expect(s.insetMaxDist).toBeLessThanOrEqual(25)
    })
  })

  describe('at a declared 1:500', () => {
    test('hard rules', () => expectHardRules(summarise(fine.labelMetrics)))

    test('a finer scale never needs MORE insets or cramped letters than 1:600', () => {
      const a = summarise(auto.labelMetrics)
      const f = summarise(fine.labelMetrics)
      expect(f.insets).toBeLessThanOrEqual(a.insets)
      expect(f.cramped).toBeLessThanOrEqual(a.cramped)
    })

    test('today: 6 insets, every label beside its beacon (furthest 21pt) and along its road', () => {
      const s = summarise(fine.labelMetrics)
      expect(s.insets).toBeLessThanOrEqual(6)
      expect(s.insetFar).toBe(0)
      expect(s.insetOffRoad).toBe(0)
      expect(s.insetMaxDist).toBeLessThanOrEqual(25)
    })
  })
})
