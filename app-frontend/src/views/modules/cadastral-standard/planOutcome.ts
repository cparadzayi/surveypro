/**
 * What to tell the surveyor when a plan generation finishes.
 *
 * It used to be one blocking `alert()` listing file names, and any warning (blocks that
 * overlap the figure, beacons the DXF skipped, a scale that fell back) went to the console
 * only. This turns the whole outcome into one notice: saved files, files kept, parcels not
 * drawn, and anything the generators warned about -- a warning keeps the notice up until it
 * is dismissed, so a known fault is not missed.
 */

/** "0:07", "2:19", "1:02:05": time elapsed, for a button that would otherwise just say "Generating…". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** True when a request failed because the user cancelled it (axios, fetch and DOM spellings). */
export function isCancelled(error: unknown): boolean {
  const e = error as { code?: string; name?: string } | null
  return !!e && (e.code === 'ERR_CANCELED' || e.name === 'CanceledError' || e.name === 'AbortError')
}

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
  /** What the PDF was actually drawn at, e.g. "1:600", when known (it may differ from what was asked for). */
  scale?: string
  /** The sheet code the renderer used, e.g. "SI727_1000x800". */
  sheet?: string
  /** Number of sheets in a multi-sheet plan. */
  sheetCount?: number
}

/** "SI727_1000x800" reads as "1000 × 800 mm"; anything else is shown as given. */
export function describeSheet(code: string): string {
  const m = /(\d{3,4})x(\d{3,4})$/i.exec(code)
  return m ? `${m[1]} × ${m[2]} mm` : code
}

function describeDrawing(o: GenerationOutcome): string {
  const parts: string[] = []
  if (o.scale) parts.push(`at ${o.scale}`)
  if (o.sheetCount && o.sheetCount > 1) parts.push(`on ${o.sheetCount} sheets`)
  else if (o.sheet) parts.push(`on a ${describeSheet(o.sheet)} sheet`)
  return parts.length ? ` Drawn ${parts.join(' ')}.` : ''
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
      ? `Saved ${o.saved.length} ${o.saved.length === 1 ? 'file' : 'files'} to output/${o.subdir}/.${describeDrawing(o)}`
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
type DxfWarningSummary = Record<string, number | boolean | null>

/** A multi-sheet DXF sends one summary per sheet: add the counts, keep any flag that is set. */
function mergeDxfSummaries(list: DxfWarningSummary[]): DxfWarningSummary {
  const out: DxfWarningSummary = {}
  for (const s of list) {
    if (!s || typeof s !== 'object') continue
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'number') out[k] = (typeof out[k] === 'number' ? (out[k] as number) : 0) + v
      else if (v === true) out[k] = true
    }
  }
  return out
}

export function describeDxfWarnings(input: DxfWarningSummary | DxfWarningSummary[] | null | undefined): string[] {
  if (!input) return []
  const summary = Array.isArray(input) ? mergeDxfSummaries(input) : input
  const out: string[] = []
  const n = (k: string) => (typeof summary[k] === 'number' ? (summary[k] as number) : 0)
  if (n('beacons')) out.push(`${n('beacons')} beacon(s) were left out of the DXF.`)
  if (n('parcels')) out.push(`${n('parcels')} parcel(s) were left out of the DXF.`)
  if (n('beaconDescTruncated')) out.push(`${n('beaconDescTruncated')} beacon description(s) were shortened to fit.`)
  if (n('priorDiagramsTruncated')) out.push(`${n('priorDiagramsTruncated')} prior diagram reference(s) were shortened to fit.`)
  if (n('crampedLetters')) {
    out.push(`${n('crampedLetters')} beacon letter(s) are too close together to fit at this scale and are drawn at the smallest size, so they may touch a boundary line. Use a finer scale, or the PDF, which magnifies them in insets.`)
  }
  if (summary.scaleFallback) out.push('The DXF scale fell back to 1:500.')
  return out
}
