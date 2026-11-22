/**
 * The survey's S.R. number, once the Surveyor-General's office has issued it, for every document that prints one.
 *
 * It is entered once, with the other office numbers (Survey Plan step, or project setup), and saved on the project
 * (survey_projects.sr_no, projectInfo.srNo). The documents used to read other fields: the Report on Survey and the
 * Beacon Comparison read their own saved report's srNumber, the Co-ordinate List read nothing. So Brackenhurst's
 * diagrams printed S.R. 188/2026 while its Report on Survey, Co-ordinate List and Beacon Comparison printed
 * ".... / 2026". Every document now takes the number from here.
 */
import type { ReportOnSurveyData } from '../types/cadastral'

/** Values that mean "not issued yet". */
const NOT_ISSUED = /^(n\/?a|-+|\.+(\s*\/\s*\d{4})?|this survey)$/i

/** The first issued number among the candidates (the project's own first), or '' when none is issued yet. */
export function issuedSrNumber(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const v = String(c ?? '').trim()
    if (v && !NOT_ISSUED.test(v)) return v
  }
  return ''
}

/**
 * The report data with the issued S.R. number put in: the report's own number and the Beacon Comparison's
 * "Current Survey" (which reads "This Survey" until a number exists). Unchanged when none is issued.
 */
export function withIssuedSrNumber<T extends ReportOnSurveyData | null | undefined>(reportData: T, srNumber: string): T {
  if (!reportData || !srNumber) return reportData
  const out: any = { ...reportData, srNumber }
  const bc = (reportData as any).beaconComparison
  if (bc && (!bc.currentSRNumber || NOT_ISSUED.test(String(bc.currentSRNumber).trim()))) {
    out.beaconComparison = { ...bc, currentSRNumber: srNumber }
  }
  return out
}
