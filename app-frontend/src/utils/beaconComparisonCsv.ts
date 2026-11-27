/** The single canonical beacon-comparison CSV format. Y = Westing, X = Southing (Cape Lo). */
export const CSV_HEADER = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X'

export interface BeaconComparisonRow {
  name: string
  yH: number
  xH: number
  yS: number
  xS: number
}

const FIELDS = ['Hist_Y', 'Hist_X', 'Survey_Y', 'Survey_X'] as const

/**
 * Parse a beacon-comparison CSV into rows of { name, yH, xH, yS, xS }.
 * Tolerates an optional header line and blank rows; throws on malformed input.
 *
 * A row of nothing but separators (",,,,", which a spreadsheet leaves below the data) is skipped. It used to be
 * read as a beacon: Number('') is 0, so each such row passed as a point at Y = 0, X = 0 and was given a template
 * name (BM 005, BM 006, ...). Six of them in one upload all coincided, every line among them "passed", and the
 * comparison rejected the four real beacons instead. A row that has anything in it must now have a beacon name
 * and all four co-ordinates; nothing is invented for it.
 */
export function parseBeaconCsv(text: string): BeaconComparisonRow[] {
  const lines = text.split(/\r?\n/)
    .map((l, i) => ({ line: l.trim(), fileRow: i + 1 }))
    .filter(({ line }) => line !== '' && line.split(',').some((c) => c.trim() !== ''))
  if (lines.length === 0) throw new Error('The file is empty.')

  // Treat the first line as a header unless its numeric columns parse as numbers.
  const firstCols = lines[0].line.split(',')
  const firstLooksLikeData =
    firstCols.length >= 5 && firstCols.slice(1, 5).every((c) => c.trim() !== '' && Number.isFinite(Number(c.trim())))
  const dataLines = firstLooksLikeData ? lines : lines.slice(1)

  const rows = dataLines.map(({ line, fileRow }) => {
    const cols = line.split(',').map((s) => s.trim())
    if (cols.length < 5) {
      throw new Error(`Row ${fileRow}: expected 5 columns (${CSV_HEADER}), found ${cols.length}.`)
    }
    const [name, ...coords] = cols
    if (!name) throw new Error(`Row ${fileRow}: has co-ordinates but no beacon name.`)
    const values = coords.slice(0, 4).map((c, k) => {
      if (c === '') throw new Error(`Row ${fileRow} (${name}): ${FIELDS[k]} is empty.`)
      const v = Number(c)
      if (!Number.isFinite(v)) throw new Error(`Row ${fileRow} (${name}): ${FIELDS[k]} "${c}" is not a valid number.`)
      return v
    })
    return { name, yH: values[0], xH: values[1], yS: values[2], xS: values[3] }
  })

  if (rows.length < 3) throw new Error('Need at least 3 beacons to run a comparison.')
  return rows
}
