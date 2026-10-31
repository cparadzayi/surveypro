/**
 * Numbers the Surveyor-General's office gives AFTER preliminary examination, which the
 * surveyor enters once known: the file, S.R., compilation sheet and General Plan
 * numbers (one set for the survey) and the diagram S.G. number (one per diagram).
 * They are stored as they always were -- the first four on the project record, the
 * diagram numbers in the survey-plan workflow step -- so nothing saved needs migrating.
 */

export interface OfficeNumbers {
  fileNo: string
  srNo: string
  compilation: string
  gpNo: string
}

export const OFFICE_NUMBER_FIELDS: Array<{ key: keyof OfficeNumbers; label: string; placeholder: string }> = [
  { key: 'fileNo', label: 'File No.', placeholder: 'e.g. B/2917' },
  { key: 'srNo', label: 'S.R. No.', placeholder: 'e.g. 188/2026' },
  { key: 'compilation', label: 'Compilation sheet No.', placeholder: 'e.g. QJ9454' },
  { key: 'gpNo', label: 'General Plan No.', placeholder: 'e.g. 44/2026' },
]

const clean = (v: unknown): string => (v == null ? '' : String(v).trim())

/** The four office numbers out of any projectInfo-like object, missing ones as ''. */
export function officeNumbersFrom(src: Partial<Record<keyof OfficeNumbers, unknown>> | null | undefined): OfficeNumbers {
  return {
    fileNo: clean(src?.fileNo), srNo: clean(src?.srNo),
    compilation: clean(src?.compilation), gpNo: clean(src?.gpNo),
  }
}

/** Only the numbers that differ from what is saved, trimmed; empty when nothing changed.
 *  Clearing a number is a change (it is sent as ''). */
export function changedOfficeNumbers(saved: OfficeNumbers, edited: OfficeNumbers): Partial<OfficeNumbers> {
  const out: Partial<OfficeNumbers> = {}
  for (const f of OFFICE_NUMBER_FIELDS) {
    const next = clean(edited[f.key])
    if (next !== clean(saved[f.key])) out[f.key] = next
  }
  return out
}

/** Saved diagram numbers by subject id. Anything not a string-valued object is ignored: this is
 *  saved data, and must never be trusted blindly. */
export function hydrateDiagramSgNumbers(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim()
  }
  return out
}

/** The map with `subjectId`'s number set (immutable); an empty number removes the entry. */
export function withDiagramSgNumber(
  map: Record<string, string>, subjectId: string | number, value: string,
): Record<string, string> {
  const next = { ...map }
  const v = clean(value)
  if (v) next[String(subjectId)] = v
  else delete next[String(subjectId)]
  return next
}

/**
 * What the renderers read from metadata: this diagram's number, and the survey's office numbers
 * THAT HAVE BEEN ENTERED. A blank here must not overwrite what the project record already holds
 * (the record's values reach the renderer by another route), or an empty field on this screen
 * would blank a number that was set at project setup.
 */
export function officeNumbersMetadata(
  numbers: OfficeNumbers, diagramNos: Record<string, string>, subjectId: string | number | null,
): Partial<OfficeNumbers> & { diagramSgNo: string } {
  const out: Partial<OfficeNumbers> & { diagramSgNo: string } = {
    diagramSgNo: subjectId == null ? '' : (diagramNos[String(subjectId)] ?? ''),
  }
  for (const f of OFFICE_NUMBER_FIELDS) {
    const v = clean(numbers[f.key])
    if (v) out[f.key] = v
  }
  return out
}

/**
 * The fields' state after the project record (or workflow copy) is read again.
 *
 * The record is the source of truth for what is SAVED, but re-reading must never wipe what the
 * surveyor has typed or what is already shown: a value arriving blank (a stale or not-yet-loaded
 * copy) changes nothing, and a field being edited (differs from what was saved) keeps its text.
 */
export function reloadOfficeNumbers(
  local: OfficeNumbers, saved: OfficeNumbers, incoming: OfficeNumbers,
): { local: OfficeNumbers; saved: OfficeNumbers } {
  const nextLocal = { ...local }
  const nextSaved = { ...saved }
  for (const f of OFFICE_NUMBER_FIELDS) {
    const inc = clean(incoming[f.key])
    if (!inc) continue
    const dirty = clean(local[f.key]) !== clean(saved[f.key])
    nextSaved[f.key] = inc
    if (!dirty) nextLocal[f.key] = inc
  }
  return { local: nextLocal, saved: nextSaved }
}

// ---- General Plan: the code each sheet prints under -----------------------------------------
// The office issues a number within a series (BCT / BCG / BDG, by paper size). The app picks the
// series from the sheet the plan lands on, so a later scale change that moves a sheet to another
// size would print the same number under a different series. We remember the series a number was
// first printed under and say so when it changes.

/** The code each sheet printed under, from the layouts the PDF reported ({} for an unknown size). */
export function printedGpCodes(
  layouts: Array<{ sheetNumber: number; sheetSize: string }> | undefined | null,
  usedSheetSize: string | undefined | null,
  codeFor: (sheetSize: string) => string,
): Record<string, string> {
  const rows = layouts?.length ? layouts : [{ sheetNumber: 1, sheetSize: usedSheetSize ?? '' }]
  const out: Record<string, string> = {}
  for (const r of rows) {
    const code = codeFor(r.sheetSize)
    if (code) out[String(r.sheetNumber)] = code
  }
  return out
}

export interface SheetCodeReport {
  /** The series each numbered sheet is now remembered under. */
  recorded: Record<string, string>
  /** Sheets whose number was issued under another series than the one they print under now. */
  mismatches: Array<{ sheet: string; was: string; now: string }>
  /** One line per sheet for the generation notice. */
  lines: string[]
}

export function reconcileSheetCodes(
  numbers: Record<string, string>,
  recorded: Record<string, string>,
  printed: Record<string, string>,
): SheetCodeReport {
  const next = { ...recorded }
  const mismatches: SheetCodeReport['mismatches'] = []
  const lines: string[] = []
  for (const [sheet, code] of Object.entries(printed)) {
    const no = (numbers[sheet] ?? '').trim()
    if (!no) { delete next[sheet]; lines.push(`Sheet ${sheet}: ${code} (no number entered yet)`); continue }
    if (!next[sheet]) next[sheet] = code
    if (next[sheet] !== code) mismatches.push({ sheet, was: next[sheet], now: code })
    lines.push(`Sheet ${sheet}: ${code} ${no}`)
  }
  return { recorded: next, mismatches, lines }
}
