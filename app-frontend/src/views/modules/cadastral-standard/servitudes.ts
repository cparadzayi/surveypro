import type { SideAnnotation, SubjectSide } from './sideAnnotations'
import { resolveBeaconNameForPoint } from '@/utils/beaconNameMatch'

export type ServitudeType =
  | 'party-wall' | 'right-of-way' | 'sewer' | 'water' | 'electricity'
  | 'storm-water' | 'pipeline' | 'telecom' | 'other'

export const SERVITUDE_TYPE_LABELS: Record<ServitudeType, string> = {
  'party-wall': 'Party wall',
  'right-of-way': 'Right of way',
  sewer: 'Sewer',
  water: 'Water',
  electricity: 'Electricity',
  'storm-water': 'Storm-water / drainage',
  pipeline: 'Pipeline',
  telecom: 'Telecom',
  other: 'Other',
}

export interface Servitude {
  id: string
  subjectId: string            // String(parcel.id) — the burdened stand's parcel
  side: string                 // 'BC' — same letter model as SubjectSide
  type: ServitudeType
  typeLabelOther?: string
  widthM?: number
  beneficiary?: string
  burdenedStand?: string
  adjoiningStand?: string       // party walls: the reciprocal stand
  purpose?: string
  statuteRef?: string
  fromBeacon?: string
  toBeacon?: string
}

export function newServitudeId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `sv_${Date.now()}_${Math.random().toString(36).slice(2)}`)
}

export function servitudeTypeLabel(s: Servitude): string {
  if (s.type === 'other') return s.typeLabelOther?.trim() || 'Other'
  return SERVITUDE_TYPE_LABELS[s.type]
}

export function upsertServitude(list: Servitude[], s: Servitude): Servitude[] {
  const out = list.filter((x) => x.id !== s.id)
  out.push(s)
  return out
}

export function removeServitude(list: Servitude[], id: string): Servitude[] {
  return list.filter((x) => x.id !== id)
}

export function servitudesForSubject(list: Servitude[], subjectId: string): Servitude[] {
  return list.filter((x) => x.subjectId === subjectId)
}

export function hydrateServitudes(raw: unknown): Servitude[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (x): x is Servitude =>
      !!x && typeof x === 'object' && typeof (x as any).id === 'string' &&
      typeof (x as any).subjectId === 'string' && typeof (x as any).side === 'string' &&
      typeof (x as any).type === 'string',
  )
}

/**
 * Map a letter side (e.g. 'BC') to its beacon-name pair using the parcel's
 * ring-ordered edges. `sides` (from subjectSides) and `edges` (metadata.edges)
 * are both in ring order, so the side's index indexes the edge. Endpoint names
 * are resolved via `resolveBeaconNameForPoint` — the edge's own id/name when
 * present and not a generic fallback (e.g. "BC"), else a spatial match against
 * `coordinatePoints`. Returns null when the side is unknown or either endpoint
 * has no beacon name.
 */
export function resolveBeaconPair(
  sides: SubjectSide[], edges: any[], side: string, coordinatePoints: any[] = [],
): { fromBeacon: string; toBeacon: string } | null {
  const idx = sides.findIndex((s) => s.side === side)
  if (idx < 0) return null
  const edge = edges?.[idx]
  if (!edge) return null
  const fromBeacon = resolveBeaconNameForPoint(edge.from, coordinatePoints)
  const toBeacon = resolveBeaconNameForPoint(edge.to, coordinatePoints)
  if (!fromBeacon || !toBeacon) return null
  return { fromBeacon, toBeacon }
}

// Re-export for consumers that build the mirror (Task 2 adds functions here too).
export type { SideAnnotation }

/**
 * Rebuild the role:'servitude' mirror in a per-subject annotation map from the
 * servitude records (the single source of truth). road/contiguous entries are
 * left untouched. Each servitude entry carries servitudeId back to its record.
 */
export function syncServitudeMirror(
  annotationsBySubject: Record<string, SideAnnotation[]>,
  servitudes: Servitude[],
): Record<string, SideAnnotation[]> {
  const out: Record<string, SideAnnotation[]> = {}
  for (const [subjectId, list] of Object.entries(annotationsBySubject)) {
    out[subjectId] = list.filter((a) => a.role !== 'servitude')
  }
  for (const s of servitudes) {
    const entry: SideAnnotation = {
      side: s.side,
      role: 'servitude',
      label: s.beneficiary || s.purpose || undefined,
      widthM: s.widthM,
      servitudeId: s.id,
    }
    if (!out[s.subjectId]) out[s.subjectId] = []
    out[s.subjectId].push(entry)
  }
  return out
}

/**
 * One-time migration: turn legacy role:'servitude' annotations (no servitudeId)
 * into Servitude records so pre-existing projects adopt the model. Type defaults
 * to 'party-wall' for the surveyor to confirm; the annotation label becomes purpose.
 */
export function backfillServitudesFromAnnotations(
  annotationsBySubject: Record<string, SideAnnotation[]>,
): Servitude[] {
  const out: Servitude[] = []
  for (const [subjectId, list] of Object.entries(annotationsBySubject)) {
    for (const a of list) {
      if (a.role === 'servitude' && !a.servitudeId) {
        out.push({
          id: newServitudeId(),
          subjectId,
          side: a.side,
          type: 'party-wall',
          widthM: a.widthM,
          purpose: a.label || undefined,
        })
      }
    }
  }
  return out
}

/**
 * A row of the General Plan party-wall servitude statement:
 * the stands bound by the wall and the wall's beacon-pair boundary.
 */
export interface PartyWallStatementRow {
  stands: string
  boundary: string
}

/**
 * Build the General Plan "party-wall servitude" statement table from the
 * servitude records (the single source of truth captured in the Servitudes
 * view). Only `party-wall` records contribute. Each row pairs the stands
 * involved (the burdened stand resolved via `standForParcel`, plus the
 * reciprocal `adjoiningStand`) with the wall boundary, using the record's
 * `fromBeacon`–`toBeacon` pair when the beacons are named, else the letter
 * side. Rows that resolve to the same stands + boundary are merged (a wall is
 * often recorded once per stand, so a single wall can otherwise appear twice).
 */
export function buildPartyWallStatementRows(
  servitudes: Servitude[],
  standForParcel: (parcelId: string) => string | null | undefined,
): PartyWallStatementRow[] {
  const rows: PartyWallStatementRow[] = []
  const seen = new Set<string>()
  const canonical = (stands: string[]) => [...stands].sort().join('|')

  for (const s of servitudes) {
    if (s.type !== 'party-wall') continue
    const subjectStand = standForParcel(String(s.subjectId))
    const stands: string[] = []
    if (subjectStand) stands.push(subjectStand)
    if (s.adjoiningStand && !stands.includes(s.adjoiningStand)) stands.push(s.adjoiningStand)
    if (stands.length === 0) continue

    const boundary = s.fromBeacon && s.toBeacon ? `${s.fromBeacon} - ${s.toBeacon}` : (s.side || '')
    // The same wall recorded from the reciprocal stand reverses the beacon
    // order ("2833A - 2833B" vs "2833B - 2833A"); sort the pair so both
    // collapse onto one row, while the DISPLAY keeps the recorded direction.
    const boundaryKey = s.fromBeacon && s.toBeacon
      ? [String(s.fromBeacon), String(s.toBeacon)].sort().join('|')
      : (s.side || '')
    const key = `${canonical(stands)}|${boundaryKey}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ stands: stands.join(', '), boundary })
  }
  return rows
}
