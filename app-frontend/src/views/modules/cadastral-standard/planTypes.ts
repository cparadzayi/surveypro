import type { PlanFamily } from '@/utils/recordComposition'

export type PlanType =
  | 'general-undeveloped'
  | 'general-developed'
  | 'diagram'
  | 'working-plan'

export type SubjectMode = 'whole-set' | 'single-parcel'

export interface PlanTypeMeta {
  key: PlanType
  /** User-facing label; also drives the Generate button text. */
  label: string
  /** single-parcel ⇒ the user must click one parcel; whole-set ⇒ all parcels. */
  subjectMode: SubjectMode
  /** Whether to also emit the plan-statistics summary PDF in the bundle. */
  includesSummary: boolean
  /** Product family, for record-composition gating. Working plans are never gated. */
  family: PlanFamily
}

export const PLAN_TYPE_META: Record<PlanType, PlanTypeMeta> = {
  'general-undeveloped': {
    key: 'general-undeveloped',
    label: 'General Plan (Undeveloped Portion)',
    subjectMode: 'whole-set',
    includesSummary: true,
    family: 'general',
  },
  'general-developed': {
    key: 'general-developed',
    label: 'General Plan (Developed Portion)',
    subjectMode: 'whole-set',
    includesSummary: true,
    family: 'general',
  },
  diagram: {
    key: 'diagram',
    label: 'Diagram',
    subjectMode: 'single-parcel',
    includesSummary: false,
    family: 'diagram',
  },
  'working-plan': {
    key: 'working-plan',
    label: 'Working Plan',
    subjectMode: 'whole-set',
    includesSummary: false,
    family: 'working',
  },
}

export function getPlanTypeMeta(planType: string): PlanTypeMeta {
  return PLAN_TYPE_META[planType as PlanType] ?? PLAN_TYPE_META['general-undeveloped']
}
