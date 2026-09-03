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
 * axios rejects a non-2xx response with `error.message` set to the generic
 * "Request failed with status code NNN" -- `responseType: 'blob'` applies to
 * error responses too, so the backend's real message (e.g. the beacon name in
 * a 400) is left sitting unread as `error.response.data`, a Blob. Decode it so
 * that message actually reaches the surveyor, the same shape as geopdf.ts's
 * PDF-signature check does for the PDF route. A body that isn't JSON, or
 * can't be read, must fall back to the original error rather than masking the
 * real failure with a decode error.
 */
async function decodeWorkingPlanError(error: any): Promise<unknown> {
  const body = error?.response?.data
  if (body instanceof Blob) {
    try {
      const parsed = JSON.parse(await body.text())
      if (parsed && typeof parsed.message === 'string' && parsed.message) {
        return new Error(parsed.message)
      }
    } catch {
      // non-JSON or unreadable body -- fall through to the original error
    }
  }
  return error
}

/**
 * Render the A4 working plan. The spec goes up whole; the sheet comes back as a
 * DXF, with the scale, grid and computed areas on headers because they cannot be
 * read back out of the body without parsing it.
 */
export async function generateWorkingPlanDXF(spec: WorkingPlanSpec): Promise<WorkingPlanDXFResult> {
  let response
  try {
    response = await api.post('/working-plan/dxf', spec, {
      responseType: 'blob',
      timeout: 120000,
    })
  } catch (error) {
    throw await decodeWorkingPlanError(error)
  }

  const headers = (response.headers ?? {}) as Record<string, string>
  const scaleRaw = Number(headers['x-plan-scale'])

  return {
    blob: response.data as Blob,
    scale: Number.isFinite(scaleRaw) && headers['x-plan-scale'] ? scaleRaw : null,
    gridInterval: parseJsonHeader<{ e: number; n: number }>(headers['x-plan-grid']),
    areas: parseJsonHeader<Record<string, number>>(headers['x-plan-areas']),
  }
}
