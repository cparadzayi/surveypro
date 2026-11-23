/**
 * What the SurveyPro Lite modules share: the points layer last chosen, and the points worked with in this
 * browser (picked from a layer, typed in, or computed by Polar or Intersections). A point computed in one
 * module can then be picked in any other (Join, Polar, Intersections, Areas v2) without retyping it.
 * Kept in localStorage, so it survives moving between modules and a reload; nothing here is saved to a project.
 */
import { defineStore } from 'pinia'

export type WorkingPointSource = 'layer' | 'typed' | 'polar' | 'intersection'

export interface WorkingPoint {
  name: string
  /** Y westing, X southing (Cape Lo), metres. */
  y: number
  x: number
  source: WorkingPointSource
  /** When it was added or last updated (ms). */
  at: number
}

const STORAGE_KEY = 'lite-working-points'
/** The list is a scratch pad, not a project: the oldest fall off past this. */
export const MAX_WORKING_POINTS = 200

/** The first of prefix1, prefix2, ... not already a working point's name (computed points are named so). */
export function nextFreeName(points: Array<{ name: string }>, prefix: string): string {
  const taken = new Set(points.map((p) => p.name.toLowerCase()))
  let n = 1
  while (taken.has(`${prefix}${n}`.toLowerCase())) n++
  return `${prefix}${n}`
}

interface Persisted { layerId?: number; points: WorkingPoint[] }

function load(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    const points = Array.isArray(raw?.points)
      ? raw.points.filter((p: any) => p && typeof p.name === 'string' && Number.isFinite(p.y) && Number.isFinite(p.x))
      : []
    const layerId = Number.isFinite(raw?.layerId) ? raw.layerId : undefined
    return { layerId, points }
  } catch {
    return { points: [] }
  }
}

export const useLiteWorkingPointsStore = defineStore('liteWorkingPoints', {
  state: () => load(),
  getters: {
    /** Newest first. */
    recent: (s) => [...s.points].sort((a, b) => b.at - a.at),
  },
  actions: {
    persist() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ layerId: this.layerId, points: this.points })) } catch { /* quota or private mode */ }
    },
    setLayer(layerId?: number) {
      this.layerId = layerId
      this.persist()
    },
    /**
     * Add a point, or update the one of the same name (names compare without case or surrounding spaces).
     * A point without a name is not kept: it could not be told apart in the list.
     */
    add(p: { name: string; y: number; x: number; source: WorkingPointSource }) {
      const name = String(p.name ?? '').trim()
      if (!name || !Number.isFinite(p.y) || !Number.isFinite(p.x)) return
      const key = name.toLowerCase()
      const entry: WorkingPoint = { name, y: p.y, x: p.x, source: p.source, at: Date.now() }
      const i = this.points.findIndex((q) => q.name.toLowerCase() === key)
      if (i >= 0) this.points.splice(i, 1, entry)
      else this.points.push(entry)
      if (this.points.length > MAX_WORKING_POINTS) {
        this.points = [...this.points].sort((a, b) => b.at - a.at).slice(0, MAX_WORKING_POINTS)
      }
      this.persist()
    },
    remove(name: string) {
      const key = name.trim().toLowerCase()
      this.points = this.points.filter((q) => q.name.toLowerCase() !== key)
      this.persist()
    },
    clear() {
      this.points = []
      this.persist()
    },
    /** Working points whose name contains the text, newest first. */
    matching(text: string, limit = 10): WorkingPoint[] {
      const t = text.trim().toLowerCase()
      return this.recent.filter((p) => !t || p.name.toLowerCase().includes(t)).slice(0, limit)
    },
  },
})
