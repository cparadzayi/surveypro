import { computed } from 'vue'
import { getDMSPolicy, DMSContext } from '../utils/displayConfig'
import { decimalToDMS, dmsToDecimal, carryDMS, formatDMS, parseFlexibleNumberOrDMS } from '../utils/dms'

export function useDMSPolicy(context: DMSContext = 'default') {
  const policy = computed(() => getDMSPolicy(context))

  function formatDegrees(decimalDegrees: number) {
    const dms = decimalToDMS(decimalDegrees)
    return formatDMS(dms, policy.value.secondsDecimals, policy.value.separator)
  }

  function parseDegrees(input: string): number | null {
    return parseFlexibleNumberOrDMS(input)
  }

  function normalizeDMS(d: number, m: number, s: number) {
    return carryDMS({ D: d, M: m, S: s })
  }

  return {
    policy,
    formatDegrees,
    parseDegrees,
    normalizeDMS,
  }
}
