/**
 * app-shared/trigName.js — the single source of the trig monument DISPLAY rule.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js trigName-shared
 */
import { describe, test, expect } from '@jest/globals'
import { displayTrigName } from '../../../../app-shared/trigName.js'

describe('displayTrigName', () => {
  test('title-cases a monument name the registry holds in capitals', () => {
    expect(displayTrigName('THORNHILL')).toBe('Thornhill')
    expect(displayTrigName('MNYAMI')).toBe('Mnyami')
    expect(displayTrigName('KENYANI')).toBe('Kenyani')
  })

  test('title-cases every word of a multi-word name', () => {
    expect(displayTrigName('CHRISTMAS GIFT')).toBe('Christmas Gift')
    expect(displayTrigName('HAPPY VALLEY')).toBe('Happy Valley')
  })

  test('leaves a vowel-less token alone: it is a code, not a word', () => {
    expect(displayTrigName('CPLX')).toBe('CPLX')
    expect(displayTrigName('TSM')).toBe('TSM')
    // Longer vowel-less tokens in the registry are codes, never words:
    // GMB (Grain Marketing Board), BLDG, WCT, and STH for South.
    expect(displayTrigName('GMB')).toBe('GMB')
    expect(displayTrigName('BLDG')).toBe('BLDG')
    expect(displayTrigName('M.W.GATOOMA STH')).toBe('M.W.Gatooma STH')
    // A compass bearing is a code too, so it keeps its capitals.
    expect(displayTrigName('KHAMI RIVER SW')).toBe('Khami River SW')
  })

  test('reads a known word abbreviation as the word it stands for', () => {
    // The registry writes these both ways -- MT x5 but Mt x6, ST x2 but St x3 --
    // so the mixed-case rows are the form it means; the shouting rows follow them.
    expect(displayTrigName('MT HAMPDEN')).toBe('Mt Hampden')
    expect(displayTrigName('MT. TOWLA')).toBe('Mt. Towla')
    expect(displayTrigName('MT OLYMPUS')).toBe('Mt Olympus')
    expect(displayTrigName('ST MARYS')).toBe('St Marys')
    // Already in that form, so nothing moves.
    expect(displayTrigName('Mt Darwin')).toBe('Mt Darwin')
    expect(displayTrigName('Mt. Hampden')).toBe('Mt. Hampden')
  })

  test('leaves a token carrying a digit alone', () => {
    expect(displayTrigName('TSM5025')).toBe('TSM5025')
    expect(displayTrigName('CHIVHU 2')).toBe('Chivhu 2')
  })

  test('keeps a connecting word down unless it opens the name', () => {
    expect(displayTrigName('MOUNT OF OLIVES')).toBe('Mount of Olives')
    expect(displayTrigName('OF OLIVES')).toBe('Of Olives')
  })

  test('capitalises each part of a hyphenated name, keeping the hyphen', () => {
    expect(displayTrigName('BEIT-BRIDGE')).toBe('Beit-Bridge')
  })

  test('preserves the separators the registry recorded', () => {
    expect(displayTrigName("O'BRIEN")).toBe("O'Brien")
    expect(displayTrigName('CHRISTMAS  GIFT')).toBe('Christmas  Gift')
  })

  test('leaves a deliberately mixed-case name verbatim, so it is idempotent', () => {
    expect(displayTrigName('Thornhill')).toBe('Thornhill')
    expect(displayTrigName(displayTrigName('THORNHILL'))).toBe('Thornhill')
    expect(displayTrigName('McDonald')).toBe('McDonald')
  })

  test('is total: never throws, returns a non-string unchanged', () => {
    expect(displayTrigName('')).toBe('')
    expect(displayTrigName(null)).toBeNull()
    expect(displayTrigName(undefined)).toBeUndefined()
    expect(displayTrigName(42)).toBe(42)
  })
})
