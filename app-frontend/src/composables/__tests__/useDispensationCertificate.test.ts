import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/documentStorage', () => ({
  saveDocument: vi.fn(),
}))
vi.mock('@/utils/dispensationCertificateGenerator', () => ({
  generateDispensationCertificatePDF: vi.fn(async () => ({ blob: new Blob(['x']), pageCount: 1 })),
}))

import { saveDocument } from '@/services/documentStorage'
import { generateDispensationCertificatePDF } from '@/utils/dispensationCertificateGenerator'
import { generateAndSaveDispensation, dispensationFromWorkflow } from '../useDispensationCertificate'
import type { Servitude } from '../../views/modules/cadastral-standard/servitudes'

const header = { township: 'MAGLAS', dispensationClause: 'Reg 78', surveyorName: 'F.C.', date: '2026-07-14' }
const parcels = [{ id: 10, stand: '1620', area_m2: 174 }]
const sv: Servitude = { id: 's', subjectId: '10', side: 'AB', type: 'party-wall', fromBeacon: '1620a', toBeacon: '1620b' }

beforeEach(() => { vi.clearAllMocks() })

describe('generateAndSaveDispensation', () => {
  it('developed: builds data with rows/totals, saves DispensationDeveloped.pdf to certificates, overwrite', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: true, filePath: '/p/DispensationDeveloped.pdf' })
    const out = await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels, servitudes: [sv], header })
    const genArg = (generateDispensationCertificatePDF as any).mock.calls[0][0]
    expect(genArg.portion).toBe('developed')
    expect(genArg.standCount).toBe(1)
    expect(genArg.totalArea).toBe(174)
    expect(genArg.rows[0].boundary).toContain('1620a – 1620b')
    expect(genArg.surveyTitle).toBe('SURVEY OF STANDS 1620 MAGLAS')
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({
      workingDirectory: 'C:/proj', documentType: 'dispensation-certificate',
      fileName: 'DispensationDeveloped.pdf', overwrite: true,
    }))
    expect(out.saved).toBeTruthy()
    expect(out.failed).toBeUndefined()
  })
  it('prefers the workflow surveyOf over the header township in the title', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: true, filePath: '/p/DispensationDeveloped.pdf' })
    const h = { ...header, surveyOf: 'Stands 1620 - 1621 Maglas Township' }
    await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels: [{ ...parcels[0], stand: '1620' }, { id: 11, stand: '1621', area_m2: 200 }], servitudes: [sv], header: h })
    const genArg = (generateDispensationCertificatePDF as any).mock.calls[0][0]
    expect(genArg.surveyTitle).toBe('SURVEY OF STANDS 1620 - 1621 MAGLAS TOWNSHIP')
  })
  it('undeveloped: uses DispensationUndeveloped.pdf', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: true, filePath: '/p/DispensationUndeveloped.pdf' })
    await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'undeveloped', parcels, servitudes: [], header })
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'DispensationUndeveloped.pdf' }))
  })
  it('records a failure without throwing when saveDocument reports failure', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: false, error: 'locked' })
    const out = await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels, servitudes: [sv], header })
    expect(out.saved).toBeUndefined()
    expect(out.failed).toBe('locked')
  })
  it('records a failure without throwing when the generator throws', async () => {
    ;(generateDispensationCertificatePDF as any).mockRejectedValueOnce(new Error('boom'))
    const out = await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels, servitudes: [sv], header })
    expect(out.failed).toBe('boom')
  })
})

describe('dispensationFromWorkflow', () => {
  const certParcels = [{ id: 10, stand: '1620', area_m2: 174 }]

  it('rebuilds the inputs from persisted step_data (servitudes + header + portion)', () => {
    const input = dispensationFromWorkflow({
      servitudes: {
        servitudes: [sv],
        portion: 'undeveloped',
        header: { township: 'MAGLAS', surveyOf: 'Stands 1620 Maglas Township', surveyorName: 'F.C.', date: '2026-07-14' },
      },
    }, certParcels)

    expect(input).toBeDefined()
    expect(input!.portion).toBe('undeveloped')
    expect(input!.servitudes).toHaveLength(1)
    expect(input!.parcels).toEqual(certParcels)
    expect(input!.header.township).toBe('MAGLAS')
    expect(input!.header.surveyOf).toBe('Stands 1620 Maglas Township')
    expect(input!.header.dispensationClause).toBe('')
  })

  it('defaults the portion to developed', () => {
    const input = dispensationFromWorkflow({ servitudes: { servitudes: [] } }, certParcels)
    expect(input!.portion).toBe('developed')
  })

  it('returns undefined when there is no step_data or no servitudes', () => {
    expect(dispensationFromWorkflow(undefined, certParcels)).toBeUndefined()
    expect(dispensationFromWorkflow({}, certParcels)).toBeUndefined()
  })

  it('returns undefined when there are no parcels', () => {
    expect(dispensationFromWorkflow({ servitudes: { servitudes: [sv] } }, [])).toBeUndefined()
  })

  it('drops malformed servitude records', () => {
    const input = dispensationFromWorkflow({
      servitudes: { servitudes: [sv, { id: 'bad' }] },
    }, certParcels)
    expect(input!.servitudes).toHaveLength(1)
  })

  it('derives the designation from project-setup when the saved header predates the surveyOf field', () => {
    const input = dispensationFromWorkflow({
      'project-setup': { survey_of: 'STANDS 271-339, 346-349 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A' },
      servitudes: {
        servitudes: [sv],
        portion: 'developed',
        header: { township: 'MAG1 SH2', surveyorName: 'F.C.', date: '2026-07-14' },
      },
    }, certParcels)

    expect(input).toBeDefined()
    expect(input!.header.surveyOf).toBe('STANDS 271-339, 346-349 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A')
  })
})
