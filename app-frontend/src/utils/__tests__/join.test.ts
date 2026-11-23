import { describe, it, expect } from 'vitest'
import { joinPoints, featureYX } from '../join'
// @ts-expect-error — plain JS module from the backend, the rule the app's stored edges use
import { bearingSouthBetween, distanceYX } from '../../../../app-backend/src/utils/zim-geo.js'

describe('joinPoints: direction and distance, south-oriented, Y westing / X southing', () => {
  const O = { y: 0, x: 0 }
  it.each([
    [{ y: 0, x: 100 }, 0, '0:00:00'],     // due south
    [{ y: 100, x: 0 }, 90, '90:00:00'],   // due west
    [{ y: 0, x: -100 }, 180, '180:00:00'], // due north
    [{ y: -100, x: 0 }, 270, '270:00:00'], // due east
  ])('cardinal %o', (b, deg, dms) => {
    const j = joinPoints(O, b)!
    expect(j.direction).toBeCloseTo(deg, 9)
    expect(j.directionDms).toBe(dms)
    expect(j.distanceRounded).toBe(100)
  })

  it('a 3-4-5 join, worked by hand: 36°52′11.6″ rounds to 36:52:12, reverse 216:52:12', () => {
    const j = joinPoints({ y: 1000, x: 2000 }, { y: 1003, x: 2004 })!
    expect(j.dy).toBeCloseTo(3, 9)
    expect(j.dx).toBeCloseTo(4, 9)
    expect(j.distanceRounded).toBe(5)
    expect(j.directionDms).toBe('36:52:12')
    expect(j.reverseDirectionDms).toBe('216:52:12')
  })

  it('rounds the distance banker\'s, half to even', () => {
    expect(joinPoints(O, { y: 0, x: 0.125 })!.distanceRounded).toBe(0.12)
    expect(joinPoints(O, { y: 0, x: 0.135 })!.distanceRounded).toBe(0.14)
  })

  it('carries 59.6″ up to the next minute', () => {
    // 10°00′59.6″ rounds to 60″, which carries into the minutes
    const deg = 10 + 59.6 / 3600
    const r = 1000
    const b = { y: r * Math.sin(deg * Math.PI / 180), x: r * Math.cos(deg * Math.PI / 180) }
    expect(joinPoints(O, b)!.directionDms).toBe('10:01:00')
  })

  it('agrees with the backend rule on real Cape Lo co-ordinates', () => {
    const a = { y: 33332.88, x: 1860173 }
    const b = { y: 25426.06, x: 1869672 }
    const j = joinPoints(a, b)!
    expect(j.direction).toBeCloseTo(bearingSouthBetween({ y1: a.y, x1: a.x }, { y2: b.y, x2: b.x }), 10)
    expect(j.distance).toBeCloseTo(distanceYX({ y1: a.y, x1: a.x }, { y2: b.y, x2: b.x }), 9)
  })

  it('refuses coincident or missing points', () => {
    expect(joinPoints(O, O)).toBeNull()
    expect(joinPoints(O, { y: NaN, x: 1 })).toBeNull()
    expect(joinPoints(null as any, O)).toBeNull()
  })
})

describe('featureYX: Y and X of a layer point, whichever order it was stored in', () => {
  it('takes the server order [Y, X]', () => {
    expect(featureYX({ geometry: { coordinates: [33332.88, 1860173] } })).toEqual({ y: 33332.88, x: 1860173 })
  })
  it('recognises [X, Y] by the southing in the millions', () => {
    expect(featureYX({ geometry: { coordinates: [1860173, 33332.88] } })).toEqual({ y: 33332.88, x: 1860173 })
    expect(featureYX({ geometry: { coordinates: [1860173, -3551.377] } })).toEqual({ y: -3551.377, x: 1860173 })
  })
  it('keeps [Y, X] for a local system with no southing in the millions', () => {
    expect(featureYX({ geometry: { coordinates: [500, 1200] } })).toEqual({ y: 500, x: 1200 })
  })
  it('returns null for a feature without two numbers', () => {
    expect(featureYX({ geometry: { coordinates: [1] } })).toBeNull()
    expect(featureYX(null)).toBeNull()
  })
})
