/**
 * Unit tests for dxfGenerator pure helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator
 */
import { describe, test, expect } from '@jest/globals'
import { countLayerOnTable } from './dxfParse.js'
import { capeLoToDxfSouthUp } from '../dxfGenerator.js'

describe('dxfParse helpers (smoke)', () => {
  test('countLayerOnTable returns 0 for an empty input', () => {
    expect(countLayerOnTable('', 'NONEXISTENT')).toBe(0)
  })
})

describe('capeLoToDxfSouthUp', () => {
  // Fixtures spanning Cape Lo zones 25 (Bulawayo), 27 (Harare),
  // 29 (Mutare), 31 (eastern Zimbabwe). All Y, X positive by convention.
  const fixtures = [
    { name: 'Lo 25',  capeY:  35123.456, capeX: 1987654.321 },
    { name: 'Lo 27',  capeY:  72500.000, capeX: 2100000.000 },
    { name: 'Lo 29',  capeY:  50000.000, capeX: 2200000.000 },
    { name: 'Lo 31a', capeY:  18000.000, capeX: 2050000.000 },
    { name: 'Lo 31b', capeY: 110000.000, capeX: 2300000.000 },
    { name: 'origin', capeY:      1.000, capeX:       1.000 },
  ]
  test.each(fixtures)('$name → DXF X = capeY and DXF Y = capeX', ({ capeY, capeX }) => {
    const out = capeLoToDxfSouthUp(capeY, capeX)
    expect(out.x).toBeCloseTo(capeY, 6)
    expect(out.y).toBeCloseTo(capeX, 6)
  })
  test('regression sentinel: old (x = -y) formula would fail', () => {
    const out = capeLoToDxfSouthUp(50000, 2200000)
    expect(out.x).not.toBeLessThan(0)   // catches accidental sign-flip revert
    expect(out.y).not.toBeLessThan(0)
  })
})
