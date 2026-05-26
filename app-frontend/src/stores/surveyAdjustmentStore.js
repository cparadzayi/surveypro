// ─────────────────────────────────────────────────────────────────────────────
// surveyAdjustmentStore.js
// Pinia store — owns all state and calls the pure math utilities.
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { iterativeAdjust, SAMPLE_DATA } from '@/utils/surveyMath'
import { suggestedSigma0, edgeCompliance } from '@/utils/si727'

let nextId = SAMPLE_DATA.length + 1

export const useSurveyAdjustmentStore = defineStore('surveyAdjustment', () => {
  // ── STATE ──────────────────────────────────────────────────────────────────
  const points = ref(SAMPLE_DATA.map(p => ({ ...p })))
  const sigma0 = ref(suggestedSigma0(SAMPLE_DATA, 'B'))   // a priori σ₀ (m), class-derived; editable
  const critW  = ref(2.576)   // W-test critical value (99 % confidence)
  const surveyClass = ref('B')   // SI 727 survey class (B or C)
  const sigma0Auto  = ref(true)  // true while σ₀ is auto-derived from the class
  const result = ref(null)    // { adj, pts, log, converged }
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
  }

  function removePoint(id) {
    points.value = points.value.filter(p => p.id !== id)
    result.value = null
  }

  function updatePoint(id, field, val) {
    const p = points.value.find(p => p.id === id)
    if (p) p[field] = val
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

  // ── EXPOSE ─────────────────────────────────────────────────────────────────
  return {
    // state
    points, sigma0, critW, surveyClass, sigma0Auto, result, error,
    // actions
    addPoint, removePoint, updatePoint, loadSample, setPoints,
    setSurveyClass, setSigma0, compute,
  }
})
