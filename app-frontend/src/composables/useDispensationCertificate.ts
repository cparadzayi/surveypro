import { saveDocument } from '@/services/documentStorage'
import { generateDispensationCertificatePDF } from '@/utils/dispensationCertificateGenerator'
import { buildCertificateRows, certificateStands, type CertificateParcel } from '@/utils/dispensationCertificate'
import { surveyOfTitle } from '@/utils/planDesignation'
import { hydrateServitudes, type Servitude } from '@/views/modules/cadastral-standard/servitudes'

export interface DispensationHeader {
  township: string
  parentProperty?: string
  district?: string
  province?: string
  generalPlanNumber?: string
  sgNumber?: string
  loZone?: string
  certificateNumber?: string
  /** The workflow "SURVEY OF ..." designation, the single source of truth for
   *  the certificate's title block. Preferred over `township` when present. */
  surveyOf?: string
  dispensationClause: string
  surveyorName: string
  licenseNumber?: string
  place?: string
  date: string
}

export interface GenerateDispensationOptions {
  workingDirectory: string
  portion: 'developed' | 'undeveloped'
  parcels: CertificateParcel[]
  servitudes: Servitude[]
  header: DispensationHeader
}

/** Everything needed to render the certificate PDF itself (no saving). */
export interface DispensationInput {
  portion: 'developed' | 'undeveloped'
  parcels: CertificateParcel[]
  servitudes: Servitude[]
  header: DispensationHeader
}

/**
 * Render the dispensation certificate PDF (jsPDF blob) from rows assembled from
 * the given parcels + servitudes. Shared by the standalone save flow and the
 * comprehensive-record collation, so both produce an identical certificate.
 */
export async function buildDispensationCertificateBlob(
  opts: DispensationInput,
): Promise<{ blob: Blob }> {
  const { portion, parcels, servitudes, header } = opts
  // The schedule and the header totals must agree: exclude the Outside Figure
  // pseudo-parcel from both (certificateStands is what buildCertificateRows uses).
  const parcelsInSchedule = certificateStands(parcels)
  const rows = buildCertificateRows(parcelsInSchedule, servitudes, portion)
  // "SURVEY OF <designation>" — the workflow surveyOf when the stage knows one
  // (the shared general-plan phrase, ranges rebuilt from the schedule), else the
  // header township as before.
  const standNames = [...new Set(parcelsInSchedule.map((p) => String(p.stand)).filter(Boolean))]
  const surveySource = (header.surveyOf ?? '').trim() || (header.township ?? '').trim()
  const surveyTitle = surveyOfTitle(surveySource, standNames)
  const { blob } = await generateDispensationCertificatePDF({
    portion,
    ...header,
    surveyTitle,
    rows,
    standCount: parcelsInSchedule.length,
    totalArea: parcelsInSchedule.reduce((sum, p) => sum + (p.area_m2 ?? 0), 0),
  })
  return { blob }
}

/**
 * Rebuild the certificate inputs from a survey's persisted workflow state. The
 * Servitudes stage saves its snapshot at `step_data['servitudes']` (servitudes,
 * plus the header and portion it generated with); the comprehensive-record path
 * reads it back so the collated certificate matches what was generated.
 *
 * Returns undefined when the Servitudes stage was never persisted — the record
 * then simply omits the certificate section.
 */
export function dispensationFromWorkflow(
  stepData: { servitudes?: any; 'project-setup'?: any } | null | undefined,
  parcels: CertificateParcel[],
): DispensationInput | undefined {
  const saved = stepData?.['servitudes']
  if (!saved || !Array.isArray(saved.servitudes) || !parcels.length) return undefined
  const savedHeader: any = saved.header ?? {}
  // The Servitudes header only gained a surveyOf field later; saves made before
  // that reused the editable Township box, which then held the project short
  // name ("MAG1 SH2"). Derive the designation from the workflow's project-setup
  // step when the saved header lacks one, so a re-collated certificate never
  // regresses to "SURVEY OF STANDS … MAG1 SH2".
  const workflowSurveyOf = String(stepData?.['project-setup']?.survey_of || '').trim()
  return {
    portion: saved.portion === 'undeveloped' ? 'undeveloped' : 'developed',
    parcels,
    servitudes: hydrateServitudes(saved.servitudes),
    header: {
      township: savedHeader.township || '',
      surveyOf: String(savedHeader.surveyOf || '').trim() || workflowSurveyOf,
      parentProperty: savedHeader.parentProperty || '',
      district: savedHeader.district || '',
      generalPlanNumber: savedHeader.generalPlanNumber || '',
      sgNumber: savedHeader.sgNumber || '',
      loZone: savedHeader.loZone || '',
      certificateNumber: savedHeader.certificateNumber || '',
      dispensationClause: savedHeader.dispensationClause || '',
      surveyorName: savedHeader.surveyorName || '',
      licenseNumber: savedHeader.licenseNumber || '',
      place: savedHeader.place || '',
      date: savedHeader.date || new Date().toISOString().slice(0, 10),
    },
  }
}

export async function generateAndSaveDispensation(
  opts: GenerateDispensationOptions,
): Promise<{ saved?: string; failed?: string }> {
  const { workingDirectory, portion, parcels, servitudes, header } = opts
  try {
    const { blob } = await buildDispensationCertificateBlob({ portion, parcels, servitudes, header })
    const fileName = portion === 'developed' ? 'DispensationDeveloped.pdf' : 'DispensationUndeveloped.pdf'
    const result = await saveDocument({
      workingDirectory,
      documentType: 'dispensation-certificate',
      fileName,
      pdfBlob: blob,
      overwrite: true,
    })
    if (result.success) return { saved: result.filePath || fileName }
    return { failed: result.error || 'Unknown error' }
  } catch (error: any) {
    return { failed: error?.message || 'Unknown error' }
  }
}
