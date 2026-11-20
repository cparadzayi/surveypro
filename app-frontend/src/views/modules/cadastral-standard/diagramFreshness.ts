/**
 * Which saved diagrams are older than the coordinates they were drawn from.
 *
 * A CSV re-import moves beacons, and `refreshParcelSnapshotsAfterImport` rebuilds the parcels from the new
 * figures, but a diagram already saved in output/diagrams keeps the old ones. That is how the Brackenhurst
 * diagrams came to disagree with the Co-ordinate List after the 19 Nov re-import. The plan screen redraws
 * every diagram this module names, so a saved diagram is never older than the survey's coordinates.
 *
 * The rule is stateless: a diagram file is out of date when it was written before the coordinates last
 * changed. Redrawing it writes a newer file, so nothing has to be cleared afterwards, and a diagram that
 * failed to redraw is simply named again the next time.
 */

export interface ManifestEntry { name: string; relDir: string; mtimeMs?: number }
export interface DiagramSubject { id: string | number; baseName: string }
export type DiagramFormat = 'pdf' | 'dxf' | 'gpkg'
export interface OutdatedFile extends ManifestEntry { format: DiagramFormat }
export interface OutdatedDiagram {
  parcelId: string | number
  /** The out-of-date files of this diagram (its PDF, DXF zip, GeoPackage). */
  files: OutdatedFile[]
  /** The scale the old diagram was drawn at ("1:500"), so the redraw keeps the surveyor's choice; null = auto. */
  scale: string | null
}

/** Where diagrams are saved, relative to the working directory (see planTypeOutputSubdir). */
export const DIAGRAM_DIR = 'output/diagrams'

const FORMAT_OF: Record<string, DiagramFormat> = { pdf: 'pdf', zip: 'dxf', gpkg: 'gpkg' }

/**
 * The time the survey's coordinates last changed, in ms: the re-import's own marker
 * (`step_data['csv-import'].coordinates_changed_at`) or, for a re-import made before that marker existed, the
 * latest parcel snapshot it rebuilt (`metadata.reimport_rebuilt_at`). Null when neither is known.
 */
export function coordinatesChangedAt(stepData: any, parcels: any[]): number | null {
  const times = [
    stepData?.['csv-import']?.coordinates_changed_at,
    ...(Array.isArray(parcels) ? parcels : []).map((p) => p?.metadata?.reimport_rebuilt_at),
  ].map((t) => (typeof t === 'string' ? Date.parse(t) : NaN)).filter((t) => Number.isFinite(t))
  return times.length ? Math.max(...times) : null
}

/**
 * The file a diagram of `baseName` was saved as, or null: `<baseName><scale tag>.<pdf|zip|gpkg>`, the scale tag
 * being `_1-500` (or empty when none was known). The tag is matched exactly, so "diagram-STAND_40" never claims
 * "diagram-STAND_404_1-500.pdf".
 */
export function diagramFileOf(name: string, baseName: string): { format: DiagramFormat; scale: string | null } | null {
  if (!name.startsWith(baseName)) return null
  const m = name.slice(baseName.length).match(/^((?:_1-\d+)*(?:_to_1-\d+)?)\.(pdf|zip|gpkg)$/i)
  if (!m) return null
  const first = m[1].match(/^_1-(\d+)/)
  return { format: FORMAT_OF[m[2].toLowerCase()], scale: first ? `1:${first[1]}` : null }
}

/** Every saved diagram written before `changedAt`, grouped by the stand it is the diagram of. */
export function outdatedDiagrams(input: { files: ManifestEntry[]; subjects: DiagramSubject[]; changedAt: number | null }): OutdatedDiagram[] {
  const { files, subjects, changedAt } = input
  if (changedAt == null) return []
  const inDir = (files ?? []).filter((f) => f.relDir === DIAGRAM_DIR)
  const out: OutdatedDiagram[] = []
  for (const s of subjects ?? []) {
    const stale: OutdatedFile[] = []
    // The scale of the NEWEST old copy (a stand can have copies at two scales); a PDF's wins over a DXF's of
    // the same time.
    let scale: string | null = null
    let best = -Infinity
    for (const f of inDir) {
      const hit = diagramFileOf(f.name, s.baseName)
      // A file whose time could not be read (0) is left alone: it cannot be shown to be out of date.
      if (!hit || !f.mtimeMs || f.mtimeMs >= changedAt) continue
      stale.push({ ...f, format: hit.format })
      const rank = f.mtimeMs + (hit.format === 'pdf' ? 0.5 : 0)
      if (hit.scale && rank > best) { best = rank; scale = hit.scale }
    }
    if (stale.length) out.push({ parcelId: s.id, files: stale, scale })
  }
  return out
}
