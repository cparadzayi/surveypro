import { servitudeTypeLabel, beaconBoundary, type Servitude } from '../views/modules/cadastral-standard/servitudes'
import { isOutsideFigureParcelName } from '@/services/parcelValidation'

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
  /** Parcel designation — lets the certificate drop the Outside Figure pseudo-parcel. */
  designation?: string
}

/**
 * The stands the schedule lists: every parcel EXCEPT the SI 727 Outside Figure
 * pseudo-parcel (the encapsulating polygon, never a lodged stand). Detected on
 * the designation or stand name so an empty-stand Outside Figure is caught too.
 */
export function certificateStands(parcels: CertificateParcel[]): CertificateParcel[] {
  return parcels.filter((p) => !isOutsideFigureParcelName(String(p.designation || p.stand || '')))
}

export function buildCertificateRows(
  parcels: CertificateParcel[],
  servitudes: Servitude[],
  portion: 'developed' | 'undeveloped',
): CertificateRow[] {
  const parcelsInSchedule = certificateStands(parcels)
  if (portion === 'undeveloped') {
    return parcelsInSchedule.map((p) => ({
      stand: p.stand,
      areaM2: p.area_m2 ?? 0,
      boundary: '',
      servitudeType: '',
    }))
  }

  const rows: CertificateRow[] = []
  const seen = new Set<string>()
  for (const p of parcelsInSchedule) {
    const pid = String(p.id)
    // A party wall is shared between two parcels: it burdens the subject parcel
    // AND the reciprocal one, captured via adjoiningSubjectId (with a back-compat
    // fallback to the adjoiningStand designation for records saved before the id
    // existed).
    const affecting = servitudes.filter(
      (s) => s.subjectId === pid ||
        (s.type === 'party-wall' && (s.adjoiningSubjectId === pid || s.adjoiningStand === p.stand)),
    )
    if (!affecting.length) {
      rows.push({ stand: p.stand, areaM2: p.area_m2 ?? 0, boundary: '', servitudeType: '' })
      continue
    }
    for (const s of affecting) {
      const boundary = beaconBoundary(s)
      let servitudeType = servitudeTypeLabel(s)
      if (s.type !== 'party-wall') {
        servitudeType += (s.widthM ? `, ${s.widthM} m` : '') + (s.beneficiary ? `, in favour of ${s.beneficiary}` : '')
      }
      // The same wall recorded from both parcels (legacy mirrors) must not
      // double-list a stand; collapse on stands+boundary+type.
      const boundaryKey = s.fromBeacon && s.toBeacon
        ? [String(s.fromBeacon), String(s.toBeacon)].sort().join('|')
        : (s.side || '')
      const key = `${p.stand}|${boundaryKey}|${servitudeType}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ stand: p.stand, areaM2: p.area_m2 ?? 0, boundary, servitudeType })
    }
  }
  return rows
}
