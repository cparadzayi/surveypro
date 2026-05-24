/**
 * Smart Suggestions Composable
 * Provides intelligent auto-complete and suggestions for Report on Survey
 */

import { ref, computed } from 'vue'
import { REPORT_PATTERNS, COMMON_PHRASES, EQUIPMENT_PHRASES, COORDINATE_SYSTEMS } from '../data/reportPatterns'
import type { ReportOnSurveyData } from '../types/cadastral'

export interface Suggestion {
  text: string
  category: 'template' | 'phrase' | 'auto'
  confidence: number
}

export function useSmartSuggestions() {
  const activeSuggestions = ref<Suggestion[]>([])
  const showSuggestions = ref(false)

  /**
   * Get purpose suggestions based on survey type
   */
  function getPurposeSuggestions(
    surveyType: string,
    reference?: string,
    date?: string
  ): Suggestion[] {
    const patterns = REPORT_PATTERNS[surveyType]
    if (!patterns) return []

    const suggestions: Suggestion[] = []
    const currentDate = date || new Date().toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    })

    patterns.purposeTemplates.forEach(template => {
      let text = template
        .replace('{date}', currentDate)
        .replace('{reference}', reference || '[Reference]')
        .replace('{permit}', reference || '[Permit Number]')
        .replace('{number}', '[Number]')
        .replace('{name}', '[Name]')
        .replace('{authority}', '[Authority]')
        .replace('{description}', '[Description]')
        .replace('{purpose}', '[Purpose]')
        .replace('{landType}', 'Private land')

      suggestions.push({
        text,
        category: 'template',
        confidence: 0.9
      })
    })

    return suggestions
  }

  /**
   * Get survey basis suggestions
   */
  function getSurveyBasisSuggestions(
    surveyType: string,
    controlPoints?: string[],
    equipment?: string,
    coordinateSystem?: string
  ): Suggestion[] {
    const patterns = REPORT_PATTERNS[surveyType]
    if (!patterns) return []

    const suggestions: Suggestion[] = []
    const trigList = controlPoints?.filter(p => 
      p.includes('Trig') || p.includes('/') || p.includes('P(')
    ).join(', ') || '[Trig List]'
    
    const degrees = coordinateSystem || '29'

    patterns.surveyBasisTemplates.forEach(template => {
      let text = template
        .replace('{degrees}', degrees)
        .replace('{trigList}', trigList)
        .replace('{station}', controlPoints?.[0] || '[Station]')
        .replace('{source}', '[Source]')
        .replace('{equipment}', equipment || '[Equipment]')
        .replace('{checkPoints}', controlPoints?.slice(0, 2).join(' and ') || '[Check Points]')
        .replace('{page}', '[Page Number]')
        .replace('{list}', controlPoints?.join(', ') || '[Control Points]')
        .replace('{srNumber}', '[SR Number]')

      suggestions.push({
        text,
        category: 'template',
        confidence: 0.85
      })
    })

    // Add equipment-specific phrases
    if (equipment) {
      Object.entries(EQUIPMENT_PHRASES).forEach(([key, phrase]) => {
        if (equipment.toLowerCase().includes(key.toLowerCase())) {
          suggestions.push({
            text: phrase,
            category: 'phrase',
            confidence: 0.8
          })
        }
      })
    }

    // Add calibration phrases
    COMMON_PHRASES.calibration.forEach(phrase => {
      suggestions.push({
        text: phrase.replace('{page}', '[Page Number]').replace('{source}', '[Source]').replace('{method}', '[Method]'),
        category: 'phrase',
        confidence: 0.75
      })
    })

    return suggestions
  }

  /**
   * Get found beacons suggestions
   */
  function getFoundBeaconsSuggestions(
    surveyType: string,
    hasFoundBeacons: boolean = false
  ): Suggestion[] {
    const patterns = REPORT_PATTERNS[surveyType]
    if (!patterns) return []

    const suggestions: Suggestion[] = []

    patterns.foundBeaconsTemplates.forEach(template => {
      let text = template
        .replace('{id}', '[Beacon ID]')
        .replace('{condition}', 'good')
        .replace('{list}', '[Beacon List]')
        .replace('{srNumber}', '[SR Number]')

      const confidence = template === 'NIL' && !hasFoundBeacons ? 0.95 : 0.7

      suggestions.push({
        text,
        category: 'template',
        confidence
      })
    })

    return suggestions
  }

  /**
   * Get placed beacons suggestions
   */
  function getPlacedBeaconsSuggestions(
    surveyType: string,
    context?: string
  ): Suggestion[] {
    const patterns = REPORT_PATTERNS[surveyType]
    if (!patterns) return []

    const suggestions: Suggestion[] = []

    patterns.placedBeaconsTemplates.forEach(template => {
      suggestions.push({
        text: template,
        category: 'template',
        confidence: 0.85
      })
    })

    // Add context-specific phrases
    if (context?.toLowerCase().includes('development')) {
      COMMON_PHRASES.existingDevelopments.forEach(phrase => {
        suggestions.push({
          text: phrase,
          category: 'phrase',
          confidence: 0.9
        })
      })
    }

    return suggestions
  }

  /**
   * Get comment suggestions
   */
  function getCommentSuggestions(
    surveyType: string,
    complexity: 'simple' | 'moderate' | 'complex' = 'simple'
  ): Suggestion[] {
    const patterns = REPORT_PATTERNS[surveyType]
    if (!patterns) return []

    const suggestions: Suggestion[] = []

    patterns.commentTemplates.forEach(template => {
      suggestions.push({
        text: template,
        category: 'template',
        confidence: complexity === 'simple' ? 0.9 : 0.7
      })
    })

    // Add common straightforward phrases
    if (complexity === 'simple') {
      COMMON_PHRASES.straightforward.forEach(phrase => {
        suggestions.push({
          text: phrase,
          category: 'phrase',
          confidence: 0.85
        })
      })
    }

    return suggestions
  }

  /**
   * Generate smart auto-complete based on partial input
   */
  function getAutoComplete(
    field: string,
    partialText: string,
    context: any
  ): Suggestion[] {
    if (!partialText || partialText.length < 3) return []

    const allSuggestions: Suggestion[] = []
    const lowerText = partialText.toLowerCase()

    // Search through all patterns
    Object.values(REPORT_PATTERNS).forEach(pattern => {
      Object.values(pattern).flat().forEach(template => {
        if (template.toLowerCase().includes(lowerText)) {
          allSuggestions.push({
            text: template,
            category: 'auto',
            confidence: 0.6
          })
        }
      })
    })

    // Search through common phrases
    Object.values(COMMON_PHRASES).flat().forEach(phrase => {
      if (phrase.toLowerCase().includes(lowerText)) {
        allSuggestions.push({
          text: phrase,
          category: 'auto',
          confidence: 0.65
        })
      }
    })

    // Sort by confidence and return top 5
    return allSuggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
  }

  /**
   * Get all suggestions for a field
   */
  function getSuggestionsForField(
    field: 'purpose' | 'surveyBasis' | 'foundBeacons' | 'placedBeacons' | 'comment',
    reportData: Partial<ReportOnSurveyData>,
    context?: any
  ): Suggestion[] {
    const surveyType = reportData.purpose?.type || 'private-land'

    switch (field) {
      case 'purpose':
        return getPurposeSuggestions(
          surveyType,
          reportData.purpose?.reference,
          context?.date
        )
      
      case 'surveyBasis':
        return getSurveyBasisSuggestions(
          surveyType,
          context?.controlPoints,
          context?.equipment,
          context?.coordinateSystem
        )
      
      case 'foundBeacons':
        return getFoundBeaconsSuggestions(
          surveyType,
          context?.hasFoundBeacons
        )
      
      case 'placedBeacons':
        return getPlacedBeaconsSuggestions(
          surveyType,
          context?.developmentContext
        )
      
      case 'comment':
        return getCommentSuggestions(
          surveyType,
          context?.complexity || 'simple'
        )
      
      default:
        return []
    }
  }

  /**
   * Apply a suggestion to the field
   */
  function applySuggestion(suggestion: Suggestion): string {
    return suggestion.text
  }

  /**
   * Show suggestions for a field
   */
  function showSuggestionsFor(
    field: string,
    reportData: Partial<ReportOnSurveyData>,
    context?: any
  ) {
    activeSuggestions.value = getSuggestionsForField(
      field as any,
      reportData,
      context
    )
    showSuggestions.value = activeSuggestions.value.length > 0
  }

  /**
   * Hide suggestions
   */
  function hideSuggestions() {
    showSuggestions.value = false
  }

  /**
   * Clear suggestions
   */
  function clearSuggestions() {
    activeSuggestions.value = []
    showSuggestions.value = false
  }

  return {
    // State
    activeSuggestions,
    showSuggestions,

    // Methods
    getPurposeSuggestions,
    getSurveyBasisSuggestions,
    getFoundBeaconsSuggestions,
    getPlacedBeaconsSuggestions,
    getCommentSuggestions,
    getAutoComplete,
    getSuggestionsForField,
    applySuggestion,
    showSuggestionsFor,
    hideSuggestions,
    clearSuggestions
  }
}
