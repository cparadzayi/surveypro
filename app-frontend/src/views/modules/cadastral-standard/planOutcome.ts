/**
 * What to tell the surveyor when a plan generation finishes.
 *
 * It used to be one blocking `alert()` listing file names, and any warning (blocks that
 * overlap the figure, beacons the DXF skipped, a scale that fell back) went to the console
 * only. This turns the whole outcome into one notice: saved files, files kept, parcels not
 * drawn, and anything the generators warned about -- a warning keeps the notice up until it
 * is dismissed, so a known fault is not missed.
 */

export interface GenerationOutcome {
  /** Folder under output/ the files went to, e.g. "general-plans". */
  subdir: string
  saved: string[]
  /** Files that already existed and the surveyor chose not to overwrite. */
  skipped: string[]
  /** Parcels the working plan could not draw (no named boundary points). */
  notDrawn: string[]
  /** Plain sentences from the PDF and DXF generators. */
  warnings: string[]
}

export interface OutcomeNotice {
  kind: 'success' | 'warning'
  title: string
  message: string
  details: string[]
  sticky: boolean
}

export function describeGenerationOutcome(o: GenerationOutcome): OutcomeNotice {
  const needsReading = o.warnings.length > 0 || o.notDrawn.length > 0
  const hasCaveat = needsReading || o.skipped.length > 0

  const title = o.saved.length > 0 ? 'Plan generated' : 'Nothing new was saved'
  const message =
    o.saved.length > 0
      ? `Saved ${o.saved.length} ${o.saved.length === 1 ? 'file' : 'files'} to output/${o.subdir}/.`
      : o.skipped.length > 0
        ? `Every file already exists in output/${o.subdir}/ and was kept.`
        : `No files were written to output/${o.subdir}/.`

  const details = [
    ...o.saved,
    ...o.skipped.map((n) => `Kept existing (not overwritten): ${n}`),
    ...o.notDrawn.map((n) => `Not drawn (no named boundary points): ${n}`),
    ...o.warnings.map((w) => `Check: ${w}`),
  ]

  return {
    kind: hasCaveat ? 'warning' : 'success',
    title,
    message,
    details,
    // A success clears itself; anything the surveyor should act on stays until dismissed.
    sticky: needsReading,
  }
}

/**
 * Where the files went, as a path the surveyor can paste into Explorer: the project's working
 * directory, then output, then the plan folder. It joins with whichever separator the working
 * directory already uses, so a Windows path stays a Windows path.
 */
export function outputFolderPath(workingDirectory: string, subdir: string): string {
  const BACKSLASH = String.fromCharCode(92)
  const base = workingDirectory.trim().replace(/[\\/]+$/, '')
  const sep = base.includes(BACKSLASH) && !base.includes('/') ? BACKSLASH : '/'
  return [base, 'output', subdir].join(sep)
}

/** The DXF generator's warning counts, as plain sentences. */
export function describeDxfWarnings(summary: Record<string, number | boolean> | null | undefined): string[] {
  if (!summary) return []
  const out: string[] = []
  const n = (k: string) => (typeof summary[k] === 'number' ? (summary[k] as number) : 0)
  if (n('beacons')) out.push(`${n('beacons')} beacon(s) were left out of the DXF.`)
  if (n('parcels')) out.push(`${n('parcels')} parcel(s) were left out of the DXF.`)
  if (n('beaconDescTruncated')) out.push(`${n('beaconDescTruncated')} beacon description(s) were shortened to fit.`)
  if (n('priorDiagramsTruncated')) out.push(`${n('priorDiagramsTruncated')} prior diagram reference(s) were shortened to fit.`)
  if (summary.scaleFallback) out.push('The DXF scale fell back to 1:500.')
  return out
}
