/**
 * Join (reverse polar): the direction and distance from one point to another.
 *
 * Convention, as everywhere else in the app (zim-geo.js, surveyMath.js): Cape Lo P(Y, X), Y westing (+west),
 * X southing (+south); directions are south-oriented whole-circle, 0° = South, 90° = West, 180° = North,
 * 270° = East, from atan2(ΔY, ΔX). The distance is banker's-rounded to 2 dp and the direction to the whole
 * second, both from the full-precision figures, never from each other.
 */
import { bankersRound, decimalToDMS, formatDMS, normalizeDegrees360 } from './dms'

export interface PointYX { y: number; x: number }

export interface JoinResult {
  /** ΔY (westing) and ΔX (southing), full precision. */
  dy: number
  dx: number
  /** Distance, full precision and banker's-rounded to 2 dp. */
  distance: number
  distanceRounded: number
  /** Direction from A to B and from B to A, south-oriented decimal degrees [0, 360). */
  direction: number
  reverseDirection: number
  /** The two directions as D:MM:SS, seconds banker's-rounded. */
  directionDms: string
  reverseDirectionDms: string
}

const RAD = 180 / Math.PI

/** Direction and distance from A to B. Null when either point is not a pair of finite numbers or they coincide. */
export function joinPoints(a: PointYX, b: PointYX): JoinResult | null {
  if (![a?.y, a?.x, b?.y, b?.x].every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  const dy = b.y - a.y
  const dx = b.x - a.x
  const distance = Math.hypot(dy, dx)
  if (distance === 0) return null
  const direction = normalizeDegrees360(Math.atan2(dy, dx) * RAD)
  const reverseDirection = normalizeDegrees360(direction + 180)
  return {
    dy,
    dx,
    distance,
    distanceRounded: bankersRound(distance, 2),
    direction,
    reverseDirection,
    directionDms: formatDMS(decimalToDMS(direction), 0),
    reverseDirectionDms: formatDMS(decimalToDMS(reverseDirection), 0),
  }
}

/** Ground in Zimbabwe: a Cape Lo southing (X) runs to millions of metres, a westing (Y) to a few hundred thousand. */
const SOUTHING_MIN = 1_000_000

/**
 * Y and X of a point feature from the spatial layers. Their writers disagree on the order: the server's
 * compute and CSV import store [Y, X], the project-points export stores [X, Y]. The southing is the one in the
 * millions; when neither or both are (a local system), the server's [Y, X] is taken.
 */
export function featureYX(feature: { geometry?: { coordinates?: unknown } } | null | undefined): PointYX | null {
  const c = feature?.geometry?.coordinates
  if (!Array.isArray(c) || c.length < 2) return null
  const a = Number(c[0])
  const b = Number(c[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const aIsSouthing = Math.abs(a) >= SOUTHING_MIN
  const bIsSouthing = Math.abs(b) >= SOUTHING_MIN
  if (aIsSouthing && !bIsSouthing) return { y: b, x: a }
  return { y: a, x: b }
}
