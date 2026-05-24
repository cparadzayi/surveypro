/**
 * DSG Certificate Smart Suggestions Composable
 * 
 * Provides AI/ML-powered suggestions for DSG Certificate generation
 * Based on survey type, project data, and professional templates
 */

import { DSG_CERTIFICATE_PATTERNS, DSG_COMMON_PHRASES } from '@/data/dsgCertificatePatterns'

export interface DSGSuggestion {
  text: string
  confidence: number
  category: 'template' | 'phrase' | 'auto'
  metadata?: {
    surveyType?: string
    field?: string
  }
}

/**
 * Get Survey Of suggestions based on survey type and project data
 */
export function getSurveyOfSuggestions(
  surveyType: string,
  projectData: {
    standNumbers?: string
    township?: string
    district?: string
    name?: string
    number?: string
    description?: string
    municipality?: string
    type?: string
    standNumber?: string
  }
): DSGSuggestion[] {
  const patterns = DSG_CERTIFICATE_PATTERNS[surveyType]
  if (!patterns) {
    return []
  }

  const suggestions: DSGSuggestion[] = []

  // Generate suggestions from templates
  patterns.surveyOfTemplates.forEach((template, index) => {
    let text = template
    let confidence = 95 - (index * 3) // Decrease confidence for later templates

    // Replace variables with actual data
    if (projectData.standNumbers) {
      text = text.replace('{standNumbers}', projectData.standNumbers)
      confidence += 5
    }
    if (projectData.township) {
      text = text.replace('{township}', projectData.township.toUpperCase())
      confidence += 3
    }
    if (projectData.district) {
      text = text.replace('{district}', projectData.district.toUpperCase())
      confidence += 3
    }
    if (projectData.name) {
      text = text.replace('{name}', projectData.name.toUpperCase())
      confidence += 5
    }
    if (projectData.number) {
      text = text.replace('{number}', projectData.number)
      confidence += 3
    }
    if (projectData.description) {
      text = text.replace('{description}', projectData.description.toUpperCase())
      confidence += 3
    }
    if (projectData.municipality) {
      text = text.replace('{municipality}', projectData.municipality.toUpperCase())
      confidence += 3
    }
    if (projectData.type) {
      text = text.replace('{type}', projectData.type.toUpperCase())
      confidence += 3
    }
    if (projectData.standNumber) {
      text = text.replace('{standNumber}', projectData.standNumber)
      confidence += 3
    }

    // Only add if we have some actual data filled in
    const hasData = !text.includes('{')
    if (hasData || index === 0) {
      suggestions.push({
        text,
        confidence: Math.min(confidence, 95),
        category: 'template',
        metadata: {
          surveyType,
          field: 'surveyOf'
        }
      })
    }
  })

  return suggestions.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Get Statement 1 suggestions (Data consistency check)
 */
export function getStatement1Suggestions(
  surveyType: string
): DSGSuggestion[] {
  const patterns = DSG_CERTIFICATE_PATTERNS[surveyType]
  if (!patterns) {
    return []
  }

  return patterns.certificationStatements.statement1.map((text, index) => ({
    text,
    confidence: 90 - (index * 3),
    category: 'template' as const,
    metadata: {
      surveyType,
      field: 'statement1'
    }
  }))
}

/**
 * Get Statement 2 suggestions (Coordinate verification)
 */
export function getStatement2Suggestions(
  surveyType: string
): DSGSuggestion[] {
  const patterns = DSG_CERTIFICATE_PATTERNS[surveyType]
  if (!patterns) {
    return []
  }

  return patterns.certificationStatements.statement2.map((text, index) => ({
    text,
    confidence: 90 - (index * 3),
    category: 'template' as const,
    metadata: {
      surveyType,
      field: 'statement2'
    }
  }))
}

/**
 * Get Statement 3 suggestions (Beacon placement verification)
 */
export function getStatement3Suggestions(
  surveyType: string
): DSGSuggestion[] {
  const patterns = DSG_CERTIFICATE_PATTERNS[surveyType]
  if (!patterns) {
    return []
  }

  return patterns.certificationStatements.statement3.map((text, index) => ({
    text,
    confidence: 90 - (index * 3),
    category: 'template' as const,
    metadata: {
      surveyType,
      field: 'statement3'
    }
  }))
}

/**
 * Get Statement 4 suggestions (Overall satisfaction)
 */
export function getStatement4Suggestions(
  surveyType: string
): DSGSuggestion[] {
  const patterns = DSG_CERTIFICATE_PATTERNS[surveyType]
  if (!patterns) {
    return []
  }

  return patterns.certificationStatements.statement4.map((text, index) => ({
    text,
    confidence: 90 - (index * 3),
    category: 'template' as const,
    metadata: {
      surveyType,
      field: 'statement4'
    }
  }))
}

/**
 * Get surveyor title suggestions
 */
export function getSurveyorTitleSuggestions(
  surveyType: string
): DSGSuggestion[] {
  const patterns = DSG_CERTIFICATE_PATTERNS[surveyType]
  if (!patterns) {
    return []
  }

  return patterns.surveyorTitles.map((text, index) => ({
    text,
    confidence: 85 - (index * 5),
    category: 'phrase' as const,
    metadata: {
      surveyType,
      field: 'surveyorTitle'
    }
  }))
}

/**
 * Get introduction suggestions
 */
export function getIntroductionSuggestions(
  surveyorName: string,
  licenseNumber?: string
): DSGSuggestion[] {
  return DSG_COMMON_PHRASES.introductions.map((template, index) => {
    let text = template.replace('{surveyorName}', surveyorName.toUpperCase())
    let confidence = 90 - (index * 5)

    if (licenseNumber) {
      text = text.replace('{licenseNumber}', licenseNumber)
      confidence += 5
    }

    return {
      text,
      confidence: Math.min(confidence, 95),
      category: 'template' as const,
      metadata: {
        field: 'introduction'
      }
    }
  })
}

/**
 * Get closing suggestions
 */
export function getClosingSuggestions(
  surveyorName: string,
  licenseNumber?: string
): DSGSuggestion[] {
  return DSG_COMMON_PHRASES.closings.map((template, index) => {
    let text = template.replace('{surveyorName}', surveyorName.toUpperCase())
    let confidence = 85 - (index * 5)

    if (licenseNumber) {
      text = text.replace('{licenseNumber}', licenseNumber)
      confidence += 5
    }

    return {
      text,
      confidence: Math.min(confidence, 95),
      category: 'phrase' as const,
      metadata: {
        field: 'closing'
      }
    }
  })
}

/**
 * Get additional notes suggestions
 */
export function getAdditionalNotesSuggestions(
  context: {
    meridian?: string
    equipment?: string
    trigList?: string[]
  }
): DSGSuggestion[] {
  return DSG_COMMON_PHRASES.additionalNotes.map((template, index) => {
    let text = template
    let confidence = 75 - (index * 3)

    if (context.meridian) {
      text = text.replace('{meridian}', context.meridian)
      confidence += 5
    }
    if (context.equipment) {
      text = text.replace('{equipment}', context.equipment)
      confidence += 5
    }
    if (context.trigList && context.trigList.length > 0) {
      text = text.replace('{trigList}', context.trigList.join(', '))
      confidence += 5
    }

    // Only include if variables are replaced or it's a general statement
    const hasUnreplacedVars = text.includes('{')
    if (!hasUnreplacedVars || index < 2) {
      return {
        text,
        confidence: Math.min(confidence, 85),
        category: 'phrase' as const,
        metadata: {
          field: 'additionalNotes'
        }
      }
    }
    return null
  }).filter(Boolean) as DSGSuggestion[]
}

/**
 * Get auto-complete suggestions for partial text
 */
export function getAutoCompleteSuggestions(
  field: string,
  partialText: string,
  surveyType: string
): DSGSuggestion[] {
  if (!partialText || partialText.length < 3) {
    return []
  }

  const patterns = DSG_CERTIFICATE_PATTERNS[surveyType]
  if (!patterns) {
    return []
  }

  const suggestions: DSGSuggestion[] = []
  const lowerPartial = partialText.toLowerCase()

  // Search in relevant field templates
  let templates: string[] = []
  
  switch (field) {
    case 'surveyOf':
      templates = patterns.surveyOfTemplates
      break
    case 'statement1':
      templates = patterns.certificationStatements.statement1
      break
    case 'statement2':
      templates = patterns.certificationStatements.statement2
      break
    case 'statement3':
      templates = patterns.certificationStatements.statement3
      break
    case 'statement4':
      templates = patterns.certificationStatements.statement4
      break
  }

  templates.forEach((template) => {
    if (template.toLowerCase().includes(lowerPartial)) {
      const confidence = 70 + (partialText.length * 2)
      suggestions.push({
        text: template,
        confidence: Math.min(confidence, 85),
        category: 'auto',
        metadata: {
          surveyType,
          field
        }
      })
    }
  })

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
}

/**
 * Generate complete DSG certificate suggestions based on workflow data
 */
export function generateCompleteCertificateSuggestions(
  surveyType: string,
  workflowData: {
    projectInfo?: any
    surveyorInfo?: any
    reportOnSurvey?: any
  }
): {
  surveyOf: DSGSuggestion[]
  statement1: DSGSuggestion[]
  statement2: DSGSuggestion[]
  statement3: DSGSuggestion[]
  statement4: DSGSuggestion[]
  surveyorTitle: DSGSuggestion[]
  introduction: DSGSuggestion[]
  closing: DSGSuggestion[]
  additionalNotes: DSGSuggestion[]
} {
  const projectData = {
    standNumbers: workflowData.reportOnSurvey?.purpose?.standNumbers,
    township: workflowData.reportOnSurvey?.purpose?.township,
    district: workflowData.projectInfo?.district,
    name: workflowData.projectInfo?.name,
    description: workflowData.reportOnSurvey?.purpose?.description
  }

  const surveyorName = workflowData.surveyorInfo?.landSurveyor || ''
  const licenseNumber = workflowData.surveyorInfo?.licenseNumber

  const context = {
    meridian: workflowData.projectInfo?.centralMeridian?.replace('Lo ', ''),
    equipment: 'Hi-Target GPS',
    trigList: workflowData.projectInfo?.controlPointIds || []
  }

  return {
    surveyOf: getSurveyOfSuggestions(surveyType, projectData),
    statement1: getStatement1Suggestions(surveyType),
    statement2: getStatement2Suggestions(surveyType),
    statement3: getStatement3Suggestions(surveyType),
    statement4: getStatement4Suggestions(surveyType),
    surveyorTitle: getSurveyorTitleSuggestions(surveyType),
    introduction: getIntroductionSuggestions(surveyorName, licenseNumber),
    closing: getClosingSuggestions(surveyorName, licenseNumber),
    additionalNotes: getAdditionalNotesSuggestions(context)
  }
}
