import PDFDocument from 'pdfkit'
import { clusterCramped, clusterWindow, renderBeaconClusterInset, clipToRect, placeStandNumber } from '../beaconClusterInset.js'
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
