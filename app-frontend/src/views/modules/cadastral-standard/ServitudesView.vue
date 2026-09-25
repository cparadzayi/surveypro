<template>
  <div class="servitudes-view">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4">
      <h2 class="text-2xl font-bold text-gray-900">Servitudes & Dispensation Certificate</h2>
      <p class="mt-1 text-sm text-gray-600">
        Record servitudes and party-wall burdens on stand boundaries, then generate the Dispensation Certificate.
      </p>
    </div>

    <!-- Instructions -->
    <div class="px-6 py-4 bg-blue-50 border-b border-blue-100">
      <div class="flex items-start space-x-3">
        <svg class="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-blue-900">How this works</h3>
          <p class="mt-1 text-sm text-blue-800">
            Select a stand — on the map or from the list — then click one of its boundary sides — on the map
            or in the list — to attach a servitude. Saved servitudes are mirrored onto the General Plan /
            Diagram rendering automatically — you never need to annotate a side twice.
          </p>
        </div>
      </div>
    </div>

    <div class="px-6 py-6 space-y-6 max-w-5xl mx-auto">
      <!-- Stand selection -->
      <div class="bg-white border border-gray-200 rounded-lg p-6">
        <label class="block text-sm font-semibold text-gray-900 mb-2">Stand</label>
        <ParcelSelect
          :options="parcelOptions"
          v-model="selectedParcelId"
          placeholder="Search stand or designation…"
        />
        <p v-if="loading" class="mt-2 text-xs text-gray-500">Loading parcels…</p>
        <p v-else-if="!parcels.length" class="mt-2 text-xs text-gray-500">No parcels found for this project.</p>
      </div>

      <!-- Interactive map (additive — the dropdown + side list below remain a fallback) -->
      <div v-if="parcels.length" class="bg-white border border-gray-200 rounded-lg p-6">
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-semibold text-gray-900">Map</label>
          <p class="text-xs text-gray-500">Click a stand to select it, then click a boundary to attach a servitude.</p>
        </div>
        <div ref="mapContainer" class="servitude-map-container"></div>
        <p v-if="mapInitError" class="mt-2 text-xs text-amber-600">
          Map preview unavailable ({{ mapInitError }}) — use the stand picker and side list below instead.
        </p>
        <div class="mt-2 flex items-center gap-4 text-xs text-gray-500">
          <span class="inline-flex items-center gap-1">
            <span class="inline-block w-3 h-0.5 align-middle" style="background:#DC2626"></span> Servitude
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="inline-block w-3 h-0.5 align-middle" style="background:#B7410E"></span> Road
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="inline-block w-3 h-0.5 align-middle border-t border-dashed border-gray-500"></span> Contiguous
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="inline-block w-3 h-3 align-middle rounded-sm" style="background:#16A34A;opacity:0.45"></span> Stand with a servitude
          </span>
        </div>
      </div>

      <!-- Boundary sides + editor -->
      <div v-if="selectedParcel" class="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h3 class="text-lg font-semibold text-gray-900">
          Boundaries of Stand {{ selectedParcel.stand }}
        </h3>

        <div v-if="!sides.length" class="text-sm text-gray-500">
          This stand has no usable boundary geometry.
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            v-for="s in sides"
            :key="s.side"
            type="button"
            @click="selectSide(s.side)"
            class="px-3 py-2 text-sm rounded-md border text-left transition-colors"
            :class="selectedSide === s.side
              ? 'border-blue-600 bg-blue-50 text-blue-900'
              : servitudeSideSet.has(s.side)
                ? 'border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400'
                : 'border-gray-200 hover:border-blue-300'"
          >
            <span class="font-medium">{{ sideLabel(s) }}</span>
            <span v-if="sideBeaconPair(s)" class="ml-1 text-[10px] text-gray-400">{{ s.side }}</span>
            <span v-if="servitudeSideSet.has(s.side)" class="ml-1 text-xs">●</span>
          </button>
        </div>

        <!-- Editor -->
        <div v-if="selectedSide" class="border-t border-gray-200 pt-4 space-y-4">
          <h4 class="text-sm font-semibold text-gray-900">
            {{ editingId ? 'Edit' : 'New' }} servitude — {{ selectedSideBeaconLabel || selectedSide }}
          </h4>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select v-model="form.type" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option v-for="(label, key) in SERVITUDE_TYPE_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
            <div v-if="form.type === 'other'">
              <label class="block text-xs font-medium text-gray-700 mb-1">Describe type</label>
              <input
                v-model="form.typeLabelOther"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="e.g. Access easement"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">Width (m, optional)</label>
              <input
                v-model.number="form.widthM"
                type="number"
                min="0"
                step="0.01"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">Beneficiary (optional)</label>
              <input
                v-model="form.beneficiary"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="e.g. ZESA Holdings"
              />
            </div>
            <div v-if="form.type === 'party-wall'">
              <label class="block text-xs font-medium text-gray-700 mb-1">Adjoining stand (shared wall)</label>
              <ParcelSelect
                :options="adjoiningParcelOptions"
                v-model="form.adjoiningSubjectId"
                placeholder="Search the stand this wall is shared with…"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">Purpose (optional)</label>
              <input
                v-model="form.purpose"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">Statute reference (optional)</label>
              <input
                v-model="form.statuteRef"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>

          <p v-if="resolvedBeacons" class="text-xs text-gray-500">
            Beacons: {{ resolvedBeacons.fromBeacon }} – {{ resolvedBeacons.toBeacon }}
          </p>
          <p v-else class="text-xs text-gray-400">
            No named beacons resolved for this side — the certificate will reference side {{ selectedSide }} directly.
          </p>

          <div class="flex gap-3">
            <button
              @click="saveServitude"
              :disabled="savingRecord"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {{ savingRecord ? 'Saving…' : (editingId ? 'Update servitude' : 'Save servitude') }}
            </button>
            <button
              @click="cancelEdit"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Existing servitudes for this stand -->
        <div v-if="subjectServitudes.length" class="border-t border-gray-200 pt-4">
          <h4 class="text-sm font-semibold text-gray-900 mb-2">Existing servitudes</h4>
          <ul class="divide-y divide-gray-100">
            <li v-for="s in subjectServitudes" :key="s.id" class="flex items-center justify-between py-2 text-sm">
              <div>
                <span class="font-medium">{{ beaconBoundary(s) || s.side }}</span>
                — {{ servitudeTypeLabel(s) }}
                <span v-if="s.type === 'party-wall' && s.adjoiningStand"> · shared with Stand {{ s.adjoiningStand }}</span>
                <span v-if="s.widthM"> · {{ s.widthM }} m</span>
                <span v-if="s.beneficiary"> · {{ s.beneficiary }}</span>
              </div>
              <div class="flex gap-2">
                <button @click="editServitude(s)" class="text-xs text-blue-600 hover:text-blue-700">Edit</button>
                <button @click="deleteServitude(s.id)" class="text-xs text-red-600 hover:text-red-700">Delete</button>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Certificate header details -->
      <div class="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h3 class="text-lg font-semibold text-gray-900">Certificate details</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Township</label>
            <input v-model="header.township" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Parent property (optional)</label>
            <input v-model="header.parentProperty" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">District (optional)</label>
            <input v-model="header.district" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">General Plan number (optional)</label>
            <input v-model="header.generalPlanNumber" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">SG number (optional)</label>
            <input v-model="header.sgNumber" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Certificate No. (optional)</label>
            <input v-model="header.certificateNumber" type="text" placeholder="blank = hand-filled" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Lo zone (optional)</label>
            <input v-model="header.loZone" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div class="col-span-2">
            <label class="block text-xs font-medium text-gray-700 mb-1">Dispensation clause</label>
            <input v-model="header.dispensationClause" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Surveyor name</label>
            <input v-model="header.surveyorName" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">License number (optional)</label>
            <input v-model="header.licenseNumber" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Place (optional)</label>
            <input v-model="header.place" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <DateInputDDMMYYYY v-model="header.date" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
        </div>
      </div>

      <!-- Generate -->
      <div class="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h3 class="text-lg font-semibold text-gray-900">Generate Dispensation Certificate</h3>

        <div class="flex items-center gap-6">
          <label class="flex items-center gap-2 text-sm">
            <input type="radio" v-model="portion" value="developed" />
            Developed portion
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="radio" v-model="portion" value="undeveloped" />
            Undeveloped portion
          </label>
        </div>

        <button
          @click="generate"
          :disabled="generating"
          class="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400"
        >
          {{ generating ? 'Generating…' : `Generate ${portion === 'developed' ? 'Developed' : 'Undeveloped'} Certificate` }}
        </button>

        <p v-if="genMessage" class="text-sm" :class="genFailed ? 'text-red-600' : 'text-green-700'">
          {{ genMessage }}
        </p>
      </div>

      <!-- Navigation -->
      <div class="flex items-center justify-between pt-2">
        <button
          @click="goBack"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          ← Back to Parcel Digitization & Areas
        </button>
        <button
          @click="goNext"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Continue to Report on Survey →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { capeLoArrayToWGS84, capeLoToWGS84, calculateWGS84Bounds, type CapeLoPoint } from '@/utils/coordinateTransform'
import { useCadastralWorkflow } from '@/composables/useCadastralWorkflow'
import DateInputDDMMYYYY from '@/components/DateInputDDMMYYYY.vue'
import { listCoordinatePoints } from '@/services/spatial'
import { loadBaseMapParcels, computeBaseMapStandLabels, computeBaseMapBeaconLabels } from '@/utils/surveyParcels'
import api from '@/services/api'
import ParcelSelect from '@/components/inputs/ParcelSelect.vue'
import { buildParcelOptions } from '@/components/inputs/parcelSelect'
import { subjectSides, hydrateAnnotationsMap, annotationsForSubject, type SideAnnotation, type SubjectSide } from './sideAnnotations'
import { pickDiagramSubjectId } from './diagramSubjectPick'
import {
  SERVITUDE_TYPE_LABELS,
  newServitudeId,
  upsertServitude,
  removeServitude,
  servitudesInvolving,
  parcelHasServitude,
  hydrateServitudes,
  servitudeTypeLabel,
  beaconBoundary,
  resolveBeaconPair,
  sideMatchingBeaconPair,
  syncServitudeMirror,
  backfillServitudesFromAnnotations,
  type Servitude,
  type ServitudeType,
} from './servitudes'
import { generateAndSaveDispensation, type DispensationHeader } from '@/composables/useDispensationCertificate'
import type { CertificateParcel } from '@/utils/dispensationCertificate'
import { townshipPhrase } from '@/utils/planDesignation'

const { workflowState, projectId } = useCadastralWorkflow()

const parcels = ref<any[]>([])
const servitudes = ref<Servitude[]>([])
const annotations = ref<Record<string, SideAnnotation[]>>({})
const coordinatePoints = ref<any[]>([])

const loading = ref(false)
const savingRecord = ref(false)
const generating = ref(false)

const selectedParcelId = ref<string | number | null>(null)
const selectedSide = ref<string | null>(null)
const editingId = ref<string | null>(null)

const form = ref<{
  type: ServitudeType
  typeLabelOther: string
  widthM: number | undefined
  beneficiary: string
  adjoiningStand: string
  adjoiningSubjectId: string | number | null
  purpose: string
  statuteRef: string
}>({
  type: 'party-wall',
  typeLabelOther: '',
  widthM: undefined,
  beneficiary: '',
  adjoiningStand: '',
  adjoiningSubjectId: null,
  purpose: '',
  statuteRef: '',
})

const portion = ref<'developed' | 'undeveloped'>('developed')
const genMessage = ref<string | null>(null)
const genFailed = ref(false)

const header = ref<DispensationHeader>({
  township: '',
  surveyOf: '',
  parentProperty: '',
  district: '',
  generalPlanNumber: '',
  sgNumber: '',
  loZone: '',
  certificateNumber: '',
  dispensationClause: '',
  surveyorName: '',
  licenseNumber: '',
  place: '',
  date: new Date().toISOString().slice(0, 10),
})

const parcelOptions = computed(() => buildParcelOptions(parcels.value))

const selectedParcel = computed(() =>
  parcels.value.find((p: any) => String(p.id) === String(selectedParcelId.value)) ?? null)

/** Mirrors SurveyPlanMapView.vue's capeLoRingForSubject / ringForParcel. */
function ringForParcel(p: any): [number, number][] | null {
  const ring = p?.geom?.coordinates?.[0]
  return Array.isArray(ring) && ring.length >= 3 ? (ring as [number, number][]) : null
}

/** Ring-ordered edge table for a parcel — stored under `metadata.edges` by the
 *  base-map save, `metadata.residuals.edges` by the area/consistency pipeline. */
function parcelEdges(p: any): any[] {
  return p?.metadata?.edges || p?.metadata?.residuals?.edges || []
}

const sides = computed(() => {
  const ring = selectedParcel.value ? ringForParcel(selectedParcel.value) : null
  return ring ? subjectSides(ring) : []
})

// ---------------------------------------------------------------------------
// Interactive map (self-contained — reuses the pattern from SurveyPlanMapView.vue
// without importing from it). The map is additive: it only changes how a stand
// or boundary side gets SELECTED; the ParcelSelect dropdown + side list below
// remain a fully-working fallback.
// ---------------------------------------------------------------------------

const mapContainer = ref<HTMLDivElement | null>(null)
const map = ref<maplibregl.Map | null>(null)
const mapInitError = ref<string | null>(null)
let mapInitialized = false

/** Central meridian for Cape Lo → WGS84 transforms. Same source + fallback
 *  SurveyPlanMapView uses (`config.value.centralMeridian` there defaults to 31
 *  from `projectInfo.centralMeridian || 31`). */
function currentMeridian(): number {
  const cm = workflowState.projectInfo?.centralMeridian
  return cm != null && Number.isFinite(Number(cm)) ? Number(cm) : 31
}

/** Replicates the Polygon path of SurveyPlanMapView.vue's transformParcelGeometry
 *  (SurveyPlanMapView.vue:3216-3295): parse if string, unwrap Feature, pass through
 *  if already WGS84, else transform each ring with capeLoArrayToWGS84. */
function transformParcelGeometryForMap(geom: any): { type: 'Feature'; geometry: { type: 'Polygon'; coordinates: [number, number][][] }; properties: Record<string, never> } | null {
  let geometry = geom
  if (!geometry) return null
  if (typeof geometry === 'string') {
    try {
      geometry = JSON.parse(geometry)
    } catch {
      return null
    }
  }
  if (geometry?.type === 'Feature' && geometry?.geometry) geometry = geometry.geometry

  // ⭐ CHECK CRS on the ORIGINAL (pre-flatten) geometry object — the
  // MultiPolygon→Polygon rewrite below builds a fresh object with no `.crs`,
  // so the check must run first or an already-WGS84 MultiPolygon parcel gets
  // wrongly re-transformed through capeLoArrayToWGS84 (SurveyPlanMapView.vue:
  // 3216-3295 does the CRS check before the Polygon/MultiPolygon branching —
  // mirrored here).
  const crs = geometry?.crs
  const crsName = crs?.properties?.name || crs?.name || ''
  const isAlreadyWGS84 = crsName.includes('EPSG:4326') || crsName.includes('WGS84')

  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates?.[0])) {
    geometry = { type: 'Polygon', coordinates: geometry.coordinates[0] }
  }
  if (geometry?.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) return null

  if (isAlreadyWGS84) {
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: geometry.coordinates }, properties: {} }
  }

  const zone = currentMeridian()
  const coordinates = geometry.coordinates.map((ring: number[][]) => {
    const capeLoPoints: CapeLoPoint[] = ring.map((c: number[], i: number) => ({ id: `v${i}`, x: c[0], y: c[1] }))
    return capeLoArrayToWGS84(capeLoPoints, zone).map((p) => [p.lng, p.lat] as [number, number])
  })
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates }, properties: {} }
}

function addParcelLayersToMap() {
  if (!map.value) return
  for (const p of parcels.value) {
    const sourceId = `parcel-${p.id}`
    if (map.value.getSource(sourceId)) continue
    const feature = transformParcelGeometryForMap(p.geom)
    if (!feature) continue
    map.value.addSource(sourceId, { type: 'geojson', data: feature as any })
    map.value.addLayer({
      id: `${sourceId}-fill`,
      type: 'fill',
      source: sourceId,
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.12 },
    })
    map.value.addLayer({
      id: `${sourceId}-outline`,
      type: 'line',
      source: sourceId,
      paint: { 'line-color': '#0f172a', 'line-width': 2 },
    })
  }
  highlightSelectedParcelOnMap()
}

/** Base-map labels on the servitude map: a stand designation at each parcel
 *  centroid (like MapLibreAreaView's `parcels-labels`) plus the GE beacon names
 *  at the parcels' vertices — both sourced from the digitized records via the
 *  shared surveyParcels helpers (single source of truth). */
async function addBaseMapLabelsToMap() {
  if (!map.value) return
  try {
    await buildBaseMapLabels()
  } catch (e: any) {
    console.warn('[Servitudes] base-map labels failed:', e?.message)
  }
}

function buildBaseMapLabels() {
  const m = map.value
  if (!m) return
  const meridian = currentMeridian()

  const stands = computeBaseMapStandLabels(parcels.value)
  const standFeatures = stands
    .map((s) => {
      const wgs = capeLoToWGS84({ id: s.stand, x: s.centroid.x, y: s.centroid.y } as CapeLoPoint, meridian)
      return {
        type: 'Feature' as const,
        properties: { stand: s.stand, parcelId: s.parcelId },
        geometry: { type: 'Point' as const, coordinates: [wgs.lng, wgs.lat] },
      }
    })
  m.addSource('base-stand-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: standFeatures } as any })
  m.addLayer({
    id: 'base-stand-labels-layer',
    type: 'symbol',
    source: 'base-stand-labels',
    layout: {
      'text-field': ['get', 'stand'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12, 5, 14, 6, 16, 7, 18, 8, 20, 9],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.2,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-optional': false,
      'text-padding': 3,
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  } as any)

  m.addSource('base-beacon-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })
  m.addLayer({
    id: 'base-beacon-labels-layer',
    type: 'symbol',
    source: 'base-beacon-labels',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12, 4.5, 14, 5.5, 16, 6.5, 18, 7.5, 20, 8.5],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-variable-anchor': ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right'],
      'text-radial-offset': -0.5,
      'text-justify': 'center',
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-optional': false,
      'text-padding': 2,
    },
    paint: { 'text-color': '#1e293b', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  } as any)

  void computeBaseMapBeaconLabels(parcels.value, coordinatePoints.value).then((beacons) => {
    const src = m.getSource('base-beacon-labels') as any
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: beacons
        .map((b) => {
          const wgs = capeLoToWGS84({ id: b.name, x: b.x, y: b.y } as CapeLoPoint, meridian)
          return {
            type: 'Feature' as const,
            properties: { name: b.name, parcelIds: b.parcelIds },
            geometry: { type: 'Point' as const, coordinates: [wgs.lng, wgs.lat] },
          }
        }),
    } as any)
  }).catch((e: any) => {
    console.warn('[Servitudes] beacon labels failed:', e?.message)
  })
}

/**
 * Stronger fill/outline for the selected stand — mirrors applyDiagramHighlight — and
 * green for a stand that already carries a servitude, so the ones still to be
 * draughted are the ones left blue. An annotated stand sits a little more opaque
 * than a plain one, because green at 0.12 is too faint to pick out at a glance.
 */
function highlightSelectedParcelOnMap() {
  if (!map.value) return
  parcels.value.forEach((p: any) => {
    const fillId = `parcel-${p.id}-fill`
    const outlineId = `parcel-${p.id}-outline`
    if (!map.value!.getLayer(fillId) || !map.value!.getLayer(outlineId)) return
    const isSelected = selectedParcelId.value != null && String(p.id) === String(selectedParcelId.value)
    const hasServitude = parcelHasServitude(servitudes.value, p.id)
    map.value!.setPaintProperty(fillId, 'fill-color', hasServitude ? '#16A34A' : '#3b82f6')
    map.value!.setPaintProperty(fillId, 'fill-opacity', isSelected ? 0.35 : hasServitude ? 0.22 : 0.12)
    map.value!.setPaintProperty(outlineId, 'line-color', isSelected ? '#2563eb' : '#0f172a')
    map.value!.setPaintProperty(outlineId, 'line-width', isSelected ? 4 : 2)
  })
}

function fitMapToParcels() {
  if (!map.value) return
  const points: { id: string; lng: number; lat: number }[] = []
  for (const p of parcels.value) {
    const feature = transformParcelGeometryForMap(p.geom)
    const ring = feature?.geometry?.coordinates?.[0]
    if (!ring) continue
    ring.forEach((c, i) => points.push({ id: `${p.id}-${i}`, lng: c[0], lat: c[1] }))
  }
  if (!points.length) return
  try {
    const bounds = calculateWGS84Bounds(points as any)
    map.value.fitBounds(
      [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
      { padding: 40, animate: false },
    )
  } catch (e: any) {
    console.warn('[Servitudes] fitBounds failed:', e?.message)
  }
}

/** Clickable boundary-side layer for the SELECTED stand only — mirrors
 *  SurveyPlanMapView.vue's updateSubjectSidesLayer (1932-1976): solid layer for
 *  road/servitude, dashed for contiguous/unannotated, plus a wide transparent
 *  hit layer for easy clicking. Role colours come from the same mirror map this
 *  view already loads (`annotations`). */
function updateSidesMapLayer() {
  if (!map.value) return
  const srcId = 'servitude-map-sides'
  const feats: any[] = []
  if (selectedParcel.value?.geom) {
    const feature = transformParcelGeometryForMap(selectedParcel.value.geom)
    const wgsRing = feature?.geometry?.coordinates?.[0]
    if (wgsRing) {
      const roleBySide = new Map(
        annotationsForSubject(annotations.value, selectedParcelId.value).map((a) => [a.side, a.role]),
      )
      for (const s of subjectSides(wgsRing)) {
        feats.push({
          type: 'Feature',
          properties: { side: s.side, role: roleBySide.get(s.side) ?? '' },
          geometry: { type: 'LineString', coordinates: [s.a, s.b] },
        })
      }
    }
  }
  const data = { type: 'FeatureCollection', features: feats } as any
  const existing = map.value.getSource(srcId) as any
  if (existing) {
    existing.setData(data)
    return
  }
  map.value.addSource(srcId, { type: 'geojson', data })
  // Servitude sides read red HERE, on the map the surveyor draughts them from,
  // against the road's burnt sienna. The diagram and plan output keep their own
  // servitude blue; this colour is a draughting aid, not a plan convention.
  const colour = ['match', ['get', 'role'], 'road', '#B7410E', 'servitude', '#DC2626', 'contiguous', '#000000', '#9aa0a6'] as any
  map.value.addLayer({
    id: `${srcId}-solid`, type: 'line', source: srcId,
    filter: ['any', ['==', ['get', 'role'], 'road'], ['==', ['get', 'role'], 'servitude']] as any,
    paint: { 'line-color': colour, 'line-width': 4 },
  })
  map.value.addLayer({
    id: `${srcId}-dashed`, type: 'line', source: srcId,
    filter: ['!', ['any', ['==', ['get', 'role'], 'road'], ['==', ['get', 'role'], 'servitude']]] as any,
    paint: { 'line-color': colour, 'line-width': 4, 'line-dasharray': [2, 2] },
  })
  map.value.addLayer({
    id: `${srcId}-hit`, type: 'line', source: srcId,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 14 },
  })
  map.value.on('mouseenter', `${srcId}-hit`, () => { if (map.value) map.value.getCanvas().style.cursor = 'pointer' })
  map.value.on('mouseleave', `${srcId}-hit`, () => { if (map.value) map.value.getCanvas().style.cursor = '' })
}

/** Mirrors onMapClickSelectParcel (SurveyPlanMapView.vue:1978-2011): a hit on the
 *  subject-sides layer takes priority and drives the SAME selectSide() the side
 *  list uses; otherwise pick the smallest overlapping stand under the click and
 *  set the SAME selectedParcelId the ParcelSelect dropdown sets. */
function onMapClick(e: maplibregl.MapMouseEvent) {
  if (!map.value) return
  const hitLayer = 'servitude-map-sides-hit'
  if (map.value.getLayer(hitLayer)) {
    const sideHits = map.value.queryRenderedFeatures(e.point, { layers: [hitLayer] })
    if (sideHits.length) {
      const side = String(sideHits[0].properties?.side ?? '')
      if (side) {
        selectSide(side)
        return
      }
    }
  }
  const fillLayers = parcels.value
    .map((p: any) => `parcel-${p.id}-fill`)
    .filter((id: string) => map.value!.getLayer(id))
  if (!fillLayers.length) return
  const hits = map.value.queryRenderedFeatures(e.point, { layers: fillLayers })
  if (!hits.length) return
  const hitLayerIds = hits.map((h) => h.layer.id)
  const pickedId = pickDiagramSubjectId(hitLayerIds, parcels.value, null)
  if (pickedId == null) return
  selectedParcelId.value = pickedId
}

/** Mirrors SurveyPlanMapView.vue's map init (1564-1620): raster OSM + satellite
 *  style, fixed Zimbabwe-ish default center, fit to data once parcels are drawn.
 *  Best-effort: guarded on container + parcels, wrapped in try/catch so the
 *  dropdown + side list keep working if the map can't initialise. */
function initServitudeMap() {
  if (mapInitialized || !mapContainer.value || !parcels.value.length) return
  mapInitialized = true
  try {
    map.value = new maplibregl.Map({
      container: mapContainer.value,
      preserveDrawingBuffer: true,
      style: {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
          satellite: {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© Esri',
          },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#f0f0f0' } },
          { id: 'satellite-layer', type: 'raster', source: 'satellite' },
          { id: 'osm-layer', type: 'raster', source: 'osm-raster', layout: { visibility: 'none' } },
        ],
      } as any,
      center: [29.8, -19.4],
      zoom: 16,
      minZoom: 10,
      maxZoom: 20,
    } as any)
    map.value.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.value.on('error', (e: any) => {
      console.warn('[Servitudes] map tile error:', e?.error)
    })

    map.value.on('load', () => {
      try {
        addParcelLayersToMap()
        fitMapToParcels()
        void addBaseMapLabelsToMap()
        updateSidesMapLayer()
        map.value!.on('click', onMapClick)
      } catch (e: any) {
        console.warn('[Servitudes] map load handler failed:', e?.message)
        mapInitError.value = e?.message || 'Map failed to render parcels'
      }
    })
  } catch (e: any) {
    console.warn('[Servitudes] map init failed:', e?.message)
    mapInitError.value = e?.message || 'Map unavailable'
    map.value = null
  }
}

// Rebuild the highlight + clickable sides whenever the selected stand changes,
// or whenever a servitude is saved/deleted (syncAndPersist reassigns `servitudes`
// and `annotations`, so the side the user just saved recolours to servitude-blue).
watch([selectedParcelId, servitudes, annotations], () => {
  if (!map.value) return
  highlightSelectedParcelOnMap()
  updateSidesMapLayer()
})

const subjectServitudes = computed(() =>
  selectedParcelId.value == null ? [] : servitudesInvolving(servitudes.value, selectedParcelId.value))

const servitudeSideSet = computed(() => new Set(subjectServitudes.value.map((s) => s.side)))

/** Beacon names resolved for every lettered side of the selected parcel. */
const sideBeaconPairs = computed<Record<string, { fromBeacon: string; toBeacon: string } | null>>(() => {
  const out: Record<string, { fromBeacon: string; toBeacon: string } | null> = {}
  const parcel = selectedParcel.value
  if (!parcel) return out
  const edges = parcelEdges(parcel)
  for (const s of sides.value) {
    out[s.side] = resolveBeaconPair(sides.value, edges, s.side, coordinatePoints.value)
  }
  return out
})

function beaconLabelForSide(side: string | null): string | null {
  if (!side) return null
  const b = sideBeaconPairs.value[side]
  return b ? `${b.fromBeacon} – ${b.toBeacon}` : null
}

function sideBeaconPair(s: SubjectSide): { fromBeacon: string; toBeacon: string } | null {
  return sideBeaconPairs.value[s.side] ?? null
}

/** Display label for a boundary-side button: the beacon pair when named, else the letter side. */
function sideLabel(s: SubjectSide): string {
  return beaconLabelForSide(s.side) ?? s.side
}

const selectedSideBeaconLabel = computed(() => beaconLabelForSide(selectedSide.value))

const resolvedBeacons = computed(() => {
  if (!selectedSide.value) return null
  return sideBeaconPairs.value[selectedSide.value] ?? null
})

/** Parcels a party-wall on the selected stand may be shared with (any other parcel). */
const adjoiningParcelOptions = computed(() =>
  selectedParcelId.value == null ? [] : buildParcelOptions(parcels.value, { excludeId: selectedParcelId.value }))

function parcelIdForStand(stand: string | undefined | null): string | null {
  if (!stand) return null
  const p = parcels.value.find((x: any) => String(x.stand ?? '').trim() === String(stand).trim())
  return p ? String(p.id) : null
}

/** The governing servitude for a clicked side: a record keyed by that side, else
 *  a shared party wall recorded from the OTHER parcel (its ring side letter differs;
 *  matched back by the beacon pair instead). */
function existingServitudeForSide(list: Servitude[], side: string): Servitude | null {
  const direct = list.find((s) => s.side === side)
  if (direct) return direct
  const pair = sideBeaconPairs.value[side]
  if (!pair) return null
  return list.find(
    (s) => s.type === 'party-wall' && s.fromBeacon && s.toBeacon &&
      ((s.fromBeacon === pair.fromBeacon && s.toBeacon === pair.toBeacon) ||
        (s.fromBeacon === pair.toBeacon && s.toBeacon === pair.fromBeacon)),
  ) ?? null
}

function resetForm() {
  form.value = {
    type: 'party-wall',
    typeLabelOther: '',
    widthM: undefined,
    beneficiary: '',
    adjoiningStand: '',
    adjoiningSubjectId: null,
    purpose: '',
    statuteRef: '',
  }
}

function selectSide(side: string) {
  selectedSide.value = side
  editingId.value = null
  const existing = existingServitudeForSide(subjectServitudes.value, side)
  if (existing) {
    editServitude(existing)
    return
  }
  resetForm()
  // A party wall's adjoining stand can be derived from the boundary's beacon
  // pair — auto-choose the parcel on the other side so the surveyor can't pick
  // the wrong one. Falls back to manual selection when no geometry matches.
  const partner = adjoiningParcelForSide(sideBeaconPairs.value[side])
  if (form.value.type === 'party-wall' && partner) {
    form.value.adjoiningSubjectId = String(partner.id)
    form.value.adjoiningStand = partner.stand?.trim() ?? ''
  }
}

function editServitude(s: Servitude) {
  selectedSide.value = s.side
  editingId.value = s.id
  form.value = {
    type: s.type,
    typeLabelOther: s.typeLabelOther || '',
    widthM: s.widthM,
    beneficiary: s.beneficiary || '',
    adjoiningStand: s.adjoiningStand || '',
    adjoiningSubjectId: s.adjoiningSubjectId ?? parcelIdForStand(s.adjoiningStand),
    purpose: s.purpose || '',
    statuteRef: s.statuteRef || '',
  }
}

function cancelEdit() {
  selectedSide.value = null
  editingId.value = null
  resetForm()
}

async function persistServitudes() {
  if (!projectId.value) return
  try {
    await api.patch(`/survey-projects/${projectId.value}/workflow`, {
      step: 'servitudes',
      action: 'update',
      metadata: {
        servitudes: servitudes.value,
        header: header.value,
        portion: portion.value,
      },
    })
  } catch (e: any) {
    console.warn('[Servitudes] failed to persist servitudes:', e?.message)
  }
}

async function persistMirror() {
  if (!projectId.value) return
  try {
    await api.patch(`/survey-projects/${projectId.value}/workflow`, {
      step: 'survey-plan',
      action: 'update',
      metadata: { sideAnnotations: annotations.value },
    })
  } catch (e: any) {
    console.warn('[Servitudes] failed to persist survey-plan mirror:', e?.message)
  }
}

/** The ring side of a parcel that walks a given beacon-pair boundary (either
 *  direction — an adjoining ring sees the same edge reversed). */
function sideForBeaconPairOnParcel(p: any, pair: { fromBeacon: string; toBeacon: string }): string | null {
  const ring = ringForParcel(p)
  const pSides = ring ? subjectSides(ring) : []
  if (!pSides.length) return null
  return sideMatchingBeaconPair(pSides, parcelEdges(p), coordinatePoints.value, pair)
}

/** The parcel sharing the given beacon-pair boundary with the selected stand, if
 *  any. This auto-populates the party wall's adjoining stand so the surveyor
 *  doesn't have to hunt for the correct parcel themselves. */
function adjoiningParcelForSide(pair: { fromBeacon: string; toBeacon: string } | null): any | null {
  if (!pair) return null
  const reverse = { fromBeacon: pair.toBeacon, toBeacon: pair.fromBeacon }
  for (const p of parcels.value) {
    if (selectedParcelId.value != null && String(p.id) === String(selectedParcelId.value)) continue
    if (sideForBeaconPairOnParcel(p, reverse)) return p
  }
  return null
}

// Switching a freshly-added servitude to a party wall must name its other parcel —
// auto-populate it from the boundary geometry (never overriding a user choice).
watch(() => form.value.type, (type) => {
  if (type !== 'party-wall') return
  if (form.value.adjoiningSubjectId || !selectedSide.value) return
  const partner = adjoiningParcelForSide(sideBeaconPairs.value[selectedSide.value])
  if (partner) {
    form.value.adjoiningSubjectId = String(partner.id)
    form.value.adjoiningStand = partner.stand?.trim() ?? ''
  }
})

/** The reciprocal parcel's ring side carrying a shared party wall, so the map
 *  mirror also tags the adjoining stand. Prefers the recorded reciprocal parcel;
 *  falls back to a beacon-pair match against the adjoining geometry. */
function adjoiningSideForPartyWall(s: Servitude): { subjectId: string; side: string } | null {
  if (s.type !== 'party-wall' || !s.fromBeacon || !s.toBeacon) return null
  const pair = { fromBeacon: s.fromBeacon, toBeacon: s.toBeacon }
  const parcel = s.adjoiningSubjectId
    ? (parcels.value.find((p: any) => String(p.id) === String(s.adjoiningSubjectId)) ?? null)
    : null
  const target = parcel ?? adjoiningParcelForSide(pair)
  if (!target) return null
  const side = sideForBeaconPairOnParcel(target, pair)
  return side ? { subjectId: String(target.id), side } : null
}

/** Rebuild the role:'servitude' mirror from the servitude records and persist BOTH steps.
 *  This view is the sole writer of role:'servitude' annotation entries. */
async function syncAndPersist() {
  annotations.value = syncServitudeMirror(annotations.value, servitudes.value, adjoiningSideForPartyWall)
  await persistServitudes()
  await persistMirror()
}

async function saveServitude() {
  if (!selectedParcelId.value || !selectedSide.value) return
  savingRecord.value = true
  try {
    const subjectId = String(selectedParcelId.value)
    const existing = existingServitudeForSide(subjectServitudes.value, selectedSide.value)
    // A party wall is shared between two parcels. Editing one from the OTHER
    // stand keeps the record anchored to the parcel it was first recorded on
    // (and that parcel's ring side + beacon direction), so the wall stays a
    // single record surfaced from both sides of the boundary.
    const anchoredElsewhere = !!existing && existing.subjectId !== subjectId
    const anchorSubjectId = anchoredElsewhere ? existing.subjectId : subjectId
    const anchorSide = anchoredElsewhere ? existing.side : selectedSide.value
    const beacons = sideBeaconPairs.value[selectedSide.value]

    const isPartyWall = form.value.type === 'party-wall'
    let adjoiningParcel = isPartyWall
      ? parcels.value.find((p: any) => String(p.id) === String(form.value.adjoiningSubjectId)) ?? null
      : null
    // Safety net: a party wall must name its other parcel. If the surveyor cleared the
    // (auto-populated) adjoining stand, fall back to the geometric partner of the boundary.
    if (!adjoiningParcel && beacons && !anchoredElsewhere) {
      adjoiningParcel = adjoiningParcelForSide(beacons)
      if (adjoiningParcel) {
        form.value.adjoiningSubjectId = String(adjoiningParcel.id)
        form.value.adjoiningStand = adjoiningParcel.stand?.trim() ?? ''
      }
    }
    const record: Servitude = {
      id: editingId.value ?? existing?.id ?? newServitudeId(),
      subjectId: anchorSubjectId,
      side: anchorSide,
      type: form.value.type,
      typeLabelOther: form.value.type === 'other' ? (form.value.typeLabelOther.trim() || undefined) : undefined,
      widthM: form.value.widthM != null && !Number.isNaN(form.value.widthM) ? Number(form.value.widthM) : undefined,
      beneficiary: form.value.beneficiary.trim() || undefined,
      adjoiningStand: isPartyWall
        ? (adjoiningParcel?.stand?.trim() || form.value.adjoiningStand.trim() || undefined)
        : undefined,
      adjoiningSubjectId: isPartyWall
        ? (adjoiningParcel?.id != null ? String(adjoiningParcel.id) : undefined)
        : undefined,
      purpose: form.value.purpose.trim() || undefined,
      statuteRef: form.value.statuteRef.trim() || undefined,
      fromBeacon: anchoredElsewhere && existing.fromBeacon ? existing.fromBeacon : beacons?.fromBeacon,
      toBeacon: anchoredElsewhere && existing.toBeacon ? existing.toBeacon : beacons?.toBeacon,
    }
    servitudes.value = upsertServitude(servitudes.value, record)
    await syncAndPersist()
    cancelEdit()
  } finally {
    savingRecord.value = false
  }
}

async function deleteServitude(id: string) {
  servitudes.value = removeServitude(servitudes.value, id)
  await syncAndPersist()
  if (editingId.value === id) cancelEdit()
}

function applyHeaderDefaults() {
  const info = workflowState.projectInfo
  // The certificate's "SURVEY OF ..." designation comes from the workflow's
  // single source of truth, not from the editable township field. A manually
  // saved header is overridden so the certificate always tracks the project.
  const surveyOf = workflowState.surveyorInfo?.surveyOf
    || workflowState.projectInfo?.designation
    || header.value.surveyOf
  header.value.surveyOf = surveyOf
  // The Township box holds the designation's township phrase — "MAGLAS TOWNSHIP
  // OF SHABANI MINE SURFACE RIGHTS A", never the project's short name ("MAG1
  // SH2") and never the workflow's unpopulated projectInfo.township.
  header.value.township = townshipPhrase(surveyOf)
    || info.township
    || info.name
    || header.value.township
  header.value.parentProperty = info.parentProperty || header.value.parentProperty
  header.value.district = info.district || header.value.district
  header.value.loZone = info.centralMeridian != null ? `Lo ${info.centralMeridian}` : header.value.loZone
  header.value.surveyorName = workflowState.surveyorInfo.landSurveyor || header.value.surveyorName
  header.value.licenseNumber = workflowState.surveyorInfo.licenseNumber || header.value.licenseNumber
  header.value.place = header.value.place || info.district || ''
}

async function loadServitudesAndAnnotations() {
  if (!projectId.value) return
  try {
    const resp = await api.get(`/survey-projects/${projectId.value}/workflow`)
    const ws = resp.data?.workflow_state
    const savedStep = ws?.step_data?.['servitudes']
    servitudes.value = hydrateServitudes(savedStep?.servitudes)
    annotations.value = hydrateAnnotationsMap(ws?.step_data?.['survey-plan']?.sideAnnotations)
    // Restore the certificate header + portion the last generation was made
    // with, so the Servitudes stage and the comprehensive record stay in step.
    if (savedStep?.header && typeof savedStep.header === 'object') {
      header.value = { ...header.value, ...savedStep.header }
    }
    if (savedStep?.portion === 'developed' || savedStep?.portion === 'undeveloped') {
      portion.value = savedStep.portion
    }
  } catch (e: any) {
    console.warn('[Servitudes] failed to load workflow state:', e?.message)
  }

  // One-time migration: adopt any legacy hand-authored role:'servitude' annotations
  // (no servitudeId) as Servitude records, then resync the mirror from records.
  const legacy = backfillServitudesFromAnnotations(annotations.value)
  if (legacy.length) {
    servitudes.value = [...servitudes.value, ...legacy]
    await syncAndPersist()
  }
}

async function loadParcels() {
  if (!projectId.value) return
  try {
    parcels.value = await loadBaseMapParcels(projectId.value)
  } catch (e: any) {
    console.warn('[Servitudes] failed to load parcels:', e?.message)
  }
}

async function loadCoordinatePoints() {
  if (!projectId.value) return
  try {
    coordinatePoints.value = await listCoordinatePoints(projectId.value)
  } catch (e: any) {
    console.warn('[Servitudes] failed to load coordinate points:', e?.message)
  }
}

/** Legacy coverage: records saved before beacon resolution shipped only carry
 *  `side` (e.g. "BC"). Re-resolve fromBeacon/toBeacon from the current parcels'
 *  ring + edges and the loaded coordinate points so the certificate shows real
 *  beacon names for those too. Does not mutate/persist `servitudes` — the
 *  resolved copies are only used for this generation run. When the parcel or
 *  side can't be resolved, the beacons are left undefined and the row falls
 *  back to the raw side (buildCertificateRows' `s.side` fallback). */
function resolveServitudesForCertificate(list: Servitude[]): Servitude[] {
  return list.map((s) => {
    const parcel = parcels.value.find((p: any) => String(p.id) === s.subjectId)
    const ring = parcel ? ringForParcel(parcel) : null
    const sidesForParcel = ring ? subjectSides(ring) : []
    const beacons = resolveBeaconPair(
      sidesForParcel, parcelEdges(parcel), s.side, coordinatePoints.value,
    )
    return { ...s, fromBeacon: beacons?.fromBeacon, toBeacon: beacons?.toBeacon }
  })
}

async function generate() {
  if (!projectId.value) return
  generating.value = true
  genMessage.value = null
  genFailed.value = false
  try {
    // Snapshot the header + portion this run uses, so the comprehensive record's
    // certificate collation matches the standalone one exactly.
    await persistServitudes()
    const certParcels: CertificateParcel[] = parcels.value.map((p: any) => ({
      id: p.id,
      stand: p.stand,
      designation: p.designation ?? p.stand,
      area_m2: p.area_m2 != null ? Number(p.area_m2) : undefined,
    }))
    const result = await generateAndSaveDispensation({
      workingDirectory: workflowState.projectInfo.workingDirectory || '',
      portion: portion.value,
      parcels: certParcels,
      servitudes: resolveServitudesForCertificate(servitudes.value),
      header: header.value,
    })
    if (result.saved) {
      genMessage.value = `Saved: ${result.saved}`
      genFailed.value = false
    } else {
      genMessage.value = `Failed: ${result.failed || 'Unknown error'}`
      genFailed.value = true
    }
  } catch (e: any) {
    genMessage.value = `Failed: ${e?.message || 'Unknown error'}`
    genFailed.value = true
  } finally {
    generating.value = false
  }
}

function goBack() {
  workflowState.currentStep = 'area-computation'
}

function goNext() {
  workflowState.currentStep = 'report-on-survey'
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([loadParcels(), loadServitudesAndAnnotations(), loadCoordinatePoints()])
    applyHeaderDefaults()
  } finally {
    loading.value = false
  }
  // The map container only renders (v-if="parcels.length") once parcels have
  // loaded — wait a tick so mapContainer.value is attached before initialising.
  await nextTick()
  initServitudeMap()
})

onUnmounted(() => {
  try {
    map.value?.remove()
  } catch (e: any) {
    console.warn('[Servitudes] map teardown failed:', e?.message)
  }
  map.value = null
})
</script>

<style scoped>
.servitudes-view {
  min-height: 100vh;
  background-color: #f9fafb;
}

.servitude-map-container {
  height: 420px;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}
</style>
