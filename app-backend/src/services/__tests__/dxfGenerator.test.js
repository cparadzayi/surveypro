/**
 * Unit tests for dxfGenerator pure helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator
 */
import { describe, test, expect } from '@jest/globals'
import { countLayerOnTable } from './dxfParse.js'

describe('dxfParse helpers (smoke)', () => {
  test('countLayerOnTable returns 0 for an empty input', () => {
    expect(countLayerOnTable('', 'NONEXISTENT')).toBe(0)
  })
})
