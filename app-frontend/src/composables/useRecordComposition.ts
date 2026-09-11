import { ref } from 'vue'
import api from '@/services/api'
import { getLandParcels } from '@/services/landParcels'
import { isOutsideFigureParcelName } from '@/services/parcelValidation'
import {
  inferComposition,
  normalizeComposition,
  type RecordComposition,
} from '@/utils/recordComposition'

/** Key under workflow_state.step_data. Arbitrary keys are accepted by PATCH .../workflow. */
const STEP_KEY = 'record-composition'

/**
 * Module-scope cache, keyed by project id — the same shape stores/projectContext.ts
 * uses. Confirming writes through to the workflow jsonb AND updates the cache, so
 * gating reacts immediately without a refetch.
 */
const cache = ref<Record<number, RecordComposition>>({})

/** Parcel count each inference was based on, so the banner can show its reasoning. */
const parcelCounts = ref<Record<number, number>>({})

export function useRecordComposition() {
  /** The composition currently known for a project, or null if none is loaded. */
  const compositionFor = (projectId: number): RecordComposition | null =>
    cache.value[projectId] ?? null

  /**
   * The parcel count behind an inferred composition, or null when the composition
   * came straight from the database and no count was ever taken.
   */
  const parcelCountFor = (projectId: number): number | null =>
    parcelCounts.value[projectId] ?? null

  /**
   * Read a confirmed composition out of a workflow_state-shaped object, or null.
   *
   * Only a CONFIRMED composition was ever persisted -- normalizeComposition also
   * accepts a well-formed 'inferred' shape, but such a value cannot have come from
   * a real confirmation, so it must not short-circuit re-inference.
   */
  const confirmedFromStepData = (stepData: any): RecordComposition | null => {
    const persisted = normalizeComposition(stepData?.[STEP_KEY])
    return persisted && persisted.source === 'confirmed' ? persisted : null
  }

  /**
   * Hydrate from workflow state; fall back to inferring from the digitized parcel
   * count. Only confirmed values are ever persisted, so anything valid found in
   * step_data is a human decision and is never overwritten by inference.
   *
   * Order: (1) in-memory cache, (2) the passed workflow state's step_data, (3) the
   * persisted workflow state over the API, (4) inference from the parcel count.
   *
   * Step (3) exists because most callers pass the FRONTEND reactive workflow state
   * (`CadastralWorkflowState`), which has no `step_data` property at all -- so a
   * confirmed composition was written to the database and then never read back, and
   * every reload re-inferred, re-prompted, and dropped the gating. When the caller
   * does hand us a real step_data carrying a confirmation we trust it and skip the
   * fetch; otherwise we ask the server before guessing.
   */
  const loadComposition = async (
    projectId: number,
    workflowState?: any
  ): Promise<RecordComposition | null> => {
    if (cache.value[projectId]) return cache.value[projectId]

    const fromState = confirmedFromStepData(workflowState?.step_data)
    if (fromState) {
      cache.value[projectId] = fromState
      return fromState
    }

    try {
      const response = await api.get(`/survey-projects/${projectId}/workflow`)
      const stepData = response?.data?.workflow_state?.step_data
      const fromApi = confirmedFromStepData(stepData)
      if (fromApi) {
        cache.value[projectId] = fromApi
        return fromApi
      }
    } catch (error) {
      // Never block plan generation on this lookup: an unreachable or failing
      // workflow endpoint simply means we fall through to inference, which gates
      // nothing because its result is only ever 'inferred'.
      console.warn('[RecordComposition] Could not load persisted workflow state:', error)
    }

    let parcelCount = 0
    try {
      // The default page size (limit: 50) would truncate this count -- and Task 8's
      // confirm banner prints it as the stated reason for the suggestion, so an
      // undersized count would show the surveyor a false justification. Ask for
      // everything, matching the full-fetch limit already used elsewhere in this route.
      const parcels = await getLandParcels(projectId, { limit: 10000 })
      parcelCount = (parcels || []).filter(
        (p: any) => !isOutsideFigureParcelName(p?.stand ?? p?.designation)
      ).length
    } catch (error) {
      // A failed fetch must not block plan generation; infer from zero, which
      // gates nothing because the result is only ever 'inferred'.
      console.warn('[RecordComposition] Could not load parcels to infer composition:', error)
    }

    const inferred = inferComposition(parcelCount)
    cache.value[projectId] = inferred
    parcelCounts.value[projectId] = parcelCount
    return inferred
  }

  /** Record the surveyor's decision, persist it, and cache it. */
  const confirmComposition = async (
    projectId: number,
    includesDiagrams: boolean,
    includesGeneralPlans: boolean
  ): Promise<RecordComposition> => {
    if (!includesDiagrams && !includesGeneralPlans) {
      throw new Error('A record must enclose at least one of Diagrams or General Plans')
    }
    const confirmed: RecordComposition = {
      includesDiagrams,
      includesGeneralPlans,
      source: 'confirmed',
      confirmedAt: new Date().toISOString(),
    }
    await api.patch(`/survey-projects/${projectId}/workflow`, {
      step: STEP_KEY,
      action: 'update',
      metadata: { ...confirmed },
    })
    cache.value[projectId] = confirmed
    return confirmed
  }

  /**
   * Test seam only. Switching projects needs no reset: entries are keyed by
   * project id, so other open projects' cached compositions are unaffected either way.
   */
  const resetCache = () => {
    cache.value = {}
    parcelCounts.value = {}
  }

  return { compositionFor, parcelCountFor, loadComposition, confirmComposition, resetCache }
}
