/**
 * Annotation subjects for a SPLIT outside figure.
 *
 * A stored cut turns the one outside figure into one part per sheet, and each
 * part has its own perimeter, its own vertex letters (A.. in that part's ring)
 * and its own abutters. So each sheet's figure is a subject in its own right:
 * its tags are keyed by a sheet-subject id (never by the whole figure's parcel
 * id, whose side letters belong to the unsplit ring) and travel to the renderers
 * with the sheet number, so a sheet draws only its own.
 *
 * Pure -- no Vue, no map -- so selection and persistence are testable.
 */
import { figureLabel } from '../../../../../app-shared/sheetDerivation'
import type { SideAnnotation } from './sideAnnotations'

const SEP = '#sheet'

export interface SheetRingInput {
  sheetNumber: number
  totalSheets: number
  /** The sheet's part of the figure, open, Lo metres (y westing, x southing). */
  ring: Array<{ y: number; x: number }>
}

export interface SheetSubject {
  /** Key under which this sheet's side annotations are stored. */
  id: string
  sheetNumber: number
  totalSheets: number
  /** "Outside Figure Sheet 2". */
  label: string
  /** Closed ring in the parcel `geom` axis order ([Southing, Westing]) so it can be
   *  treated exactly like a parcel's own geometry. */
  ring: [number, number][]
}

export function sheetSubjectId(outsideFigureId: string | number, sheetNumber: number): string {
  return `${outsideFigureId}${SEP}${sheetNumber}`
}

/** The sheet number a sheet-subject id names, or null for any other id. */
export function parseSheetSubjectId(id: string | number | null | undefined): number | null {
  if (id == null) return null
  const m = new RegExp(`${SEP}(\\d+)$`).exec(String(id))
  return m ? Number(m[1]) : null
}

/** One subject per sheet. Fewer than two sheets is not a split: no sheet subjects,
 *  and the single outside figure stays the subject exactly as before. */
export function buildSheetSubjects(
  outsideFigureId: string | number | null,
  sheets: SheetRingInput[] | undefined | null,
): SheetSubject[] {
  if (outsideFigureId == null || !Array.isArray(sheets) || sheets.length < 2) return []
  const out: SheetSubject[] = []
  for (const s of [...sheets].sort((a, b) => a.sheetNumber - b.sheetNumber)) {
    const pts = (s.ring ?? []).filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    if (pts.length < 3) continue
    const ring = pts.map(p => [p.x, p.y] as [number, number])
    ring.push([...ring[0]] as [number, number])
    out.push({
      id: sheetSubjectId(outsideFigureId, s.sheetNumber),
      sheetNumber: s.sheetNumber,
      totalSheets: s.totalSheets,
      label: figureLabel(s.sheetNumber, s.totalSheets),
      ring,
    })
  }
  return out
}

/** Even-odd containment in any consistent 2-D frame. */
export function pointInRing(pt: [number, number], ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** The sheet whose figure holds `pt`, given rings in the same frame as `pt`
 *  (the caller passes WGS84 rings for a map click). Null when none does. */
export function sheetSubjectAt(
  pt: [number, number],
  subjects: Array<{ id: string; ring: [number, number][] }>,
): string | null {
  for (const s of subjects) if (pointInRing(pt, s.ring)) return s.id
  return null
}

export interface AdjoiningSubject {
  subjectId: string
  ring: [number, number][]
  annotations: SideAnnotation[]
  sheetNumber?: number
}

/**
 * The per-subject set sent to the renderers.
 *
 * On a split figure the unsplit outside-figure subject is dropped (its side
 * letters belong to the whole ring, which no sheet draws) and each sheet's tags
 * go out with their `sheetNumber`. Tags keyed to a sheet that the stored cut no
 * longer produces are dropped too, instead of landing on a figure they were never
 * drawn on. Without a split, nothing here changes.
 */
export function adjoiningSubjectsFor(
  bySubject: Record<string, SideAnnotation[]>,
  ringFor: (subjectId: string) => [number, number][] | null,
  opts: { outsideFigureId: string | number | null; sheetSubjects: SheetSubject[] },
): AdjoiningSubject[] {
  const split = opts.sheetSubjects.length > 0
  const liveSheets = new Map(opts.sheetSubjects.map(s => [s.id, s.sheetNumber]))
  const out: AdjoiningSubject[] = []
  for (const [subjectId, annotations] of Object.entries(bySubject)) {
    if (!Array.isArray(annotations) || annotations.length === 0) continue
    const sheetNumber = parseSheetSubjectId(subjectId)
    if (sheetNumber != null) {
      if (liveSheets.get(subjectId) !== sheetNumber) continue
    } else if (split && opts.outsideFigureId != null && subjectId === String(opts.outsideFigureId)) {
      continue
    }
    const ring = ringFor(subjectId)
    if (!ring) continue
    out.push(sheetNumber != null
      ? { subjectId, ring, annotations, sheetNumber }
      : { subjectId, ring, annotations })
  }
  return out
}
