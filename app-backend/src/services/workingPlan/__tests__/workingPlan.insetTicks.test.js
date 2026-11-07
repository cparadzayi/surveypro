import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

const sd5 = brackenhurstSpec.beacons.find((b) => b.name === 'SD5')
const spec = {
  ...brackenhurstSpec,
  remainderLabel: 'Rem./',
  inset: { ...brackenhurstSpec.inset, beacons: [{ name: 'SD5', X: sd5.X, Y: sd5.Y, symbol: 'peg' }] },
}

describe('every scaled inset carries a labelled tick', () => {
  const out = generateWorkingPlan(spec)
  const ops = out.model.doc.ops
  const captions = ops.filter((o) => o.t === 'text' && o.layer === 'INSET' && /^INSET \d+( \(|$)/.test(o.str))

  test('there are scaled insets to check', () => {
    expect(captions.length).toBeGreaterThanOrEqual(2)
  })

  test('each scaled inset has at least one tick, reported by number', () => {
    for (const c of captions) {
      const n = +c.str.match(/^INSET (\d+)/)[1]
      if (/NOT TO SCALE/.test(c.str)) expect(out.insetTicks[n] ?? 0).toBe(0)
      else expect(out.insetTicks[n]).toBeGreaterThanOrEqual(1)
    }
  })

  test('each tick is lettered with an X and a Y figure', () => {
    const total = Object.values(out.insetTicks).reduce((a, b) => a + b, 0)
    const texts = ops.filter((o) => o.t === 'text' && o.layer === 'GRID-TEXT')
    const mainTicks = out.gridTicks
    expect(texts.filter((o) => /^X = /.test(o.str)).length).toBe(mainTicks + total)
    expect(texts.filter((o) => /^Y = /.test(o.str)).length).toBe(mainTicks + total)
  })
})
