/**
 * Areas and consistency are computed from the lodged co-ordinates.
 *
 * A cadastral record publishes its co-ordinates to two decimals. Those printed
 * figures are the record: anyone checking a diagram recomputes the sides, the
 * directions and the extent from them and must arrive at the same answers. So
 * the computation has to start where the reader starts — at two decimals — not
 * at the surveyor's working precision.
 *
 * It did not. The area computation took the raw observed co-ordinates, while
 * the diagram derived its figures from the stored parcel polygon, which is held
 * at two decimals. Two documents, one parcel, two sets of numbers:
 *
 *   STAND 404, Brackenhurst Township
 *     Area & Consistency   4046 m²   SD5→SD6 314°57'10"   SD3→86C 69.92
 *     Diagram              4047 m²   SD5→SD6 314°57'20"   SD3→86C 69.93
 *
 * Rounding first makes the diagram's figures the correct ones and the record
 * self-consistent — and reproducible by the Surveyor-General's examiner.
 *
 * The fixture is that parcel: `coordinate_points` as observed, against the
 * figures its diagram prints.
 */

import { describe, test, expect } from '@jest/globals'
import { computeAreaConsistency } from '../area-computation.js'

/** STAND 404 as observed, before the record rounds it. */
const STAND_404 = [
  { id: 'SD4', y: -85673.907, x: 2144027.044 },
  { id: 'SD5', y: -85710.106, x: 2144063.183 },
  { id: 'SD6', y: -85723.396, x: 2144076.451 },
  { id: 'SD3', y: -85682.515, x: 2144117.414 },
  { id: '86C', y: -85633.040, x: 2144068.004 },
]

const dms = (deg) => {
  const total = Math.round(deg * 3600)
  return `${Math.floor(total / 3600)}°${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}'${String(total % 60).padStart(2, '0')}"`
}

describe('computeAreaConsistency works from the lodged co-ordinates', () => {
  test('states the extent the diagram states', () => {
    const r = computeAreaConsistency(STAND_404, { roundMetersDecimals: 0 })

    // Shoelace of the observed co-ordinates is 4046.380 and prints as 4046.
    // Shoelace of the lodged co-ordinates is 4046.576, which prints as 4047 —
    // the figure on the diagram, and the one an examiner recomputing from the
    // published co-ordinates arrives at.
    expect(r.area.abs_m2).toBeCloseTo(4046.576, 3)
    expect(r.area.meters_rounded).toBe(4047)
  })

  test('states the directions the diagram states', () => {
    const r = computeAreaConsistency(STAND_404, { includeResiduals: true })
    const legs = r.edges.map((e) => dms(e.bearingRoundedDeg))

    expect(legs).toEqual([
      "314°57'10\"", // SD4 -> SD5
      "314°57'20\"", // SD5 -> SD6  (was 314°57'10" from unrounded input)
      "44°56'40\"",  // SD6 -> SD3  (was 44°56'30")
      "134°57'30\"", // SD3 -> 86C  (was 134°57'40")
      "224°56'10\"", // 86C -> SD4
    ])
  })

  test('states the distances the diagram states', () => {
    const r = computeAreaConsistency(STAND_404, { includeResiduals: true })
    const metres = r.edges.map((e) => Number(e.distance.toFixed(2)))

    // SD3->86C was 69.92 from the observed co-ordinates.
    expect(metres).toEqual([51.15, 18.78, 57.87, 69.93, 57.86])
  })

  test('rounds half-to-even, like every other figure in the record', () => {
    // SD3's westing is -85682.515, exactly on the half-cent. Banker's rounding
    // gives -85682.52, which is what the Co-ordinate List prints.
    const r = computeAreaConsistency(
      [
        { id: 'A', y: -85682.515, x: 2144117.414 },
        { id: 'B', y: -85682.505, x: 2144217.414 },
        { id: 'C', y: -85782.515, x: 2144217.414 },
      ],
      { includeResiduals: true },
    )

    expect(r.edges[0].from.y).toBe(-85682.52)
    // -85682.505 -> -85682.50: the kept digit 0 is already even.
    expect(r.edges[0].to.y).toBe(-85682.5)
  })

  test('leaves co-ordinates already at two decimals untouched', () => {
    const lodged = [
      { id: 'A', y: -85673.91, x: 2144027.04 },
      { id: 'B', y: -85710.11, x: 2144063.18 },
      { id: 'C', y: -85723.40, x: 2144076.45 },
      { id: 'D', y: -85682.52, x: 2144117.41 },
      { id: 'E', y: -85633.04, x: 2144068.00 },
    ]

    const fromObserved = computeAreaConsistency(STAND_404, { roundMetersDecimals: 0 })
    const fromLodged = computeAreaConsistency(lodged, { roundMetersDecimals: 0 })

    // Feeding the already-rounded polygon must give the identical answer — that
    // is what makes the published record reproducible.
    expect(fromLodged.area.abs_m2).toBeCloseTo(fromObserved.area.abs_m2, 6)
    expect(fromLodged.area.meters_rounded).toBe(4047)
  })
})
