import { boxesIntersect, normalizeRect, normalizeSpacing } from '../collisionPrimitives.js'

// boxesIntersect used to build two normalised copies of its arguments; it now does the same sums
// without allocating. Any drift would move labels on a legal plan, so it is checked against the
// original formulation on ordinary, negative-sized, touching and non-finite rectangles.
const reference = (box1, box2, spacing = 0) => {
  const a = normalizeRect(box1), b = normalizeRect(box2), s = normalizeSpacing(spacing)
  return !(a.x + a.width + s < b.x || b.x + b.width + s < a.x || a.y + a.height + s < b.y || b.y + b.height + s < a.y)
}

describe('boxesIntersect agrees with the normalise-then-compare original', () => {
  let seed = 11
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const odd = [undefined, null, NaN, Infinity, -Infinity, 0, -0]
  const num = () => (rnd() < 0.08 ? odd[Math.floor(rnd() * odd.length)] : Math.round((rnd() * 200 - 100) * 10) / 10 + (rnd() < 0.3 ? 0.1 + 0.2 : 0))
  const rect = () => (rnd() < 0.03 ? undefined : { x: num(), y: num(), width: num(), height: num() })

  test('20000 random pairs, with and without spacing', () => {
    for (let i = 0; i < 20000; i++) {
      const a = rect(), b = rect(), s = rnd() < 0.5 ? 0 : num()
      expect(boxesIntersect(a, b, s)).toBe(reference(a, b, s))
    }
  })

  test('touching edges count as overlap; a gap does not', () => {
    expect(boxesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBe(true)
    expect(boxesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10.01, y: 0, width: 5, height: 5 })).toBe(false)
    expect(boxesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10.01, y: 0, width: 5, height: 5 }, 0.02)).toBe(true)
  })
})
