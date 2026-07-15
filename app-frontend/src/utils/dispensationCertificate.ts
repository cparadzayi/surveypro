import { servitudeTypeLabel, type Servitude } from '../views/modules/cadastral-standard/servitudes'

export interface CertificateRow {
  stand: string
  areaM2: number
  boundary: string       // beacon pair "1620a – 1620b" (or the raw side if unresolved); '' when no servitude
  servitudeType: string  // e.g. "Party wall"; '' when no servitude
}

export interface CertificateParcel {
  id: string | number
  stand: string
  area_m2?: number
}

export function buildCertificateRows(
  parcels: CertificateParcel[],
  servitudes: Servitude[],
  portion: 'developed' | 'undeveloped',
): CertificateRow[] {
  if (portion === 'undeveloped') {
    return parcels.map((p) => ({
      stand: p.stand,
      areaM2: p.area_m2 ?? 0,
      boundary: '',
      servitudeType: '',
    }))
  }

  const rows: CertificateRow[] = []
  for (const p of parcels) {
    const pid = String(p.id)
    const affecting = servitudes.filter(
      (s) => s.subjectId === pid || (s.type === 'party-wall' && s.adjoiningStand === p.stand),
    )
    if (!affecting.length) {
      rows.push({ stand: p.stand, areaM2: p.area_m2 ?? 0, boundary: '', servitudeType: '' })
      continue
    }
    for (const s of affecting) {
      const boundary = s.fromBeacon && s.toBeacon ? `${s.fromBeacon} – ${s.toBeacon}` : s.side
      let servitudeType = servitudeTypeLabel(s)
      if (s.type !== 'party-wall') {
        servitudeType += (s.widthM ? `, ${s.widthM} m` : '') + (s.beneficiary ? `, in favour of ${s.beneficiary}` : '')
      }
      rows.push({ stand: p.stand, areaM2: p.area_m2 ?? 0, boundary, servitudeType })
    }
  }
  return rows
}
