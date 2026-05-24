// ─────────────────────────────────────────────────────────────────────────────
// surveyAdjustmentStore.js
// Pinia store — owns all state and calls the pure math utilities.
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { iterativeAdjust, SAMPLE_DATA } from '@/utils/surveyMath'

let nextId = SAMPLE_DATA.length + 1

export const useSurveyAdjustmentStore = defineStore('surveyAdjustment', () => {
  // ── STATE ──────────────────────────────────────────────────────────────────
  const points = ref(SAMPLE_DATA.map(p => ({ ...p })))
  const sigma0 = ref(0.010)   // a priori σ₀ in metres
  const critW  = ref(2.576)   // W-test critical value (99 % confidence)
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

  function compute() {
    error.value  = null
    result.value = null
    try {
      const res = iterativeAdjust(points.value, critW.value, sigma0.value)
      if (res.error) {
        error.value = res.error
      } else {
        result.value = res
      }
    } catch (e) {
      error.value = e.message
    }
  }

  // ── EXPOSE ─────────────────────────────────────────────────────────────────
  return {
    // state
    points, sigma0, critW, result, error,
    // actions
    addPoint, removePoint, updatePoint, loadSample, setPoints, compute,
  }
})
