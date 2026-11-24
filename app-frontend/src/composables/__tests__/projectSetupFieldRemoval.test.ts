/**
 * "Original Area of Parent Property (m²)" was removed from Project Setup: the
 * parent's area comes from its geometry, not from a typed project detail. A
 * field that survives in any link of the save/load chain would keep showing up
 * in documents and workflow state, so pin its absence at each link.
 */

import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const chain = [
  '../../views/modules/cadastral-standard/ProjectSetupView.vue',
  '../../views/modules/cadastral-standard/CadastralStandardView.vue',
  '../useCadastralWorkflow.ts',
  '../../views/modules/cadastral-standard/SurveyPlanViewNew.vue',
  '../../views/modules/cadastral-standard/SurveyPlanMapView.vue',
  '../../services/geopdf.ts',
  '../../types/cadastral.ts',
]

describe('project setup no longer collects a typed parent area', () => {
  it.each(chain)('%s has no parent-area field', (path) => {
    expect(source(path)).not.toMatch(/parentArea|parent_area|Original Area of Parent Property/i)
  })
})
