// ─────────────────────────────────────────────────────────────────────────────
// surveyAdjustmentStore.js
// Pinia store — owns all state and calls the pure math utilities.
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { iterativeAdjust, SAMPLE_DATA } from '@/utils/surveyMath'
import { suggestedSigma0, edgeCompliance, coordinateComparison } from '@/utils/si727'

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
        // 1. Comparison of co-ordinates vide §67(5): the survey-vs-historical schedule, judged by
        //    Second Schedule para 7(5) on the lines between the beacons (no co-ordinate limit:
        //    the regulations set none). No Helmert, no W-test.
        res = coordinateComparison(points.value, surveyClass.value)
      } else if (method.value === 'edges') {
        // 2. Edge compliance with the SI 727 classes: every line between the beacons against Second
        //    Schedule para 7(5) ALONG each line and its tolerance ACROSS it (the sideways movement after
        //    the common swing of the beacons kept; SI 727 states the limit along the line only, and the
        //    report says the extension is ours), decided by the same rule as the comparison of
        //    co-ordinates: a beacon is set aside only when
        //    lines to it fail while the lines among the others pass; failures running through the network
        //    leave every beacon UNRESOLVED. (It used to be a 1.25 x median "severity" cut that also counted
        //    a direction limit, neither in SI 727.) Edges cover every beacon, set-aside ones included:
        //    their failing lines are the evidence and stay on the sketch and table.
        const edges = edgeCompliance(points.value, surveyClass.value)
        res = { ...coordinateComparison(points.value, surveyClass.value, { sideways: true }), edges }
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
