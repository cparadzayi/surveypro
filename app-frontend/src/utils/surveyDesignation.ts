/**
 * The survey designation — "Stand 403-405 Brackenhurst Township of Stand 87
 * Brackenhurst Township" — resolved in one place.
 *
 * The stands the survey actually covers come from the digitized parcels (via
 * loadSurveyStandNames, shared with the DSG certificate and every other
 * document that prints the designation); the township + parent phrase comes
 * from Project Setup. Every "Survey of" line — the report on survey (SI 727 and
 * narrative formats), the collated record, the DSG certificate — composes from
 * this same pipeline so none of them can drift.
 */

import { loadSurveyStandNames } from '../services/spatial';
import { composeReportSurveyOf } from './planDesignation';

export interface ResolvedSurveyDesignation {
  township: string;
  parentProperty: string;
  wholePortion: string;
  standNames: string[];
  /** The fully composed designation, ready to print. */
  surveyOf: string;
}

/**
 * The workflow's recorded survey context, as persisted by Project Setup.
 * Kept structurally typed so this util does not drag in the workflow store.
 */
export interface SurveyDesignationContext {
  selectedProject?: { id?: number | string } | null;
  projectInfo?: {
    projectId?: number | string;
    township?: string;
    parentProperty?: string;
    wholePortion?: string;
    projectName?: string;
  } | null;
  surveyorInfo?: {
    surveyOf?: string;
  } | null;
}

/**
 * Compose the survey designation from the digitized parcels + Project Setup.
 *
 * Falls back to the authored survey description when the parcels cannot be
 * loaded or no project is selected, so a document is never left empty.
 */
export async function resolveSurveyDesignation(
  context: SurveyDesignationContext | null | undefined
): Promise<ResolvedSurveyDesignation> {
  const projectId =
    context?.selectedProject?.id ?? context?.projectInfo?.projectId ?? null;
  const township = String(context?.projectInfo?.township || '').trim();
  const parentProperty = String(context?.projectInfo?.parentProperty || '').trim();
  const wholePortion = String(context?.projectInfo?.wholePortion || '').trim();
  const fallbackSurveyOf = String(
    context?.surveyorInfo?.surveyOf ||
    context?.projectInfo?.projectName ||
    ''
  ).trim();

  const standNames = projectId != null && projectId !== ''
    ? await loadSurveyStandNames(Number(projectId))
    : [];

  const surveyOf = composeReportSurveyOf({
    standNames,
    township,
    parentProperty,
    wholePortion,
    fallbackSurveyOf,
  });

  return { township, parentProperty, wholePortion, standNames, surveyOf };
}