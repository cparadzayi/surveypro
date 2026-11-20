export type AlignmentBand = 'on-line' | 'may-stay' | 'correct'
export interface AlignmentResult {
  beacon: string
  from: string
  to: string
  offset: number
  d: number
  nearest: string
  limit: number
  moveLimit: number
  band: AlignmentBand
}
export const ALIGNMENT_MAX_M: number
export function alignmentLimits(d: number): { limit: number; moveLimit: number }
export function alignmentBand(offset: number, d: number): AlignmentBand
export function beaconAlignment(input: {
  rings: string[][]
  points: Map<string, { y?: number; x?: number; Y?: number; X?: number }>
  isParent: (name: string) => boolean
  connections?: { fromBeacon: string; toBeacon: string }[]
}): AlignmentResult[]
export function describeAlignment(r: AlignmentResult): string
