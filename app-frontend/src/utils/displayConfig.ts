// Centralized display configuration for DMS formatting and related UI policies.
// This keeps the app future-proof for contexts like mining/engineering/topo that
// may require non-integer seconds and different separators.

export type DMSContext = 'default' | 'mining' | 'engineering' | 'topo' | 'conversions'

export interface DMSDisplayPolicy {
  secondsDecimals: number; // 0 for integer seconds; >0 for fractional seconds
  separator: ':' | ';'; // primary display separator
}

const POLICIES: Record<DMSContext, DMSDisplayPolicy> = {
  default: { secondsDecimals: 0, separator: ':' },
  mining: { secondsDecimals: 2, separator: ':' },
  engineering: { secondsDecimals: 2, separator: ':' },
  topo: { secondsDecimals: 1, separator: ':' },
  conversions: { secondsDecimals: 3, separator: ':' }
}

export function getDMSPolicy(ctx: DMSContext = 'default'): DMSDisplayPolicy {
  return POLICIES[ctx] || POLICIES.default
}

// Area display policy (Zimbabwe convention):
// - If area >= 10,000 m², display in hectares to 4 decimal places
// - If area < 10,000 m², display in square meters to 0 decimal places (nearest m²)
export interface AreaDisplayPolicy {
  thresholdMeters: number; // switch point between m² and hectares
  metersDecimals: number;  // decimals for m²
  hectaresDecimals: number; // decimals for hectares
}

const AREA_POLICY_ZIM: AreaDisplayPolicy = {
  thresholdMeters: 10000,
  metersDecimals: 0,
  hectaresDecimals: 4,
}

export function getAreaPolicy(): AreaDisplayPolicy {
  return AREA_POLICY_ZIM
}
