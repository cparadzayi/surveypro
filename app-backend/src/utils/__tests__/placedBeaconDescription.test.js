import { describe, test, expect } from '@jest/globals'
import { placedBeaconDescription, isPlacedStatus, PLACED_BEACON_DESCRIPTION } from '../../../../app-shared/placedBeaconDescription.js'

describe('placedBeaconDescription', () => {
  test.each([
    '12mm iron peg', '12mm Iron Peg', '12mm Iron peg', '12MM IRON PEG', '12 mm iron peg', '  12mm iron peg  ',
  ])('a placed beacon described %j reads "in concrete"', (d) => {
    expect(placedBeaconDescription('P', d)).toBe(PLACED_BEACON_DESCRIPTION)
    expect(placedBeaconDescription('p', d)).toBe(PLACED_BEACON_DESCRIPTION)
  })

  test('a placed witness mark (P/WS) is placed too', () => {
    expect(placedBeaconDescription('P/WS', '12mm iron peg')).toBe(PLACED_BEACON_DESCRIPTION)
  })

  test('a found beacon keeps the description it was found with', () => {
    expect(placedBeaconDescription('F', '12mm iron peg')).toBe('12mm iron peg')
    expect(placedBeaconDescription('F/WS', '12mm iron peg')).toBe('12mm iron peg')
  })

  test('a calculated or unstatused point is untouched', () => {
    expect(placedBeaconDescription('C', '12mm iron peg')).toBe('12mm iron peg')
    expect(placedBeaconDescription(null, '12mm iron peg')).toBe('12mm iron peg')
    expect(placedBeaconDescription(undefined, '12mm iron peg')).toBe('12mm iron peg')
  })

  test('any other description on a placed beacon is untouched', () => {
    for (const d of ['12mm iron peg in concrete', '12mm iron peg and cairn', '50mm Iron Pipe in Concrete', '10mm iron peg', 'Not Beaconed', '', null, undefined]) {
      expect(placedBeaconDescription('P', d)).toBe(d)
    }
  })

  test('isPlacedStatus', () => {
    expect(['P', 'p', ' P ', 'P/WS', 'p / ws'].every(isPlacedStatus)).toBe(true)
    expect(['F', 'C', 'PS', '', null, undefined, 5].some(isPlacedStatus)).toBe(false)
  })
})
