import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'
import { maglasTwoSheetSpec } from './fixtures/maglasTwoSheetSpec.js'

// Every layer of a working plan is colour 7 (black on paper), so its lines and symbols print black like its lettering.
describe('working plan lines are black', () => {
  for (const [name, spec] of [['diagrams sheet', brackenhurstSpec], ['General Plan', maglasTwoSheetSpec()]]) {
    test(`${name}: the DXF layer table carries only colour 7`, () => {
      const L = generateWorkingPlan(spec).dxf.split(/\r?\n/).map((l) => l.trim())
      const colours = []
      for (let i = 0; i < L.length; i++) if (L[i] === 'LAYER' && L[i - 1] === '0' && L[i + 1] === '2' && L[i + 5] === '62') colours.push(L[i + 6])
      expect(colours.length).toBeGreaterThan(5)
      expect(colours.every((c) => c === '7')).toBe(true)
    })
  }
})
