/**
 * A General Plan of an undeveloped township states the repeated stand sides once, in the title block, and leaves
 * them off the sides; a bearing already printed on a straight line is not repeated on its continuation.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js standardSideLengths
 */
import { describe, test, expect, jest } from '@jest/globals'
import {
  standardSideLengths, standardLengthsPhrase, sideLengthKey, MIN_REPEATS,
} from '../standardSideLengths.js'
import { LabelingSystem } from '../pdfkitLabeling.js'

const stand = (name, distances) => ({
  type: 'Feature', properties: { stand: name, edges: distances.map((d) => ({ distance: d, distanceRounded: d })) },
})
const plan = (features) => ({ type: 'FeatureCollection', features })

describe('standardSideLengths', () => {
  test('a length repeated on many sides is standard, in ascending order, and a one-off is not', () => {
    const stands = Array.from({ length: 12 }, (_, i) => stand(String(i + 1), [12, 25, 12, 25]))
    stands.push(stand('99', [12.003, 31.41, 7.77, 25]))
    expect(standardSideLengths(plan(stands))).toEqual(['12.00', '25.00'])
  })

  test('equal lengths that are only a few of many are a coincidence, not a layout', () => {
    const many = Array.from({ length: 60 }, (_, i) => stand(String(i), [10 + i * 0.37, 20 + i * 0.41, 30.11 + i, 40.5 + i]))
    const few = Array.from({ length: MIN_REPEATS }, (_, i) => stand(`x${i}`, [15.5, 0.01 + i, 0.02 + i, 0.03 + i]))
    expect(standardSideLengths(plan([...many, ...few]))).toEqual([])   // 15.50 occurs MIN_REPEATS times but under 3% of the sides
  })

  test('the Outside Figure is not a stand and its sides are not counted', () => {
    const of = { type: 'Feature', properties: { stand: 'Outside Figure', edges: Array.from({ length: 30 }, () => ({ distance: 99 })) } }
    expect(standardSideLengths(plan([of]))).toEqual([])
  })

  test('nothing to say about an empty or missing plan', () => {
    expect(standardSideLengths(null)).toEqual([])
    expect(standardSideLengths(plan([]))).toEqual([])
  })

  test('lengths are compared to the centimetre', () => {
    expect(sideLengthKey(11.999)).toBe('12.00')
    expect(sideLengthKey(12.004)).toBe('12.00')
    expect(sideLengthKey('x')).toBe('')
  })

  test('the phrase reads as a list', () => {
    expect(standardLengthsPhrase(['12.00'])).toBe('12.00')
    expect(standardLengthsPhrase(['10.00', '12.00', '25.00'])).toBe('10.00, 12.00 and 25.00')
    expect(standardLengthsPhrase([])).toBe('')
  })
})

describe('LabelingSystem leaves the standard sides unlabelled', () => {
  const mkDoc = () => {
    const d = {
      text: jest.fn(), font: jest.fn(() => d), fontSize: jest.fn(() => d), save: jest.fn(), restore: jest.fn(),
      moveTo: jest.fn(() => d), lineTo: jest.fn(() => d), stroke: jest.fn(), rect: jest.fn(() => d), fill: jest.fn(),
      fillColor: jest.fn(() => d), strokeColor: jest.fn(() => d), lineWidth: jest.fn(() => d), widthOfString: jest.fn(() => 20),
      dash: jest.fn(() => d), undash: jest.fn(() => d), translate: jest.fn(() => d), rotate: jest.fn(() => d),
    }
    return d
  }
  const collision = { hasCollision: jest.fn(() => false), addRegion: jest.fn() }
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const extent = { minY: -18000, maxY: -17900, minX: -20000, maxX: -19900 }
  const bounds = { x: 0, y: 0, width: 1000, height: 800 }

  // Two stands side by side, 12 m wide and 25 m deep. Geographic coords [y, x]; page coords 10 pt per metre.
  // Stand 1 occupies y 0..12, stand 2 y 12..24; both x 0..25. Their shared side is y = 12.
  const geo = (y0, y1) => [[y0, 0], [y1, 0], [y1, 25], [y0, 25], [y0, 0]]
  const pdf = (y0, y1) => [{ x: y0 * 10, y: 100 }, { x: y1 * 10, y: 100 }, { x: y1 * 10, y: 350 }, { x: y0 * 10, y: 350 }, { x: y0 * 10, y: 100 }]
  // Bearings (degrees): along y (the 12 m sides) 90 / 270, along x (the 25 m sides) 0 / 180.
  const parcel = (name, y0, y1) => ({
    geometry: { coordinates: [geo(y0, y1)] },
    properties: {
      stand: name,
      edges: [
        { bearing: 90, distance: 12, distanceRounded: 12, directionDMS: `90°00'00"` },
        { bearing: 0, distance: 25, distanceRounded: 25, directionDMS: `0°00'00"` },
        { bearing: 270, distance: 12, distanceRounded: 12, directionDMS: `270°00'00"` },
        { bearing: 180, distance: 25, distanceRounded: 25, directionDMS: `180°00'00"` },
      ],
    },
  })
  const printed = (doc) => doc.text.mock.calls.map((c) => c[0])

  const run = (standard) => {
    const doc = mkDoc()
    const ls = new LabelingSystem(doc, extent, bounds, { value: 1000 }, collision, logger, 'general-undeveloped')
    ls.setStandardLengths(standard)
    ls.renderEdgeLabels(parcel('1', 0, 12), pdf(0, 12))
    ls.renderEdgeLabels(parcel('2', 12, 24), pdf(12, 24))
    return { out: printed(doc), ls }
  }

  test('with no standard lengths every side carries its length and bearing, as before', () => {
    const { out } = run([])
    expect(out.filter((t) => /^\d+\.\d\d$/.test(t)).length).toBeGreaterThanOrEqual(6)
  })

  test('a standard length is not printed on any side', () => {
    const { out, ls } = run(['12.00', '25.00'])
    expect(out.filter((t) => /^\d+\.\d\d$/.test(t))).toEqual([])
    expect(ls.suppressed.distances).toBeGreaterThan(0)
  })

  test('the bearings that are printed are fewer, because a straight line is not restated', () => {
    const all = run([]).out.filter((t) => /°/.test(t)).length
    const some = run(['12.00', '25.00']).out.filter((t) => /°/.test(t)).length
    expect(some).toBeLessThan(all)
    expect(some).toBeGreaterThan(0)          // never none: the first of each line is stated
  })

  test('a length that is not standard keeps its figures', () => {
    const { out } = run(['25.00'])
    expect(out.filter((t) => t === '12.00').length).toBeGreaterThan(0)
    expect(out.filter((t) => t === '25.00').length).toBe(0)
  })

  test('a developed township is untouched by the setting (it carries no side figures at all)', () => {
    const doc = mkDoc()
    const ls = new LabelingSystem(doc, extent, bounds, { value: 1000 }, collision, logger, 'general-developed')
    ls.setStandardLengths(['12.00', '25.00'])
    ls.renderEdgeLabels(parcel('1', 0, 12), pdf(0, 12))
    expect(printed(doc)).toEqual([])
  })
})
