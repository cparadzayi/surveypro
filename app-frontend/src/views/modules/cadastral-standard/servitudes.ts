import type { SideAnnotation, SubjectSide } from './sideAnnotations'

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

const beaconOf = (pt: any): string | null => (pt?.id || pt?.name || null)

/**
 * Map a letter side (e.g. 'BC') to its beacon-name pair using the parcel's
 * ring-ordered edges. `sides` (from subjectSides) and `edges` (metadata.edges)
 * are both in ring order, so the side's index indexes the edge. Returns null
 * when the side is unknown or the edge endpoints have no beacon name.
 */
export function resolveBeaconPair(
  sides: SubjectSide[],
  edges: any[],
  side: string,
): { fromBeacon: string; toBeacon: string } | null {
  const idx = sides.findIndex((s) => s.side === side)
  if (idx < 0) return null
  const edge = edges?.[idx]
  if (!edge) return null
  const fromBeacon = beaconOf(edge.from)
  const toBeacon = beaconOf(edge.to)
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
