import { describe, test, expect } from '@jest/globals'
import { contiguousMarks } from '../contiguousMarks.js'

const a = [0, 0]
const b = [100, 0]      // mid = [50, 0]

describe('contiguousMarks', () => {
  test("both: stubs at both terminals, label at the side midpoint", () => {
    expect(contiguousMarks(a, b, 'both')).toEqual({
      stubFrom: true, stubTo: true, labelAnchor: [50, 0],
    })
  })

  test("missing end defaults to both (back-compat)", () => {
    expect(contiguousMarks(a, b, undefined)).toEqual({
      stubFrom: true, stubTo: true, labelAnchor: [50, 0],
    })
  })

  test("from: stub at A only, label still centred on the side", () => {
    expect(contiguousMarks(a, b, 'from')).toEqual({
      stubFrom: true, stubTo: false, labelAnchor: [50, 0],
    })
  })

  test("to: stub at B only, label still centred on the side", () => {
    expect(contiguousMarks(a, b, 'to')).toEqual({
      stubFrom: false, stubTo: true, labelAnchor: [50, 0],
    })
  })

  test("works off-axis (diagonal side): label at the side midpoint", () => {
    // a=(0,0) b=(40,80) -> mid (20,40); the label is centred regardless of end.
    expect(contiguousMarks([0, 0], [40, 80], 'from')).toEqual({
      stubFrom: true, stubTo: false, labelAnchor: [20, 40],
    })
  })
})
