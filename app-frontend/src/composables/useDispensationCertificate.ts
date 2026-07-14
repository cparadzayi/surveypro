import { saveDocument } from '@/services/documentStorage'
import { generateDispensationCertificatePDF } from '@/utils/dispensationCertificateGenerator'
import { buildCertificateRows, type CertificateParcel } from '@/utils/dispensationCertificate'
import type { Servitude } from '@/views/modules/cadastral-standard/servitudes'

export interface DispensationHeader {
  township: string
  parentProperty?: string
  district?: string
  province?: string
  generalPlanNumber?: string
  sgNumber?: string
  loZone?: string
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

export async function generateAndSaveDispensation(
  opts: GenerateDispensationOptions,
): Promise<{ saved?: string; failed?: string }> {
  const { workingDirectory, portion, parcels, servitudes, header } = opts
  try {
    const rows = buildCertificateRows(parcels, servitudes, portion)
    const heading = `DISPENSATION CERTIFICATE — ${portion === 'developed' ? 'DEVELOPED' : 'UNDEVELOPED'} PORTION`
    const { blob } = await generateDispensationCertificatePDF({
      portion,
      heading,
      ...header,
      rows,
      standCount: parcels.length,
      totalArea: parcels.reduce((sum, p) => sum + (p.area_m2 ?? 0), 0),
    })
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
