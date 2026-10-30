/**
 * Candidate spots for an inset's tag (the "Inset 3a" label written on the plan beside the beacons it
 * magnifies), in the order they are to be tried: cheapest first, ties in the order they were generated.
 *
 * There are a great many: every beacon of the cluster x 24 bearings x 7-10 gaps x each turn x each of
 * 4 sizes, plus a slide along the road at 11 sideways offsets x 2 sides x 37 positions. On a plan drawn
 * small enough to put 100+ beacons in a cluster that is millions, and building and sorting them all
 * before looking at the first took seconds and gigabytes -- yet the caller takes the first one that
 * fits, usually within the first few hundred.
 *
 * `insetTagCandidates` produces the SAME sequence as `insetTagCandidatesEager` (which builds, then
 * stable-sorts by cost, exactly as the renderer used to) without building it: the candidates fall into
 * streams that are each already in order, and the streams are merged with a heap, one candidate at a
 * time. Two kinds of stream:
 *   - bearing: one per (size, turn, gap). Every candidate in it costs the same (the cost does not
 *     depend on which beacon or bearing), so it is simply read in the order generated.
 *   - along-the-road: one per (size, road direction). Costs differ candidate to candidate, so its
 *     numbers (not objects) are computed and sorted once, and objects are made as they are reached.
 * Ties between streams break on where the candidate sat in the eager list, so equal-cost candidates
 * come out in the same order as before. insetTagCandidates.test.js checks that, candidate by candidate.
 *
 * @param {object} o
 * @param {number[]} o.fonts            sizes, in the order they were built
 * @param {number[]} o.gaps             gaps beside a beacon's circle
 * @param {number}   o.ref              the size that costs nothing (smaller ones cost FONT_COST_PT per pt)
 * @param {Array<{pos:{x:number,y:number}}>} o.anchors   the beacons the tag is tried beside
 * @param {number[]} o.rots             turns (degrees) tried at every bearing
 * @param {number[]} o.alongRots        road directions the tag is slid along
 * @param {(fs:number)=>number} o.widthAt  the tag's width at a size
 * @param {number}   o.beaconRadius
 * @param {(rot:number)=>number} o.turnCost
 * @param {number}   o.fontCostPt
 */

const BEARING_STEP = 15;
const SIDES = [];
for (let side = 2.5; side <= 10; side += 0.75) SIDES.push(side);
const SIGNS = [1, -1];
const ALONGS = [];
for (let along = -36; along <= 36; along += 2) ALONGS.push(along);
const ANGLES = [];
for (let a = 0; a < 360; a += BEARING_STEP) ANGLES.push(a);

/** Everything the two builders share, computed once per call. */
function prepare({ fonts, widthAt }) {
  // Widths are asked for in font order, so the caller's document is left at the last font, as building
  // each size in turn left it.
  return fonts.map((fs) => ({ fs, w: widthAt(fs), h: fs }));
}

function bearingCandidate(p, ctx, rotIdx, mIdx, aIdx, gap, cost) {
  const { fs, w, h } = p
  const rot = ctx.rots[rotIdx]
  const rr = (rot * Math.PI) / 180
  const ew = Math.abs(Math.cos(rr)) * w + Math.abs(Math.sin(rr)) * h
  const eh = Math.abs(Math.sin(rr)) * w + Math.abs(Math.cos(rr)) * h
  const m = ctx.anchors[mIdx]
  const a = ANGLES[aIdx]
  const dx = Math.cos((a * Math.PI) / 180), dy = Math.sin((a * Math.PI) / 180)
  const ux = Math.cos(rr), uy = Math.sin(rr)
  const reach = (Math.abs(dx * ux + dy * uy) * w + Math.abs(-dx * uy + dy * ux) * h) / 2
  const d = ctx.beaconRadius + gap + reach
  return { rot, ew, eh, dx, dy, reach, gap, fs, tw: w, th: h, bx: m.pos.x, by: m.pos.y,
    x: m.pos.x + dx * d, y: m.pos.y + dy * d, cost }
}

/** The along-the-road geometry of one (size, direction): constants shared by its candidates. */
function alongFrame(p, rot) {
  const { w, h } = p
  const rr = (rot * Math.PI) / 180
  const ux = Math.cos(rr), uy = Math.sin(rr), nx = -Math.sin(rr), ny = Math.cos(rr)
  const ew = Math.abs(ux) * w + Math.abs(uy) * h, eh = Math.abs(uy) * w + Math.abs(ux) * h
  return { ux, uy, nx, ny, ew, eh }
}

/** Nearest the label's box comes to the beacon, in the label's own frame. */
function alongGap(p, ctx, along, side) {
  return Math.hypot(Math.max(Math.abs(along) - p.w / 2, 0), Math.max(side - p.h / 2, 0)) - ctx.beaconRadius
}

function alongCandidate(p, ctx, frame, rot, mIdx, side, sg, along, gapToCircle, cost) {
  const m = ctx.anchors[mIdx]
  return { rot, ew: frame.ew, eh: frame.eh, gap: Math.round(gapToCircle * 10) / 10, fs: p.fs, tw: p.w, th: p.h,
    bx: m.pos.x, by: m.pos.y,
    x: m.pos.x + frame.ux * along + frame.nx * side * sg, y: m.pos.y + frame.uy * along + frame.ny * side * sg, cost }
}

/** The reference: build every candidate, then stable-sort by cost. What the renderer did before. */
export function insetTagCandidatesEager(o) {
  const { fonts, gaps, ref, anchors, rots, alongRots, beaconRadius, turnCost, fontCostPt } = o
  const ctx = { rots, anchors, beaconRadius }
  const prepared = prepare(o)
  const out = []
  for (const p of prepared) {
    for (let rotIdx = 0; rotIdx < rots.length; rotIdx++) {
      for (let mIdx = 0; mIdx < anchors.length; mIdx++) {
        for (let aIdx = 0; aIdx < ANGLES.length; aIdx++) {
          for (const gap of gaps) {
            out.push(bearingCandidate(p, ctx, rotIdx, mIdx, aIdx, gap, gap + (ref - p.fs) * fontCostPt + turnCost(rots[rotIdx])))
          }
        }
      }
    }
    for (const rot of alongRots) {
      const frame = alongFrame(p, rot)
      for (let mIdx = 0; mIdx < anchors.length; mIdx++) {
        for (const side of SIDES) {
          for (const sg of SIGNS) {
            for (const along of ALONGS) {
              const gapToCircle = alongGap(p, ctx, along, side)
              if (gapToCircle < 0.4) continue
              out.push(alongCandidate(p, ctx, frame, rot, mIdx, side, sg, along, gapToCircle,
                gapToCircle + (ref - p.fs) * fontCostPt + turnCost(rot)))
            }
          }
        }
      }
    }
  }
  return out.sort((p, q) => p.cost - q.cost)
}

// ---- the lazy merge -------------------------------------------------------------------------------

/** Where a candidate sat in the eager list, as numbers compared left to right. */
function keyCompare(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}

class Heap {
  constructor() { this.a = [] }
  get size() { return this.a.length }
  less(x, y) { return x.cost !== y.cost ? x.cost < y.cost : keyCompare(x.key, y.key) < 0 }
  push(e) {
    const a = this.a
    a.push(e)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.less(a[i], a[p])) break
      ;[a[i], a[p]] = [a[p], a[i]]
      i = p
    }
  }
  pop() {
    const a = this.a
    const top = a[0]
    const last = a.pop()
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let s = i
        if (l < a.length && this.less(a[l], a[s])) s = l
        if (r < a.length && this.less(a[r], a[s])) s = r
        if (s === i) break
        ;[a[i], a[s]] = [a[s], a[i]]
        i = s
      }
    }
    return top
  }
}

/**
 * A re-iterable sequence: each `for...of` over it starts afresh from the cheapest candidate, and only
 * as many candidates are made as the loop asks for.
 */
export function insetTagCandidates(o) {
  const { fonts, gaps, ref, anchors, rots, alongRots, beaconRadius, turnCost, fontCostPt } = o
  const ctx = { rots, anchors, beaconRadius }
  const prepared = prepare(o)

  // Per-iteration state is built inside [Symbol.iterator], but the along-the-road tables do not change,
  // so they are computed on first use and shared.
  let alongTables = null
  const tables = () => {
    if (alongTables) return alongTables
    alongTables = []
    prepared.forEach((p, fsIdx) => {
      alongRots.forEach((rot, rotIdx2) => {
        const frame = alongFrame(p, rot)
        const turn = turnCost(rot)
        const mi = [], sd = [], sgn = [], al = [], gp = [], cost = []
        for (let mIdx = 0; mIdx < anchors.length; mIdx++) {
          for (const side of SIDES) {
            for (const sg of SIGNS) {
              for (const along of ALONGS) {
                const gapToCircle = alongGap(p, ctx, along, side)
                if (gapToCircle < 0.4) continue
                mi.push(mIdx); sd.push(side); sgn.push(sg); al.push(along); gp.push(gapToCircle)
                // The same expression, in the same order, as the eager list: floating point is not associative.
                cost.push(gapToCircle + (ref - p.fs) * fontCostPt + turn)
              }
            }
          }
        }
        // Stable by generation order: ties keep the order they were generated in.
        const order = Array.from({ length: cost.length }, (_, i) => i).sort((x, y) => cost[x] - cost[y] || x - y)
        alongTables.push({ fsIdx, rotIdx2, p, rot, frame, mi, sd, sgn, al, gp, cost, order })
      })
    })
    return alongTables
  }

  return {
    [Symbol.iterator]() {
      const heap = new Heap()
      // Bearing streams: (size, turn, gap). A stream's next candidate is (beacon, bearing) in generation order.
      prepared.forEach((p, fsIdx) => {
        rots.forEach((rot, rotIdx) => {
          gaps.forEach((gap, gapIdx) => {
            if (!anchors.length) return
            const cost = gap + (ref - p.fs) * fontCostPt + turnCost(rot)
            const s = { kind: 0, p, fsIdx, rotIdx, gap, gapIdx, cost, mIdx: 0, aIdx: 0 }
            heap.push({ cost, key: [fsIdx, 0, rotIdx, 0, 0, gapIdx], s })
          })
        })
      })
      for (const t of tables()) {
        if (!t.order.length) continue
        const i = t.order[0]
        heap.push({ cost: t.cost[i], key: [t.fsIdx, 1, t.rotIdx2, i], s: { kind: 1, t, pos: 0 } })
      }
      return {
        next() {
          if (!heap.size) return { done: true, value: undefined }
          const e = heap.pop()
          const s = e.s
          let value
          if (s.kind === 0) {
            value = bearingCandidate(s.p, ctx, s.rotIdx, s.mIdx, s.aIdx, s.gap, s.cost)
            if (++s.aIdx === ANGLES.length) { s.aIdx = 0; s.mIdx++ }
            if (s.mIdx < anchors.length) heap.push({ cost: s.cost, key: [s.fsIdx, 0, s.rotIdx, s.mIdx, s.aIdx, s.gapIdx], s })
          } else {
            const t = s.t
            const i = t.order[s.pos]
            value = alongCandidate(t.p, ctx, t.frame, t.rot, t.mi[i], t.sd[i], t.sgn[i], t.al[i], t.gp[i], t.cost[i])
            if (++s.pos < t.order.length) {
              const j = t.order[s.pos]
              heap.push({ cost: t.cost[j], key: [t.fsIdx, 1, t.rotIdx2, j], s })
            }
          }
          return { done: false, value }
        },
      }
    },
  }
}
