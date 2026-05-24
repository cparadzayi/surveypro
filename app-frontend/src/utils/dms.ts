// Shared DMS utilities for frontend (Zimbabwe south-oriented bearings UI)
// Policy:
// - Preferred separator: ':' (colon). Accept ';' for compatibility only when parsing strings.
// - No minutes/seconds >= 60. After rounding, carry seconds->minutes and minutes->degrees.
// - Degrees wrap to [0, 360) for bearings.

export interface DMS { D: number; M: number; S: number }

export function normalizeDegrees360(deg: number): number {
  return ((deg % 360) + 360) % 360
}

export function decimalToDMS(decimal: number): DMS {
  const d = normalizeDegrees360(decimal)
  const D = Math.floor(d)
  const mFloat = (d - D) * 60
  const M = Math.floor(mFloat)
  const S = (mFloat - M) * 60
  return { D, M, S }
}

export function dmsToDecimal({ D, M, S }: DMS): number {
  // Note: we assume inputs already respected non-negative mins/secs (<60) and D in [0,360) for bearings.
  const deg = normalizeDegrees360(D)
  return deg + (M || 0) / 60 + (S || 0) / 3600
}

// Strict version for UI validation: do not normalize; enforce valid ranges.
export function dmsToDecimalStrict({ D, M, S }: DMS): number | null {
  const d = Number(D), m = Number(M), s = Number(S)
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s)) return null
  if (d < 0 || d >= 360) return null
  if (m < 0 || m >= 60) return null
  if (s < 0 || s >= 60) return null
  return d + m / 60 + s / 3600
}

export function carryDMS({ D, M, S }: DMS): DMS {
  let d = D, m = M, s = S
  d = Number.isFinite(d) ? d : 0
  m = Number.isFinite(m) ? m : 0
  s = Number.isFinite(s) ? s : 0
  if (s >= 60) { const add = Math.floor(s / 60); s -= add * 60; m += add }
  if (s < 0) { const sub = Math.ceil(-s / 60); s += sub * 60; m -= sub }
  if (m >= 60) { const add = Math.floor(m / 60); m -= add * 60; d += add }
  if (m < 0) { const sub = Math.ceil(-m / 60); m += sub * 60; d -= sub }
  d = normalizeDegrees360(d)
  return { D: d, M: m, S: s }
}

export function formatDMS(dms: DMS, secondsDecimals = 0, sep = ':'): string {
  // Rounds seconds to given decimals, then applies carry and formats with sep.
  const Srounded = bankersRound(dms.S, secondsDecimals)
  const carried = carryDMS({ D: dms.D, M: dms.M, S: Srounded })
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const secStr = secondsDecimals > 0
    ? carried.S.toFixed(secondsDecimals).padStart(2 + 1 + secondsDecimals, '0')
    : pad2(Math.round(carried.S))
  return `${carried.D}${sep}${pad2(carried.M)}${sep}${secStr}`
}

export function parseDMSString(s: string): DMS | null {
  if (!s) return null
  const t = s.trim()
  if (!(t.includes(':') || t.includes(';'))) return null
  const parts = t.split(/[:;]/).map(p => p.trim())
  if (!parts[0]) return null
  const D = parseInt(parts[0], 10)
  const M = parts[1] ? parseInt(parts[1], 10) : 0
  const S = parts[2] ? Number(parts[2].replace(',', '.')) : 0
  if (!Number.isFinite(D) || !Number.isFinite(M) || !Number.isFinite(S)) return null
  if (Math.abs(M) >= 60 || Math.abs(S) >= 60) return null
  return { D, M, S }
}

export function parseFlexibleNumberOrDMS(s: string): number | null {
  if (!s) return null
  const fromDms = parseDMSString(s)
  if (fromDms) return dmsToDecimal(fromDms)
  // Fallback to decimal with comma accepted
  const n = Number(s.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Banker's rounding (round half to even) used for UI numeric formatting where applicable
export function bankersRound(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals)
  const n = value * factor
  const f = Math.floor(n)
  const r = n - f
  if (Math.abs(r - 0.5) < 1e-12) {
    return (f % 2 === 0 ? f : f + 1) / factor
  }
  return Math.round(n) / factor
}
