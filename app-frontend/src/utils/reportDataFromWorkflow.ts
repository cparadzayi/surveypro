/**
 * Adapter: cadastral workflow state → ReportOnSurveyData.
 *
 * Both the Beacon Comparison Report and the narrative Report of Survey are built
 * from workflow state at collation time, so the collated document never depends
 * on the user having visited the Report on Survey step. Two shapes are supported:
 *   - in-memory workflow state (CadastralStandardView / MapLibreAreaView)
 *   - backend workflow_state (SurveyPlanMapView), where the report lives under
 *     step_data['report-on-survey'].report_data
 */

import type { ReportOnSurveyData } from '../types/cadastral';

/** Pull the report data out of whichever workflow shape was passed in. */
export function buildReportDataFromWorkflow(
  workflowState: any
): ReportOnSurveyData | null {
  if (!workflowState) return null;

  const inMemory = workflowState.reportOnSurvey;
  if (inMemory) return inMemory as ReportOnSurveyData;

  const persisted = workflowState.step_data?.['report-on-survey']?.report_data;
  if (persisted) return persisted as ReportOnSurveyData;

  return null;
}

/**
 * True when the report carries nothing worth printing — no beacons, no purpose,
 * and no comments. Callers use this to skip the narrative append entirely.
 */
export function isReportDataEmpty(
  reportData: ReportOnSurveyData | null | undefined
): boolean {
  if (!reportData) return true;

  const hasBeacons = (reportData.beacons?.length || 0) > 0;
  const hasPurpose =
    !!reportData.purpose?.type?.trim() || !!reportData.purpose?.reference?.trim();
  const hasComments = !!reportData.unusualOccurrences?.trim();

  return !hasBeacons && !hasPurpose && !hasComments;
}
