import api from './api'
import type { WorkingPlanSpec } from '@/views/modules/cadastral-standard/workingPlanSpec'

export interface WorkingPlanDXFResult {
  blob: Blob
  /** Scale denominator the module chose, e.g. 2000 for 1:2000. */
  scale: number | null
  gridInterval: { e: number; n: number } | null
  /** Areas from the PLOTTED coordinates — a cross-check, never the SI 727 area. */
  areas: Record<string, number> | null
}

function parseJsonHeader<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Render the A4 working plan. The spec goes up whole; the sheet comes back as a
 * DXF, with the scale, grid and computed areas on headers because they cannot be
 * read back out of the body without parsing it.
 */
export async function generateWorkingPlanDXF(spec: WorkingPlanSpec): Promise<WorkingPlanDXFResult> {
  const response = await api.post('/working-plan/dxf', spec, {
    responseType: 'blob',
    timeout: 120000,
  })

  const headers = (response.headers ?? {}) as Record<string, string>
  const scaleRaw = Number(headers['x-plan-scale'])

  return {
    blob: response.data as Blob,
    scale: Number.isFinite(scaleRaw) && headers['x-plan-scale'] ? scaleRaw : null,
    gridInterval: parseJsonHeader<{ e: number; n: number }>(headers['x-plan-grid']),
    areas: parseJsonHeader<Record<string, number>>(headers['x-plan-areas']),
  }
}
