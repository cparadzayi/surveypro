import { describe, it, expect } from 'vitest'
import { dsgCertificateFromWorkflow } from '../useDSGCertificate'

const savedCert = {
  surveyOf: 'STANDS 109-166, 257-267, 274, 278-281, 297-318 AD VALOREM TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A, SHABANI DISTRICT',
  surveyorName: 'O. SAUNYAMA',
  licenseNumber: 'LS/2024/001',
  statement1: 'The consistency of data has been checked directly from the General Plan.',
  statement2: 'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
  statement3: 'All beacons shown on the diagrams have been placed and checked.',
  statement4: 'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
  surveyorTitle: 'LAND SURVEYOR (Zim)',
  additionalNotes: '',
  date: '2026-09-25',
  formReference: 'DSG/1/96',
}

describe('dsgCertificateFromWorkflow', () => {
  it('rebuilds the certificate data from persisted step_data', () => {
    const cert = dsgCertificateFromWorkflow({ 'dsg-certificate': { certificate_data: savedCert } })
    expect(cert).toBeDefined()
    expect(cert!.surveyOf).toContain('SHABANI MINE')
    expect(cert!.surveyorName).toBe('O. SAUNYAMA')
    expect(cert!.statement1).toContain('General Plan')
    expect(cert!.formReference).toBe('DSG/1/96')
  })

  it('returns undefined when there is no step_data or no certificate_data', () => {
    expect(dsgCertificateFromWorkflow(undefined)).toBeUndefined()
    expect(dsgCertificateFromWorkflow(null)).toBeUndefined()
    expect(dsgCertificateFromWorkflow({})).toBeUndefined()
    expect(dsgCertificateFromWorkflow({ 'dsg-certificate': {} })).toBeUndefined()
  })

  it('returns undefined when a required field is blank', () => {
    expect(dsgCertificateFromWorkflow({
      'dsg-certificate': { certificate_data: { ...savedCert, surveyorName: '' } },
    })).toBeUndefined()
    expect(dsgCertificateFromWorkflow({
      'dsg-certificate': { certificate_data: { ...savedCert, statement2: ' ' } },
    })).toBeUndefined()
  })

  it('applies sensible defaults for optional fields', () => {
    const cert = dsgCertificateFromWorkflow({
      'dsg-certificate': { certificate_data: { ...savedCert, surveyorTitle: '', date: '' } },
    })
    expect(cert!.surveyorTitle).toBe('LAND SURVEYOR (Zim)')
    expect(cert!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})