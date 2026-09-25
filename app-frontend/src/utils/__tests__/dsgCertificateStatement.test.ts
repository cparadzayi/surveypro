import { describe, it, expect } from 'vitest'
import {
  statement1ForComposition,
  statement2ForComposition,
  statement3ForComposition,
  certificationStatementsForComposition,
  composeCertificateSurveyOf,
} from '../../data/dsgCertificatePatterns'
import type { RecordComposition } from '../recordComposition'

const DIAGRAMS_ONLY: RecordComposition = { includesDiagrams: true, includesGeneralPlans: false, source: 'confirmed' }
const GENERAL_ONLY: RecordComposition = { includesDiagrams: false, includesGeneralPlans: true, source: 'confirmed' }
const BOTH: RecordComposition = { includesDiagrams: true, includesGeneralPlans: true, source: 'confirmed' }

describe('statement1ForComposition', () => {
  it('names Diagrams for a diagrams-only record', () => {
    expect(statement1ForComposition(DIAGRAMS_ONLY))
      .toBe('The consistency of data has been checked directly from the Diagrams.')
  })

  it('names General Plans for a general-plan-only record', () => {
    expect(statement1ForComposition(GENERAL_ONLY))
      .toBe('The consistency of data has been checked directly from General Plans.')
  })

  it('names both for a split record', () => {
    expect(statement1ForComposition(BOTH))
      .toBe('The consistency of data has been checked directly from the Diagrams and General Plans.')
  })

  it('ignores the source flag — an inference drives the wording the same way', () => {
    expect(statement1ForComposition({ ...GENERAL_ONLY, source: 'inferred' }))
      .toBe('The consistency of data has been checked directly from General Plans.')
  })

  it('keeps the legacy General-Plan default when the composition is unusable', () => {
    expect(statement1ForComposition(null))
      .toBe('The consistency of data has been checked directly from the General Plan.')
    expect(statement1ForComposition(undefined)).toBe(statement1ForComposition(null))
    expect(statement1ForComposition({ includesDiagrams: false, includesGeneralPlans: false, source: 'inferred' }))
      .toBe(statement1ForComposition(null))
  })
})

describe('statement2ForComposition', () => {
  it('keeps the diagrams wording for a diagrams-only record', () => {
    expect(statement2ForComposition(DIAGRAMS_ONLY)).toContain('appearing on the diagrams have been checked')
  })

  it('rewords to the general plan for a general-plan-only record', () => {
    expect(statement2ForComposition(GENERAL_ONLY))
      .toBe('The coordinates of beacons appearing on the general plan have been checked against the coordinate list and calculations of the fixes of beacons.')
  })

  it('names both sources for a split record', () => {
    expect(statement2ForComposition(BOTH))
      .toBe('The coordinates of beacons appearing on the diagrams and the general plan have been checked against the coordinate list and calculations of the fixes of beacons.')
  })

  it('falls back to the legacy default when the composition is unusable', () => {
    expect(statement2ForComposition(null))
      .toBe('The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.')
  })
})

describe('statement3ForComposition', () => {
  it('keeps the diagrams wording for a diagrams-only record', () => {
    expect(statement3ForComposition(DIAGRAMS_ONLY)).toContain('shown on the diagrams have been placed and checked')
  })

  it('rewords to the general plan for a general-plan-only record', () => {
    expect(statement3ForComposition(GENERAL_ONLY))
      .toBe('All beacons shown on the general plan have been placed and checked.')
  })

  it('names both sources for a split record', () => {
    expect(statement3ForComposition(BOTH))
      .toBe('All beacons shown on the diagrams and the general plan have been placed and checked.')
  })

  it('falls back to the legacy default when the composition is unusable', () => {
    expect(statement3ForComposition(null))
      .toBe('All beacons shown on the diagrams have been placed and checked.')
  })
})

describe('certificationStatementsForComposition', () => {
  it('resolves all three statements consistently for a general-plan-only record', () => {
    const statements = certificationStatementsForComposition(GENERAL_ONLY)
    expect(statements).toEqual({
      statement1: 'The consistency of data has been checked directly from General Plans.',
      statement2: 'The coordinates of beacons appearing on the general plan have been checked against the coordinate list and calculations of the fixes of beacons.',
      statement3: 'All beacons shown on the general plan have been placed and checked.',
    })
  })

  it('resolves the diagrams-only defaults together', () => {
    const statements = certificationStatementsForComposition(DIAGRAMS_ONLY)
    expect(statements.statement1).toContain('from the Diagrams.')
    expect(statements.statement2).toContain('appearing on the diagrams have been checked')
    expect(statements.statement3).toContain('shown on the diagrams have been placed and checked')
  })
})

describe('composeCertificateSurveyOf', () => {
  it('renders the digitized stand range in all caps with the OF parent join', () => {
    const surveyOf = composeCertificateSurveyOf({
      standNames: ['403', '404', '405'],
      township: 'Brackenhurst Township',
      parentProperty: 'Stand 87 Brackenhurst Township',
    })
    expect(surveyOf).toBe('STANDS 403-405 BRACKENHURST TOWNSHIP OF STAND 87 BRACKENHURST TOWNSHIP')
  })

  it('closes the designation with the district, replacing the portion clause', () => {
    const surveyOf = composeCertificateSurveyOf({
      standNames: ['403', '404', '405'],
      township: 'Brackenhurst Township',
      parentProperty: 'Stand 87 Brackenhurst Township',
      wholePortion: 'a portion',
      district: 'Gwelo',
    })
    expect(surveyOf).toBe('STANDS 403-405 BRACKENHURST TOWNSHIP OF STAND 87 BRACKENHURST TOWNSHIP, GWELO DISTRICT')
    expect(surveyOf).not.toContain('being')
  })

  it('prints the wholePortion clause only when no district is known', () => {
    const surveyOf = composeCertificateSurveyOf({
      standNames: ['403', '404', '405'],
      township: 'Brackenhurst Township',
      parentProperty: 'Stand 87 Brackenhurst Township',
      wholePortion: 'the remainder',
    })
    expect(surveyOf.endsWith('BRACKENHURST TOWNSHIP, BEING THE REMAINDER')).toBe(true)
  })

  it('uses STAND (singular) for a single stand', () => {
    const surveyOf = composeCertificateSurveyOf({
      standNames: ['12'],
      township: 'Marlborough Township',
    })
    expect(surveyOf).toBe('STAND 12 MARLBOROUGH TOWNSHIP')
  })

  it('separates several ranges with commas after the STANDS label', () => {
    const surveyOf = composeCertificateSurveyOf({
      standNames: ['3', '5', '7'],
      township: 'Borrowdale Township',
    })
    expect(surveyOf).toBe('STANDS 3, 5, 7 BORROWDALE TOWNSHIP')
  })

  it('falls back to the authored designation when no stands or township exist', () => {
    const surveyOf = composeCertificateSurveyOf({
      fallbackSurveyOf: 'Stand 403-405 Brackenhurst Township',
    })
    expect(surveyOf).toBe('Stand 403-405 Brackenhurst Township')
  })
})