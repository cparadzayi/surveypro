import type { VectorGeoPDFRequest } from '../../../services/geopdf'
import { getPlanTypeMeta, type PlanType } from './planTypes'
import JSZip from 'jszip'

export interface PlanPayloadContext {
  planType: PlanType
  subjectParcelId: string | number | null
  parcels: GeoJSON.FeatureCollection
  beacons: GeoJSON.FeatureCollection
  beaconLabels: any[]
  projection: string
  projectId?: number
  metadata: VectorGeoPDFRequest['metadata']
  extent?: VectorGeoPDFRequest['extent']
  scale?: string
  sheetSize?: string
  orientation: 'landscape' | 'portrait'
  outsideFigureData: any
  beaconGroups: any[]
  annotations?: GeoJSON.FeatureCollection
  renderEngine?: 'gdal' | 'pdfkit'
}

/** Vertex match tolerance in Cape Lo metres. */
const VERTEX_TOL = 0.05

/**
 * Beacons whose coordinate matches a vertex of the parcel's outer ring.
 * Beacon features carry no parcel id, so vertex coincidence is the link.
 */
export function beaconsForParcel(
  beacons: GeoJSON.FeatureCollection,
  parcelFeature: GeoJSON.Feature,
): GeoJSON.FeatureCollection {
  if (parcelFeature.geometry?.type !== 'Polygon') {
    return { type: 'FeatureCollection', features: [] }
  }
  const ring = (parcelFeature.geometry.coordinates[0] ?? []) as GeoJSON.Position[]
  const onRing = (c: number[]) =>
    ring.some(v => Math.abs(v[0] - c[0]) <= VERTEX_TOL && Math.abs(v[1] - c[1]) <= VERTEX_TOL)
  return {
    type: 'FeatureCollection',
    features: beacons.features.filter(
      f => f.geometry?.type === 'Point' && onRing((f.geometry as GeoJSON.Point).coordinates),
    ),
  }
}

/**
 * Assemble the request shared by the PDF and DXF endpoints. For single-parcel
 * plan types (Diagram) with a chosen subject, the parcels/beacons/labels are
 * filtered to that one parcel. Renderer behaviour is otherwise unchanged.
 */
export function buildPlanPayload(ctx: PlanPayloadContext): VectorGeoPDFRequest {
  const meta = getPlanTypeMeta(ctx.planType)
  let parcels = ctx.parcels
  let beacons = ctx.beacons
  let beaconLabels = ctx.beaconLabels

  if (meta.subjectMode === 'single-parcel' && ctx.subjectParcelId != null) {
    const subject = ctx.parcels.features.find(
      f => String(f.properties?.id) === String(ctx.subjectParcelId),
    )
    parcels = { type: 'FeatureCollection', features: subject ? [subject] : [] }
    beacons = subject
      ? beaconsForParcel(ctx.beacons, subject)
      : { type: 'FeatureCollection', features: [] }
    beaconLabels = (ctx.beaconLabels ?? []).filter(
      l => String(l?.parcelId) === String(ctx.subjectParcelId),
    )
  }

  return {
    parcels,
    beacons,
    annotations: ctx.annotations ?? { type: 'FeatureCollection', features: [] },
    projection: ctx.projection,
    projectId: ctx.projectId,
    renderEngine: ctx.renderEngine ?? 'pdfkit',
    extent: ctx.extent,
    scale: ctx.scale,
    sheetSize: ctx.sheetSize,
    orientation: ctx.orientation,
    metadata: ctx.metadata,
    outsideFigureData: ctx.outsideFigureData,
    beaconGroups: ctx.beaconGroups,
    beaconLabels,
    planType: ctx.planType,
  }
}

export function composePlanBaseName(
  planType: string,
  designation: string | undefined,
  projectId: number | string | undefined,
  ts: number,
): string {
  const id = (designation && designation.trim()) || String(projectId ?? 'project')
  const safe = id.replace(/[^\w.-]+/g, '_')
  return `${planType}-${safe}-${ts}`
}

export interface PlanDocumentSet {
  pdf?: Blob
  dxf?: Blob
  summary?: Blob
}

/**
 * One file ⇒ returned directly with the right extension. Two or more ⇒ zipped
 * into `${baseName}.zip` containing `<base>.pdf`, `<base>.dxf`, `<base>-summary.pdf`.
 */
export async function bundlePlanDocuments(
  docs: PlanDocumentSet,
  baseName: string,
): Promise<{ blob: Blob; filename: string }> {
  const present = (Object.entries(docs) as [keyof PlanDocumentSet, Blob | undefined][])
    .filter((e): e is [keyof PlanDocumentSet, Blob] => e[1] instanceof Blob)
  if (present.length === 0) throw new Error('No documents to bundle')

  if (present.length === 1) {
    const [kind, blob] = present[0]
    const ext = kind === 'dxf' ? 'dxf' : 'pdf'
    const suffix = kind === 'summary' ? '-summary' : ''
    return { blob, filename: `${baseName}${suffix}.${ext}` }
  }

  const zip = new JSZip()
  if (docs.pdf) zip.file(`${baseName}.pdf`, await docs.pdf.arrayBuffer())
  if (docs.dxf) zip.file(`${baseName}.dxf`, await docs.dxf.arrayBuffer())
  if (docs.summary) zip.file(`${baseName}-summary.pdf`, await docs.summary.arrayBuffer())
  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, filename: `${baseName}.zip` }
}
