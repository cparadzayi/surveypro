/**
 * Boundaries & Abutters: one role per side.
 *
 * A side is a servitude (a record in `step_data.servitudes`, mirrored as a
 * role:'servitude' annotation), a road, or a contiguous neighbour (annotations in
 * `step_data['survey-plan'].sideAnnotations`). The saved data is unchanged; what
 * this adds is the rule that picking a different role replaces the old one, so a
 * side can never be a servitude record AND a road at once.
 */
import {
  removeAnnotation, upsertAnnotation, annotationsForSubject, withSubjectAnnotations,
  type SideAnnotation,
} from './sideAnnotations'
import { removeServitude, syncServitudeMirror, type Servitude } from './servitudes'

export interface TagResult {
  annotations: Record<string, SideAnnotation[]>
  servitudes: Servitude[]
  /** True when a servitude record was removed (so the servitudes step must be saved too). */
  servitudesChanged: boolean
}

/**
 * Tag `ann.side` of `subjectId` as a road or contiguous neighbour. A servitude
 * record governing that side (`replacing`) is deleted: the new role replaces it.
 */
export function applyRoadOrNeighbourTag(
  annotations: Record<string, SideAnnotation[]>,
  servitudes: Servitude[],
  subjectId: string | number,
  ann: SideAnnotation,
  replacing: Servitude | null,
  adjoiningSideFor?: (s: Servitude) => { subjectId: string; side: string } | null,
): TagResult {
  let base = annotations
  let nextServitudes = servitudes
  if (replacing) {
    nextServitudes = removeServitude(servitudes, replacing.id)
    base = syncServitudeMirror(annotations, nextServitudes, adjoiningSideFor)
  }
  const list = upsertAnnotation(annotationsForSubject(base, subjectId), ann)
  return {
    annotations: withSubjectAnnotations(base, subjectId, list),
    servitudes: nextServitudes,
    servitudesChanged: !!replacing,
  }
}

/** Remove a road / contiguous tag from a side. Servitude entries are never removed here:
 *  they belong to their record. */
export function clearRoadOrNeighbourTag(
  annotations: Record<string, SideAnnotation[]>,
  subjectId: string | number,
  side: string,
): Record<string, SideAnnotation[]> {
  const list = annotationsForSubject(annotations, subjectId)
  const cur = list.find(a => a.side === side)
  if (!cur || cur.role === 'servitude') return annotations
  return withSubjectAnnotations(annotations, subjectId, removeAnnotation(list, side))
}

/** The road / contiguous tag on a side, if any (a servitude is a record, not this). */
export function roadOrNeighbourTag(
  annotations: Record<string, SideAnnotation[]>,
  subjectId: string | number | null,
  side: string | null,
): SideAnnotation | undefined {
  if (subjectId == null || side == null) return undefined
  return annotationsForSubject(annotations, subjectId).find(a => a.side === side && a.role !== 'servitude')
}

/** How many subjects carry any tag, of the total: the "12 of 15 tagged" status. */
export function taggedSubjectCount(
  annotations: Record<string, SideAnnotation[]>,
  subjectIds: Array<string | number>,
): { tagged: number; total: number } {
  const tagged = subjectIds.filter(id => annotationsForSubject(annotations, id).length > 0).length
  return { tagged, total: subjectIds.length }
}

export interface BoundarySummaryRow {
  id: string | number
  label: string
  roads: number
  servitudes: number
  neighbours: number
  total: number
}

/**
 * The read-only "Boundaries" summary other screens show: per subject, how many sides
 * are tagged as what. `subjects` is every subject Boundaries & Abutters offers, in
 * the order it offers them, so the "N of M tagged" figure means the same on both.
 */
export function summariseBoundaries(
  annotations: Record<string, SideAnnotation[]>,
  subjects: Array<{ id: string | number; label: string }>,
): { rows: BoundarySummaryRow[]; tagged: number; total: number } {
  const rows = subjects.map(s => {
    const list = annotationsForSubject(annotations, s.id)
    const roads = list.filter(a => a.role === 'road').length
    const servitudes = list.filter(a => a.role === 'servitude').length
    const neighbours = list.filter(a => a.role === 'contiguous').length
    return { id: s.id, label: s.label, roads, servitudes, neighbours, total: roads + servitudes + neighbours }
  })
  return { rows, tagged: rows.filter(r => r.total > 0).length, total: rows.length }
}
