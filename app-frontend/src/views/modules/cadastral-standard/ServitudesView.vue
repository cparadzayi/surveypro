<template>
  <div class="servitudes-view">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4">
      <h2 class="text-2xl font-bold text-gray-900">Servitudes</h2>
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
            <span class="inline-block w-3 h-0.5 align-middle" style="background:#1F6FB2"></span> Servitude
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="inline-block w-3 h-0.5 align-middle" style="background:#B7410E"></span> Road
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="inline-block w-3 h-0.5 align-middle border-t border-dashed border-gray-500"></span> Contiguous
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
            <span class="font-medium">{{ s.side }}</span>
            <span v-if="servitudeSideSet.has(s.side)" class="ml-1 text-xs">●</span>
          </button>
        </div>

        <!-- Editor -->
        <div v-if="selectedSide" class="border-t border-gray-200 pt-4 space-y-4">
          <h4 class="text-sm font-semibold text-gray-900">
            {{ editingId ? 'Edit' : 'New' }} servitude — side {{ selectedSide }}
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
              <label class="block text-xs font-medium text-gray-700 mb-1">Adjoining stand</label>
              <input
                v-model="form.adjoiningStand"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="e.g. 45"
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
                <span class="font-medium">{{ s.side }}</span>
                — {{ servitudeTypeLabel(s) }}
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
            <input v-model="header.date" type="date" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
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
          ← Back to Area Computation
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
import { capeLoArrayToWGS84, calculateWGS84Bounds, type CapeLoPoint } from '@/utils/coordinateTransform'
import { useCadastralWorkflow } from '@/composables/useCadastralWorkflow'
import { listLandParcels, listCoordinatePoints } from '@/services/spatial'
import api from '@/services/api'
import ParcelSelect from '@/components/inputs/ParcelSelect.vue'
import { buildParcelOptions } from '@/components/inputs/parcelSelect'
import { subjectSides, hydrateAnnotationsMap, annotationsForSubject, type SideAnnotation } from './sideAnnotations'
import { pickDiagramSubjectId } from './diagramSubjectPick'
import {
  SERVITUDE_TYPE_LABELS,
  newServitudeId,
  upsertServitude,
  removeServitude,
  servitudesForSubject,
  hydrateServitudes,
  servitudeTypeLabel,
  resolveBeaconPair,
  syncServitudeMirror,
  backfillServitudesFromAnnotations,
  type Servitude,
  type ServitudeType,
} from './servitudes'
import { generateAndSaveDispensation, type DispensationHeader } from '@/composables/useDispensationCertificate'
import type { CertificateParcel } from '@/utils/dispensationCertificate'

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
  purpose: string
  statuteRef: string
}>({
  type: 'party-wall',
  typeLabelOther: '',
  widthM: undefined,
  beneficiary: '',
  adjoiningStand: '',
  purpose: '',
  statuteRef: '',
})

const portion = ref<'developed' | 'undeveloped'>('developed')
const genMessage = ref<string | null>(null)
const genFailed = ref(false)

const header = ref<DispensationHeader>({
  township: '',
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

/** Stronger fill/outline for the selected stand — mirrors applyDiagramHighlight. */
function highlightSelectedParcelOnMap() {
  if (!map.value) return
  parcels.value.forEach((p: any) => {
    const fillId = `parcel-${p.id}-fill`
    const outlineId = `parcel-${p.id}-outline`
    if (!map.value!.getLayer(fillId) || !map.value!.getLayer(outlineId)) return
    const isSelected = selectedParcelId.value != null && String(p.id) === String(selectedParcelId.value)
    map.value!.setPaintProperty(fillId, 'fill-opacity', isSelected ? 0.35 : 0.12)
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
  const colour = ['match', ['get', 'role'], 'road', '#B7410E', 'servitude', '#1F6FB2', 'contiguous', '#000000', '#9aa0a6'] as any
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
  selectedParcelId.value == null ? [] : servitudesForSubject(servitudes.value, String(selectedParcelId.value)))

const servitudeSideSet = computed(() => new Set(subjectServitudes.value.map((s) => s.side)))

const resolvedBeacons = computed(() => {
  if (!selectedSide.value) return null
  return resolveBeaconPair(
    sides.value, selectedParcel.value?.metadata?.edges || [], selectedSide.value, coordinatePoints.value,
  )
})

function resetForm() {
  form.value = {
    type: 'party-wall',
    typeLabelOther: '',
    widthM: undefined,
    beneficiary: '',
    adjoiningStand: '',
    purpose: '',
    statuteRef: '',
  }
}

function selectSide(side: string) {
  selectedSide.value = side
  editingId.value = null
  const existing = subjectServitudes.value.find((s) => s.side === side)
  if (existing) {
    editServitude(existing)
  } else {
    resetForm()
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
      metadata: { servitudes: servitudes.value },
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

/** Rebuild the role:'servitude' mirror from the servitude records and persist BOTH steps.
 *  This view is the sole writer of role:'servitude' annotation entries. */
async function syncAndPersist() {
  annotations.value = syncServitudeMirror(annotations.value, servitudes.value)
  await persistServitudes()
  await persistMirror()
}

async function saveServitude() {
  if (!selectedParcelId.value || !selectedSide.value) return
  savingRecord.value = true
  try {
    const subjectId = String(selectedParcelId.value)
    const beacons = resolveBeaconPair(
      sides.value, selectedParcel.value?.metadata?.edges || [], selectedSide.value, coordinatePoints.value,
    )
    const record: Servitude = {
      id: editingId.value ?? newServitudeId(),
      subjectId,
      side: selectedSide.value,
      type: form.value.type,
      typeLabelOther: form.value.type === 'other' ? (form.value.typeLabelOther.trim() || undefined) : undefined,
      widthM: form.value.widthM != null && !Number.isNaN(form.value.widthM) ? Number(form.value.widthM) : undefined,
      beneficiary: form.value.beneficiary.trim() || undefined,
      adjoiningStand: form.value.type === 'party-wall' ? (form.value.adjoiningStand.trim() || undefined) : undefined,
      purpose: form.value.purpose.trim() || undefined,
      statuteRef: form.value.statuteRef.trim() || undefined,
      fromBeacon: beacons?.fromBeacon,
      toBeacon: beacons?.toBeacon,
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
  header.value.township = info.township || info.name || header.value.township
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
    servitudes.value = hydrateServitudes(ws?.step_data?.['servitudes']?.servitudes)
    annotations.value = hydrateAnnotationsMap(ws?.step_data?.['survey-plan']?.sideAnnotations)
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
    parcels.value = await listLandParcels(projectId.value)
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
      sidesForParcel, parcel?.metadata?.edges || [], s.side, coordinatePoints.value,
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
    const certParcels: CertificateParcel[] = parcels.value.map((p: any) => ({
      id: p.id,
      stand: p.stand,
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
