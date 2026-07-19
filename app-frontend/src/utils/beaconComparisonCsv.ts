/** The single canonical beacon-comparison CSV format. Y = Westing, X = Southing (Cape Lo). */
export const CSV_HEADER = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X'

export interface BeaconComparisonRow {
  name: string
  yH: number
  xH: number
  yS: number
  xS: number
}

/**
 * Parse a beacon-comparison CSV into rows of { name, yH, xH, yS, xS }.
 * Tolerates an optional header line and blank rows; throws on malformed input.
 */
export function parseBeaconCsv(text: string): BeaconComparisonRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) throw new Error('The file is empty.')

  // Treat the first line as a header unless its numeric columns parse as numbers.
  const firstCols = lines[0].split(',')
  const firstLooksLikeData =
    firstCols.length >= 5 && firstCols.slice(1, 5).every((c) => Number.isFinite(parseFloat(c)))
  const dataLines = firstLooksLikeData ? lines : lines.slice(1)

  const rows = dataLines.map((line, i) => {
    const cols = line.split(',').map((s) => s.trim())
    if (cols.length < 5) {
      throw new Error(`Row ${i + 1}: expected 5 columns (${CSV_HEADER}), found ${cols.length}.`)
    }
    const [name, yH, xH, yS, xS] = cols
    const nums = { yH: Number(yH), xH: Number(xH), yS: Number(yS), xS: Number(xS) }
    for (const [k, v] of Object.entries(nums)) {
      if (!Number.isFinite(v)) {
        throw new Error(`Row ${i + 1} (${name || 'unnamed'}): "${k}" is not a valid number.`)
      }
    }
    return { name: name || `BM ${String(i + 1).padStart(3, '0')}`, ...nums }
  })

  if (rows.length < 3) throw new Error('Need at least 3 beacons to run a comparison.')
  return rows
}
