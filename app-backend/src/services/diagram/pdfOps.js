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

  const record = (op) => ops.push({ layer, ...op })
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
          const w = target.widthOfString(String(str), o)
          let leftX = x
          if (o.width != null && o.align === 'center') leftX = x + (o.width - w) / 2
          else if (o.width != null && o.align === 'right') leftX = x + o.width - w
          const [px, py] = pt(leftX, baselineY)
          record({
            type: 'text', text: String(str), x: px, y: py, size: size * scaleOf(), font: st.font,
            color: st.fill, rotation: rotation(), width: w * scaleOf(),
            box: { x, w: o.width ?? null, align: o.align ?? 'left' },
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
