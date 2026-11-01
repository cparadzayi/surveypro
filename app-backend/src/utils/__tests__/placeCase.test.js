import { describe, test, expect } from '@jest/globals'
import { placeCase } from '../placeCase.js'

describe('placeCase', () => {
  test.each([
    ['STAND 1345 OF SEBANGA POORT', 'Stand 1345 of Sebanga Poort'],
    ['SELUKWE', 'Selukwe'],
    ['Lot 1 of  Stand 198 Woodville North of Subdivision A of Plot 1A', 'Lot 1 of Stand 198 Woodville North of Subdivision A of Plot 1A'],
    ['STANDS 2283, 2288 - 2293 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A', 'Stands 2283, 2288 - 2293 Maglas Township of Shabani Mine Surface Rights A'],
    ['MOUNT-HAMPDEN', 'Mount-Hampden'],
    [null, ''],
  ])('%s', (a, b) => expect(placeCase(a)).toBe(b))
})
