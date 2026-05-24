# Beacon Comparison Examination Report (PDF) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side PDF examination report (SI 727 §67(5)) to the Beacon Comparison tool, including a holistic South-oriented displacement plot.

**Architecture:** Two new frontend modules — a pure, dependency-free geometry/format helper module (`beaconReportGeometry.js`, Node-testable) and a jsPDF generator class (`beaconAdjustmentReport.js`) that assembles the report and draws the plot with native vector primitives — plus examination-metadata inputs and a download button in `CompareView.vue`. No backend.

**Tech Stack:** Vue 3, jsPDF v3, jspdf-autotable v5, plain-JS ES modules.

**Spec:** `docs/superpowers/specs/2026-05-24-beacon-comparison-report-design.md`

**Testing note:** The frontend has no unit-test runner. Pure helpers are verified with a throwaway Node script (copy the ES module to `.mjs`, run assertions — the pattern already used for `surveyMath.js`). PDF assembly and UI are verified via `npm run build` and the Edge/Playwright harness in `%TEMP%\pw-verify`. Do **not** add Vitest — out of scope.

**Adjustment `result` shape** (from `iterativeAdjust`):
`{ pts:[{id,name,yH,xH,yS,xS,dY,dX,vY,vX,resDist,resBrg,wMax,rawDist,rawBrg,finalStatus,rejIter}], adj:{ params:{TY,TX,a,b,scale,rotDeg,ppm,yc,xc}, stats:{n,DOF,vTv,s0,chi2,chi2L,chi2U,sig0} }, log:[{iter,n,s0,chi2,chi2L,chi2U}], converged }`. Rejected `pts` carry `dY/dX/rawDist/rawBrg` but `vY/vX/resDist/resBrg/wMax` are `undefined`. Formatters `f3/f4/f4s/formatDMS` already return `'—'` for `undefined`.

---

### Task 1: Pure geometry & format helpers

**Files:**
- Create: `app-frontend/src/utils/beaconReportGeometry.js`

- [ ] **Step 1: Write the module**

```js
// app-frontend/src/utils/beaconReportGeometry.js
// Pure helpers for the beacon comparison report — no jsPDF/Vue imports, so they
// can be checked under Node in isolation.

/** Smallest "nice" 1/2/5 ×10ⁿ value ≥ x (for exaggeration factors). */
export function niceNumber(x) {
  if (!(x > 0)) return 1
  const exp = Math.floor(Math.log10(x))
  const base = Math.pow(10, exp)
  const f = x / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * base
}

/** Largest "nice" 1/2/5 ×10ⁿ value ≤ x (for scale-bar lengths). */
export function niceFloor(x) {
  if (!(x > 0)) return 0
  const exp = Math.floor(Math.log10(x))
  const base = Math.pow(10, exp)
  const f = x / base
  const nice = f >= 5 ? 5 : f >= 2 ? 2 : 1
  return nice * base
}

/** Filesystem-safe identifier for the report filename. */
export function sanitizeReportFilename(id) {
  const cleaned = String(id || '').trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'report'
}

/** Page mm per ground metre that fits the network span into the plot box. */
export function planScaleMmPerM(spanE, spanN, boxW, boxH) {
  const sE = boxW / (spanE || 1)
  const sN = boxH / (spanN || 1)
  return Math.min(sE, sN)
}

/** Vector exaggeration so the largest displacement renders ≈ targetMm. */
export function chooseExaggeration(maxDispM, mmPerM, targetMm = 20) {
  if (!(maxDispM > 0) || !(mmPerM > 0)) return 1
  return Math.max(1, niceNumber(targetMm / (maxDispM * mmPerM)))
}

/** Nice round ground metres whose drawn length fits within maxBarMm. */
export function scaleBarMetres(mmPerM, maxBarMm = 40) {
  if (!(mmPerM > 0)) return 0
  return niceFloor(maxBarMm / mmPerM)
}
```

- [ ] **Step 2: Verify under Node (expect all PASS)**

Run:
```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
cp app-frontend/src/utils/beaconReportGeometry.js /tmp/geom.mjs
cat > /tmp/geomcheck.mjs <<'EOF'
import { niceNumber, niceFloor, sanitizeReportFilename, planScaleMmPerM, chooseExaggeration, scaleBarMetres } from './geom.mjs'
const eq=(a,b,m)=>console.log((Math.abs(a-b)<1e-9?'PASS':'FAIL')+' '+m+' => '+a)
const se=(a,b,m)=>console.log((a===b?'PASS':'FAIL')+' '+m+' => '+a)
eq(niceNumber(0.018),0.02,'niceNumber 0.018'); eq(niceNumber(73),100,'niceNumber 73')
eq(niceNumber(40),50,'niceNumber 40');         eq(niceNumber(6),10,'niceNumber 6')
eq(niceFloor(150),100,'niceFloor 150');        eq(niceFloor(7),5,'niceFloor 7')
se(sanitizeReportFilename('SR 12345/2026'),'SR-12345-2026','sanitize')
se(sanitizeReportFilename(''),'report','sanitize empty')
eq(planScaleMmPerM(500,750,160,200),200/750,'planScale limiting axis')
eq(chooseExaggeration(0.248,200/750,20),500,'exaggeration ~x500')
se(chooseExaggeration(0,1,20),1,'exaggeration guard zero')
eq(scaleBarMetres(200/750,40),100,'scaleBar 100m')
EOF
node /tmp/geomcheck.mjs
```
Expected: every line begins `PASS`.

- [ ] **Step 3: Commit**

```bash
git add app-frontend/src/utils/beaconReportGeometry.js
git commit -m "feat(lite): pure geometry/format helpers for beacon report"
```

---

### Task 2: Report generator (`beaconAdjustmentReport.js`)

**Files:**
- Create: `app-frontend/src/utils/beaconAdjustmentReport.js`

Build the whole generator one method per step. Each step appends to the same class.

- [ ] **Step 1: Module imports + class skeleton + helpers + export**

```js
// app-frontend/src/utils/beaconAdjustmentReport.js
// SI 727 §67(5) beacon comparison examination report (client-side jsPDF).
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { f3, f4, f4s, formatDMS } from '@/utils/surveyMath'
import { planScaleMmPerM, chooseExaggeration, scaleBarMetres, sanitizeReportFilename } from '@/utils/beaconReportGeometry'

const NAVY = [30, 58, 92]

class BeaconAdjustmentReport {
  constructor() {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    this.pw = this.doc.internal.pageSize.getWidth()
    this.ph = this.doc.internal.pageSize.getHeight()
    this.margin = 18
    this.y = 18
  }

  sectionTitle(t) {
    this.doc.setFontSize(11); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text(t, this.margin, this.y); this.y += 5
  }

  ensureSpace(h) {
    if (this.y + h > this.ph - 16) { this.doc.addPage('a4', 'portrait'); this.y = this.margin }
  }

  generate(result, meta) {
    this.addHeader(meta)
    this.addTransformStats(result)
    this.addSnoopingLog(result)
    this.addDisplacementPlot(result)
    this.addCertification(result, meta)
    this.addScheduleLandscape(result)
    this.addFooters()
    return this.doc
  }
}

export function generateBeaconAdjustmentReport(result, meta) {
  const r = new BeaconAdjustmentReport()
  r.generate(result, meta)
  const id = meta.priorSurvey || meta.date || 'report'
  r.doc.save(`beacon-comparison-${sanitizeReportFilename(id)}.pdf`)
}
```

- [ ] **Step 2: `addHeader` (add as a method on the class, before `generate`)**

```js
  addHeader(meta) {
    this.doc.setFontSize(15); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text('BEACON COMPARISON & ADJUSTMENT', this.pw / 2, this.y, { align: 'center' }); this.y += 7
    this.doc.setFontSize(10); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(90)
    this.doc.text('SI 727 of 1979 — Section 67(5)  ·  Cape Lo P(Y,X), South-oriented', this.pw / 2, this.y, { align: 'center' }); this.y += 6
    this.doc.setDrawColor(200, 170, 75); this.doc.setLineWidth(0.8)
    this.doc.line(this.margin, this.y, this.pw - this.margin, this.y); this.y += 6
    autoTable(this.doc, {
      startY: this.y, margin: { left: this.margin, right: this.margin }, theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
      body: [
        ['Surveyor', meta.surveyorName || '—'],
        ['PLS No.', meta.plsNumber || '—'],
        ['Location / description', meta.location || '—'],
        ['Prior survey / Diagram-GP No.', meta.priorSurvey || '—'],
        ['Examination date', meta.date || '—'],
      ],
    })
    this.y = this.doc.lastAutoTable.finalY + 6
  }
```

- [ ] **Step 3: `addTransformStats`**

```js
  addTransformStats(result) {
    const p = result.adj.params, s = result.adj.stats
    const pass = s.chi2 >= s.chi2L && s.chi2 <= s.chi2U
    this.sectionTitle('Transformation & Statistics')
    autoTable(this.doc, {
      startY: this.y, margin: { left: this.margin, right: this.margin }, theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.5 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 85 } },
      body: [
        ['Translation ΔY (Westing, @ centroid)', f4(p.TY) + ' m'],
        ['Translation ΔX (Southing, @ centroid)', f4(p.TX) + ' m'],
        ['Scale factor', p.scale.toFixed(8)],
        ['Scale (ppm)', p.ppm.toFixed(2) + ' ppm'],
        ['Rotation θ', formatDMS(p.rotDeg) + '  (' + p.rotDeg.toFixed(6) + '°)'],
        ['σ₀ a priori', s.sig0.toFixed(4) + ' m'],
        ['σ₀ a posteriori', s.s0.toFixed(4) + ' m'],
        ['Degrees of freedom', String(s.DOF)],
        ['Chi-square χ²', s.chi2.toFixed(4) + '  (bounds ' + s.chi2L.toFixed(2) + ' – ' + s.chi2U.toFixed(2) + ')'],
        ['Chi-square test', pass ? 'PASS — variance consistent with a priori σ₀'
                                 : 'FAIL — review σ₀ or check for residual blunders'],
      ],
    })
    this.y = this.doc.lastAutoTable.finalY + 6
  }
```

- [ ] **Step 4: `addSnoopingLog`**

```js
  addSnoopingLog(result) {
    this.ensureSpace(40)
    this.sectionTitle('Data-Snooping Log (iterative Baarda W-test)')
    autoTable(this.doc, {
      startY: this.y, margin: { left: this.margin, right: this.margin },
      head: [['Iteration', 'Active pts', 'σ₀ (m)', 'χ²', 'χ² bounds']],
      body: result.log.map(L => [String(L.iter), String(L.n), L.s0.toFixed(5),
        L.chi2.toFixed(4), `${L.chi2L.toFixed(2)} – ${L.chi2U.toFixed(2)}`]),
      styles: { fontSize: 9, cellPadding: 1.5 }, headStyles: { fillColor: NAVY },
    })
    this.y = this.doc.lastAutoTable.finalY + 6
  }
```

- [ ] **Step 5: `addDisplacementPlot` + `_arrowhead`**

```js
  _arrowhead(x1, y1, x2, y2, rej, rgb) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy)
    if (len < 1.4) return
    const ux = dx / len, uy = dy / len, h = 2.4, w = 1.3
    const bx = x2 - ux * h, by = y2 - uy * h
    if (rgb) this.doc.setFillColor(rgb[0], rgb[1], rgb[2])
    else if (rej) this.doc.setFillColor(220, 38, 38)
    else this.doc.setFillColor(70, 90, 200)
    this.doc.triangle(x2, y2, bx - uy * w, by + ux * w, bx + uy * w, by - ux * w, 'F')
  }

  addDisplacementPlot(result) {
    this.doc.addPage('a4', 'portrait'); this.y = this.margin
    this.sectionTitle('Holistic Displacement Plot')
    const pts = result.pts
    const boxX = this.margin, boxYtop = this.y, boxW = this.pw - 2 * this.margin, boxH = 170
    this.doc.setDrawColor(120); this.doc.setLineWidth(0.3); this.doc.rect(boxX, boxYtop, boxW, boxH)

    // Conventional plan layout: East = −Y (right), North = −X (up).
    const es = pts.map(p => -p.yH), ns = pts.map(p => -p.xH)
    const minE = Math.min(...es), maxE = Math.max(...es)
    const minN = Math.min(...ns), maxN = Math.max(...ns)
    const spanE = maxE - minE, spanN = maxN - minN
    const pad = 16, innerW = boxW - 2 * pad, innerH = boxH - 2 * pad
    const s = planScaleMmPerM(spanE, spanN, innerW, innerH)
    const offX = boxX + pad + (innerW - spanE * s) / 2
    const offY = boxYtop + pad + (innerH - spanN * s) / 2
    const PX = e => offX + (e - minE) * s
    const PY = n => offY + (maxN - n) * s
    const maxDisp = Math.max(0, ...pts.map(p => Math.hypot(p.yS - p.yH, p.xS - p.xH)))
    const k = chooseExaggeration(maxDisp, s, 22)

    for (const p of pts) {
      const x1 = PX(-p.yH), y1 = PY(-p.xH)
      const x2 = x1 + (-(p.yS - p.yH)) * s * k
      const y2 = y1 - (-(p.xS - p.xH)) * s * k
      const rej = p.finalStatus === 'REJECT'
      this.doc.setLineWidth(rej ? 0.6 : 0.4)
      if (rej) this.doc.setDrawColor(220, 38, 38); else this.doc.setDrawColor(70, 90, 200)
      this.doc.line(x1, y1, x2, y2)
      this._arrowhead(x1, y1, x2, y2, rej)
      this.doc.setFillColor(20, 20, 20); this.doc.circle(x1, y1, 0.8, 'F')
      if (rej) this.doc.setFillColor(220, 38, 38); else this.doc.setFillColor(37, 99, 235)
      this.doc.circle(x2, y2, 0.7, 'F')
      this.doc.setFontSize(6.5); this.doc.setTextColor(rej ? 198 : 60, rej ? 30 : 60, rej ? 30 : 60)
      this.doc.text(p.name, x1 + 1.5, y1 - 1.2)
    }

    // True-metre scale bar (bottom-left of box)
    const barM = scaleBarMetres(s, 40), barMm = barM * s
    const sbx = boxX + pad, sby = boxYtop + boxH - 8
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.5)
    this.doc.line(sbx, sby, sbx + barMm, sby)
    this.doc.line(sbx, sby - 1.2, sbx, sby + 1.2)
    this.doc.line(sbx + barMm, sby - 1.2, sbx + barMm, sby + 1.2)
    this.doc.setFontSize(7); this.doc.setTextColor(40)
    this.doc.text('0', sbx, sby + 4); this.doc.text(`${barM} m`, sbx + barMm, sby + 4, { align: 'right' })

    // South arrow (bottom-right of box) + label
    const ax = boxX + boxW - pad - 4
    const ay0 = boxYtop + boxH - pad - 16, ay1 = boxYtop + boxH - pad
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.6); this.doc.line(ax, ay0, ax, ay1)
    this._arrowhead(ax, ay0, ax, ay1, false, [40, 40, 40])
    this.doc.setFontSize(8); this.doc.setTextColor(40); this.doc.text('S', ax, ay1 + 4, { align: 'center' })

    // Callout under the box
    this.y = boxYtop + boxH + 6
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(60)
    this.doc.text(
      `Displacement vectors exaggerated ×${k}. Black dot = historical position; blue dot = accepted survey position; `
      + `red dot/vector = rejected beacon. Bearings South-oriented (0°=S, 90°=W).`,
      this.margin, this.y, { maxWidth: this.pw - 2 * this.margin })
    this.y += 12
  }
```

- [ ] **Step 6: `addCertification`**

```js
  addCertification(result, meta) {
    this.ensureSpace(60)
    this.sectionTitle('Certification')
    const acc = result.pts.filter(p => p.finalStatus === 'ACCEPT').length
    const rej = result.pts.filter(p => p.finalStatus === 'REJECT')
    const s = result.adj.stats
    const chiOk = s.chi2 >= s.chi2L && s.chi2 <= s.chi2U
    let line
    if (!result.converged) line = 'Did not converge within 25 iterations — REFER for manual review.'
    else if (rej.length > 0) line = `Referred — ${rej.length} beacon(s) exceed tolerance: ${rej.map(p => p.name).join(', ')}.`
    else if (!chiOk) line = 'Recommended with note — chi-square test outside bounds; review a priori σ₀.'
    else line = 'Recommended for approval — all compared beacons within tolerance.'

    this.doc.setFontSize(9); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(20)
    this.doc.text(
      `Beacons compared: ${result.pts.length}.  Accepted: ${acc}.  Rejected: ${rej.length}.  W-test critical value: ${meta.critW}.`,
      this.margin, this.y, { maxWidth: this.pw - 2 * this.margin }); this.y += 6
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(`Recommendation: ${line}`, this.margin, this.y, { maxWidth: this.pw - 2 * this.margin }); this.y += 16

    this.doc.setFont('helvetica', 'normal'); this.doc.setDrawColor(60); this.doc.setLineWidth(0.3)
    const colW = (this.pw - 2 * this.margin - 10) / 2
    this.doc.line(this.margin, this.y, this.margin + colW, this.y)
    this.doc.line(this.margin + colW + 10, this.y, this.pw - this.margin, this.y)
    this.y += 4; this.doc.setFontSize(8); this.doc.setTextColor(90)
    this.doc.text('Examined by (Office of the Surveyor-General)', this.margin, this.y)
    this.doc.text('Date', this.margin + colW + 10, this.y)
    this.y += 8
  }
```

- [ ] **Step 7: `addScheduleLandscape`**

```js
  addScheduleLandscape(result) {
    this.doc.addPage('a4', 'landscape')
    this.doc.setFontSize(11); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text('Comparison Schedule — SI 727 §67(5)', 14, 14)
    const body = result.pts.map(p => [
      p.name, f3(p.yH), f3(p.xH), f3(p.yS), f3(p.xS),
      f4s(p.dY), f4s(p.dX), f4s(p.vY), f4s(p.vX),
      f4(p.resDist), formatDMS(p.resBrg),
      (p.wMax != null ? p.wMax.toFixed(2) : '—'), p.finalStatus || '—',
    ])
    autoTable(this.doc, {
      startY: 18, margin: { left: 14, right: 14 },
      head: [['Beacon', 'Hist Y', 'Hist X', 'Survey Y', 'Survey X', 'ΔY', 'ΔX', 'vY', 'vX', 'Dist', 'Brg (S)', 'W-max', 'Status']],
      body,
      styles: { fontSize: 7.5, cellPadding: 1, halign: 'right' },
      columnStyles: { 0: { halign: 'left' }, 12: { halign: 'center' } },
      headStyles: { fillColor: NAVY, halign: 'center', fontSize: 7.5 },
      didParseCell: d => { if (d.section === 'body' && body[d.row.index][12] === 'REJECT') d.cell.styles.fillColor = [252, 226, 226] },
    })
    const fy = this.doc.lastAutoTable.finalY + 5
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(90)
    this.doc.text('BLACK = original (historical) · RED = survey · Bearings South-oriented (0°=S, 90°=W) · Residuals & W-max are undefined ( — ) for rejected beacons.', 14, fy)
  }
```

- [ ] **Step 8: `addFooters`**

```js
  addFooters() {
    const n = this.doc.getNumberOfPages()
    for (let i = 1; i <= n; i++) {
      this.doc.setPage(i)
      const w = this.doc.internal.pageSize.getWidth(), h = this.doc.internal.pageSize.getHeight()
      this.doc.setFontSize(7); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(140)
      this.doc.text(`SurveyPro · computer-generated · ${new Date().toISOString().slice(0, 10)}`, 14, h - 8)
      this.doc.text(`Page ${i} of ${n}`, w - 14, h - 8, { align: 'right' })
    }
  }
```

- [ ] **Step 9: Build**

Run: `npm --prefix app-frontend run build 2>&1 | grep -iE 'error|✓ built'`
Expected: `✓ built` and no error lines. (Module is imported in Task 3; until then the bundler tree-shakes it — to force a compile error check, this build at minimum must stay green.)

- [ ] **Step 10: Commit**

```bash
git add app-frontend/src/utils/beaconAdjustmentReport.js
git commit -m "feat(lite): jsPDF beacon comparison examination report generator"
```

---

### Task 3: Wire report into `CompareView.vue`

**Files:**
- Modify: `app-frontend/src/views/modules/lite/compare/CompareView.vue`

- [ ] **Step 1: Add examination-details inputs after the CSV hint block**

Find the closing of the CSV hint `<div class="px-4 pb-3 -mt-1 space-y-1"> … </div>` (the block containing the `CSV columns:` paragraph and the `importMsg` paragraph). Immediately **after** that `</div>`, still inside the Configuration card, insert:

```html
        <!-- Examination details (for the SG report header) -->
        <div class="px-4 pb-3 border-t border-gray-100 pt-3">
          <div class="text-[11px] font-medium text-[#1a3a5c] mb-2">Examination details (for PDF report)</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <input v-model="surveyorName" placeholder="Surveyor name"
                   class="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
            <input v-model="plsNumber" placeholder="PLS no."
                   class="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
            <input v-model="location" placeholder="Location / description"
                   class="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
            <input v-model="priorSurvey" placeholder="Prior survey / Diagram-GP no."
                   class="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
          </div>
        </div>
```

- [ ] **Step 2: Add the report button to the action cluster (after the Compute button)**

Find the Compute button (`@click="store.compute()"` … `▶ Compute</button>`). Immediately after that `</button>`, insert:

```html
            <button
              @click="downloadReport"
              :disabled="!result"
              class="px-3 py-1.5 text-xs font-medium border border-[#1a3a5c] text-[#1a3a5c]
                     rounded hover:bg-[#1a3a5c] hover:text-white transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#1a3a5c]"
              title="Generate the SI 727 §67(5) examination report (PDF)"
            >
              📄 Examination Report (PDF)
            </button>
```

- [ ] **Step 3: Add import, refs and handler in `<script setup>`**

After the existing import line `import { f3, f4, f4s, formatDMS, SAMPLE_DATA } from '@/utils/surveyMath'`, add:

```js
import { generateBeaconAdjustmentReport } from '@/utils/beaconAdjustmentReport'
```

After `const importMsg = ref(null)`, add:

```js
// ── EXAMINATION REPORT METADATA ───────────────────────────────────────────────
const surveyorName = ref('')
const plsNumber    = ref('')
const location     = ref('')
const priorSurvey  = ref('')

function downloadReport() {
  if (!result.value) return
  generateBeaconAdjustmentReport(result.value, {
    surveyorName: surveyorName.value,
    plsNumber: plsNumber.value,
    location: location.value,
    priorSurvey: priorSurvey.value,
    sigma0: sigma0.value,
    critW: critW.value,
    date: new Date().toISOString().slice(0, 10),
  })
}
```

- [ ] **Step 4: Build**

Run: `npm --prefix app-frontend run build 2>&1 | grep -iE 'CompareView|error|✓ built'`
Expected: a `CompareView-*.js` chunk line and `✓ built`, no error lines.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/lite/compare/CompareView.vue
git commit -m "feat(lite): examination details inputs + PDF report button"
```

---

### Task 4: GUI integration verification (Edge)

**Files:**
- Verify only (no source changes). Reuses `%TEMP%\pw-verify` from earlier in the session (Playwright package + Edge).

- [ ] **Step 1: Start the dev server**

Run (background): `npm --prefix app-frontend run dev` — note the port (5173 or next free, e.g. 5174).

- [ ] **Step 2: Drive Edge to generate and capture the PDF**

Write `/tmp/pw-verify/report.mjs` (set `BASE` to the dev port) and run `node report.mjs`:

```js
import { chromium } from 'playwright'
import fs from 'node:fs'
const BASE = 'http://localhost:5174'      // <-- match the dev server port
const profile = { id:1, email:'x@y.z', user_type:'registered_surveyor', created_at:'2026-01-01',
  profile:{ id:1, name:'V', surveyor_type:'registered' } }
const b = await chromium.launch({ channel:'msedge', headless:true })
const ctx = await b.newContext({ acceptDownloads:true })
await ctx.addInitScript(p => { localStorage.setItem('token','t'); localStorage.setItem('lastActivity',String(Date.now())); localStorage.setItem('userProfile',JSON.stringify(p)) }, profile)
const page = await ctx.newPage()
await page.route('**/api/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }))
await page.route('**/auth/me', r => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(profile) }))
await page.goto(BASE + '/modules/lite/compare', { waitUntil:'domcontentloaded' })
await page.waitForSelector('text=Beacon Comparison', { timeout:15000 })
await page.fill('input[placeholder="Surveyor name"]', 'C. Paradzayi')
await page.fill('input[placeholder="PLS no."]', 'PLS 1234')
await page.fill('input[placeholder="Location / description"]', 'Stand 4471 Harare · Lo 31')
await page.fill('input[placeholder="Prior survey / Diagram-GP no."]', 'SR 9876/2001')
await page.locator('button', { hasText:'Compute' }).click()
await page.waitForTimeout(500)
const [dl] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('button', { hasText:'Examination Report' }).click(),
])
await dl.saveAs('/tmp/pw-verify/report.pdf')
console.log('SAVED', dl.suggestedFilename(), fs.statSync('/tmp/pw-verify/report.pdf').size, 'bytes')
await b.close()
```
Expected: `SAVED beacon-comparison-SR-9876-2001.pdf <non-zero> bytes`.

- [ ] **Step 3: Render the PDF pages to PNG for visual inspection**

```bash
cd /tmp/pw-verify
cat > render.mjs <<'EOF'
import { chromium } from 'playwright'
const b = await chromium.launch({ channel:'msedge', headless:true })
const page = await (await b.newContext()).newPage()
await page.goto('file:///' + process.cwd().replace(/\\/g,'/') + '/report.pdf')
await page.waitForTimeout(1500)
await page.screenshot({ path:'report-view.png', fullPage:true })
await b.close()
EOF
node render.mjs
```
Then `Read` `%TEMP%\pw-verify\report-view.png` (Edge's built-in PDF viewer renders page 1). Confirm: header + metadata, statistics table with PASS/FAIL, snooping log, and that the document opens without error. (Edge's viewer shows one page at a time; if needed, also confirm the saved `report.pdf` is a valid non-zero PDF from Step 2.)

- [ ] **Step 4: Stop the dev server**

```bash
pid=$(netstat -ano | grep ':5174' | grep -i LISTENING | awk '{print $NF}' | head -1)
[ -n "$pid" ] && taskkill //PID "$pid" //F
```

---

## Self-Review

**1. Spec coverage**
- Client-side generation, no backend → Tasks 2–3 (jsPDF, no API). ✓
- Metadata inputs (surveyor+PLS, location, prior survey) → Task 3 Step 1/3; rendered in header → Task 2 Step 2. ✓
- SurveyPro branding + SI 727 §67(5) subtitle → Task 2 Step 2 (`addHeader`). ✓
- Comparison schedule on landscape page, rejected rows tinted, residuals `—` for rejected → Task 2 Step 7. ✓
- Transformation + statistics + χ² verdict → Task 2 Step 3. ✓
- Data-snooping log → Task 2 Step 4. ✓
- Holistic South-oriented displacement plot: exaggerated vectors (stated ×k), true scale bar, accept=blue/reject=red, S arrow, S-oriented note, degenerate guards (via `planScaleMmPerM`/`chooseExaggeration`) → Task 1 + Task 2 Step 5. ✓
- Certification with recommendation + signature lines; non-converged handled → Task 2 Step 6. ✓
- Footer page numbers + computer-generated note → Task 2 Step 8. ✓
- Filename sanitisation → Task 1 + Task 2 Step 1. ✓
- Verification: build + Edge harness → Task 4. ✓

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code; commands have expected output. ✓

**3. Type/name consistency:** Method names used in `generate()` (`addHeader`, `addTransformStats`, `addSnoopingLog`, `addDisplacementPlot`, `addCertification`, `addScheduleLandscape`, `addFooters`, `_arrowhead`, `sectionTitle`, `ensureSpace`) all defined in Task 2. Helper names (`planScaleMmPerM`, `chooseExaggeration`, `scaleBarMetres`, `sanitizeReportFilename`) match Task 1 exports. `result`/`meta` field names match the documented shape and the store/`surveyMath.js`. Handler `downloadReport` + refs (`surveyorName`, `plsNumber`, `location`, `priorSurvey`) consistent between Task 3 template and script. ✓
