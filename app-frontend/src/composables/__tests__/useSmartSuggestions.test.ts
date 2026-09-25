import { describe, it, expect } from 'vitest'
import { useSmartSuggestions } from '../useSmartSuggestions'
import { REPORT_PATTERNS } from '../../data/reportPatterns'

const TRIGS = ['176/P (Kenyani)', '170/P (Mnyami)', '50/T (Thornhill)', '49/T (Christmas Gift)']

describe('useSmartSuggestions survey basis wording', () => {
  it('composes the trig list with a natural A, B and C join', () => {
    const { getSurveyBasisSuggestions } = useSmartSuggestions()
    const suggestions = getSurveyBasisSuggestions('private-land', TRIGS, 'Trimble R8 GNSS', '29')
    const trigTemplate = suggestions.find(s => s.text.includes('Trigonometrical beacons'))
    expect(trigTemplate?.text).toContain(
      'Trigonometrical beacons 176/P (Kenyani), 170/P (Mnyami), 50/T (Thornhill) and 49/T (Christmas Gift), using Trimble R8 GNSS equipment'
    )
  })

  it('handles a single trig without the and-connector', () => {
    const { getSurveyBasisSuggestions } = useSmartSuggestions()
    const suggestions = getSurveyBasisSuggestions('mining-lease', ['176/P (Kenyani)'])
    const trigTemplate = suggestions.find(s => s.text.includes('Trigonometrical beacons'))
    expect(trigTemplate?.text).toContain('Trigonometrical beacons 176/P (Kenyani)')
    expect(trigTemplate?.text).not.toMatch(/\d \(.+\) and/)
  })

  it('swaps the old Trig system phrasing for Survey-based wording', () => {
    const { getSurveyBasisSuggestions } = useSmartSuggestions()
    const suggestions = getSurveyBasisSuggestions('replacement', ['SR 123/45'])
    const texts = suggestions.map(s => s.text)
    expect(texts).not.toContain('Trig system as per original survey')
    expect(texts.join(' ')).toContain('Survey based on original survey')
  })

  it('no report-pattern basis template retains the Trig system phrasing', () => {
    expect(Object.values(REPORT_PATTERNS).every(p =>
      p.surveyBasisTemplates.every(t => !/Trig system|Trigs /i.test(t))
    )).toBe(true)
  })
})