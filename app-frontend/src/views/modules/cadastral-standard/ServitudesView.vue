<template>
  <div class="servitudes-view">
    <div class="bnd-bar">
      <h2 class="bnd-title">Boundaries &amp; Abutters</h2>
      <p class="bnd-sub">Tag what abuts each boundary &mdash; roads, servitudes and contiguous neighbours.</p>
      <details class="bnd-help">
        <summary>How this works</summary>
        <p>
          Select a stand, the Outside Figure or a sheet's figure &mdash; on the map or from the list &mdash; then click one
          of its boundary sides and say what it is. This is the only place sides are tagged; the General Plan and Diagram
          read these tags, so you never tag a side twice. Servitudes also feed the Dispensation Certificate.
        </p>
      </details>
    </div>

    <div ref="workspace" class="bnd-workspace" :class="{ 'dock-collapsed': dockCollapsed }">
      <SideClassifyModal :editor="roleEditor" :roles="['road', 'contiguous']" @save="saveRoleEditor" @clear="clearRoleTag" @cancel="roleEditor = null" />

      <!-- Map: takes everything the dock leaves -->
      <div class="bnd-map-wrap">
        <div ref="mapContainer" class="bnd-map"></div>

        <div class="bnd-toolbar" role="toolbar" aria-label="Map controls">
          <div class="bnd-seg" role="group" aria-label="Basemap">
            <button v-for="b in BASEMAP_MODES" :key="b.mode" type="button" class="bnd-seg-btn"
              :class="{ 'bnd-seg-active': basemapMode === b.mode }" :aria-pressed="basemapMode === b.mode"
              :title="b.mode === 'auto' ? 'Street map, with satellite fading in as you zoom closer' : ''"
              @click="basemapMode = b.mode">{{ b.label }}</button>
          </div>
          <button type="button" class="bnd-tool" title="Fit all stands" @click="fitMapToParcels(true)">⤢ Fit</button>
          <button type="button" class="bnd-tool" :disabled="!selectedParcel" title="Zoom to the selected subject" @click="zoomToSelected">◎ Subject</button>
          <button type="button" class="bnd-tool" :title="isFullscreen ? 'Exit full screen' : 'Full screen'" @click="toggleFullscreen">{{ isFullscreen ? '⤡ Exit' : '⛶ Full' }}</button>
        </div>

        <div class="bnd-legend" aria-label="Legend">
          <span><i class="bnd-sw" style="background:#DC2626"></i>Servitude</span>
          <span><i class="bnd-sw" style="background:#B7410E"></i>Road</span>
          <span><i class="bnd-sw bnd-sw-dash"></i>Contiguous</span>
          <span><i class="bnd-sw bnd-sw-fill"></i>Stand with a servitude</span>
        </div>

        <p v-if="mapInitError" class="bnd-note">Map unavailable ({{ mapInitError }}) &mdash; use the subject list and side buttons instead.</p>
        <p v-else-if="loading" class="bnd-note">Loading parcels…</p>
        <p v-else-if="!parcels.length" class="bnd-note">No parcels found for this project.</p>

        <button v-if="dockCollapsed" type="button" class="bnd-expand" @click="dockCollapsed = false" title="Show the panel">◀ Panel</button>
      </div>

      <!-- Dock -->
      <aside v-if="!dockCollapsed" class="bnd-dock" aria-label="Boundaries panel">
        <div class="bnd-dock-header">
          <h3 class="bnd-dock-title">Boundaries</h3>
          <button type="button" class="bnd-collapse" title="Hide the panel to maximise the map" @click="dockCollapsed = true">▶</button>
        </div>
        <div class="bnd-tabs" role="tablist" aria-label="Boundaries sections" @keydown="onDockTabKeydown">
          <button v-for="t in DOCK_TABS" :id="`bnd-tab-${t.id}`" :key="t.id" type="button" role="tab" class="bnd-tab"
            :class="{ 'bnd-tab-active': dockTab === t.id }" :aria-selected="dockTab === t.id"
            :aria-controls="`bnd-panel-${t.id}`" :tabindex="dockTab === t.id ? 0 : -1" @click="dockTab = t.id">
            <span aria-hidden="true">{{ t.icon }}</span><span>{{ t.label }}</span>
            <span v-if="t.id === 'servitudes' && servitudes.length" class="bnd-badge">{{ servitudes.length }}</span>
          </button>
        </div>

        <div class="bnd-dock-body">
          <!-- Subject -->
          <div id="bnd-panel-subject" v-show="dockTab === 'subject'" role="tabpanel" aria-labelledby="bnd-tab-subject" class="space-y-3">
            <div>
              <label class="bnd-label">Subject (stand, Outside Figure or sheet)</label>
              <ParcelSelect :options="parcelOptions" v-model="selectedParcelId" placeholder="Search, or click the map…" @select="zoomSoon" />
              <p v-if="!selectedParcel" class="bnd-hint">Click a stand or figure on the map, or pick one from the list.</p>
            </div>
            <div v-if="selectedParcel" class="space-y-3">
    <h3 class="bnd-h3">
      Boundaries of {{ selectedParcel.isSheetFigure ? selectedParcel.designation : `Stand ${selectedParcel.stand}` }}
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
            : tagForSide(s.side)
              ? 'border-gray-400 bg-gray-50 text-gray-900 hover:border-gray-500'
              : 'border-gray-200 hover:border-blue-300'"
      >
        <span class="font-medium">{{ sideLabel(s) }}</span>
        <span v-if="sideBeaconPair(s)" class="ml-1 text-xs text-gray-500">{{ s.side }}</span>
        <span aria-hidden="true" v-if="servitudeSideSet.has(s.side)" class="ml-1 text-xs">●</span>
        <span v-else-if="tagForSide(s.side)" class="ml-1 text-xs text-gray-600">· {{ tagForSide(s.side)!.role === 'road' ? 'Road' : 'Neighbour' }}<template v-if="tagForSide(s.side)!.label"> {{ tagForSide(s.side)!.label }}</template></span>
      </button>
    </div>

    <!-- What is this side? One role per side. -->
    <div v-if="selectedSide" class="border-t border-gray-200 pt-4 space-y-2">
      <h4 class="text-sm font-semibold text-gray-900">Side {{ selectedSideBeaconLabel || selectedSide }} is a…</h4>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Role of this side">
        <button v-for="r in ROLE_CHOICES" :key="r.role" type="button" @click="chooseRole(r.role)"
          class="px-3 py-1.5 text-sm rounded-md border transition-colors"
          :class="sideRole === r.role ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-300 hover:border-blue-300'">
          {{ r.label }}
        </button>
        <button v-if="tagForSide(selectedSide)" type="button" @click="clearRoleTag"
          class="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-red-700 hover:border-red-300">
          Remove road / neighbour tag
        </button>
      </div>
    </div>

    <!-- Servitude editor -->
    <div v-if="selectedSide && sideRole === 'servitude'" class="border-t border-gray-200 pt-4 space-y-4" @input="unsaved.mark()" @change="unsaved.mark()">
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
        <div v-else>
          <label class="block text-xs font-medium text-gray-700 mb-1">Benefiting stand (optional)</label>
          <ParcelSelect
            :options="adjoiningParcelOptions"
            v-model="form.beneficiarySubjectId"
            placeholder="Search the stand this servitude benefits…"
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
      <p v-else class="text-xs text-gray-500">
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
            </div>
          </div>

          <!-- Servitudes -->
          <div id="bnd-panel-servitudes" v-show="dockTab === 'servitudes'" role="tabpanel" aria-labelledby="bnd-tab-servitudes" class="space-y-2">
            <h3 class="bnd-h3">Servitude declarations</h3>
            <p v-if="!servitudes.length" class="bnd-hint">None yet. Select a side in the Subject tab and tag it as a servitude.</p>
            <ul v-else class="divide-y divide-gray-100">
              <li v-for="s in servitudes" :key="s.id" class="py-2 text-sm">
                <div class="font-medium">{{ subjectLabel(s.subjectId) }} &middot; {{ beaconBoundary(s) || s.side }}</div>
                <div class="text-xs text-gray-600">
                  {{ servitudeTypeLabel(s) }}
                  <span v-if="s.type === 'party-wall' && s.adjoiningStand"> &middot; shared with Stand {{ s.adjoiningStand }}</span>
                  <span v-if="s.widthM"> &middot; {{ s.widthM }} m</span>
                  <span v-if="s.beneficiary"> &middot; {{ s.beneficiary }}</span>
                </div>
                <div class="flex gap-3 mt-1">
                  <button type="button" @click="focusServitude(s)" class="text-xs text-blue-600 hover:text-blue-700">Edit</button>
                  <button type="button" @click="deleteServitude(s.id)" class="text-xs text-red-600 hover:text-red-700">Delete</button>
                </div>
              </li>
            </ul>
          </div>

          <!-- Certificate -->
          <div id="bnd-panel-certificate" v-show="dockTab === 'certificate'" role="tabpanel" aria-labelledby="bnd-tab-certificate" class="space-y-4">
    <div class="space-y-3">
      <h3 class="bnd-h3">Certificate details</h3>
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
    <div class="space-y-3">
      <h3 class="bnd-h3">Generate Dispensation Certificate</h3>

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
          </div>
        </div>

        <div class="bnd-dock-footer">
          <button type="button" @click="goBack" class="bnd-nav">← Digitization</button>
          <button type="button" @click="goNext" class="bnd-nav bnd-nav-primary">Report on Survey →</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { capeLoArrayToWGS84, capeLoToWGS84, calculateWGS84Bounds, type CapeLoPoint } from '@/utils/coordinateTransform'
import { useCadastralWorkflow } from '@/composables/useCadastralWorkflow'
import { useUnsavedWork } from '@/composables/useUnsavedWork'
import DateInputDDMMYYYY from '@/components/DateInputDDMMYYYY.vue'
import { listCoordinatePoints } from '@/services/spatial'
import { loadBaseMapParcels, computeBaseMapStandLabels, computeBaseMapBeaconLabels } from '@/utils/surveyParcels'
import api from '@/services/api'
import ParcelSelect from '@/components/inputs/ParcelSelect.vue'
import SideClassifyModal from './SideClassifyModal.vue'
import { buildParcelOptions } from '@/components/inputs/parcelSelect'
import { subjectSides, hydrateAnnotationsMap, annotationsForSubject, type SideAnnotation, type SubjectSide } from './sideAnnotations'
import { upsertSubjectSidesLayer, upsertSheetOutlinesLayer, resolveSubjectClick } from './subjectMapLayers'
import {
  BASEMAP_MODES, basemapOpacities, standLabelOpacity, standLabelSize, beaconLabelOpacity,
  STAND_LABEL_ZOOM, BEACON_LABEL_ZOOM, labelPriority, type BasemapMode,
} from './boundaryMapStyle'
import { buildSheetSubjects, type SheetSubject } from './sheetSubjects'
import { openSideEditor, sideEditorToAnnotation, type SideEditorState } from './sideEditor'
import { applyRoadOrNeighbourTag, clearRoadOrNeighbourTag, roadOrNeighbourTag } from './boundaryTagging'
import { confirmDialog } from '@/composables/useNotifications'
import { deriveStoredSheets, findOutsideFigureParcel, outsideFigureCapeLoRing } from './storedSheets'
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
  beneficiarySubjectId: string | number | null
  purpose: string
  statuteRef: string
}>({
  type: 'party-wall',
  typeLabelOther: '',
  widthM: undefined,
  beneficiary: '',
  adjoiningStand: '',
  adjoiningSubjectId: null,
  beneficiarySubjectId: null,
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

// When a stored cut splits the outside figure, each sheet's part is a subject of its
// own, exactly as on the Plan screen (see sheetSubjects.ts).
const sheetSubjects = computed<SheetSubject[]>(() => {
  const of = findOutsideFigureParcel(parcels.value)
  const sheets = deriveStoredSheets({
    outsideFigureParcel: of,
    outsideFigureRing: outsideFigureCapeLoRing(of),
    parcels: parcels.value,
    takenNames: coordinatePoints.value.map((p: { name?: string }) => p?.name).filter(Boolean) as string[],
  })
  return buildSheetSubjects(of?.id ?? null, sheets)
})

const parcelOptions = computed(() => [
  ...buildParcelOptions(parcels.value, {
    // A split figure is tagged one sheet at a time; the unsplit figure is not offered.
    excludeId: sheetSubjects.value.length > 0 ? (findOutsideFigureParcel(parcels.value)?.id ?? null) : null,
  }),
  ...sheetSubjects.value.map(s => ({ id: s.id, stand: null, designation: s.label, areaM2: null })),
])

/** A parcel, or a sheet's figure shaped like one (id + geom), by subject id. */
function findSubject(id: string | number | null | undefined): any | null {
  if (id == null) return null
  const sheet = sheetSubjects.value.find(s => s.id === String(id))
  if (sheet) return { id: sheet.id, geom: { type: 'Polygon', coordinates: [sheet.ring] }, stand: null, designation: sheet.label, isSheetFigure: true }
  return parcels.value.find((p: any) => String(p.id) === String(id)) ?? null
}

const selectedParcel = computed(() => findSubject(selectedParcelId.value))

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
  // One white casing under every stand outline, so the dark line reads on satellite as well as street.
  if (!map.value.getSource('parcels-casing')) {
    const rings = parcels.value
      .map((p: any) => transformParcelGeometryForMap(p.geom)?.geometry?.coordinates?.[0])
      .filter(Boolean)
      .map((r: any) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r } }))
    map.value.addSource('parcels-casing', { type: 'geojson', data: { type: 'FeatureCollection', features: rings } as any })
    map.value.addLayer({
      id: 'parcels-casing', type: 'line', source: 'parcels-casing',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.85 },
    })
  }
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
        properties: { stand: s.stand, parcelId: s.parcelId, prio: 2 },
        geometry: { type: 'Point' as const, coordinates: [wgs.lng, wgs.lat] },
      }
    })
  standLabelFeatures = standFeatures
  m.addSource('base-stand-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: standFeatures } as any })
  m.addLayer({
    id: 'base-stand-labels-layer',
    type: 'symbol',
    source: 'base-stand-labels',
    // ~150 stand numbers are unreadable zoomed out: show none until the stands are big enough
    // to hold one, fade them in, and let the selected / tagged stands win any collision.
    minzoom: STAND_LABEL_ZOOM.min,
    layout: {
      'text-field': ['get', 'stand'],
      'symbol-sort-key': ['get', 'prio'],
      'text-size': standLabelSize() as any,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.2,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-optional': false,
      'text-padding': 3,
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2, 'text-opacity': standLabelOpacity() as any },
  } as any)

  // The selected subject's label is always shown, whatever the zoom or collisions.
  m.addSource('selected-subject-label', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })
  m.addLayer({
    id: 'selected-subject-label-layer', type: 'symbol', source: 'selected-subject-label',
    layout: {
      'text-field': ['get', 'text'], 'text-size': 14, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-allow-overlap': true, 'text-ignore-placement': true,
    },
    paint: { 'text-color': '#1d4ed8', 'text-halo-color': '#ffffff', 'text-halo-width': 2.5 },
  } as any)
  refreshLabelPriorities()

  m.addSource('base-beacon-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })
  m.addLayer({
    id: 'base-beacon-labels-layer',
    type: 'symbol',
    source: 'base-beacon-labels',
    minzoom: BEACON_LABEL_ZOOM.min,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 18, 8, 20, 10],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-variable-anchor': ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right'],
      'text-radial-offset': -0.5,
      'text-justify': 'center',
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-optional': false,
      'text-padding': 2,
    },
    paint: { 'text-color': '#1e293b', 'text-halo-color': '#ffffff', 'text-halo-width': 2, 'text-opacity': beaconLabelOpacity() as any },
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
    map.value!.setPaintProperty(fillId, 'fill-opacity', isSelected ? 0.28 : hasServitude ? 0.22 : 0.1)
    map.value!.setPaintProperty(outlineId, 'line-color', isSelected ? '#2563eb' : '#0f172a')
    map.value!.setPaintProperty(outlineId, 'line-width', isSelected ? 5 : 2)
  })
}

function fitMapToParcels(animate = false) {
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
      { padding: 40, animate },
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
  const feature = selectedParcel.value?.geom ? transformParcelGeometryForMap(selectedParcel.value.geom) : null
  const ring = (feature?.geometry?.coordinates?.[0] as [number, number][] | undefined) ?? null
  // Servitude sides read red HERE, on the map the surveyor draughts them from,
  // against the road's burnt sienna. The diagram and plan output keep their own
  // servitude blue; this colour is a draughting aid, not a plan convention.
  upsertSubjectSidesLayer(map.value as any, { srcId: 'servitude-map-sides', servitudeColour: '#DC2626' }, ring,
    annotationsForSubject(annotations.value, selectedParcelId.value))
}

/** Each sheet's figure in map coordinates, for hit-testing a click and outlining it. */
function sheetRingsForMap(): Array<{ id: string; ring: [number, number][] }> {
  const out: Array<{ id: string; ring: [number, number][] }> = []
  for (const sub of sheetSubjects.value) {
    const ring = transformParcelGeometryForMap({ type: 'Polygon', coordinates: [sub.ring] })?.geometry?.coordinates?.[0]
    if (ring) out.push({ id: sub.id, ring })
  }
  return out
}

/** Mirrors onMapClickSelectParcel (SurveyPlanMapView.vue:1978-2011): a hit on the
 *  subject-sides layer takes priority and drives the SAME selectSide() the side
 *  list uses; otherwise pick the smallest overlapping stand under the click and
 *  set the SAME selectedParcelId the ParcelSelect dropdown sets. */
function onMapClick(e: maplibregl.MapMouseEvent) {
  if (!map.value) return
  const split = sheetSubjects.value.length > 0
  const hit = resolveSubjectClick({
    map: map.value as any,
    point: e.point,
    lngLat: e.lngLat,
    sidesHitLayer: 'servitude-map-sides-hit',
    parcels: parcels.value,
    excludeFigureId: split ? (findOutsideFigureParcel(parcels.value)?.id ?? null) : null,
    sheetRings: split ? sheetRingsForMap() : [],
  })
  if (!hit) return
  if (hit.side) { selectSide(hit.side); return }
  if (hit.subjectId != null) selectedParcelId.value = hit.subjectId
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
          // Street map underneath, always drawn, so a satellite tile that has not arrived is never a hole.
          { id: 'osm-layer', type: 'raster', source: 'osm-raster', paint: { 'raster-opacity': basemapOpacities(basemapMode.value).street } },
          { id: 'satellite-layer', type: 'raster', source: 'satellite', paint: { 'raster-opacity': basemapOpacities(basemapMode.value).satellite as any } },
        ],
      } as any,
      center: [29.8, -19.4],
      zoom: 16,
      minZoom: 10,
      maxZoom: 20,
    } as any)
    map.value.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.value.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    if (typeof ResizeObserver !== 'undefined' && mapContainer.value) {
      mapResizeObserver = new ResizeObserver(() => map.value?.resize())
      mapResizeObserver.observe(mapContainer.value)
    }

    map.value.on('error', (e: any) => {
      console.warn('[Servitudes] map tile error:', e?.error)
    })

    map.value.on('load', () => {
      try {
        addParcelLayersToMap()
        fitMapToParcels(false)
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
// Selecting a stand halves the map's column on md screens and up. MapLibre does not
// observe its container, so without this it renders clipped into the old width.
watch(() => !!selectedParcel.value, async () => {
  await nextTick()
  map.value?.resize()
})

watch([selectedParcelId, servitudes, annotations], () => {
  if (!map.value) return
  highlightSelectedParcelOnMap()
  updateSidesMapLayer()
  upsertSheetOutlinesLayer(map.value as any, sheetRingsForMap(), selectedParcelId.value)
  refreshLabelPriorities()
})

// ---- Workspace chrome ------------------------------------------------------
const DOCK_TABS = [
  { id: 'subject', label: 'Subject', icon: '🧭' },
  { id: 'servitudes', label: 'Servitudes', icon: '⚖️' },
  { id: 'certificate', label: 'Certificate', icon: '📜' },
] as const
type DockTab = typeof DOCK_TABS[number]['id']
const dockTab = ref<DockTab>('subject')
const dockCollapsed = ref(false)
const workspace = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
let mapResizeObserver: ResizeObserver | null = null

function onDockTabKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const ids = DOCK_TABS.map(t => t.id)
  const next = (ids.indexOf(dockTab.value) + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length
  dockTab.value = ids[next]
  nextTick(() => document.getElementById(`bnd-tab-${ids[next]}`)?.focus())
}

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void workspace.value?.requestFullscreen()
  } catch (e: any) {
    console.warn('[Boundaries] fullscreen unavailable:', e?.message)
  }
}
function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === workspace.value
  nextTick(() => map.value?.resize())
}

// Basemap: Auto fades satellite in over the street map by zoom; the rest are fixed.
const BASEMAP_KEY = 'boundaries.basemap'
function readBasemap(): BasemapMode {
  try {
    const v = localStorage.getItem(BASEMAP_KEY)
    if (v === 'auto' || v === 'satellite' || v === 'street') return v
  } catch { /* storage may be blocked; default applies */ }
  return 'auto'
}
const basemapMode = ref<BasemapMode>(readBasemap())
watch(basemapMode, (mode) => {
  try { localStorage.setItem(BASEMAP_KEY, mode) } catch { /* ignore */ }
  if (!map.value?.getLayer('satellite-layer')) return
  const o = basemapOpacities(mode)
  map.value.setPaintProperty('satellite-layer', 'raster-opacity', o.satellite as any)
  map.value.setPaintProperty('osm-layer', 'raster-opacity', o.street)
})

watch(dockCollapsed, async () => { await nextTick(); map.value?.resize() })

/** What a subject is called in lists and on the map. */
function subjectLabel(id: string | number): string {
  const sheet = sheetSubjects.value.find(x => x.id === String(id))
  if (sheet) return sheet.label
  const p = parcels.value.find((x: any) => String(x.id) === String(id))
  if (!p) return String(id)
  if (p.id === findOutsideFigureParcel(parcels.value)?.id) return 'Outside Figure'
  return p.stand ? `Stand ${p.stand}` : (p.designation || `#${p.id}`)
}

function zoomSoon() { nextTick(zoomToSelected) }
function zoomToSelected() {
  if (!map.value || !selectedParcel.value?.geom) return
  const ring = transformParcelGeometryForMap(selectedParcel.value.geom)?.geometry?.coordinates?.[0]
  if (!ring?.length) return
  const b = new maplibregl.LngLatBounds(ring[0] as [number, number], ring[0] as [number, number])
  for (const c of ring) b.extend(c as [number, number])
  map.value.fitBounds(b, { padding: 70, maxZoom: 19.5, duration: 600 })
}

/** A servitude chosen from the declarations list: select its subject and side, and show its form. */
async function focusServitude(s: Servitude) {
  selectedParcelId.value = s.subjectId
  await nextTick()
  editServitude(s)
  sideRole.value = 'servitude'
  dockTab.value = 'subject'
}

let standLabelFeatures: any[] = []
/** Selected subject first, then tagged stands, then the rest -- and its own always-on label. */
function refreshLabelPriorities() {
  const m = map.value
  if (!m) return
  const sel = selectedParcelId.value == null ? null : String(selectedParcelId.value)
  const src = m.getSource('base-stand-labels') as any
  if (src) {
    src.setData({
      type: 'FeatureCollection',
      features: standLabelFeatures.map((f: any) => {
        const id = String(f.properties.parcelId)
        const tagged = annotationsForSubject(annotations.value, id).length > 0 || parcelHasServitude(servitudes.value, id)
        return { ...f, properties: { ...f.properties, prio: labelPriority(id === sel, tagged) } }
      }),
    } as any)
  }
  const selSrc = m.getSource('selected-subject-label') as any
  if (!selSrc) return
  const ring = selectedParcel.value?.geom
    ? transformParcelGeometryForMap(selectedParcel.value.geom)?.geometry?.coordinates?.[0]
    : null
  if (!ring || ring.length < 2) { selSrc.setData({ type: 'FeatureCollection', features: [] }); return }
  const pts = ring.slice(0, -1)
  const lng = pts.reduce((t: number, c: number[]) => t + c[0], 0) / pts.length
  const lat = pts.reduce((t: number, c: number[]) => t + c[1], 0) / pts.length
  selSrc.setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { text: subjectLabel(selectedParcelId.value as string | number) }, geometry: { type: 'Point', coordinates: [lng, lat] } }],
  })
}

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

// What the surveyor has typed into the servitude editor and not yet saved. Marked by their own
// input events (never by comparing values), cleared when the form is reset after a save or cancel.
const unsaved = useUnsavedWork('servitude', 'A servitude you are editing')

function resetForm() {
  unsaved.clear()
  form.value = {
    type: 'party-wall',
    typeLabelOther: '',
    widthM: undefined,
    beneficiary: '',
    adjoiningStand: '',
    adjoiningSubjectId: null,
    beneficiarySubjectId: null,
    purpose: '',
    statuteRef: '',
  }
}

// What a side is: a servitude (a record, with its own form) or a road / contiguous
// neighbour (a plain annotation, edited in the shared classify dialog). One role per side.
type BoundaryRole = 'servitude' | 'road' | 'contiguous'
const ROLE_CHOICES: Array<{ role: BoundaryRole; label: string }> = [
  { role: 'servitude', label: 'Servitude' },
  { role: 'road', label: 'Road' },
  { role: 'contiguous', label: 'Contiguous neighbour' },
]
const sideRole = ref<BoundaryRole>('servitude')
const roleEditor = ref<SideEditorState | null>(null)

/** The road / contiguous tag on a side of the selected subject. */
function tagForSide(side: string) {
  return roadOrNeighbourTag(annotations.value, selectedParcelId.value, side)
}

function chooseRole(role: BoundaryRole) {
  sideRole.value = role
  if (role === 'servitude' || !selectedSide.value) { roleEditor.value = null; return }
  const ed = openSideEditor(selectedSide.value, tagForSide(selectedSide.value), 'both')
  ed.role = role
  roleEditor.value = ed
}

async function saveRoleEditor() {
  const ed = roleEditor.value
  if (!ed || selectedParcelId.value == null) return
  const replacing = existingServitudeForSide(subjectServitudes.value, ed.side)
  if (replacing && !(await confirmDialog({
    title: 'Replace the servitude?',
    message: 'This side carries a servitude record. Tagging it as a ' + (ed.role === 'road' ? 'road' : 'contiguous neighbour') + ' deletes that record.',
    confirmLabel: 'Replace',
  }))) return
  const res = applyRoadOrNeighbourTag(annotations.value, servitudes.value, selectedParcelId.value,
    sideEditorToAnnotation(ed), replacing, adjoiningSideForPartyWall)
  servitudes.value = res.servitudes
  annotations.value = res.annotations
  roleEditor.value = null
  sideRole.value = ed.role
  if (res.servitudesChanged) await persistServitudes()
  await persistMirror()
  if (replacing) cancelEdit()
}

async function clearRoleTag() {
  const side = roleEditor.value?.side ?? selectedSide.value
  if (!side || selectedParcelId.value == null) return
  annotations.value = clearRoadOrNeighbourTag(annotations.value, selectedParcelId.value, side)
  roleEditor.value = null
  sideRole.value = 'servitude'
  await persistMirror()
}

function selectSide(side: string) {
  const tag = tagForSide(side)
  selectedSide.value = side
  roleEditor.value = null
  sideRole.value = tag ? tag.role : 'servitude'
  if (tag) {
    // A side already tagged road / neighbour opens its tag, as the Plan's click did.
    editingId.value = null
    resetForm()
    chooseRole(tag.role)
    return
  }
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
    beneficiarySubjectId: s.beneficiarySubjectId ?? null,
    purpose: s.purpose || '',
    statuteRef: s.statuteRef || '',
  }
}

function cancelEdit() {
  roleEditor.value = null
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
      beneficiarySubjectId: !isPartyWall && form.value.beneficiarySubjectId != null
        ? String(form.value.beneficiarySubjectId)
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

onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  mapResizeObserver?.disconnect()
  try {
    map.value?.remove()
  } catch (e: any) {
    console.warn('[Servitudes] map teardown failed:', e?.message)
  }
  map.value = null
})
</script>

<style scoped>
.servitudes-view { background-color: #f9fafb; }

/* Slim title bar: the workspace below gets the height. */
.bnd-bar { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.25rem 1rem; padding: 0.4rem 1rem; background: #fff; border-bottom: 1px solid #e5e7eb; }
.bnd-title { font-size: 1.05rem; font-weight: 700; color: #111827; }
.bnd-sub { font-size: 0.8rem; color: #6b7280; }
.bnd-help { font-size: 0.8rem; color: #374151; margin-left: auto; }
.bnd-help summary { cursor: pointer; color: #1d4ed8; }
.bnd-help p { max-width: 38rem; margin-top: 0.25rem; }

/* Map-first, like the plan screen: fill the viewport under the header; only the dock body scrolls. */
.bnd-workspace {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  height: max(30rem, calc(100vh - 11rem));
  gap: 0.75rem;
  padding: 0.5rem 0.75rem 0.75rem;
  background: #f3f4f6;
  transition: grid-template-columns 0.3s ease;
}
.bnd-workspace.dock-collapsed { grid-template-columns: minmax(0, 1fr) 0px; gap: 0; }
.bnd-workspace:fullscreen { height: 100vh; padding: 0.5rem; }

.bnd-map-wrap { position: relative; min-height: 0; border-radius: 8px; overflow: hidden; border: 1px solid #d1d5db; background: #e5e7eb; }
.bnd-map { position: absolute; inset: 0; }

.bnd-toolbar { position: absolute; top: 0.6rem; left: 0.6rem; z-index: 5; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
.bnd-seg { display: inline-flex; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
.bnd-seg-btn { padding: 0.3rem 0.65rem; font-size: 0.75rem; color: #374151; background: #fff; border: 0; border-right: 1px solid #e5e7eb; cursor: pointer; }
.bnd-seg-btn:last-child { border-right: 0; }
.bnd-seg-btn:hover { background: #f3f4f6; }
.bnd-seg-active, .bnd-seg-active:hover { background: #1d4ed8; color: #fff; }
.bnd-tool { padding: 0.3rem 0.6rem; font-size: 0.75rem; color: #374151; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
.bnd-tool:hover:not(:disabled) { background: #f3f4f6; }
.bnd-tool:disabled { opacity: 0.5; cursor: default; }

.bnd-legend { position: absolute; left: 0.6rem; bottom: 1.6rem; z-index: 5; display: flex; flex-wrap: wrap; gap: 0.2rem 0.8rem; max-width: 80%; padding: 0.3rem 0.6rem; font-size: 0.7rem; color: #374151; background: rgba(255,255,255,0.92); border: 1px solid #d1d5db; border-radius: 6px; }
.bnd-legend span { display: inline-flex; align-items: center; gap: 0.3rem; }
.bnd-sw { display: inline-block; width: 14px; height: 3px; }
.bnd-sw-dash { height: 0; border-top: 2px dashed #111; }
.bnd-sw-fill { height: 10px; width: 10px; border-radius: 2px; background: #16A34A; opacity: 0.55; }

.bnd-note { position: absolute; top: 3.2rem; left: 0.6rem; z-index: 5; padding: 0.3rem 0.6rem; font-size: 0.75rem; color: #92400e; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; }
.bnd-expand { position: absolute; top: 0.6rem; right: 3.2rem; z-index: 6; padding: 0.4rem 0.8rem; font-size: 0.8rem; font-weight: 600; color: #4f46e5; background: #fff; border: 2px solid #4f46e5; border-radius: 8px; cursor: pointer; }

/* Dock: same language as the plan screen's configuration panel. */
.bnd-dock { background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.bnd-dock-header { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.6rem 0.4rem 0.9rem; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.bnd-dock-title { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #374151; }
.bnd-collapse { padding: 0.15rem 0.5rem; font-size: 0.8rem; color: #6b7280; background: #f3f4f6; border: 0; border-radius: 4px; cursor: pointer; }
.bnd-collapse:hover { background: #e5e7eb; color: #374151; }
.bnd-tabs { display: flex; gap: 2px; padding: 4px 4px 0; background: #e5e7eb; border-bottom: 1px solid #d1d5db; flex-shrink: 0; }
.bnd-tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 4px 5px; font-size: 0.75rem; font-weight: 500; color: #4b5563; background: transparent; border: 1px solid transparent; border-bottom: none; border-radius: 0.375rem 0.375rem 0 0; white-space: nowrap; margin-bottom: -1px; cursor: pointer; }
.bnd-tab:hover { background: #f3f4f6; color: #111827; }
.bnd-tab:focus-visible { outline: 2px solid #4f46e5; outline-offset: -2px; }
.bnd-tab-active { background: #fff; border-color: #d1d5db; color: #1d4ed8; font-weight: 600; }
.bnd-badge { min-width: 1.1rem; padding: 0 0.3rem; font-size: 0.65rem; line-height: 1.1rem; text-align: center; color: #fff; background: #6b7280; border-radius: 999px; }
.bnd-dock-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0.75rem; }
.bnd-dock-footer { flex-shrink: 0; display: flex; gap: 0.5rem; padding: 6px 10px 8px; background: #f9fafb; border-top: 1px solid #d1d5db; box-shadow: 0 -2px 6px rgba(0,0,0,0.05); }
.bnd-nav { flex: 1; padding: 0.35rem 0.5rem; font-size: 0.78rem; color: #374151; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; white-space: nowrap; cursor: pointer; }
.bnd-nav:hover { background: #f3f4f6; }
.bnd-nav-primary { color: #fff; background: #2563eb; border-color: #2563eb; }
.bnd-nav-primary:hover { background: #1d4ed8; }
.bnd-h3 { font-size: 0.9rem; font-weight: 600; color: #111827; }
.bnd-label { display: block; margin-bottom: 0.25rem; font-size: 0.75rem; font-weight: 600; color: #111827; }
.bnd-hint { margin-top: 0.35rem; font-size: 0.75rem; color: #6b7280; }

@media (max-width: 900px) {
  .bnd-workspace { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(16rem, 1fr) auto; height: auto; }
  .bnd-map-wrap { min-height: 60vh; }
}
</style>
