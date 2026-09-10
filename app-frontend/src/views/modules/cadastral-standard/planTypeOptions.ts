/**
 * The plan-type chooser's logic, extracted from the views so it can be unit-tested
 * (this repo has no component-mounting harness). Both the card picker in
 * SurveyPlanViewNew and the <select> in SurveyPlanMapView render from these.
 */
import { PLAN_TYPE_META, type PlanType } from './planTypes'
import { allowsFamily, type RecordComposition } from '@/utils/recordComposition'

export interface PlanTypeOption {
  value: PlanType
  label: string
  enabled: boolean
}

/** All four plan types in declaration order, each flagged enabled or not. */
export function planTypeOptionsFor(composition: RecordComposition | null): PlanTypeOption[] {
  return (Object.keys(PLAN_TYPE_META) as PlanType[]).map((value) => ({
    value,
    label: PLAN_TYPE_META[value].label,
    enabled: allowsFamily(composition, PLAN_TYPE_META[value].family),
  }))
}

/**
 * Keep a plan-type selection legal.
 *
 * `config.planType` is state independent of the composition, so confirming a
 * general-plans-only record while 'diagram' is selected would otherwise leave the
 * <select> sitting on a disabled option.
 */
export function normalizePlanTypeSelection(
  current: string,
  composition: RecordComposition | null
): PlanType {
  const options = planTypeOptionsFor(composition)
  const stillLegal = options.find((o) => o.value === current && o.enabled)
  if (stillLegal) return stillLegal.value
  const firstEnabled = options.find((o) => o.enabled)
  return firstEnabled ? firstEnabled.value : 'general-undeveloped'
}
