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
  adjoiningStand?: string         // party walls: the reciprocal stand's designation
  adjoiningSubjectId?: string     // party walls: the reciprocal parcel's id (shared-pattern capture)
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

/**
 * Every servitude touching `subjectId`: records that burden it (`subjectId`)
 * plus party walls it bears jointly with another parcel (`adjoiningSubjectId`).
 * A party-wall is by definition shared between the two parcels a building
 * straddles, so it must surface from either side of the boundary.
 */
export function servitudesInvolving(list: Servitude[], subjectId: string | number): Servitude[] {
  const pid = String(subjectId)
  return list.filter((x) => x.subjectId === pid || (x.type === 'party-wall' && x.adjoiningSubjectId === pid))
}

/** Display boundary for a servitude: the beacon pair when named, else the raw letter side. */
export function beaconBoundary(s: Servitude): string {
  if (s.fromBeacon && s.toBeacon) return `${s.fromBeacon} – ${s.toBeacon}`
  return s.side || ''
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

/**
 * The ring side that walks a given beacon-pair boundary, in either direction
 * (an adjoining ring sees the shared edge reversed, so both orders match).
 * Returns null when no side carries the pair. Used to find the reciprocal parcel
 * of a party wall and to auto-populate its adjoining stand.
 */
export function sideMatchingBeaconPair(
  sides: SubjectSide[], edges: any[], coordinatePoints: any[],
  pair: { fromBeacon: string; toBeacon: string },
): string | null {
  for (const sd of sides) {
    const cand = resolveBeaconPair(sides, edges, sd.side, coordinatePoints)
    if (!cand) continue
    if (
      (cand.fromBeacon === pair.fromBeacon && cand.toBeacon === pair.toBeacon) ||
      (cand.fromBeacon === pair.toBeacon && cand.toBeacon === pair.fromBeacon)
    ) return sd.side
  }
  return null
}

// Re-export for consumers that build the mirror (Task 2 adds functions here too).
export type { SideAnnotation }

/**
 * Rebuild the role:'servitude' mirror in a per-subject annotation map from the
 * servitude records (the single source of truth). road/contiguous entries are
 * left untouched. Each servitude entry carries servitudeId back to its record.
 *
 * A party wall is shared between two parcels, so when `adjoiningSideFor` is
 * given it also mirrors the wall onto the reciprocal parcel's own ring side —
 * both parcels then render/tag the shared boundary (the map needs the wall on
 * each side it is reachable from, while the record stays anchored to the
 * parcel it was first recorded on).
 */
export function syncServitudeMirror(
  annotationsBySubject: Record<string, SideAnnotation[]>,
  servitudes: Servitude[],
  adjoiningSideFor?: (s: Servitude) => { subjectId: string; side: string } | null,
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
    if (s.type === 'party-wall') {
      const reciprocal = adjoiningSideFor?.(s)
      if (reciprocal) {
        if (!out[reciprocal.subjectId]) out[reciprocal.subjectId] = []
        out[reciprocal.subjectId].push({ ...entry, side: reciprocal.side })
      }
    }
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
    // Prefer the adjoining parcel id (the shared-pattern capture — both parcels
    // are known by id), then fall back to the stored designation for records
    // saved before adjoiningSubjectId shipped.
    let adjoiningStand = s.adjoiningSubjectId ? standForParcel(String(s.adjoiningSubjectId)) : undefined
    if (!adjoiningStand) adjoiningStand = s.adjoiningStand
    if (adjoiningStand && !stands.includes(adjoiningStand)) stands.push(adjoiningStand)
    if (stands.length === 0) continue

    const boundary = beaconBoundary(s)
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
