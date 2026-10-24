import { describe, test, expect } from '@jest/globals'
import { InsetManager } from '../insetManager.js'
import { MM_TO_PT } from '../geometry.js'

const S = 60 * MM_TO_PT
const quiet = { info: () => {}, warn: () => {}, error: () => {} }
const cluster = (x, y, stand = '1000') => [{ name: `${stand}A`, stand, suffix: 'A', pos: { x, y } }]
const mk = () => new InsetManager(quiet)
const make = (m, clusters) =>
  m.createBeaconClusterGroupInset({
    clusters, beacons: [], parcels: [], mainScale: 600, toPdf: (y, x) => ({ x, y }), beaconRadius: 2, textColor: '#000',
  })

describe('inset blocks: neighbouring clusters share one block', () => {
  test('a single cluster is the one-cell, single-box inset it always was', () => {
    const m = mk()
    const inset = make(m, [cluster(100, 100)])
    expect(inset.cols).toBe(1)
    expect(inset.rows).toBe(1)
    const dims = m.getInsetDimensions()
    expect(dims).toHaveLength(1)
    expect([dims[0].width, dims[0].height]).toEqual([S, S])
    // and createBeaconClusterInset still works as the single-cluster shorthand
    const again = m.createBeaconClusterInset({ items: cluster(300, 300), beacons: [], parcels: [], mainScale: 600, toPdf: (y, x) => ({ x, y }), beaconRadius: 2, textColor: '#000' })
    expect(again.cells).toHaveLength(1)
  })

  test.each([
    [2, 2, 1],
    [3, 2, 2],
    [4, 2, 2],
  ])('%i clusters make ONE block, %i across by %i down, with one number', (n, cols, rows) => {
    const m = mk()
    const inset = make(m, Array.from({ length: n }, (_, i) => cluster(100 + i * 90, 100)))
    expect(m.insets).toHaveLength(1)
    expect(inset.cells).toHaveLength(n)
    expect([inset.cols, inset.rows]).toEqual([cols, rows])
    const [d] = m.getInsetDimensions()
    expect([d.width, d.height]).toEqual([cols * S, rows * S])
  })

  test('each cell keeps its own window, so no cluster loses magnification to its neighbour', () => {
    const m = mk()
    const lone = make(mk(), [cluster(100, 100)]).cells[0].win
    const inset = make(m, [cluster(100, 100), cluster(220, 100)])
    expect(inset.cells[0].win.mag).toBeCloseTo(lone.mag, 9)
    expect(inset.cells[1].win.mag).toBeCloseTo(lone.mag, 9)
    expect(inset.cells[0].win.cx).toBe(100)
    expect(inset.cells[1].win.cx).toBe(220)
  })

  test('the block is placed off ALL of its clusters', () => {
    const inset = make(mk(), [cluster(100, 100), cluster(260, 140)])
    const w = inset.win
    for (const c of inset.cells) {
      expect(Math.hypot(c.win.cx - w.cx, c.win.cy - w.cy) + c.win.radius).toBeLessThanOrEqual(w.radius + 1e-9)
    }
  })

  test('the block numbers its cells a, b, c ... and a lone cell keeps the plain number', () => {
    const m = mk()
    const manager = mk()
    const two = make(manager, [cluster(100, 100), cluster(220, 100)])
    two.position = { x: 10, y: 20 }
    // renderInset draws each cell via renderBeaconClusterInset; capture the titles it prints
    const titles = []
    const spy = { text: (t) => { titles.push(t); return spy }, save: () => spy, restore: () => spy, rect: () => spy, clip: () => spy, lineWidth: () => spy, strokeColor: () => spy, stroke: () => spy, fontSize: () => spy, font: () => spy, fillColor: () => spy, moveTo: () => spy, lineTo: () => spy, circle: () => spy, fill: () => spy, fillAndStroke: () => spy, closePath: () => spy, translate: () => spy, rotate: () => spy, widthOfString: () => 5, dash: () => spy, undash: () => spy, polygon: () => spy, opacity: () => spy }
    manager.renderInset(spy, two, 2 * S, S)
    expect(titles.filter((t) => /Not To Scale/.test(t))).toEqual(['Inset 1a: Not To Scale', 'Inset 1b: Not To Scale'])
    titles.length = 0
    const one = make(m, [cluster(100, 100)])
    one.position = { x: 10, y: 20 }
    m.renderInset(spy, one, S, S)
    expect(titles.filter((t) => /Not To Scale/.test(t))).toEqual(['Inset 1: Not To Scale'])
  })
})
