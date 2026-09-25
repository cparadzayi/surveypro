/**
 * Beacon Comparison Persistence Service
 *
 * Persists the beacon-comparison CSV network (Beacon, Hist_Y, Hist_X, Survey_Y,
 * Survey_X) into the active survey project's database record so the loaded CSV
 * survives navigation and app restarts. Stored under
 * survey_projects.workflow_state.step_data['beacon-comparison'].points via the
 * existing schema-scoped workflow endpoint.
 */

import api from './api';

export interface BeaconComparisonPoint {
  name: string;
  yH: number;
  xH: number;
  yS: number;
  xS: number;
}

/** Save/replace the comparison network for a project (upsert into workflow_state). */
export async function saveBeaconComparisonPoints(
  projectId: number,
  points: BeaconComparisonPoint[],
): Promise<void> {
  await api.patch(`/survey-projects/${projectId}/workflow`, {
    step: 'beacon-comparison',
    action: 'update',
    metadata: { points },
  });
}

/** Load the last saved comparison network for a project, or null when none exists. */
export async function loadBeaconComparisonPoints(
  projectId: number,
): Promise<BeaconComparisonPoint[] | null> {
  const resp = await api.get(`/survey-projects/${projectId}/workflow`);
  const ws = resp.data?.workflow_state;
  const pts = ws?.step_data?.['beacon-comparison']?.points;
  if (!Array.isArray(pts) || pts.length === 0) return null;
  return pts;
}