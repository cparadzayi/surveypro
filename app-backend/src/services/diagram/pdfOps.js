/**
 * Records what a PDFKit document is asked to draw, as plain page-space operations.
 *
 * The diagram is drawn twice -- once to PDF, once to DXF -- by two renderers that must agree
 * to the point of being replicas, and agreeing by hand-copying (which is what they did) drifts.
 * This recorder is the means of CHECKING it: run the PDF renderer through it, run the DXF
 * renderer, and compare what each drew (see pdfOpsParity.test.js), so a difference is a failing
 * test instead of something a surveyor finds on paper.
 *
 * The wrapper forwards every call to the real document, so the PDF is exactly what it was. The
 * operations are recorded in absolute page points (y down) with the current transform applied.
 */

const IDENTITY = [1, 0, 0, 1, 0, 0]

/** m1 then m2 in PDF's "M x CTM" order: the result maps a point through m1 first. */
function mul(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a1 * a2 + b1 * c2, a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2, c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2, e1 * b2 + f1 * d2 + f2,
  ]
}
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080' }
function parseColor(c) {
  if (typeof c === 'string') {
    const s = NAMED[c.toLowerCase()] || c
    let m = /^#([0-9a-f]{3})$/i.exec(s)
    if (m) return '#' + [...m[1]].map((h) => h + h).join('').toLowerCase()
    m = /^#([0-9a-f]{6})$/i.exec(s)
    if (m) return '#' + m[1].toLowerCase()
  }
  if (Array.isArray(c) && c.length >= 3) {
    // PDFKit takes [r, g, b] 0-255, or [c, m, y, k] 0-100; only the former is used here.
    return '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  }
  return '#000000'
}

/** A polyline cut to an axis-aligned rectangle (Liang-Barsky per segment): the pieces that remain, joined where they meet. */
function clipPolyline(pts, closed, r) {
  const src = closed ? [...pts, pts[0]] : pts
  const pieces = []
  let run = null
  for (let i = 0; i + 1 < src.length; i++) {
    const [x0, y0] = src[i], [x1, y1] = src[i + 1]
    const dx = x1 - x0, dy = y1 - y0
    let t0 = 0, t1 = 1
    for (const [p, q] of [[-dx, x0 - r.x0], [dx, r.x1 - x0], [-dy, y0 - r.y0], [dy, r.y1 - y0]]) {
      if (p === 0) { if (q < 0) { t0 = 2; break } } else {
        const t = q / p
        if (p < 0) { if (t > t1) { t0 = 2; break } if (t > t0) t0 = t } else { if (t < t0) { t0 = 2; break } if (t < t1) t1 = t }
      }
    }
    if (t0 > t1) { run = null; continue }
    const a = [x0 + t0 * dx, y0 + t0 * dy], b = [x0 + t1 * dx, y0 + t1 * dy]
    if (run && t0 === 0) run.push(b)
    else { run = [a, b]; pieces.push(run) }
    if (t1 < 1) run = null
  }
  return pieces
}

/** A ring cut to a rectangle (Sutherland-Hodgman). */
function clipRing(ring, r) {
  const edges = [
    [(p) => p[0] >= r.x0, (a, b) => [r.x0, a[1] + (b[1] - a[1]) * (r.x0 - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= r.x1, (a, b) => [r.x1, a[1] + (b[1] - a[1]) * (r.x1 - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= r.y0, (a, b) => [a[0] + (b[0] - a[0]) * (r.y0 - a[1]) / (b[1] - a[1]), r.y0]],
    [(p) => p[1] <= r.y1, (a, b) => [a[0] + (b[0] - a[0]) * (r.y1 - a[1]) / (b[1] - a[1]), r.y1]],
  ]
  let out = ring
  for (const [inside, cross] of edges) {
    const inp = out
    out = []
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length]
      if (inside(b)) { if (!inside(a)) out.push(cross(a, b)); out.push(b) } else if (inside(a)) out.push(cross(a, b))
    }
    if (!out.length) break
  }
  return out
}

/** What of a recorded operation shows inside a clip rectangle: the same operation cut to it, or nothing. */
function clipOp(op, r) {
  const inside = (x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1
  if (op.type === 'text') {
    const a = op.rotation * Math.PI / 180
    return inside(op.x + Math.cos(a) * op.width / 2, op.y + Math.sin(a) * op.width / 2) ? [op] : []
  }
  if (op.type === 'circle' || op.type === 'discFill') return inside(op.cx, op.cy) ? [op] : []
  if (op.type === 'fill') {
    const rings = op.rings.map((g) => clipRing(g, r)).filter((g) => g.length >= 3)
    return rings.length ? [{ ...op, rings }] : []
  }
  if (op.type === 'stroke') {
    if (op.pts.every((p) => inside(p[0], p[1]))) return [op]
    return clipPolyline(op.pts, op.closed, r).map((pts) => ({ ...op, pts, closed: false }))
  }
  return [op]
}

/**
 * @param {import('pdfkit')} doc
 * @returns {{ doc: any, ops: object[] }}
 */
export function recordPdfOps(doc) {
  const ops = []
  const fresh = () => ({ ctm: IDENTITY, fill: '#000000', stroke: '#000000', lw: 1, dash: null, fillOp: 1, strokeOp: 1, font: 'Helvetica', size: 12 })
  let st = fresh()
  const stack = []
  let path = [] // subpaths: { pts: [[x,y]...], closed }
  let layer = '0'

  const pt = (x, y) => apply(st.ctm, x, y)
  const rotation = () => Math.atan2(st.ctm[1], st.ctm[0]) * 180 / Math.PI // y-down, clockwise positive
  const scaleOf = () => Math.hypot(st.ctm[0], st.ctm[1])

  const record = (op) => {
    for (const o of st.clip ? clipOp(op, st.clip) : [op]) ops.push({ layer, ...o })
  }
  const emitPath = ({ stroke, fill, rule }) => {
    if (fill) {
      // One fill covers every subpath of the path together (that is how an even-odd ring with a
      // hole is expressed), so the rings stay grouped.
      const rings = path.filter((sp) => sp.pts.length >= 3 && !sp.circle).map((sp) => sp.pts)
      if (rings.length) record({ type: 'fill', rings, rule: rule || 'nonzero', color: st.fill, opacity: st.fillOp })
      for (const sp of path) if (sp.circle) record({ type: 'discFill', ...sp.circle, color: st.fill, opacity: st.fillOp })
    }
    if (stroke) {
      for (const sp of path) {
        if (sp.circle) { record({ type: 'circle', ...sp.circle, width: st.lw * scaleOf(), color: st.stroke }); continue }
        if (sp.pts.length < 2) continue
        record({ type: 'stroke', pts: sp.pts, closed: sp.closed, width: st.lw * scaleOf(), color: st.stroke, dash: st.dash })
      }
    }
    path = []
  }
  const cur = () => path[path.length - 1]

  const handlers = {
    save() { stack.push({ ...st }) },
    restore() { if (stack.length) st = stack.pop() },
    transform(a, b, c, d, e, f) { st.ctm = mul([a, b, c, d, e, f], st.ctm) },
    translate(x, y) { st.ctm = mul([1, 0, 0, 1, x, y], st.ctm) },
    scale(sx, sy = sx) { st.ctm = mul([sx, 0, 0, sy, 0, 0], st.ctm) },
    rotate(angle, options = {}) {
      // PDFKit: rotate about `origin` (default 0,0) by `angle` degrees, clockwise on the page.
      const rad = angle * Math.PI / 180
      const cos = Math.cos(rad), sin = Math.sin(rad)
      let x = 0, y = 0
      if (options.origin) {
        const [ox, oy] = options.origin
        x = ox - (ox * cos - oy * sin)
        y = oy - (ox * sin + oy * cos)
      }
      st.ctm = mul([cos, sin, -sin, cos, x, y], st.ctm)
    },
    clip() {
      // The path's bounding box becomes the clip (every clip here is a rectangle), narrowed by any clip already in force.
      const all = path.flatMap((sp) => sp.pts)
      if (all.length) {
        const r = { x0: Math.min(...all.map((p) => p[0])), y0: Math.min(...all.map((p) => p[1])), x1: Math.max(...all.map((p) => p[0])), y1: Math.max(...all.map((p) => p[1])) }
        const c = st.clip
        st.clip = c ? { x0: Math.max(c.x0, r.x0), y0: Math.max(c.y0, r.y0), x1: Math.min(c.x1, r.x1), y1: Math.min(c.y1, r.y1) } : r
      }
      path = []
    },
    lineWidth(w) { st.lw = w },
    strokeColor(c) { st.stroke = parseColor(c) },
    fillColor(c) { st.fill = parseColor(c) },
    fillOpacity(o) { st.fillOp = o },
    strokeOpacity(o) { st.strokeOp = o },
    opacity(o) { st.fillOp = o; st.strokeOp = o },
    dash(len, o) { st.dash = { len, space: o?.space ?? len } },
    undash() { st.dash = null },
    font(name) { if (typeof name === 'string') st.font = name },
    fontSize(s) { st.size = s },
    moveTo(x, y) { path.push({ pts: [pt(x, y)], closed: false }) },
    lineTo(x, y) { (cur() ?? (path.push({ pts: [], closed: false }), cur())).pts.push(pt(x, y)) },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      // Only reached by shapes PDFKit builds from curves; chord to the end is enough for a polyline.
      const sp = cur(); if (sp) sp.pts.push(pt(x, y))
    },
    closePath() { const sp = cur(); if (sp) sp.closed = true },
    rect(x, y, w, h) {
      path.push({ pts: [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)], closed: true })
    },
    circle(x, y, r) { const [cx, cy] = pt(x, y); path.push({ pts: [], closed: true, circle: { cx, cy, r: r * scaleOf() } }) },
    stroke(color) { if (color) st.stroke = parseColor(color); emitPath({ stroke: true, fill: false }) },
    fill(color, rule) {
      // fill('even-odd') is the rule alone; fill('#abc', 'even-odd') is a colour and a rule.
      if (typeof color === 'string' && /^(even-?odd|non-?zero)$/i.test(color)) { rule = color; color = null }
      if (color) st.fill = parseColor(color)
      emitPath({ stroke: false, fill: true, rule: /even/i.test(rule || '') ? 'evenodd' : 'nonzero' })
    },
    fillAndStroke(fillC, strokeC) {
      if (fillC) st.fill = parseColor(fillC)
      if (strokeC) st.stroke = parseColor(strokeC)
      emitPath({ stroke: true, fill: true })
    },
  }

  const proxy = new Proxy(doc, {
    get(target, prop) {
      if (prop === 'layer') return (name) => { layer = String(name); return proxy }
      if (prop === 'text') {
        return (str, x, y, opts) => {
          // Text is positioned by its top-left; PDFKit places the baseline one ascender below.
          // The 2-argument form (x, y omitted) continues from the last position: not used here.
          if (typeof x === 'object' || x == null) return target.text(str, x, y, opts) && proxy
          const size = st.size
          const o = opts ?? {}
          const baselineY = y + (target._font?.ascender ?? 718) / 1000 * size
          // PDFKit breaks a string at its newlines and, given a width, at word gaps. Record one
          // op per printed line so the DXF wraps where the PDF does instead of running on.
          const wrapTo = o.lineBreak === false ? null : o.width
          const lines = []
          for (const para of String(str).split(/\r?\n/)) {
            if (wrapTo == null || target.widthOfString(para, o) <= wrapTo) { lines.push(para); continue }
            let cur = ''
            for (const word of para.split(' ')) {
              const trial = cur ? `${cur} ${word}` : word
              if (cur && target.widthOfString(trial, o) > wrapTo) { lines.push(cur); cur = word } else cur = trial
            }
            lines.push(cur)
          }
          const step = target.currentLineHeight(true) + (o.lineGap ?? target._lineGap ?? 0)
          lines.forEach((line, i) => {
            if (!line.trim() && lines.length > 1) return
            const w = target.widthOfString(line, o)
            let leftX = x
            if (o.width != null && o.align === 'center') leftX = x + (o.width - w) / 2
            else if (o.width != null && o.align === 'right') leftX = x + o.width - w
            const [px, py] = pt(leftX, baselineY + i * step)
            record({
              type: 'text', text: line, x: px, y: py, size: size * scaleOf(), font: st.font,
              color: st.fill, rotation: rotation(), width: w * scaleOf(),
              box: { x, w: o.width ?? null, align: o.align ?? 'left' },
            })
            if (o.underline && line.trim()) {
              const uy = baselineY + i * step + size * 0.12
              const [ax, ay] = pt(leftX, uy), [bx, by] = pt(leftX + w, uy)
              record({ type: 'stroke', pts: [[ax, ay], [bx, by]], closed: false, width: Math.max(0.4, size * 0.05) * scaleOf(), color: st.fill, dash: null })
            }
          })
          target.text(str, x, y, opts)
          return proxy
        }
      }
      if (prop in handlers) {
        return (...args) => {
          const r = handlers[prop](...args)
          // Forward to the real document so the PDF is untouched. The doc's own chain return is
          // `doc`; hand back the proxy instead so recording continues down a chain.
          const real = target[prop]
          if (typeof real === 'function') real.apply(target, args)
          return r === undefined ? proxy : r
        }
      }
      const v = target[prop]
      return typeof v === 'function' ? v.bind(target) : v
    },
    set(target, prop, value) { target[prop] = value; return true },
  })
  return { doc: proxy, ops }
}
