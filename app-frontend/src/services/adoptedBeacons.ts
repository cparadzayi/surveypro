import api from './api'
import { clearCoordinatePointsCache } from './coordinatePointCache'

/**
 * Adopted beacons: coordinates carried forward from a previous approved
 * survey, cited by that survey's record number (e.g. 112/2021).
 *
 * Persisted in the per-surveyor table project_adopted_beacons, independent of
 * coordinate_points so a CSV re-import can never swallow or orphan them. They
 * feed the Co-ordinate List's ADOPTED BEACONS section only: never the field
 * book, never Calculations Part 1.
 */

export interface AdoptedBeacon {
  id: number
  project_id: number
  /** Survey record number the beacon is adopted from, e.g. "112/2021". */
  sr_number: string
  point_name: string
  /** Native Cape Lo Westing */
  y: number
  /** Native Cape Lo Southing */
  x: number
  /** Verbatim from the import file (e.g. "F") */
  status: string | null
  description: string | null
  /** Survey date of the source record, verbatim (e.g. "February-21") */
  survey_date: string | null
  point_order: number
}

/** Row shape accepted by the batch import (matches the CSV template). */
export interface AdoptedBeaconInput {
  sr_number: string
  point_name: string
  y: number
  x: number
  status?: string
  description?: string
  survey_date?: string
}

export async function listAdoptedBeacons(projectId: number | string): Promise<AdoptedBeacon[]> {
  const r = await api.get('/adopted-beacons', { params: { project_id: projectId } })
  return r.data?.data ?? []
}

/**
 * Replace the project's adopted beacons with the uploaded set.
 * Replace-all, not merge: the file is the complete adopted set for the
 * record, so an edited re-upload must be able to drop rows.
 */
export async function importAdoptedBeacons(
  projectId: number | string,
  points: AdoptedBeaconInput[],
): Promise<AdoptedBeacon[]> {
  const r = await api.post('/adopted-beacons/batch', { project_id: projectId, points })
  return r.data?.data ?? []
}

export async function clearAdoptedBeacons(projectId: number | string): Promise<number> {
  const r = await api.delete('/adopted-beacons', { params: { project_id: projectId } })
  return r.data?.deleted ?? 0
}

/**
 * Move one live observation into the adopted set without a full CSV replace.
 * The server reads the point's coordinates, status and description; the caller
 * supplies only the source-record citation. The deleted point must also be
 * removed from the workflow arrays by the caller -- the API only owns the two
 * database rows.
 */
export async function adoptCoordinatePoint(
  projectId: number | string,
  input: { pointName: string; srNumber: string; surveyDate?: string | null },
): Promise<AdoptedBeacon> {
  const r = await api.post('/adopted-beacons/adopt', {
    project_id: projectId,
    point_name: input.pointName,
    sr_number: input.srNumber,
    survey_date: input.surveyDate ?? null,
  })
  clearCoordinatePointsCache()
  return r.data?.data ?? r.data?.adopted
}
