import PDFDocument from 'pdfkit'
import { clusterCramped, clusterWindow, renderBeaconClusterInset, clipToRect, placeStandNumber, rotatedBoxClear, fitIndicatorRing } from '../beaconClusterInset.js'
import { fitSuffixLabel } from '../../diagram/suffixLabelFit.js'

const it_ = (name, x, y) => ({ name, stand: '1', pos: { x, y } })

describe('clusterCramped', () => {
  test('beacons within the link distance share a cluster; far ones do not', () => {
    const cl = clusterCramped([it_('a', 0, 0), it_('b', 10, 0), it_('c', 25, 0), it_('d', 400, 0)])
    expect(cl.map((c) => c.length)).toEqual([3, 1])
  })
  test('chains link transitively', () => {
    const cl = clusterCramped([it_('a', 0, 0), it_('b', 35, 0), it_('c', 70, 0)])
    expect(cl).toHaveLength(1)
  })
})

describe('clusterWindow', () => {
  test('centres on the cluster and magnifies within limits', () => {
    const w = clusterWindow([it_('a', 100, 200), it_('b', 112, 200)], 160, 150)
    expect(w.cx).toBeCloseTo(106)
    expect(w.cy).toBeCloseTo(200)
    expect(w.mag).toBeGreaterThanOrEqual(3)
    expect(w.mag).toBeLessThanOrEqual(10)
  })
  test('a wide cluster is magnified less, never below the minimum', () => {
    const w = clusterWindow([it_('a', 0, 0), it_('b', 38, 0)], 160, 150)
    expect(w.mag).toBeGreaterThanOrEqual(3)
  })
})

describe('suffix fit reports when a letter is cramped', () => {
  const widthAt = (fs) => fs * 0.7
  test('roomy corner: not cramped', () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
    expect(fitSuffixLabel({ beaconPos: { x: 0, y: 0 }, polygon: sq, widthAt, fontSize: 8, beaconRadius: 2.1 }).cramped).toBe(false)
  })
  test('strip narrower than the letter: cramped', () => {
    const strip = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 120 }, { x: 0, y: 120 }, { x: 0, y: 0 }]
    expect(fitSuffixLabel({ beaconPos: { x: 0, y: 0 }, polygon: strip, widthAt, fontSize: 8, beaconRadius: 2.1 }).cramped).toBe(true)
  })
})

describe('renderBeaconClusterInset', () => {
  test('draws an inset (stands, beacons, letters) without throwing', async () => {
    const doc = new PDFDocument({ size: 'A4' })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    const toPdf = (y, x) => ({ x: x * 3, y: -y * 3 })
    const strip = (x0) => ({ type: 'Feature', properties: { stand: String(x0) },
      geometry: { type: 'Polygon', coordinates: [[[0, x0], [0, x0 + 4], [60, x0 + 4], [60, x0], [0, x0]]] } })
    const inset = {
      number: 1, scale: 150, stands: ['1', '5'], beaconRadius: 2.1, textColor: '#000000',
      win: clusterWindow([{ pos: toPdf(0, 1) }, { pos: toPdf(0, 5) }], 160, 150),
      toPdf, parcels: [strip(1), strip(5)],
      beacons: [{ name: '1A', stand: '1', suffix: 'A', y: 0, x: 1 }, { name: '5A', stand: '5', suffix: 'A', y: 0, x: 5 }],
      position: { x: 40, y: 40 },
    }
    expect(() => renderBeaconClusterInset(doc, inset, 170, 170)).not.toThrow()
    const done = new Promise((resolve) => doc.on('end', resolve))
    doc.end()
    await done
    expect(Buffer.concat(chunks).length).toBeGreaterThan(200)
  })
})

describe('surrounding stands in the inset', () => {
  const area = { x: 0, y: 0, width: 100, height: 100 }
  test('clipToRect keeps only the part of a polygon inside the window', () => {
    const poly = [{ x: -50, y: 40 }, { x: 150, y: 40 }, { x: 150, y: 60 }, { x: -50, y: 60 }]
    const c = clipToRect(poly, area)
    expect(Math.min(...c.map((p) => p.x))).toBeCloseTo(0)
    expect(Math.max(...c.map((p) => p.x))).toBeCloseTo(100)
    expect(c.every((p) => p.y >= 39.99 && p.y <= 60.01)).toBe(true)
  })
  test('clipToRect of a polygon wholly outside is empty', () => {
    expect(clipToRect([{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }], area)).toHaveLength(0)
  })
  const widthAt = (fs) => fs * 2.5
  test('a number goes in the middle of a roomy stand at full size', () => {
    const sq = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }]
    const r = placeStandNumber(sq, widthAt, [])
    expect(r.fontSize).toBe(9)
    expect(Math.hypot(r.cx - 30, r.cy - 30)).toBeLessThan(4)
  })
  test('a narrow stand gets a smaller number rather than none, and it stays inside', () => {
    const strip = [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 9 }, { x: 0, y: 9 }]
    const r = placeStandNumber(strip, widthAt, [])
    expect(r).not.toBeNull()
    expect(r.fontSize).toBeLessThan(9)
    expect(r.cy - r.fontSize / 2).toBeGreaterThan(0)
    expect(r.cy + r.fontSize / 2).toBeLessThan(9)
  })
  test('keeps clear of letters already placed', () => {
    const sq = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }]
    const block = { x: 20, y: 20, w: 20, h: 20 }
    const r = placeStandNumber(sq, widthAt, [block])
    const w = widthAt(r.fontSize), h = r.fontSize
    const overlap = r.cx - w / 2 < block.x + block.w && block.x < r.cx + w / 2 && r.cy - h / 2 < block.y + block.h && block.y < r.cy + h / 2
    expect(overlap).toBe(false)
  })
})

describe('numbers shown in full, tags kept off lines', () => {
  const widthAt = (fs) => fs * 2.5
  test('a tall thin sliver gets its number turned to run up the stand, whole and inside', () => {
    const sliver = [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 80 }, { x: 0, y: 80 }]
    const r = placeStandNumber(sliver, widthAt, [])
    expect(r).not.toBeNull()
    expect(r.rotation).toBe(-90)
    expect(r.cx - r.ew / 2).toBeGreaterThan(0)
    expect(r.cx + r.ew / 2).toBeLessThan(7)
    expect(r.cy - r.eh / 2).toBeGreaterThan(0)
    expect(r.cy + r.eh / 2).toBeLessThan(80)
  })
  test('horizontal is kept whenever it fits', () => {
    const sq = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }]
    expect(placeStandNumber(sq, widthAt, []).rotation).toBe(0)
  })
  const line = [{ x1: -50, y1: 0, x2: 50, y2: 0 }]
  test('rotatedBoxClear: a box on the line is blocked, one beside it is clear', () => {
    expect(rotatedBoxClear(0, 0, 20, 8, 0, line, 1)).toBe(false)
    expect(rotatedBoxClear(0, 12, 20, 8, 0, line, 1)).toBe(true)
  })
  test('rotatedBoxClear: turning a box can take it off a line it would touch', () => {
    const vertical = [{ x1: 12, y1: -50, x2: 12, y2: 50 }]
    expect(rotatedBoxClear(0, 0, 30, 6, 0, vertical, 1)).toBe(false)  // 30 wide reaches x=15
    expect(rotatedBoxClear(0, 0, 30, 6, 90, vertical, 1)).toBe(true)  // 6 wide when turned
  })
})

describe('fitIndicatorRing', () => {
  const R = 2.1
  const cluster = [{ x: 0, y: 0 }, { x: 8, y: 0 }]
  const base = { cx: 4, cy: 0, cluster, beaconRadius: R }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

  test('encloses every cluster circle whole, with the smallest ring that does', () => {
    const r = fitIndicatorRing(base)
    for (const p of cluster) expect(dist({ x: r.cx, y: r.cy }, p) + R).toBeLessThan(r.r)
    expect(r.r).toBeLessThan(10)
    expect(r.clear).toBe(true)
  })

  test('never cuts across another beacon circle: shrinks or grows to miss it', () => {
    // A neighbour 9pt out would sit right on a minimal ring.
    const other = { x: 4 + 9, y: 0 }
    const r = fitIndicatorRing({ ...base, otherBeacons: [other] })
    const d = dist({ x: r.cx, y: r.cy }, other)
    expect(d + R <= r.r || d - R >= r.r).toBe(true)
    expect(r.clear).toBe(true)
  })

  test('a label is wholly inside or wholly outside the ring, never on it', () => {
    const label = { x: 8, y: -3, width: 10, height: 6 }
    const r = fitIndicatorRing({ ...base, rects: [label] })
    const nx = Math.max(label.x, Math.min(r.cx, label.x + label.width)), ny = Math.max(label.y, Math.min(r.cy, label.y + label.height))
    const dmin = Math.hypot(nx - r.cx, ny - r.cy)
    const corners = [[label.x, label.y], [label.x + label.width, label.y], [label.x, label.y + label.height], [label.x + label.width, label.y + label.height]]
    const dmax = Math.max(...corners.map(([x, y]) => Math.hypot(x - r.cx, y - r.cy)))
    expect(dmax < r.r || dmin > r.r).toBe(true)
  })

  test('reach: a long label row that every near ring would cut is cleared by growing past it', () => {
    // 60pt long, straddling every radius from 8 to 68 along +x: nothing within the default reach is clear.
    const row = { x: 8, y: -3, width: 60, height: 6 }
    expect(fitIndicatorRing({ ...base, rects: [row] }).clear).toBe(false)
    const r = fitIndicatorRing({ ...base, rects: [row], reach: 90 })
    expect(r.clear).toBe(true)
    expect(r.r).toBeGreaterThan(40) // well past the default reach
  })

  test('leastCut: with no clear ring, a full ring that cuts the fewest labels, a label costing more than a circle', () => {
    // Labels all round at every radius, and a neighbour circle: nothing is clear.
    const wall = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: 4 + sx * 40 - 30, y: sy * 40 - 3, width: 60, height: 6 })))
    const rects = [{ x: -60, y: -3, width: 120, height: 6 }, { x: -3, y: -60, width: 6, height: 120 }, ...wall]
    const none = fitIndicatorRing({ ...base, rects, otherBeacons: [{ x: 4, y: 9 }] })
    expect(none.clear).toBe(false)
    const least = fitIndicatorRing({ ...base, rects, otherBeacons: [{ x: 4, y: 9 }], leastCut: true })
    expect(least.clear).toBe(false)
    expect(least.r).toBeGreaterThan(0)
    expect(Number.isFinite(least.cuts)).toBe(true)
  })

  test('blocks and bands too big to be labels are not allowed to veto the ring', () => {
    const band = { x: -500, y: -500, width: 1000, height: 1000 }
    expect(fitIndicatorRing({ ...base, rects: [band] }).clear).toBe(true)
  })
})

// A dense plan hands these functions hundreds of circles, labels and lines, nearly all of them far
// from the ring or box in question. They are skipped without testing; skipping must change nothing.
describe('far-away obstacles are skipped without changing the answer', () => {
  const cluster = [{ x: 100, y: 100 }, { x: 108, y: 103 }]
  const near = {
    cluster, cx: 104, cy: 101.5, beaconRadius: 2.5,
    otherBeacons: [{ x: 125, y: 100 }],
    rects: [{ x: 112, y: 90, width: 30, height: 8 }],
  }
  const far = {
    ...near,
    otherBeacons: [...near.otherBeacons, ...Array.from({ length: 300 }, (_, i) => ({ x: 600 + i * 7, y: -400 + (i % 9) * 11 }))],
    rects: [...near.rects, ...Array.from({ length: 300 }, (_, i) => ({ x: -900 + i * 9, y: 700 + (i % 5) * 13, width: 24, height: 6 }))],
  }
  test.each([
    ['default', {}],
    ['soft beacons', { softBeacons: true }],
    ['wide reach', { reach: 70, offsets: [1.5, 3, 5, 8, 12, 16] }],
    ['least cut', { leastCut: true, minR: 40 }],
  ])('fitIndicatorRing, %s: same ring with 600 distant obstacles added', (_n, extra) => {
    expect(fitIndicatorRing({ ...far, ...extra })).toEqual(fitIndicatorRing({ ...near, ...extra }))
  })

  test('rotatedBoxClear: same verdict with distant lines added, for a clear box and a blocked one', () => {
    const lines = [{ x1: 0, y1: 10, x2: 40, y2: 10 }]
    const distant = Array.from({ length: 500 }, (_, i) => ({ x1: 500 + i, y1: 500, x2: 520 + i, y2: 540 }))
    for (const [cx, cy] of [[20, 10], [20, 40]]) {
      for (const rot of [0, 35, 90]) {
        expect(rotatedBoxClear(cx, cy, 12, 4, rot, [...lines, ...distant])).toBe(rotatedBoxClear(cx, cy, 12, 4, rot, lines))
      }
    }
  })

  test('rotatedBoxClear: a long line passing a box whose ends are both far away still blocks it', () => {
    expect(rotatedBoxClear(50, 50, 10, 4, 0, [{ x1: -1000, y1: 50, x2: 1000, y2: 50 }])).toBe(false)
  })
})

describe('rotatedBoxClear with a large segment list (gridded) agrees with testing every segment', () => {
  // The reference is the same call on a short list, one segment at a time, which never uses the grid.
  test('random boxes against 400 short lines plus long and diagonal ones', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
    const segs = Array.from({ length: 400 }, () => {
      const x = rnd() * 800 - 100, y = rnd() * 600 - 100
      return { x1: x, y1: y, x2: x + rnd() * 60 - 30, y2: y + rnd() * 60 - 30 }
    })
    segs.push({ x1: -50, y1: -50, x2: 750, y2: 500 }, { x1: 300, y1: -80, x2: 310, y2: 600 }, { x1: -80, y1: 250, x2: 800, y2: 255 })
    let blocked = 0
    for (let i = 0; i < 600; i++) {
      const cx = rnd() * 800 - 100, cy = rnd() * 600 - 100, w = 4 + rnd() * 40, h = 2 + rnd() * 10, rot = rnd() * 180
      const brute = segs.every((sg) => rotatedBoxClear(cx, cy, w, h, rot, [sg], 1))
      if (!brute) blocked++
      expect(rotatedBoxClear(cx, cy, w, h, rot, segs, 1)).toBe(brute)
    }
    expect(blocked).toBeGreaterThan(50)   // the comparison saw blocked and clear boxes alike
    expect(blocked).toBeLessThan(550)
  })
})
