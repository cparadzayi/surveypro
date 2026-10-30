import { describe, test, expect } from '@jest/globals'
import { tagAnchorMembers } from '../pdfkitGeoPDF.js'

/**
 * An inset's tag is tried beside each beacon of its cluster, so candidates grow with the cluster. A plan
 * drawn small enough to put 100+ beacons in one cluster built millions of candidates and the server ran
 * out of heap. Beyond a limit only the cluster's outline is used; up to it, nothing changes.
 */
const member = (x, y, name = `${x},${y}`) => ({ name, stand: '1', pos: { x, y } })

describe('tagAnchorMembers', () => {
  test('a small cluster is returned exactly as given', () => {
    const c = Array.from({ length: 24 }, (_, i) => member(i * 5, (i % 4) * 5))
    expect(tagAnchorMembers(c)).toBe(c)
  })

  test('shared corners (the same position) count once, so a cluster of 24 distinct spots stays whole', () => {
    const distinct = Array.from({ length: 24 }, (_, i) => member(i * 5, (i % 3) * 7))
    const doubled = [...distinct, ...distinct.map((m) => member(m.pos.x, m.pos.y, m.name + '-dup'))]
    expect(tagAnchorMembers(doubled)).toBe(doubled)
  })

  test('a large cluster keeps only its outline: every beacon lies inside what is kept', () => {
    const grid = []
    for (let i = 0; i < 12; i++) for (let j = 0; j < 11; j++) grid.push(member(i * 10, j * 10))   // 132 beacons
    const kept = tagAnchorMembers(grid)
    expect(kept.length).toBeLessThan(grid.length / 4)
    const xs = kept.map((m) => m.pos.x), ys = kept.map((m) => m.pos.y)
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 110, 0, 100])
    // the four corners of the grid are on the outline
    for (const [x, y] of [[0, 0], [110, 0], [0, 100], [110, 100]]) {
      expect(kept.some((m) => m.pos.x === x && m.pos.y === y)).toBe(true)
    }
    // nothing from the middle is kept
    expect(kept.some((m) => m.pos.x === 50 && m.pos.y === 50)).toBe(false)
  })

  test('kept members are the originals, not copies (the caller reads .pos and .stand)', () => {
    const c = Array.from({ length: 40 }, (_, i) => member(Math.cos(i) * 50, Math.sin(i) * 50, `m${i}`))
    for (const m of tagAnchorMembers(c)) expect(c).toContain(m)
  })
})
