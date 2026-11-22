export type SurveyClass67 = 'A' | 'B' | 'C'
export interface ComparisonLine67 { from: string; to: string; fH: number; fS: number; diff: number; limit: number; judged: boolean; pass: boolean }
export interface ComparisonBeacon67 {
  name: string; dY: number; dX: number; resY: number; resX: number; residual: number
  failedLines: number; linesChecked: number; exempt: boolean; setAside: boolean
}
export interface ComparisonResult67 {
  surveyClass: SurveyClass67
  lines: ComparisonLine67[]
  beacons: ComparisonBeacon67[]
  shift: { dY: number; dX: number }
  swingSec: number
  setAside: string[]
  unresolved: { from: string; to: string }[]
  /** Lines still fail among the beacons left: no beacon can be singled out. */
  networkWide: boolean
  /** The original co-ordinates are in another system (more than 1 km away or turned more than 1 degree). */
  otherSystem: boolean
  linesFailing: number
}
export const PARA_7_5_K: Record<SurveyClass67, number>
export function para75Limit(f: number, cls?: SurveyClass67 | string): number
export function compareCoordinates67(
  points: { name: string; yH: number; xH: number; yS: number; xS: number }[],
  cls?: SurveyClass67 | string,
  opts?: { exempt?: Iterable<string> },
): ComparisonResult67
export function comparisonConclusion(result: ComparisonResult67): string
