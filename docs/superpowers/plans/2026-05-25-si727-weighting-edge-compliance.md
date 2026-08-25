# SI 727 Weighting + Edge Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SI 727 class-derived a-priori σ₀ and a per-line (edge) distance/direction compliance check to the Beacon Comparison tool and its PDF report.

**Architecture:** One new pure module (`si727.js`, Node-testable) holds the SI 727 tolerance formulas, the σ₀ derivation, and the edge-compliance computation. The store derives σ₀ from the chosen class and attaches edge results to the adjustment; `CompareView.vue` gains a class selector + an Edge-compliance tab; the report gains a landscape SI 727 edge section. The core `helmertLS`/`iterativeAdjust` are unchanged (equal-weight LS).

**Tech Stack:** Vue 3, Pinia, jsPDF v3 + jspdf-autotable v5, plain-JS ES modules.

**Spec:** `docs/superpowers/specs/2026-05-25-si727-weighting-edge-compliance-design.md`

**Testing note:** No frontend unit-test runner. Pure logic (`si727.js`) is verified with a throwaway Node script (copy to `.mjs`, run assertions — the pattern used for `surveyMath.js`/`beaconReportGeometry.js`). Store/UI/report verified via `npm run build` and the Edge/Playwright harness in `%TEMP%\pw-verify`. **When using `vite preview`, ALWAYS restart it after a rebuild** (sirv serves the dist snapshot from process start). Do NOT add Vitest.

**Conventions:** Cape Lo P(Y,X): `Y=Westing`, `X=Southing`; South-oriented bearings (0°=S, 90°=W). Beacon objects: `{ id, name, yH, xH, yS, xS, finalStatus, ... }`. `result.adj.params.rotDeg` = Helmert rotation (swing, degrees). Accepted beacons (`finalStatus==='ACCEPT'`) retain `yH/xH/yS/xS`.

---

### Task 1: Pure SI 727 module (`si727.js`)

**Files:**
- Create: `app-frontend/src/utils/si727.js`

- [ ] **Step 1: Write the module**

> **Superseded 2026-08-23:** the class C `distFactor` below is wrong — Second Schedule
> para 7(1)(b) prescribes 0,02, not 0,015 (0,015 belongs to para 7(2)(b), the
> angle-subtended check). Corrected in `si727.js`; do not copy the constant from here.

```js
// app-frontend/src/utils/si727.js
// Pure SI 727 (1979) comparison-sketch tolerances + helpers. No jsPDF/Vue imports.
import { bearingSouth } from '@/utils/surveyMath'

export const SI727_CLASS = {
  B: { distFactor: 0.01,  dirK: 15000 },
  C: { distFactor: 0.015, dirK: 45000 },
}

/** Allowable distance difference (m): factor·√(0.075f + 0.00015f²). f = shorter line length (m). */
export function distanceToleranceM(f, cls) {
  const c = SI727_CLASS[cls] || SI727_CLASS.B
  if (!(f > 0)) return 0
  return c.distFactor * Math.sqrt(0.075 * f + 0.00015 * f * f)
}

/** Allowable direction difference (arc-seconds): K/(S+300). S = ray length (m). */
export function directionToleranceArcsec(S, cls) {
  const c = SI727_CLASS[cls] || SI727_CLASS.B
  if (!(S >= 0)) return 0
  return c.dirK / (S + 300)
}

function dist(y1, x1, y2, x2) {
  return Math.hypot(y2 - y1, x2 - x1)
}

/** Median of all pairwise distances. useSurvey=false → historical (yH,xH); true → survey (yS,xS). */
export function medianPairwiseDistance(points, useSurvey = false) {
  const ds = []
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j]
      const d = useSurvey ? dist(a.yS, a.xS, b.yS, b.xS) : dist(a.yH, a.xH, b.yH, b.xH)
      if (d > 0) ds.push(d)
    }
  if (ds.length === 0) return 0
  ds.sort((p, q) => p - q)
  const m = Math.floor(ds.length / 2)
  return ds.length % 2 ? ds[m] : (ds[m - 1] + ds[m]) / 2
}

/**
 * Suggested a-priori σ₀ (m) from the survey class.
 * σ₀ = distanceToleranceM(L) / div ;  L = median pairwise (historical) distance.
 * div default 5 ≈ 95% 2-D confidence (≈2.45σ) propagated to a per-coordinate σ.
 * Falls back to 0.010 m if the network is degenerate.
 */
export function suggestedSigma0(points, cls, div = 5) {
  const L = medianPairwiseDistance(points, false)
  if (!(L > 0) || !(div > 0)) return 0.010
  const s = distanceToleranceM(L, cls) / div
  return s > 0 ? s : 0.010
}

/** Wrap degrees to (−180, 180]. */
function wrapDeg(d) {
  let x = ((d % 360) + 360) % 360
  if (x > 180) x -= 360
  return x
}

/**
 * Per-line SI 727 compliance for all unordered pairs of the given beacons.
 * @param {Array<{name,yH,xH,yS,xS}>} points
 * @param {'B'|'C'} cls
 * @param {number} swingDeg  Helmert rotation (deg), removed from direction differences.
 * @returns {{ rows, summary }}
 */
export function edgeCompliance(points, cls, swingDeg = 0) {
  const rows = []
  let distPass = 0, dirPass = 0, bothPass = 0
  const scales = [], swings = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j]
      const dH = dist(a.yH, a.xH, b.yH, b.xH)
      const dS = dist(a.yS, a.xS, b.yS, b.xS)
      if (!(dH > 0) || !(dS > 0)) continue   // skip degenerate/zero-length lines
      const dDiff = dS - dH
      const f = Math.min(dH, dS)
      const dAllow = distanceToleranceM(f, cls)
      const distOk = Math.abs(dDiff) <= dAllow

      const brgH = bearingSouth(b.yH - a.yH, b.xH - a.xH)
      const brgS = bearingSouth(b.yS - a.yS, b.xS - a.xS)
      const dirDiffRaw = wrapDeg(brgS - brgH)
      const dirResidualSec = wrapDeg(dirDiffRaw - swingDeg) * 3600
      const dirAllowSec = directionToleranceArcsec(dH, cls)
      const dirOk = Math.abs(dirResidualSec) <= dirAllowSec

      const pass = distOk && dirOk
      if (distOk) distPass++
      if (dirOk) dirPass++
      if (pass) { bothPass++; scales.push(dS / dH); swings.push(dirDiffRaw) }
      rows.push({ from: a.name, to: b.name, dH, dS, dDiff, dAllow, distOk,
                  dirResidualSec, dirAllowSec, dirOk, pass })
    }
  }
  const mean = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null)
  return {
    rows,
    summary: {
      totalLines: rows.length, distPass, dirPass, bothPass,
      meanScale: mean(scales), meanSwingDeg: mean(swings),
    },
  }
}
```

- [ ] **Step 2: Verify under Node (expect all PASS)**

Run:
```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
# strip the bearingSouth import for isolated run, providing a local copy
cp app-frontend/src/utils/si727.js /tmp/si.mjs
# replace the @ import with an inline bearingSouth (same formula as surveyMath)
node -e "let s=require('fs').readFileSync('/tmp/si.mjs','utf8').replace(/import \{ bearingSouth \}.*\n/, 'const bearingSouth=(dY,dX)=>{let b=Math.atan2(dY,dX)*180/Math.PI;return ((b%360)+360)%360;};\n');require('fs').writeFileSync('/tmp/si.mjs',s)"
cat > /tmp/sicheck.mjs <<'EOF'
import { distanceToleranceM, directionToleranceArcsec, suggestedSigma0, edgeCompliance, medianPairwiseDistance } from './si.mjs'
const ok=(c,m)=>console.log((c?'PASS':'FAIL')+' '+m)
const close=(a,b,m,t=1e-9)=>ok(Math.abs(a-b)<t,m+' => '+a)
close(distanceToleranceM(100,'B'),0.03,'dist tol B f=100')
close(distanceToleranceM(1000,'B'),0.15,'dist tol B f=1000')
close(distanceToleranceM(100,'C'),0.045,'dist tol C f=100')
close(directionToleranceArcsec(300,'B'),25,'dir tol B S=300')
close(directionToleranceArcsec(300,'C'),75,'dir tol C S=300')
// 3-point network: P1,P2 unmoved; P3 shifted +0.20m southing (a clear blunder)
const pts=[
 {name:'P1',yH:1000,xH:2000,yS:1000,xS:2000},
 {name:'P2',yH:1100,xH:2000,yS:1100,xS:2000},
 {name:'P3',yH:1000,xH:2100,yS:1000,xS:2100.20},
]
const r=edgeCompliance(pts,'B',0)
ok(r.rows.length===3,'edge rows = 3 => '+r.rows.length)
const p1p2=r.rows.find(x=>x.from==='P1'&&x.to==='P2')
const p1p3=r.rows.find(x=>x.from==='P1'&&x.to==='P3')
ok(p1p2.pass===true,'P1-P2 passes')
ok(p1p3.distOk===false,'P1-P3 distance fails (0.20m > tol)')
ok(r.summary.bothPass===1,'summary bothPass = 1 => '+r.summary.bothPass)
const s0=suggestedSigma0(pts,'B')
ok(s0>0 && s0<1,'suggestedSigma0 positive & < 1m => '+s0)
ok(medianPairwiseDistance(pts)>0,'median pairwise > 0 => '+medianPairwiseDistance(pts))
EOF
node /tmp/sicheck.mjs
```
Expected: every line begins `PASS`.

- [ ] **Step 3: Commit**

```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
git add app-frontend/src/utils/si727.js
git commit -m "feat(lite): SI 727 tolerance/sigma0/edge-compliance pure module

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Wire class + σ₀ + edges into the store

**Files:**
- Modify: `app-frontend/src/stores/surveyAdjustmentStore.js`

- [ ] **Step 1: Add the import**

After the existing `import { iterativeAdjust, SAMPLE_DATA } from '@/utils/surveyMath'` line, add:
```js
import { suggestedSigma0, edgeCompliance } from '@/utils/si727'
```

- [ ] **Step 2: Add state refs**

Find:
```js
  const sigma0 = ref(0.010)   // a priori σ₀ in metres
  const critW  = ref(2.576)   // W-test critical value (99 % confidence)
```
Insert immediately after the `critW` line:
```js
  const surveyClass = ref('B')   // SI 727 survey class (B or C)
  const sigma0Auto  = ref(true)  // true while σ₀ is auto-derived from the class
```

- [ ] **Step 3: Add class/σ₀ actions (place just above `function compute()`)**

```js
  function setSurveyClass(c) {
    surveyClass.value = (c === 'C') ? 'C' : 'B'
    if (sigma0Auto.value) sigma0.value = suggestedSigma0(points.value, surveyClass.value)
  }

  function setSigma0(v) {
    const n = parseFloat(v)
    if (Number.isFinite(n)) sigma0.value = n
    sigma0Auto.value = false
  }
```

- [ ] **Step 4: Update `compute()` to derive σ₀ and attach edges**

Replace the whole `compute` function body with:
```js
  function compute() {
    error.value  = null
    result.value = null
    if (sigma0Auto.value) sigma0.value = suggestedSigma0(points.value, surveyClass.value)
    try {
      const res = iterativeAdjust(points.value, critW.value, sigma0.value)
      if (res.error) {
        error.value = res.error
      } else {
        const accepted = res.pts.filter(p => p.finalStatus === 'ACCEPT')
        res.edges = edgeCompliance(accepted, surveyClass.value, res.adj.params.rotDeg)
        res.surveyClass = surveyClass.value
        result.value = res
      }
    } catch (e) {
      error.value = e.message
    }
  }
```

- [ ] **Step 5: Export the new state/actions**

Find:
```js
    // state
    points, sigma0, critW, result, error,
    // actions
    addPoint, removePoint, updatePoint, loadSample, setPoints, compute,
```
Replace with:
```js
    // state
    points, sigma0, critW, surveyClass, sigma0Auto, result, error,
    // actions
    addPoint, removePoint, updatePoint, loadSample, setPoints,
    setSurveyClass, setSigma0, compute,
```

- [ ] **Step 6: Build**

Run: `npm --prefix app-frontend run build 2>&1 | grep -iE 'error|✓ built' | head`
Expected: `✓ built`, no error lines.

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/stores/surveyAdjustmentStore.js
git commit -m "feat(lite): store derives SI 727 sigma0 + attaches edge compliance

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: CompareView — class selector, σ₀ note, Edge tab

**Files:**
- Modify: `app-frontend/src/views/modules/lite/compare/CompareView.vue`

- [ ] **Step 1: Add the class selector + σ₀ note in Configuration**

Find the σ₀ + Confidence blocks:
```html
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">A priori σ₀ (metres)</label>
            <input
              type="number" step="0.001" min="0.001"
              :value="sigma0"
              @input="sigma0 = parseFloat($event.target.value)"
              class="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm
                     focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            />
          </div>
```
Replace with:
```html
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">SI 727 class</label>
            <select
              :value="surveyClass"
              @change="store.setSurveyClass($event.target.value)"
              class="px-2 py-1.5 border border-gray-300 rounded text-sm
                     focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            >
              <option value="B">Class B</option>
              <option value="C">Class C</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] text-gray-500 mb-1">A priori σ₀ (metres)</label>
            <input
              type="number" step="0.001" min="0.001"
              :value="sigma0"
              @input="store.setSigma0($event.target.value)"
              class="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm
                     focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            />
            <p class="text-[10px] text-gray-400 mt-0.5">{{ sigma0Note }}</p>
          </div>
```

- [ ] **Step 2: Add the Edge-compliance tab button + panel**

Find the TABS array:
```js
const TABS = [
```
Replace the array literal with (add the 5th tab):
```js
const TABS = [
  { id: 'schedule', label: 'Computation schedule' },
  { id: 'trans',    label: 'Transformation'        },
  { id: 'stats',    label: 'Statistics'             },
  { id: 'plot',     label: 'Displacement plot'      },
  { id: 'edges',    label: 'Edge compliance'        },
]
```
(If the existing array already lists the first four with different spacing, keep those and just add the `edges` entry as the last element.)

Then find the closing of the **Displacement plot** tab panel — it is the `<div v-show="activeTab === 'plot'" class="p-4">` … its matching closing `</div>` immediately before the `</div><!-- /results -->` comment. Insert this new panel between the plot panel's closing `</div>` and `</div><!-- /results -->`:
```html
        <!-- ── EDGE COMPLIANCE TAB ────────────────────────────────────────── -->
        <div v-show="activeTab === 'edges'" class="p-4">
          <div v-if="!result?.edges?.rows?.length" class="text-xs text-gray-500">
            No edges to compare.
          </div>
          <template v-else>
            <div class="text-xs text-gray-500 mb-2">
              SI 727 Class {{ result.surveyClass }} · all pairs among accepted beacons ·
              <b class="text-blue-700">{{ result.edges.summary.bothPass }}</b> of
              {{ result.edges.summary.totalLines }} lines pass both checks ·
              SI 727 mean scale {{ result.edges.summary.meanScale != null ? result.edges.summary.meanScale.toFixed(8) : '—' }},
              swing {{ result.edges.summary.meanSwingDeg != null ? formatDMS(result.edges.summary.meanSwingDeg) : '—' }}
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-xs border-collapse">
                <thead>
                  <tr class="bg-gray-50 text-gray-600">
                    <th class="text-left px-2 py-1.5">Line</th>
                    <th class="text-right px-2 py-1.5">d Hist (m)</th>
                    <th class="text-right px-2 py-1.5">d Surv (m)</th>
                    <th class="text-right px-2 py-1.5">Δd (m)</th>
                    <th class="text-right px-2 py-1.5">dist tol (m)</th>
                    <th class="text-center px-2 py-1.5">dist</th>
                    <th class="text-right px-2 py-1.5">swing-res (″)</th>
                    <th class="text-right px-2 py-1.5">dir tol (″)</th>
                    <th class="text-center px-2 py-1.5">dir</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(e, idx) in result.edges.rows"
                    :key="e.from + '-' + e.to"
                    :class="[!e.pass ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60', 'border-t border-gray-100']"
                  >
                    <td class="px-2 py-1.5 whitespace-nowrap">{{ e.from }} – {{ e.to }}</td>
                    <td class="px-2 py-1.5 text-right">{{ f3(e.dH) }}</td>
                    <td class="px-2 py-1.5 text-right">{{ f3(e.dS) }}</td>
                    <td class="px-2 py-1.5 text-right">{{ f4s(e.dDiff) }}</td>
                    <td class="px-2 py-1.5 text-right text-gray-500">{{ f4(e.dAllow) }}</td>
                    <td class="px-2 py-1.5 text-center" :class="e.distOk ? 'text-blue-600' : 'text-red-600 font-medium'">{{ e.distOk ? '✓' : '✗' }}</td>
                    <td class="px-2 py-1.5 text-right">{{ e.dirResidualSec.toFixed(1) }}</td>
                    <td class="px-2 py-1.5 text-right text-gray-500">{{ e.dirAllowSec.toFixed(1) }}</td>
                    <td class="px-2 py-1.5 text-center" :class="e.dirOk ? 'text-blue-600' : 'text-red-600 font-medium'">{{ e.dirOk ? '✓' : '✗' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-[10px] text-gray-400 mt-2">
              Distance tolerance = factor·√(0.075f + 0.00015f²), f = shorter line. Direction tolerance = K/(S+300)″,
              S = historical ray length. Direction shown as residual after removing the Helmert swing.
            </p>
          </template>
        </div>
```

- [ ] **Step 3: Script — destructure new state + the σ₀ note**

Find:
```js
const { points, sigma0, critW, result, error } = storeToRefs(store)
```
Replace with:
```js
const { points, sigma0, critW, surveyClass, sigma0Auto, result, error } = storeToRefs(store)
```

Add this import after the existing `import { generateBeaconAdjustmentReport } ...` line:
```js
import { medianPairwiseDistance } from '@/utils/si727'
```

Add this computed near the other `computed(...)` declarations (e.g. after `const activeTab = ref('schedule')`):
```js
const sigma0Note = computed(() => {
  if (!sigma0Auto.value) return 'manual override'
  const L = medianPairwiseDistance(points.value, false)
  return L > 0
    ? `SI 727 class ${surveyClass.value} @ L≈${L.toFixed(0)} m`
    : `SI 727 class ${surveyClass.value}`
})
```
(`computed` is already imported from 'vue' in this file; if not, add it to the existing `import { ref, computed } from 'vue'`.)

- [ ] **Step 4: Build**

Run: `npm --prefix app-frontend run build 2>&1 | grep -iE 'CompareView|error|✓ built' | head`
Expected: a `CompareView-*.js` chunk line and `✓ built`, no error lines. If it fails, read the error and fix only this file.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/lite/compare/CompareView.vue
git commit -m "feat(lite): class selector, suggested sigma0 note, edge-compliance tab

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Report — SI 727 edge-compliance section

**Files:**
- Modify: `app-frontend/src/utils/beaconAdjustmentReport.js`

- [ ] **Step 1: Add `addEdgeCompliance` method (place right after `addScheduleLandscape` method, before `addFooters`)**

```js
  addEdgeCompliance(result) {
    const edges = result.edges
    if (!edges || !edges.rows.length) return
    this.doc.addPage('a4', 'landscape')
    this.doc.setFontSize(11); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text(`SI 727 Edge Compliance — Class ${result.surveyClass || 'B'}`, 14, 14)
    const body = edges.rows.map(e => [
      `${e.from} - ${e.to}`, f3(e.dH), f3(e.dS), f4s(e.dDiff), f4(e.dAllow),
      e.distOk ? 'PASS' : 'FAIL',
      e.dirResidualSec.toFixed(1), e.dirAllowSec.toFixed(1),
      e.dirOk ? 'PASS' : 'FAIL',
    ])
    autoTable(this.doc, {
      startY: 18, margin: { left: 14, right: 14 },
      head: [['Line', 'd Hist (m)', 'd Surv (m)', 'dd (m)', 'dist tol (m)', 'dist',
              'swing-res (sec)', 'dir tol (sec)', 'dir']],
      body,
      styles: { fontSize: 7.5, cellPadding: 1, halign: 'right' },
      columnStyles: { 0: { halign: 'left' }, 5: { halign: 'center' }, 8: { halign: 'center' } },
      headStyles: { fillColor: NAVY, halign: 'center', fontSize: 7.5 },
      didParseCell: d => { if (d.section === 'body' && !edges.rows[d.row.index].pass) d.cell.styles.fillColor = [252, 226, 226] },
    })
    const s = edges.summary, p = result.adj.params
    let y = this.doc.lastAutoTable.finalY + 6
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(40)
    const meanScale = s.meanScale != null ? s.meanScale.toFixed(8) : '-'
    const meanSwing = s.meanSwingDeg != null ? formatDMS(s.meanSwingDeg) : '-'
    const note = [
      `Lines: ${s.totalLines}.  Distance pass: ${s.distPass}.  Direction pass: ${s.dirPass}.  Both: ${s.bothPass}.`,
      `SI 727 mean scale ${meanScale}, mean swing ${meanSwing}  (Helmert scale ${p.scale.toFixed(8)}, rotation ${formatDMS(p.rotDeg)}).`,
      `Distance tolerance = factor x sqrt(0.075f + 0.00015 f^2), f = shorter line. Direction tolerance = K/(S+300) sec, S = historical ray length.`,
      `Direction shown as residual after removing the Helmert swing. Independent of the W-test accept/reject decision.`,
    ]
    note.forEach((ln, i) => this.doc.text(ln, 14, y + i * 4))
  }
```

- [ ] **Step 2: Call it from `generate()`**

Find:
```js
    this.addScheduleLandscape(result)
    this.addFooters()
```
Replace with:
```js
    this.addScheduleLandscape(result)
    this.addEdgeCompliance(result)
    this.addFooters()
```

- [ ] **Step 3: Build**

Run: `npm --prefix app-frontend run build 2>&1 | grep -iE 'CompareView|error|✓ built' | head`
Expected: a `CompareView-*.js` chunk + `✓ built`, no error lines.

- [ ] **Step 4: Commit**

```bash
git add app-frontend/src/utils/beaconAdjustmentReport.js
git commit -m "feat(lite): SI 727 edge-compliance section in examination report

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: GUI integration verification (Edge)

**Files:**
- Verify only. Reuses `%TEMP%\pw-verify` (Playwright + Edge).

- [ ] **Step 1: Build, then start a FRESH preview**

```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
npm --prefix app-frontend run build 2>&1 | grep -iE '✓ built'
# kill any stale preview/dev listeners first
for pt in 4173 4174 5173 5174; do pid=$(netstat -ano | grep ":$pt" | grep -i LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F; done
```
Then start preview in the background (`npm --prefix app-frontend run preview`) and read its output to get the PORT. **The preview MUST be started after this build** (sirv snapshots dist at startup).

- [ ] **Step 2: Drive Edge — compute (with a known blunder), open the Edge tab, generate the report**

Write `/tmp/pw-verify/si727.mjs` (set `BASE` to the preview port) and `node` it. It seeds auth, loads the tool (sample data includes the BM 004 blunder), clicks Compute, switches to the Edge-compliance tab, screenshots, then generates the PDF and extracts its text:

```js
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'; import path from 'node:path'
const BASE = 'http://localhost:4173'   // <-- set to preview port
const profile = { id:1, email:'x@y.z', user_type:'registered_surveyor', created_at:'2026-01-01',
  profile:{ id:1, name:'V', surveyor_type:'registered' } }
const b = await chromium.launch({ channel:'msedge', headless:true })
const ctx = await b.newContext({ acceptDownloads:true })
await ctx.addInitScript(p=>{localStorage.setItem('token','t');localStorage.setItem('lastActivity',String(Date.now()));localStorage.setItem('userProfile',JSON.stringify(p))}, profile)
const page = await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message))
await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}))
await page.route('**/auth/me', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(profile)}))
await page.goto(BASE+'/modules/lite/compare',{waitUntil:'domcontentloaded'})
await page.waitForSelector('text=Beacon Comparison',{timeout:15000})
const sigmaNote = await page.locator('text=SI 727 class').first().textContent().catch(()=>'(no note)')
await page.locator('button',{hasText:'Compute'}).click(); await page.waitForTimeout(500)
await page.locator('button',{hasText:'Edge compliance'}).click(); await page.waitForTimeout(300)
await page.screenshot({ path:'/tmp/pw-verify/si727-tab.png', fullPage:true })
const [dl] = await Promise.all([ page.waitForEvent('download',{timeout:10000}),
  page.locator('button',{hasText:'Examination Report'}).click() ])
await dl.saveAs('/tmp/pw-verify/report.pdf')
console.log('SIGMA_NOTE:', sigmaNote.trim())
console.log('PAGE_ERRORS:', errs.length?errs.join('|'):'NONE')
await b.close()
```
Then extract:
```bash
/c/Users/mukan/AppData/Local/Programs/Python/Python313/python -c "
from pypdf import PdfReader
t=''.join((p.extract_text() or '') for p in PdfReader(r'C:\Users\mukan\AppData\Local\Temp\pw-verify\report.pdf').pages)
print('edge section present:', 'SI 727 Edge Compliance' in t)
print('summary present:', 'Distance pass' in t)
"
```
Expected: `PAGE_ERRORS: NONE`; `SIGMA_NOTE` contains "SI 727 class B"; both `present` lines `True`.

- [ ] **Step 3: Visually confirm**

`Read` `%TEMP%\pw-verify\si727-tab.png` — confirm the Edge-compliance tab shows the per-line table with ✓/✗ and a summary, and at least one failing (red) line involving BM 004. (Optional: scroll-render the report's edge page like the schedule page.)

- [ ] **Step 4: Stop the preview**

```bash
pid=$(netstat -ano | grep ':4173' | grep -i LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F   # use actual port
```

---

## Self-Review

**1. Spec coverage**
- (A) class-derived σ₀, div=5, L=median, editable, fallback 0.010 → Task 1 (`suggestedSigma0`) + Task 2 (compute uses it; `setSigma0` flips auto off) + Task 3 (selector + note). ✓
- B/C selector, default B → Task 2 (`surveyClass='B'`, `setSurveyClass`) + Task 3 (`<select>`). ✓
- (B) edge compliance: distance |Δd| vs tol(min(dH,dS)); direction residual after swing vs tol(dH); all pairs among accepted; summary with mean scale/swing → Task 1 (`edgeCompliance`) + Task 2 (accepted-only, swing=rotDeg). ✓
- Independent of accept/reject → edges computed post-adjustment, never feed back; report note states it. ✓
- On-screen tab + report section → Task 3 (tab) + Task 4 (landscape section). ✓
- SI 727 formulas, WinAnsi-safe single-line footnotes → Task 4 (ASCII text, `sqrt`, `sec`, `f^2`). ✓
- Verification: Node + build + clean Edge render (restart preview after build) → Tasks 1, 5. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output. ✓

**3. Type/name consistency:** `surveyClass`, `sigma0Auto`, `setSurveyClass`, `setSigma0` consistent across store (Task 2) and CompareView (Task 3). `edgeCompliance` row fields (`from,to,dH,dS,dDiff,dAllow,distOk,dirResidualSec,dirAllowSec,dirOk,pass`) and summary fields (`totalLines,distPass,dirPass,bothPass,meanScale,meanSwingDeg`) used identically in Task 1 (definition), Task 3 (tab), Task 4 (report). `result.edges` / `result.surveyClass` set in Task 2, read in Tasks 3–4. `formatDMS`, `f3`, `f4`, `f4s` already imported in both CompareView and the report. ✓
