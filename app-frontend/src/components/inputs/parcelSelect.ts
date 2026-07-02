export interface ParcelOption {
  id: string | number
  stand?: string | number | null
  designation?: string | null
  areaM2?: number | null
}

interface RawParcel {
  id: string | number
  stand?: string | number | null
  designation?: string | null
  area_m2?: number | null
}

function standNum(o: ParcelOption): number {
  const m = /\d+/.exec(String(o.stand ?? ''))
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY
}

function compareOptions(a: ParcelOption, b: ParcelOption): number {
  const na = standNum(a), nb = standNum(b)
  if (na !== nb) return na - nb
  const da = String(a.designation ?? ''), db = String(b.designation ?? '')
  if (da !== db) return da.localeCompare(db)
  return String(a.id).localeCompare(String(b.id))
}

export function buildParcelOptions(
  parcels: RawParcel[],
  opts: { excludeId?: string | number | null } = {},
): ParcelOption[] {
  const exclude = opts.excludeId == null ? null : String(opts.excludeId)
  return parcels
    .filter(p => p != null && (exclude == null || String(p.id) !== exclude))
    .map(p => ({
      id: p.id,
      stand: p.stand ?? null,
      designation: p.designation ?? null,
      areaM2: p.area_m2 == null ? null : Number(p.area_m2),
    }))
    .sort(compareOptions)
}

export function filterParcelOptions(options: ParcelOption[], query: string): ParcelOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter(o =>
    `${o.stand ?? ''} ${o.designation ?? ''}`.toLowerCase().includes(q))
}

export function nextHighlightIndex(current: number, length: number, direction: 1 | -1): number {
  if (length <= 0) return -1
  if (current < 0) return direction === 1 ? 0 : length - 1
  return (current + direction + length) % length
}

export function labelForOption(option: ParcelOption): { primary: string; secondary: string } {
  const stand = option.stand == null ? '' : String(option.stand).trim()
  const designation = (option.designation ?? '').trim()
  const primary = stand ? `Stand ${stand}` : (designation || `#${option.id}`)
  const parts: string[] = []
  if (stand && designation) parts.push(designation)  // designation is primary when no stand
  if (option.areaM2 != null && Number.isFinite(option.areaM2)) {
    const ha = option.areaM2 / 10000
    parts.push(ha >= 1 ? `${ha.toFixed(4)} ha` : `${option.areaM2.toFixed(2)} m²`)
  }
  return { primary, secondary: parts.join(' · ') }
}
