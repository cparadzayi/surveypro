/**
 * DSG Certificate (1/96) — shared rendering + workflow rebuild.
 *
 * The DSG Certificate stage persists its certificate text to the workflow
 * (step_data['dsg-certificate'].certificate_data) when the surveyor generates
 * the certificate; the comprehensive-record path reads it back and re-renders,
 * so the collated certificate matches what was signed off in the workflow.
 *
 * Returns undefined when the stage was never persisted — the record then simply
 * omits the certificate section.
 */

import {
  generateDSGCertificatePDF,
  type DSGCertificateData,
} from '@/utils/dsgCertificateGenerator'

export { type DSGCertificateData };

/** Render the DSG certificate PDF (jsPDF blob) from persisted certificate data. */
export async function buildDSGCertificateBlob(
  certificate: DSGCertificateData,
): Promise<{ blob: Blob }> {
  const { blob } = await generateDSGCertificatePDF(certificate)
  return { blob }
}

/**
 * Rebuild the DSG certificate inputs from a survey's persisted workflow state.
 * The DSG Certificate stage saves `certificate_data` under the 'dsg-certificate'
 * step; the comprehensive-record path reads it back so the collated certificate
 * matches what was generated.
 *
 * Returns undefined when the stage was never persisted (or only persisted a
 * half-filled form — the form requires surveyOf + surveyorName + 4 statements).
 */
export function dsgCertificateFromWorkflow(
  stepData: { 'dsg-certificate'?: any } | null | undefined,
): DSGCertificateData | undefined {
  const cert = stepData?.['dsg-certificate']?.certificate_data
  if (!cert) return undefined
  const required = [
    cert.surveyOf,
    cert.surveyorName,
    cert.statement1,
    cert.statement2,
    cert.statement3,
    cert.statement4,
  ]
  if (required.some((v) => !String(v ?? '').trim())) return undefined
  return {
    surveyOf: String(cert.surveyOf ?? ''),
    surveyorName: String(cert.surveyorName ?? ''),
    licenseNumber: String(cert.licenseNumber ?? ''),
    statement1: String(cert.statement1 ?? ''),
    statement2: String(cert.statement2 ?? ''),
    statement3: String(cert.statement3 ?? ''),
    statement4: String(cert.statement4 ?? ''),
    surveyorTitle: String(cert.surveyorTitle || 'LAND SURVEYOR (Zim)'),
    additionalNotes: String(cert.additionalNotes ?? ''),
    date: String(cert.date || new Date().toISOString().slice(0, 10)),
    firm: cert.firm ? String(cert.firm) : undefined,
    address: cert.address ? String(cert.address) : undefined,
    formReference: cert.formReference ? String(cert.formReference) : undefined,
  }
}