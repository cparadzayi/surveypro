import { saveDocument } from '@/services/documentStorage'
import { generateDispensationCertificatePDF } from '@/utils/dispensationCertificateGenerator'
import { buildCertificateRows, certificateStands, type CertificateParcel } from '@/utils/dispensationCertificate'
import { surveyOfTitle, townshipPhrase } from '@/utils/planDesignation'
import { designationStandNames } from '@/utils/designationParcels'
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

/**
 * The project-setup values a certificate header is derived from. Both spellings
 * are accepted because the Servitudes stage reads `workflowState.projectInfo`
 * (camelCase) while the persisted `step_data['project-setup']` uses snake_case.
 * An explicitly present empty value clears the saved one: a whole-township
 * survey that drops its parent must not keep printing the old "OF ..." clause.
 */
export interface DispensationProjectSetup {
  surveyOf?: string | null
  survey_of?: string | null
  district?: string | null
  township?: string | null
  parentProperty?: string | null
  parent_property?: string | null
  loZone?: number | string | null
  lo_zone?: number | string | null
  centralMeridian?: number | string | null
  landSurveyor?: string | null
  surveyorName?: string | null
  licenseNumber?: string | null
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) return value
  }
  return undefined
}

/**
 * Overlay the current project setup onto a saved certificate header.
 *
 * The Servitudes stage used to copy setup values in with `||` on mount, and the
 * collated record trusted the saved header outright. Both let an older header
 * survive a project-setup edit — worst of all when the edit cleared the parent
 * property. Certificate-only fields (number, clause, date, place) are left
 * alone; everything the setup owns is taken from the setup, every time.
 */
export function applyProjectSetupToDispensationHeader<T extends DispensationHeader>(
  header: T,
  setup?: DispensationProjectSetup | null,
): T {
  if (!setup) return header

  const surveyOf = firstDefined(setup.surveyOf, setup.survey_of)
  if (surveyOf !== undefined) {
    header.surveyOf = String(surveyOf ?? '').trim()
    header.township = townshipPhrase(header.surveyOf)
      || String(firstDefined(setup.township) ?? '').trim()
  }

  const parentProperty = firstDefined(setup.parentProperty, setup.parent_property)
  if (parentProperty !== undefined) header.parentProperty = String(parentProperty ?? '').trim()

  const district = firstDefined(setup.district)
  if (district !== undefined) header.district = String(district ?? '').trim()

  const loZone = firstDefined(setup.loZone, setup.centralMeridian, setup.lo_zone)
  if (loZone !== undefined) {
    const value = String(loZone ?? '').trim()
    header.loZone = value ? `Lo ${value}` : ''
  }

  const landSurveyor = setup.landSurveyor
  if (typeof landSurveyor === 'string' && landSurveyor.trim()) {
    header.surveyorName = landSurveyor.trim()
  } else if (typeof setup.surveyorName === 'string' && setup.surveyorName.trim()) {
    header.surveyorName = setup.surveyorName.trim()
  }

  const licenseNumber = firstDefined(setup.licenseNumber)
  if (typeof licenseNumber === 'string' && licenseNumber.trim()) {
    header.licenseNumber = licenseNumber.trim()
  }

  return header
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
  // The title states the surveyed stands only — the remainder (REM/REMAINDER)
  // is not a lodged stand and never enters the certificate designation, even
  // though the schedule rows keep it.
  const standNames = designationStandNames(parcelsInSchedule)
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
 * The snapshot is a snapshot, not an authority on project identity: the project
 * setup may have been edited since. `projectInfo` (when the caller has it) and
 * `step_data['project-setup']` are applied over the saved header for every field
 * the setup owns. Certificate-only fields are preserved.
 *
 * Returns undefined when the Servitudes stage was never persisted — the record
 * then simply omits the certificate section.
 */
export function dispensationFromWorkflow(
  stepData: { servitudes?: any; 'project-setup'?: any } | null | undefined,
  parcels: CertificateParcel[],
  projectInfo?: DispensationProjectSetup | null,
): DispensationInput | undefined {
  const saved = stepData?.['servitudes']
  if (!saved || !Array.isArray(saved.servitudes) || !parcels.length) return undefined
  const savedHeader: any = saved.header ?? {}
  const allSteps = (stepData ?? {}) as Record<string, any>
  const setup = allSteps['project-setup'] ?? {}
  // saveWorkflowState() attaches surveyor_info to every step's metadata; the
  // latest one is the surveyor the project now names, not whoever generated the
  // certificate last.
  const surveyorInfo = Object.values(allSteps)
    .reverse()
    .find((step: any) => step?.surveyor_info)?.surveyor_info
  const header: DispensationHeader = {
    township: savedHeader.township || '',
    surveyOf: String(savedHeader.surveyOf || '').trim(),
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
  }

  applyProjectSetupToDispensationHeader(header, {
    surveyOf: setup.survey_of ?? setup.surveyOf,
    district: setup.district,
    township: setup.township,
    parentProperty: setup.parent_property ?? setup.parentProperty,
    loZone: setup.lo_zone ?? setup.central_meridian,
    landSurveyor: surveyorInfo?.landSurveyor,
    licenseNumber: surveyorInfo?.licenseNumber,
  })
  if (projectInfo) applyProjectSetupToDispensationHeader(header, projectInfo)

  return {
    portion: saved.portion === 'undeveloped' ? 'undeveloped' : 'developed',
    parcels,
    servitudes: hydrateServitudes(saved.servitudes),
    header,
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
