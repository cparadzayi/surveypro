/**
 * The beacon-comparison tool starts with SAMPLE_DATA (BM 001 - BM 008, Y ~50 000, X ~2 200 000) so the lite Compare
 * page has something to show. In the cadastral workflow that data must never become a survey's found beacons: it did
 * once, and a pack reached the Surveyor-General with BM 001 - BM 008 in its Beacon Comparison and Report on Survey.
 * These checks recognise it wherever it turns up.
 */
import { SAMPLE_DATA } from './surveyMath'

interface ComparisonRow { name?: string; yH?: number; xH?: number; yS?: number; xS?: number }
interface SampleRow { name: string; yH: number; xH: number; yS: number; xS: number }
const SAMPLE: SampleRow[] = SAMPLE_DATA

const same = (a: unknown, b: number) => Math.abs(Number(a) - b) < 1e-6

/** Names of the rows that are the sample network's own rows (name and all four figures). */
export function sampleRowsIn(rows: ComparisonRow[] | null | undefined): string[] {
  const out: string[] = []
  for (const r of rows ?? []) {
    const s = SAMPLE.find((p) => p.name === String(r?.name ?? '').trim())
    if (s && same(r.yH, s.yH) && same(r.xH, s.xH) && same(r.yS, s.yS) && same(r.xS, s.xS)) out.push(s.name)
  }
  return out
}

/** The report's found beacons (FoundBeacon shape) as comparison rows, so the same check applies to them. */
export function foundBeaconRows(beacons: any[] | null | undefined): ComparisonRow[] {
  return (beacons ?? []).map((b) => ({
    name: b?.beaconId,
    yH: b?.originalData?.coordinates?.y,
    xH: b?.originalData?.coordinates?.x,
    yS: b?.currentCoordinates?.y,
    xS: b?.currentCoordinates?.x,
  }))
}

/** A sentence naming the sample beacons found, or null when there are none. */
export function sampleDataProblem(rows: ComparisonRow[] | null | undefined, where: string): string | null {
  const names = sampleRowsIn(rows)
  if (names.length === 0) return null
  return `${where} holds the tool's sample beacons (${names.join(', ')}), not this survey's. ` +
    'Open Found Beacons, load the project\'s comparison CSV, run the comparison and save it, then generate again.'
}
