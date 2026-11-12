import { describe, it, expect } from 'vitest'
import { isOcpPoint } from '../controlTriangleIcon'

// An official control point (OCP, "6091/V") is drawn as the trig triangle inverted; a trig beacon points up.
describe('which control points are drawn inverted', () => {
  it('by status or registry type', () => {
    expect(isOcpPoint({ status: 'OCP' })).toBe(true)
    expect(isOcpPoint({ type: 'ocp' })).toBe(true)
    expect(isOcpPoint({ status: 'TRIG' })).toBe(false)
    expect(isOcpPoint({ type: 'SEC' })).toBe(false)
  })

  it('by designation, including the inset\'s "CP-" prefix and the description', () => {
    expect(isOcpPoint({ id: '6091/V' })).toBe(true)
    expect(isOcpPoint({ id: 'CP-6091/V', description: '6091/V' })).toBe(true)
    expect(isOcpPoint({ id: 'x', description: 'TSM894/V' })).toBe(true)
  })

  it('a trig station is not an OCP', () => {
    expect(isOcpPoint({ id: '333/S' })).toBe(false)
    expect(isOcpPoint({ id: 'CP-333/S', description: '333/S' })).toBe(false)
    expect(isOcpPoint({ id: 'TSM5168' })).toBe(false)
    expect(isOcpPoint({})).toBe(false)
  })
})
