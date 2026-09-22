// ─────────────────────────────────────────────────────────────────────────────
// surveyAdjustmentStore.js
// Pinia store — owns all state and calls the pure math utilities.
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { iterativeAdjust, SAMPLE_DATA } from '@/utils/surveyMath'
import { suggestedSigma0, edgeCompliance, severityVerdict, coordinateComparison, edgeVerdictPoints } from '@/utils/si727'

let nextId = SAMPLE_DATA.length + 1

export const useSurveyAdjustmentStore = defineStore('surveyAdjustment', () => {
  // ── STATE ──────────────────────────────────────────────────────────────────
  const points = ref(SAMPLE_DATA.map(p => ({ ...p })))
  const sigma0 = ref(suggestedSigma0(SAMPLE_DATA, 'B'))   // a priori σ₀ (m), class-derived; editable
  const critW  = ref(2.576)   // W-test critical value (99 % confidence)
  const surveyClass = ref('B')   // SI 727 survey class (B or C)
  const sigma0Auto  = ref(true)  // true while σ₀ is auto-derived from the class
  // Which comparison the user selected. Three independent checks:
  //   'coords' → SI 727 §67(5) co-ordinate comparison (schedule only)
  //   'edges'  → Second Schedule edge compliance + severity verdict (no adjustment)
  //   'wtest'  → Helmert + iterative Baarda W-test data snooping (no edge verdict)
  const method  = ref('coords')
  const result = ref(null)    // { method, pts, ... } per-mode shape
  const error  = ref(null)    // string | null

  // ── ACTIONS ────────────────────────────────────────────────────────────────
  function addPoint() {
    const id = nextId++
    points.value.push({
      id,
      name: `BM ${String(id).padStart(3, '0')}`,
      yH: 0, xH: 0,   // historical Westing (Y) / Southing (X)
      yS: 0, xS: 0,   // survey Westing (Y) / Southing (X)
    })
    result.value = null   // any edit invalidates the prior adjustment
  }

  function removePoint(id) {
    points.value = points.value.filter(p => p.id !== id)
    result.value = null
  }

  function updatePoint(id, field, val) {
    const p = points.value.find(p => p.id === id)
    if (p) { p[field] = val; result.value = null }   // any edit invalidates the prior adjustment
  }

  function loadSample() {
    points.value = SAMPLE_DATA.map(p => ({ ...p }))
    nextId = SAMPLE_DATA.length + 1
    result.value = null
    error.value  = null
  }

  /**
   * Replace all beacons with an imported set (e.g. from an uploaded CSV).
   * @param {Array<{name, yH, xH, yS, xS}>} rows  Parsed beacon rows
   *   (Y = Westing, X = Southing — Cape Lo).
   */
  function setPoints(rows) {
    points.value = rows.map((r, i) => ({
      id: i + 1,
      name: r.name,
      yH: r.yH, xH: r.xH,
      yS: r.yS, xS: r.xS,
    }))
    nextId = rows.length + 1
    result.value = null
    error.value  = null
  }

  function setSurveyClass(c) {
    surveyClass.value = (c === 'C') ? 'C' : 'B'
    if (sigma0Auto.value) sigma0.value = suggestedSigma0(points.value, surveyClass.value)
  }

  function setSigma0(v) {
    const n = parseFloat(v)
    if (Number.isFinite(n) && n > 0) {
      sigma0.value = n
      sigma0Auto.value = false
    }
  }

  function setCheckMethod(m) {
    if (!['coords', 'edges', 'wtest'].includes(m)) return
    method.value = m
    result.value = null
    error.value  = null
  }

  function compute() {
    error.value  = null
    result.value = null
    if (sigma0Auto.value) sigma0.value = suggestedSigma0(points.value, surveyClass.value)
    try {
      let res
      if (method.value === 'coords') {
        // 1. Comparison of co-ordinates vide §67(5): raw survey-vs-historical schedule,
        //    decided against the class co-ordinate limit. No Helmert, no W-test.
        res = coordinateComparison(points.value, surveyClass.value)
      } else if (method.value === 'edges') {
        // 2. Edge compliance with the SI 727 classes: Second Schedule line checks
        //    (paras 7(1), 8) over the WHOLE network + severity verdict. Edges are
        //    computed over every beacon, rejected ones included: their failing rays
        //    are the evidence for rejecting them and must stay on the sketch/table.
        const edges = edgeCompliance(points.value, surveyClass.value)
        const verdict = severityVerdict(edges.rows)
        res = { pts: edgeVerdictPoints(points.value, edges, verdict), edges, si727Verdict: verdict }
      } else {
        // 3. Iterative Baarda W-test: statistical data snooping on ALL points (no
        //    Second Schedule pre-filter) — the W-test alone decides rejections.
        res = iterativeAdjust(points.value, critW.value, sigma0.value)
        if (res.error) {
          error.value = res.error
          return
        }
      }
      res.method = method.value
      res.surveyClass = surveyClass.value
      result.value = res
    } catch (e) {
      error.value = e.message
    }
  }

  // ── EXPOSE ─────────────────────────────────────────────────────────────────
  return {
    // state
    points, sigma0, critW, surveyClass, sigma0Auto, method, result, error,
    // actions
    addPoint, removePoint, updatePoint, loadSample, setPoints,
    setSurveyClass, setSigma0, setCheckMethod, compute,
  }
})
