import { servitudeTypeLabel, type Servitude } from '../views/modules/cadastral-standard/servitudes'

export interface CertificateRow {
  stand: string
  areaM2: number
  servitudeText: string
}

export interface CertificateParcel {
  id: string | number
  stand: string
  area_m2?: number
}

export function buildServitudeSentence(s: Servitude, subjectStand: string): string {
  const boundary = s.fromBeacon && s.toBeacon ? `${s.fromBeacon} – ${s.toBeacon}` : s.side
  const label = servitudeTypeLabel(s)
  const width = s.widthM ? `, ${s.widthM} m` : ''
  let qualifier = ''
  if (s.type === 'party-wall' && s.adjoiningStand) {
    qualifier = ` between Stand ${subjectStand} and Stand ${s.adjoiningStand}`
  } else if (s.beneficiary) {
    qualifier = ` in favour of ${s.beneficiary}`
  }
  return `The boundary (${boundary}) is subject to a ${label}${width} servitude${qualifier}`
}

export function buildCertificateRows(
  parcels: CertificateParcel[],
  servitudes: Servitude[],
  portion: 'developed' | 'undeveloped',
): CertificateRow[] {
  // Accumulate sentences per parcel (keyed by parcel id as string).
  const sentences = new Map<string, string[]>()
  parcels.forEach((p) => sentences.set(String(p.id), []))

  if (portion === 'developed') {
    const standToId = new Map(parcels.map((p) => [p.stand, String(p.id)]))
    for (const s of servitudes) {
      const subjParcel = parcels.find((p) => String(p.id) === s.subjectId)
      if (!subjParcel) continue
      const sentence = buildServitudeSentence(s, subjParcel.stand)
      sentences.get(s.subjectId)!.push(sentence)
      // Party-wall reciprocity: same mutual sentence on the adjoining stand's row.
      if (s.type === 'party-wall' && s.adjoiningStand) {
        const adjId = standToId.get(s.adjoiningStand)
        if (adjId && adjId !== s.subjectId) sentences.get(adjId)!.push(sentence)
      }
    }
  }

  return parcels.map((p) => ({
    stand: p.stand,
    areaM2: p.area_m2 ?? 0,
    servitudeText: sentences.get(String(p.id))!.join('; '),
  }))
}
