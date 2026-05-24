import type { TariffData } from './tariff'

export type EstimateInputs = {
  jobType: string
  locality: 'URBAN' | 'RURAL'
  currency: 'ZWL' | 'USD'
  vatRate: number
  parcels?: number
  usePegEstimate?: boolean
  pegFactor?: number
  pegsOverride?: number
  km?: number
  days?: number
}

export type LineItem = {
  code: string
  description: string
  section: 'statutory' | 'examination' | 'services' | 'materials' | 'disbursements'
  qty: number
  unit: string
  unitPrice: number
  taxable: boolean
  amount: number
}

export type EstimateResult = {
  version: string
  items: LineItem[]
  totals: {
    statutory: number
    examination: number
    services: number
    materials: number
    disbursements: number
    vat: number
    grand: number
  }
}

function sum(items: LineItem[], section: LineItem['section']) {
  return items.filter(i => i.section === section).reduce((a, b) => a + b.amount, 0)
}

export function computeEffectivePegs(inputs: EstimateInputs): number {
  const lots = Math.max(0, Math.floor(inputs.parcels || 0))
  const factor = inputs.pegFactor && inputs.pegFactor > 0 ? inputs.pegFactor : 2.5
  if (inputs.usePegEstimate) return Math.ceil(lots * factor)
  return Math.max(0, Math.floor(inputs.pegsOverride || 0))
}

export function computeEstimate(tariff: TariffData, inputs: EstimateInputs): EstimateResult {
  const items: LineItem[] = []
  const jt = inputs.jobType
  const vatRate = inputs.vatRate ?? tariff.vat_rate_default ?? 0

  // Helper to add a line consistently
  const add = (p: Partial<LineItem> & { code: string; description: string }) => {
    const unitPrice = p.unitPrice ?? 0
    const qty = p.qty ?? 0
    const taxable = !!p.taxable
    const amount = unitPrice * qty
    items.push({
      code: p.code,
      description: p.description,
      section: p.section || 'services',
      qty,
      unit: p.unit || 'unit',
      unitPrice,
      taxable,
      amount,
    })
  }

  // Map tariff items
  const tItems = tariff.items || []
  for (const it of tItems) {
    // Only include items applicable to this job type (if specified)
    if (Array.isArray(it.job_types) && it.job_types.length && !it.job_types.includes(jt)) continue

    // Stub mapping: for now include only peg-related items for SUBDIVISION
    if (jt === 'SUBDIVISION' && (it.code === 'PEG_SUPPLY' || it.code === 'PEG_SETTING')) {
      const pegs = computeEffectivePegs(inputs)
      add({
        code: it.code,
        description: it.description || it.code,
        section: it.section === 'materials' ? 'materials' : 'services',
        qty: pegs,
        unit: 'peg',
        unitPrice: Number(it.rate || 0),
        taxable: !!it.taxable,
      })
    }

    // Example: add a cadastral per-parcel base fee if present
    if ((jt === 'SUBDIVISION' || jt === 'NEW_SURVEY') && it.code === 'CAD_URB_BASE') {
      add({
        code: it.code,
        description: it.description || it.code,
        section: 'statutory',
        qty: Math.max(0, Math.floor(inputs.parcels || 0)),
        unit: 'parcel',
        unitPrice: Number(it.rate || 0),
        taxable: !!it.taxable,
      })
    }
  }

  // Examination items mapping (stub): add 0 by default until UI collects counts
  const exam = tariff.examItems || []
  for (const ex of exam) {
    // Placeholders; future: bind counts from UI (e.g., diagram sheets)
    const qty = 0
    if (qty > 0) {
      add({
        code: ex.code,
        description: ex.description || ex.code,
        section: 'examination',
        qty,
        unit: ex.unit || 'unit',
        unitPrice: Number(ex.rate || 0),
        taxable: !!ex.taxable,
      })
    }
  }

  // Disbursements examples (stub): Travel per km if a tariff item exists later; for now omit

  const statutory = sum(items, 'statutory')
  const examination = sum(items, 'examination')
  const services = sum(items, 'services')
  const materials = sum(items, 'materials')
  const disbursements = sum(items, 'disbursements')
  const taxableBase = items.filter(i => i.taxable).reduce((a, b) => a + b.amount, 0)
  const vat = Math.round((taxableBase * vatRate) ) / 100 // vatRate is % (e.g., 15)
  const grand = statutory + examination + services + materials + disbursements + vat

  return {
    version: tariff.version,
    items,
    totals: { statutory, examination, services, materials, disbursements, vat, grand }
  }
}
