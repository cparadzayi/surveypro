/**
 * What the SurveyPro Lite modules share: where their points come from (one of the surveyor's survey projects,
 * read live from its coordinate points, or a spatial points layer), and the points worked with in this
 * browser (picked from a layer, typed in, or computed by Polar or Intersections). A point computed in one
 * module can then be picked in any other (Join, Polar, Intersections, Areas v2) without retyping it.
 * Kept in localStorage, so it survives moving between modules and a reload; nothing here is saved to a project.
 */
import { defineStore } from 'pinia'
import { listCoordinatePoints } from '../services/spatial'

export type WorkingPointSource = 'survey' | 'layer' | 'typed' | 'polar' | 'intersection'

/** Where the Lite modules find points: a survey project's coordinate points, or a spatial points layer. */
export type PointSourceKind = 'survey' | 'layer'

/** A beacon of the chosen survey project (read through the surveyor's own schema; never copied). */
export interface SourcePoint { name: string; y: number; x: number; description?: string }

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

interface Persisted {
  sourceKind: PointSourceKind
  surveyProjectId?: number
  surveyProjectName?: string
  layerId?: number
  points: WorkingPoint[]
}

function load(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    const points = Array.isArray(raw?.points)
      ? raw.points.filter((p: any) => p && typeof p.name === 'string' && Number.isFinite(p.y) && Number.isFinite(p.x))
      : []
    const layerId = Number.isFinite(raw?.layerId) ? raw.layerId : undefined
    const surveyProjectId = Number.isFinite(raw?.surveyProjectId) ? raw.surveyProjectId : undefined
    const surveyProjectName = typeof raw?.surveyProjectName === 'string' ? raw.surveyProjectName : undefined
    // A surveyor's own projects are the usual source; a list saved before there was a choice used a layer.
    const sourceKind: PointSourceKind = raw?.sourceKind === 'layer' || raw?.sourceKind === 'survey'
      ? raw.sourceKind
      : (layerId ? 'layer' : 'survey')
    return { sourceKind, surveyProjectId, surveyProjectName, layerId, points }
  } catch {
    return { sourceKind: 'survey', points: [] }
  }
}

export const useLiteWorkingPointsStore = defineStore('liteWorkingPoints', {
  state: () => ({
    ...load(),
    /** The chosen survey project's beacons, loaded on demand; not kept in localStorage. */
    surveyPoints: [] as SourcePoint[],
    surveyPointsFor: null as number | null,
    loadingSurvey: false,
    surveyError: '',
  }),
  getters: {
    /** Newest first. */
    recent: (s) => [...s.points].sort((a, b) => b.at - a.at),
    /** The layer to search, only while the source is a layer. */
    activeLayerId: (s) => (s.sourceKind === 'layer' ? s.layerId : undefined),
    /** The survey project to search, only while the source is a survey project. */
    activeSurveyProjectId: (s) => (s.sourceKind === 'survey' ? s.surveyProjectId : undefined),
  },
  actions: {
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          sourceKind: this.sourceKind, surveyProjectId: this.surveyProjectId, surveyProjectName: this.surveyProjectName,
          layerId: this.layerId, points: this.points,
        }))
      } catch { /* quota or private mode */ }
    },
    setLayer(layerId?: number) {
      this.layerId = layerId
      this.persist()
    },
    setSourceKind(kind: PointSourceKind) {
      this.sourceKind = kind
      this.persist()
    },
    setSurveyProject(id?: number, name?: string) {
      this.surveyProjectId = id
      this.surveyProjectName = id ? name : undefined
      this.surveyPoints = []
      this.surveyPointsFor = null
      this.surveyError = ''
      this.persist()
    },
    /**
     * Load the chosen survey project's coordinate points (once per project; `force` reloads, e.g. after a
     * re-import). Read live from the project, so they are never a stale copy.
     */
    async loadSurveyPoints(force = false): Promise<SourcePoint[]> {
      const id = this.surveyProjectId
      if (!id) { this.surveyPoints = []; this.surveyPointsFor = null; return [] }
      if (!force && this.surveyPointsFor === id) return this.surveyPoints
      this.loadingSurvey = true
      this.surveyError = ''
      try {
        const rows = await listCoordinatePoints(id)
        if (this.surveyProjectId !== id) return this.surveyPoints // another project was chosen meanwhile
        this.surveyPoints = (rows || [])
          .map((r) => ({ name: String(r.name ?? '').trim(), y: Number(r.y), x: Number(r.x), description: r.description }))
          .filter((r) => r.name && Number.isFinite(r.y) && Number.isFinite(r.x))
        this.surveyPointsFor = id
      } catch {
        this.surveyPoints = []
        this.surveyPointsFor = null
        this.surveyError = "Could not load the survey project's points"
      } finally {
        this.loadingSurvey = false
      }
      return this.surveyPoints
    },
    /** The chosen survey project's beacons whose name contains the text, in name order. */
    matchingSurvey(text: string, limit = 20): SourcePoint[] {
      const t = text.trim().toLowerCase()
      return this.surveyPoints
        .filter((p) => !t || p.name.toLowerCase().includes(t))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .slice(0, limit)
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
