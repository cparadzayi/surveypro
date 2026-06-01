/**
 * Layer 1 unit tests for the title-block SI 727 helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.titleBlock
 */
import { describe, test, expect } from '@jest/globals'
import { splitToWidth } from '../dxfGenerator.js'

describe('splitToWidth', () => {
  test('empty input returns []', () => {
    expect(splitToWidth('', 40)).toEqual([])
  })
  test('short input ≤ maxChars returns single-element array', () => {
    expect(splitToWidth('Hello world', 40)).toEqual(['Hello world'])
  })
  test('long input wraps to multiple entries, each ≤ maxChars', () => {
    const long = 'The quick brown fox jumps over the lazy dog and keeps running endlessly through the countryside.'
    const lines = splitToWidth(long, 25)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(25)
    }
  })
  test('no mid-word splits — every token in every wrapped line is a token from the input', () => {
    const input = 'one two three four five six seven eight nine ten eleven twelve'
    const lines = splitToWidth(input, 15)
    const inputTokens = new Set(input.split(/\s+/))
    for (const line of lines) {
      for (const tok of line.split(/\s+/)) {
        expect(inputTokens.has(tok)).toBe(true)
      }
    }
    // Also assert no tokens are dropped:
    const reconstructed = lines.join(' ').split(/\s+/).filter(Boolean)
    expect(reconstructed).toEqual(input.split(/\s+/))
  })
  test('single word longer than maxChars is emitted as its own line (no truncation)', () => {
    const lines = splitToWidth('short supercalifragilisticexpialidocious more', 10)
    expect(lines).toContain('supercalifragilisticexpialidocious')
  })
  test('never produces empty entries', () => {
    const lines = splitToWidth('   spaces    between    words   ', 8)
    for (const line of lines) expect(line.length).toBeGreaterThan(0)
  })
})
