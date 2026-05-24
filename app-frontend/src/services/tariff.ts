// Minimal tariff loader (stub). In production, this can fetch from backend or static file.
import tariffData from '../tariff/tariff-2023-07'

export type TariffData = {
  version: string
  effective_from?: string
  currency?: 'ZWL'|'USD'
  vat_rate_default?: number
  job_type_overrides?: Record<string, any>
  items?: Array<any>
  examItems?: Array<any>
}

export async function loadTariff(): Promise<TariffData> {
  // For now, return embedded dataset. Later: switch to HTTP or version selector.
  return tariffData as unknown as TariffData
}
