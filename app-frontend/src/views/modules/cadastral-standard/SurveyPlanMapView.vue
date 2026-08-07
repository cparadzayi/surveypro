<template>
  <div class="survey-plan-map-container" :class="{ 'panel-collapsed': isPanelCollapsed }">
    <!-- Map Canvas (now first in DOM = left column) -->
    <div ref="mapCanvasContainer" class="map-canvas-container">
      <!-- Expand Panel Button (shown when collapsed) -->
      <button v-if="isPanelCollapsed" @click="isPanelCollapsed = false" class="expand-btn" title="Show configuration panel">
        ▶ Config
      </button>
      
      <div ref="mapContainer" class="map-canvas"></div>

      <div v-if="activeSideEditor" class="side-modal-backdrop" @click.self="activeSideEditor = null">
        <div class="side-modal">
          <div class="side-modal-title">Classify side {{ activeSideEditor.side }}</div>
          <label>Role
            <select v-model="activeSideEditor.role">
              <option value="contiguous">Contiguous parcel</option>
              <option value="road">Road</option>
              <option value="servitude">Servitude</option>
            </select>
          </label>
          <label>Label
            <input v-model="activeSideEditor.label" type="text" placeholder="e.g. STAND 86 … / Klein Road" />
          </label>
          <label v-if="activeSideEditor.role === 'servitude' || activeSideEditor.role === 'road'">Width (m)
            <input v-model.number="activeSideEditor.widthM" type="number" min="0" step="0.1" />
          </label>
          <label v-if="activeSideEditor.role === 'contiguous'">Abutment
            <select v-model="activeSideEditor.end">
              <option value="from">From terminal ({{ activeSideEditor.side[0] }})</option>
              <option value="both">Midway (spans side)</option>
              <option value="to">To terminal ({{ activeSideEditor.side[1] }})</option>
            </select>
          </label>
          <div class="side-modal-actions">
            <button type="button" class="btn-primary" @click="saveSideEditor">Save</button>
            <button type="button" @click="clearSideEditor">Clear</button>
            <button type="button" @click="activeSideEditor = null">Cancel</button>
          </div>
        </div>
      </div>







      <!-- Map Controls -->
      <div class="map-controls">
        <button @click="fitBounds" class="control-btn" title="Fit to extent">🔍</button>
      </div>
      
      <!-- =====================================================================
           SHEET REVIEW MODAL
           Shown before Finalize when the plan requires multiple sheets.
           Lets the surveyor confirm which outside figure points appear on
           each tile before the layout is locked.
           ===================================================================== -->
      <div v-if="showSheetReview && activeTileGrid" class="sheet-review-panel">
          <!-- Header -->
          <div class="sr-header">
            <div class="sr-title">
              <span class="sr-icon">📋</span>
              <span>Multi-Sheet Plan Review</span>
              <span class="sr-subtitle">
                {{ activeTileGrid.totalSheets }} sheets &nbsp;·&nbsp;
                {{ activeTileGrid.cols }}×{{ activeTileGrid.rows }} grid &nbsp;·&nbsp;
                {{ activeTileGrid.scaleLabel }} on {{ activeTileGrid.sheetSize }}
              </span>
            </div>
            <button class="sr-close" @click="closeSheetReview" title="Back to layout editor">×</button>
          </div>

          <!-- Map hint -->
          <div class="sr-map-hint">
            <span class="sr-map-hint-icon">🗺️</span>
            Map shows tile extents — active sheet highlighted in blue. Click a tab to zoom.
          </div>

          <!-- Sheet selector tabs -->
          <div class="sr-tabs">
            <button
              v-for="tile in activeTileGrid.tiles"
              :key="tile.sheetNumber"
              class="sr-tab"
              :class="{ 'sr-tab-active': activeReviewSheet === tile.sheetNumber }"
              @click="activeReviewSheet = tile.sheetNumber"
            >
              {{ tile.label }}
            </button>
          </div>

          <!-- Active sheet info strip -->
          <div class="sr-sheet-info" v-if="currentTile">
            <div class="sr-info-row">
              <span class="sr-info-label">Ground window:</span>
              <span class="sr-info-val">
                Y {{ currentTile.minY.toFixed(2) }} – {{ currentTile.maxY.toFixed(2) }} m &nbsp;|&nbsp;
                X {{ currentTile.minX.toFixed(2) }} – {{ currentTile.maxX.toFixed(2) }} m
              </span>
            </div>
            <div class="sr-info-row">
              <span class="sr-info-label">Coverage:</span>
              <span class="sr-info-val">
                {{ activeTileGrid.tileWidthM.toFixed(0) }} m × {{ activeTileGrid.tileHeightM.toFixed(0) }} m
                (5 % overlap)
              </span>
            </div>
            <div class="sr-info-row">
              <span class="sr-info-label">Sub-outside figure vertices:</span>
              <span class="sr-info-val">
                <strong>{{ activeSheetOfd?.vertices.length ?? 0 }}</strong>
                <span v-if="activeSheetOfd?.isEdited" class="sr-edited-badge">edited</span>
                <span v-else class="sr-auto-badge">auto-clipped</span>
              </span>
            </div>
          </div>

          <!-- ── VIEW MODE: SI 727 edge table ─────────────────────── -->
          <div class="sr-table-wrapper" v-if="!isEditingSheetOfd">

            <!-- Edit / Reset toolbar -->
            <div class="sr-edit-toolbar">
              <button class="sr-btn-edit" @click="startOfdEdit" title="Edit outside figure vertices for this sheet">
                ✏️ Edit outside figure
              </button>
              <button
                v-if="activeSheetOfd?.isEdited"
                class="sr-btn-reset"
                @click="resetSheetOfd(activeReviewSheet)"
                title="Discard edits and revert to auto-clipped polygon"
              >
                ↺ Reset to auto
              </button>
            </div>

            <table class="sr-table" v-if="activeSheetOFEdges.length > 0">
              <thead>
                <tr>
                  <th colspan="4">OUTSIDE FIGURE DATA — {{ currentTile?.label }}</th>
                  <th colspan="2">CO-ORDINATES Lo {{ config.centralMeridian }}°</th>
                </tr>
                <tr>
                  <th>SIDES</th>
                  <th>Metres</th>
                  <th>DIRECTION °′″</th>
                  <th>Constants</th>
                  <th>Y Metres</th>
                  <th>X</th>
                </tr>
              </thead>
              <tbody>
                <tr class="sr-placeholder-row">
                  <td colspan="4"></td>
                  <td>{{ formatCoordinateWithSign(activeSheetOfd?.constants.y ?? 0) }}</td>
                  <td>{{ formatCoordinateWithSign(activeSheetOfd?.constants.x ?? 0) }}</td>
                </tr>
                <tr
                  v-for="(edge, idx) in activeSheetOFEdges"
                  :key="idx"
                  :class="{ 'sr-row-clip': (edge as any).fromType === 'clip' }"
                >
                  <td>{{ edge.side }}</td>
                  <td>{{ edge.distance.toFixed(2) }}</td>
                  <td class="nowrap">{{ edge.direction }}</td>
                  <td>{{ edge.pointId }}</td>
                  <td>{{ formatCoordinateWithSign(edge.y) }}</td>
                  <td>{{ formatCoordinateWithSign(edge.x) }}</td>
                </tr>
              </tbody>
            </table>
            <div v-else class="sr-no-edges">
              No outside figure vertices fall within this sheet's ground window.
            </div>

            <!-- Legend for clip points -->
            <div class="sr-clip-legend" v-if="activeSheetOFEdges.some((e: any) => e.fromType === 'clip')">
              <span class="sr-clip-dot"></span> Orange rows = auto-generated tile boundary intersections (editable)
            </div>
          </div>

          <!-- ── EDIT MODE: vertex list with inline inputs ──────────── -->
          <div class="sr-edit-wrapper" v-else>
            <div class="sr-edit-header">
              <span>Editing vertices for <strong>{{ currentTile?.label }}</strong></span>
              <span class="sr-edit-hint">
                Green = survey point &nbsp;|&nbsp; Orange = tile boundary (clip) point
              </span>
            </div>

            <div class="sr-vert-list">
              <div
                v-for="(vert, idx) in editingVerts"
                :key="vert.id"
                class="sr-vert-row"
                :class="vert.type === 'clip' ? 'sr-vert-clip' : 'sr-vert-survey'"
              >
                <!-- Sequence number & type badge -->
                <span class="sr-vert-num">{{ idx + 1 }}</span>
                <span class="sr-vert-badge" :class="vert.type === 'clip' ? 'badge-clip' : 'badge-survey'">
                  {{ vert.type === 'clip' ? 'clip' : 'survey' }}
                </span>

                <!-- Point name -->
                <input
                  class="sr-vert-name"
                  :value="vert.pointId"
                  @input="updateEditingVertName(idx, ($event.target as HTMLInputElement).value)"
                  placeholder="Name"
                />

                <!-- Y (Westing) -->
                <label class="sr-vert-coord-label">Y</label>
                <input
                  class="sr-vert-coord"
                  type="number"
                  step="0.01"
                  :value="vert.y.toFixed(3)"
                  @change="updateEditingVert(idx, 'y', ($event.target as HTMLInputElement).value)"
                />

                <!-- X (Southing) -->
                <label class="sr-vert-coord-label">X</label>
                <input
                  class="sr-vert-coord"
                  type="number"
                  step="0.01"
                  :value="vert.x.toFixed(3)"
                  @change="updateEditingVert(idx, 'x', ($event.target as HTMLInputElement).value)"
                />

                <!-- Reorder & delete -->
                <button class="sr-vert-btn" @click="moveEditingVertUp(idx)" :disabled="idx === 0" title="Move up">↑</button>
                <button class="sr-vert-btn" @click="moveEditingVertDown(idx)" :disabled="idx === editingVerts.length - 1" title="Move down">↓</button>
                <button class="sr-vert-btn sr-vert-del" @click="deleteEditingVert(idx)" :disabled="editingVerts.length <= 3" title="Delete vertex">×</button>

                <!-- Insert after -->
                <button class="sr-vert-btn sr-vert-ins" @click="insertVertexAfter(idx)" title="Insert vertex after this one">+</button>
              </div>
            </div>

            <div class="sr-edit-actions">
              <button class="sr-btn-cancel-edit" @click="cancelOfdEdit">Cancel</button>
              <span class="sr-actions-spacer"></span>
              <span class="sr-propagate-hint" v-if="activeTileGrid && activeTileGrid.totalSheets > 1">
                Boundary changes will propagate to adjacent sheets automatically.
              </span>
              <button class="sr-btn-save-edit" @click="saveOfdEdit">
                💾 Save &amp; propagate
              </button>
            </div>
          </div>

          <!-- Actions bar (always visible) -->
          <div class="sr-actions">
            <button class="sr-btn-back" @click="closeSheetReview">
              ← Back to Editor
            </button>
            <span class="sr-actions-spacer"></span>
            <button
              v-if="Object.keys(sheetOfdOverrides).length > 0 || activeSheetOfd?.isEdited"
              class="sr-btn-reset-all"
              @click="resetAllSheetOfds"
              title="Reset all sheets to auto-clipped"
            >
              ↺ Reset all
            </button>
            <span class="sr-hint">Review all {{ activeTileGrid.totalSheets }} sheets, then confirm.</span>
            <button class="sr-btn-confirm" @click="confirmSheetReview" :disabled="isEditingSheetOfd">
              ✓ Confirm &amp; Finalize
            </button>
          </div>
      </div>


    </div>

    <!-- Configuration Panel (now on the right) -->
    <div v-if="!isPanelCollapsed" class="config-panel">
      <div class="config-header">
        <h3 class="text-lg font-semibold text-gray-900">Survey Plan Configuration</h3>
        <button @click="isPanelCollapsed = true" class="collapse-btn" title="Hide panel to maximize map">
          ▶
        </button>
      </div>
      
      <div class="config-content">
        <!-- Plan Type -->
        <div class="config-group">
          <label class="config-label">Plan Type</label>
          <select v-model="config.planType" class="config-input">
            <option value="general-undeveloped">General Plan (Undeveloped Portion)</option>
            <option value="general-developed">General Plan (Developed Portion)</option>
            <option value="diagram">Diagram</option>
            <option value="working-plan">Working Plan</option>
          </select>
        </div>
        <div v-if="isSideAnnotationMode" class="config-group diagram-subject-hint">
          <label class="config-label">{{ isDiagramMode ? 'Diagram subject' : 'Annotation subject' }}</label>
          <ParcelSelect
            :options="diagramSubjectOptions"
            v-model="selectedDiagramParcelId"
            placeholder="Search stand or designation, or click the map…"
            @select="onDiagramSubjectPicked"
          />
          <p v-if="!selectedDiagramParcelId" class="mt-1 text-xs text-amber-600">
            👆 {{ isDiagramMode
              ? 'Or click the parcel on the map to choose the diagram subject.'
              : 'Pick the Outside Figure or a stand, then click its sides to tag roads / servitudes / contiguous neighbours.' }}
          </p>
          <p v-else class="mt-1 text-xs text-green-700">
            ✓ {{ isDiagramMode ? 'Diagram subject' : 'Subject' }}:
            <strong>{{ selectedDiagramStand ? `Stand ${selectedDiagramStand}` : 'Outside Figure' }}</strong>
          </p>
        </div>

        <!-- Scale (SI 727 Section 32(2) Prescribed) -->
        <div class="config-group">
          <label class="config-label">Scale (SI 727 §32(2))</label>
          <select v-model="config.scale" @change="updateScale" class="config-input">
            <option value="auto">Auto (Recommended)</option>
            <optgroup label="Base Scales (×1)">
              <option value="1:1000">1:1000</option>
              <option value="1:1250">1:1250</option>
              <option value="1:1500">1:1500</option>
              <option value="1:2000">1:2000</option>
              <option value="1:2500">1:2500</option>
              <option value="1:3000">1:3000</option>
              <option value="1:4000">1:4000</option>
              <option value="1:5000">1:5000</option>
              <option value="1:6000">1:6000</option>
              <option value="1:7500">1:7500</option>
            </optgroup>
            <optgroup label="Detailed (÷10)">
              <option value="1:100">1:100</option>
              <option value="1:125">1:125</option>
              <option value="1:150">1:150</option>
              <option value="1:200">1:200</option>
              <option value="1:250">1:250</option>
              <option value="1:300">1:300</option>
              <option value="1:400">1:400</option>
              <option value="1:500">1:500</option>
              <option value="1:600">1:600</option>
              <option value="1:750">1:750</option>
            </optgroup>
            <optgroup label="Regional (×10)">
              <option value="1:10000">1:10000</option>
              <option value="1:12500">1:12500</option>
              <option value="1:15000">1:15000</option>
              <option value="1:20000">1:20000</option>
              <option value="1:25000">1:25000</option>
              <option value="1:30000">1:30000</option>
              <option value="1:40000">1:40000</option>
              <option value="1:50000">1:50000</option>
              <option value="1:60000">1:60000</option>
              <option value="1:75000">1:75000</option>
            </optgroup>
          </select>
          <div v-if="intelligentPreview && config.scale === 'auto'" class="mt-1 text-xs text-indigo-600 font-medium">
            ✓ Recommended: {{ intelligentPreview.scale.label }}
          </div>
          <div class="mt-1 text-xs text-gray-500">
            Per SI 727 §32(2): Base scales or ×/÷ by 10ⁿ
          </div>
        </div>

        <!-- Sheet Size (SI 727 Compliant) -->
        <div class="config-group">
          <label class="config-label">Sheet Size (SI 727)</label>
          <div class="paper-size-display">
            <span class="font-semibold text-indigo-600">{{ recommendedSheetSize }}</span>
            <span class="text-gray-600 ml-2" v-if="intelligentPreview">
              ({{ intelligentPreview.layout.sheet.width }}×{{ intelligentPreview.layout.sheet.height }}mm)
            </span>
            <button @click="showPaperSizeOptions = !showPaperSizeOptions" class="ml-2 text-sm text-indigo-600 hover:text-indigo-800">
              Change
            </button>
          </div>
          <div v-if="showPaperSizeOptions" class="mt-2">
            <select v-model="config.sheetSize" @change="onSheetSizeChange" class="config-input">
              <option
                v-for="opt in paperSizeOptionsFor(config.planType)"
                :key="opt.value"
                :value="opt.value"
              >{{ opt.label }}</option>
            </select>
          </div>
        </div>

        <!-- Surveyor Info -->
        <div class="config-group">
          <label class="config-label">Surveyor Name</label>
          <input v-model="config.surveyorName" type="text" class="config-input" />
        </div>

        <div class="config-group">
          <label class="config-label">License Number</label>
          <input v-model="config.licenseNumber" type="text" class="config-input" />
        </div>

        <div class="config-group">
          <label class="config-label">Survey Date</label>
          <input v-model="config.surveyDate" type="date" class="config-input" />
        </div>

        <!-- Map Layers -->
        <div class="config-group">
          <label class="config-label">Map Layers</label>
          <div class="layer-controls-sidebar">
            <label class="layer-sidebar-item">
              <input type="checkbox" v-model="showParcels" @change="toggleParcelsVisibility">
              <span>Land Parcels ({{ parcels.length }})</span>
            </label>
            <label class="layer-sidebar-item">
              <input type="checkbox" v-model="showPoints" @change="togglePointsVisibility">
              <span>Survey Points ({{ coordinatePoints.length }})</span>
            </label>
            <label class="layer-sidebar-item" v-if="intelligentPreview">
              <input type="checkbox" v-model="showTopology" @change="toggleTopologyVisibility">
              <span>Beacons ({{ intelligentPreview.topology.beacons.length }})</span>
            </label>
            <label class="layer-sidebar-item" v-if="intelligentPreview">
              <input type="checkbox" v-model="showAdaptiveLabels" @change="toggleLabelsVisibility">
              <span>Parcel Labels</span>
            </label>
            <label class="layer-sidebar-item" v-if="intelligentPreview">
              <input type="checkbox" v-model="showLayoutGuides" @change="toggleLayoutGuidesVisibility">
              <span>SI 727 Layout Guides</span>
            </label>
            <label class="layer-sidebar-item">
              <input type="checkbox" v-model="config.showSchedule">
              <span>Schedule of Areas</span>
            </label>
            <label class="layer-sidebar-item">
              <input type="checkbox" v-model="config.showOutsideFigure">
              <span>Outside Figure</span>
            </label>
          </div>
        </div>

        <!-- Outside Figure Data Panel -->
        <div class="config-group" v-if="outsideFigureData">
          <label class="config-label">Outside Figure Data</label>

          <!-- Multi-sheet warning badge -->
          <div v-if="activeTileGrid" class="ofd-multisheet-badge">
            <span class="ofd-multisheet-icon">🗺️</span>
            <span>
              <strong>{{ activeTileGrid.totalSheets }} sheets required</strong>
              ({{ activeTileGrid.cols }}×{{ activeTileGrid.rows }} grid,
              {{ activeTileGrid.scaleLabel }} on {{ activeTileGrid.sheetSize }})
            </span>
          </div>

          <!-- Per-sheet sub-outside figure review button (multi-sheet plans only) -->
          <button
            v-if="activeTileGrid && activeTileGrid.totalSheets > 1"
            class="ofd-review-btn"
            @click="openSheetReview"
          >
            <span class="ofd-review-btn-icon">✏️</span>
            Review &amp; Edit Sub-Outside Figures
            <span class="ofd-review-btn-arrow">→</span>
          </button>

          <!-- Coordinate system label -->
          <div class="ofd-coord-system">
            System: Lo {{ config.centralMeridian }}° &nbsp;|&nbsp;
            {{ outsideFigureData.edges.length }} sides
          </div>

          <!-- Constants row -->
          <div v-if="outsideFigureData.constants" class="ofd-constants-row">
            <span class="ofd-label">Constants ({{ outsideFigureData.constants.pointId }}):</span>
            Y {{ formatCoordinateWithSign(outsideFigureData.constants.y) }},
            X {{ formatCoordinateWithSign(outsideFigureData.constants.x) }}
          </div>

          <!-- Edge table -->
          <div class="ofd-table-wrapper">
            <table class="ofd-sidebar-table">
              <thead>
                <tr>
                  <th>SIDES</th>
                  <th>m</th>
                  <th>DIR °′″</th>
                  <th>Pt</th>
                  <th>Y</th>
                  <th>X</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(edge, idx) in outsideFigureData.edges" :key="idx">
                  <td>{{ edge.side }}</td>
                  <td>{{ edge.distance.toFixed(2) }}</td>
                  <td class="nowrap">{{ edge.direction }}</td>
                  <td>{{ edge.pointId }}</td>
                  <td>{{ formatCoordinateWithSign(edge.y) }}</td>
                  <td>{{ formatCoordinateWithSign(edge.x) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="config-group" v-else-if="config.showOutsideFigure">
          <label class="config-label">Outside Figure Data</label>
          <p class="ofd-no-data">No outside figure parcel found. Designate a parcel as "Outside Figure" and run Compute Area &amp; Consistency.</p>
        </div>

        <!-- Export Buttons -->
        <div class="config-group export-section">
          <div class="export-header">
            <label class="config-label">📤 Export Documents</label>
            <span class="text-xs text-gray-500">SI 727 Compliant Survey Documents</span>
          </div>
          <div class="export-buttons" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="format-toggles" style="display: flex; gap: 16px; font-size: 14px;">
              <label><input type="checkbox" v-model="exportFormats.pdf" /> PDF</label>
              <label><input type="checkbox" v-model="exportFormats.dxf" /> DXF</label>
            </div>
            <button @click="generatePlanDocuments" :disabled="isExporting"
                    class="btn-export btn-geopdf" style="width: 100%; font-size: 16px; padding: 16px;">
              <span v-if="!isExporting">📋 Generate {{ planTypeLabel }}</span>
              <span v-else>⏳ Generating…</span>
            </button>
            <button @click="generateComprehensivePDF" :disabled="isExporting"
                    class="btn-export btn-professional" style="width: 100%; font-size: 16px; padding: 16px;">
              <span v-if="!isExporting">📚 Download Complete Survey Record</span>
              <span v-else>⏳ Generating…</span>
            </button>
          </div>
        </div>
        <div v-if="geoPDFStatus" class="mt-2 text-xs" :class="geoPDFStatus.available ? 'text-green-600' : 'text-amber-600'">
          {{ geoPDFStatus.message }}
        </div>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
      <div class="status-item">
        <span class="status-label">Parcels:</span>
        <span class="status-value">{{ parcels.length }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Points:</span>
        <span class="status-value">{{ coordinatePoints.length }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Total Area:</span>
        <span class="status-value">{{ formatArea(totalArea) }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Extent:</span>
        <span class="status-value">{{ extentInfo }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, reactive } from 'vue'

defineOptions({ name: 'SurveyPlanMapView' })
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { toDateInputFormat } from '@/utils/dateFormat'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { capeLoToWGS84, capeLoArrayToWGS84, calculateWGS84Bounds, geoJsonToCapeLoPoint, type CapeLoPoint } from '@/utils/coordinateTransform'
import { computeCapeLoPointsFromGeometry, getCoordinatePointsForProject } from '@/utils/parcelMetadataComputer'
import { getSurveyPlanPreview, type PreviewData } from '@/services/surveyPlanPreview'
import { 
  optimizeLayout, 
  SI727_BLOCK_CONFIG, 
  calculateBoundingBox,
  type OverlayBlock, 
  type MapBounds, 
  type BoundingBox 
} from '@/utils/surveyPlanLayoutOptimizer'
import { formatArea, formatAreaCompact } from '@/utils/areaFormatting'
// Removed: CollisionDetector - using backend as single source of truth
import {
  calculateOptimalScaleAndSheet,
  type ExportOptions,
  type OptimalScaleOptions,
  type TileGrid
} from '@/utils/professionalSurveyPlanExporter'
import {
  masterVerticesFromOfd,
  clipPolygonToTile,
  buildEdgeTable,
  computeAllSheetOfds,
  propagateSharedBoundary,
  vertsToWGS84Ring,
  type OfdVertex,
  type OfdEdge,
  type SheetOfd,
  type OfdTile,
} from '@/utils/ofdClipping'
import {
  checkGeoPDFAvailability,
  generateGeoPDF,
  generateVectorGeoPDF,
  generateDXF,
  captureMapCanvas, 
  downloadBlob 
} from '@/services/geopdf'
import { generatePlanStatisticsPDF } from '@/utils/surveyPlanSummaryReport'
import {
  normalizeGeoJSONFeatureCollection,
  calculateNormalizedExtent,
  type CapeLoExtent
} from '@/utils/capeLoNormalization'
import { generateSurveyPlanSummaryPDF, type SurveyPlanSummaryData } from '@/utils/surveyPlanSummaryGenerator'
import { CalculationsPart1Generator, type SurveyPoint } from '@/utils/calculations-part1'
import { ComprehensiveDocumentGenerator, type ComprehensiveDocumentData } from '@/utils/comprehensive-document'
import type { CoverPageInfo } from '@/utils/cover-page'
import { listCoordinatePoints, listLandParcels, updateLandParcel } from '@/services/spatial'
import { saveDocument } from '@/services/documentStorage'
import { useComprehensivePDF } from '@/composables/useComprehensivePDF'
import api from '@/services/api'
import { buildWorkflowExcel } from '@/utils/workflowExcelExporter'
import { autoSaveStepProducts } from '@/services/workflowProductStorage'
import { planTypeOutputSubdir } from '@/utils/project-directory'
import { saveWithOverwritePrompt } from '@/services/workflowProductStorage'
import { getPlanTypeMeta } from './planTypes'
import {
  buildPlanPayload, composePlanBaseName, resolveSubjectDesignation, validateGenerateRequest,
  type PlanPayloadContext, type PlanDocumentSet,
} from './planPayload'
import { diagramReferenceMetadata } from './diagramReferenceMetadata'
import { pickDiagramSubjectId } from './diagramSubjectPick'
import { paperSizeOptionsFor } from './paperSizeOptions'
import { subjectSides, upsertAnnotation, removeAnnotation, annotationsForSubject, withSubjectAnnotations, hydrateAnnotationsMap, fractionAlongSide, endFromFraction, type SideAnnotation, type SideRole } from './sideAnnotations'
import ParcelSelect from '@/components/inputs/ParcelSelect.vue'
import { buildParcelOptions } from '@/components/inputs/parcelSelect'
import { buildPlanDesignation } from '@/utils/planDesignation';
import { checkLodgementDocuments } from '@/composables/useLodgementCheck';
import { saveSurveyRecordSections } from '@/composables/useSurveyRecordOutputs';
import { buildReportDataFromWorkflow } from '@/utils/reportDataFromWorkflow';

// Props
const props = defineProps<{
  projectId: number
  workflowState?: any
  projectInfo: {
    designation?: string
    township?: string
    district?: string
    surveyType?: string
    surveyDate?: string
    surveyOf?: string
    surveyorName?: string
    licenseNumber?: string
    firm?: string
    address?: string
    isStateLand?: boolean
    centralMeridian?: number
    wholePortion?: string
    parentProperty?: string
    workingDirectory?: string
    name?: string
    deedOfTransferNo?: string
    parentDiagramNo?: string
    parentDiagramAnnexedTo?: string
    originalTitleDiagramNo?: string
    originalTitleAnnexedTo?: string
    originalTitleDeedNo?: string
    srNo?: string
    fileNo?: string
    gpNo?: string
    compilation?: string
  }
}>()

// Emit
const emit = defineEmits<{
  (e: 'export-complete', data: { format: string; filename: string }): void
}>()

// Refs
const mapContainer = ref<HTMLDivElement | null>(null)
const mapCanvasContainer = ref<HTMLDivElement | null>(null)
const map = ref<maplibregl.Map | null>(null)
const parcels = ref<any[]>([])
const coordinatePoints = ref<any[]>([])
const isExporting = ref(false)
const pdfFinalScale = ref<string | null>(null)
const showPaperSizeOptions = ref(false)
const isPanelCollapsed = ref(false)
// GeoPDF status
const geoPDFAvailable = ref(false)
const geoPDFStatus = ref<{ available: boolean; message: string } | null>(null)

// Professional export options
const exportOptions = ref<ExportOptions>({
  sheetSize: 'auto',
  orientation: 'landscape',
  resolution: 'print',
  includeGrid: false,
  includeMarginGuides: false
})

// Configuration
const config = ref({
  planType: (props.projectInfo as any)?.planType || 'general-undeveloped',  // Accept from parent component
  scale: 'auto', // Auto-select optimal SI 727 scale
  sheetSize: 'auto' as 'auto' | 'ISO_A2' | 'ISO_A1' | 'ISO_A0' | 'A4' | 'A3',
  surveyorName: props.projectInfo.surveyorName || '',
  licenseNumber: props.projectInfo.licenseNumber || '',
  surveyDate: toDateInputFormat(props.projectInfo.surveyDate) || toDateInputFormat(new Date()),
  showSchedule: true,
  showOutsideFigure: true,  // ⭐ NEW: Toggle for Outside Figure Data
  centralMeridian: (props.projectInfo as any).centralMeridian || 31,  // ⭐ Lo value for coordinate system
  areaType: 'urban' as 'urban' | 'peri-urban' | 'rural'
})

// Layer visibility
const showParcels = ref(true)
const showPoints = ref(true)
const parcelMarkers = ref<any[]>([])
const pointMarkers = ref<any[]>([])
const topologyMarkers = ref<any[]>([])

// Intelligent preview data (Phase 1-3 integration)
const intelligentPreview = ref<PreviewData | null>(null)
const showTopology = ref(true)
const showAdaptiveLabels = ref(true)
const showLayoutGuides = ref(false)  // SI 727 layout overlay
const showSheetLayout = ref(true)

// Refined beacon labels (suffix-aware labeling for PDF generation)
const refinedBeaconLabels = ref<Array<{
  text: string
  coordinates: [number, number]
  parcelId: number | null
  type: 'beacon'
  beaconName: string
  isInsideParcel: boolean
  displayInParcel: number | null
  labelType: 'suffix' | 'full' | 'suppressed'
}>>([])

// Diagram subject selection
const selectedDiagramParcelId = ref<string | number | null>(null)
const sideAnnotationsBySubject = ref<Record<string, SideAnnotation[]>>({})
const currentSideAnnotations = computed(() => annotationsForSubject(sideAnnotationsBySubject.value, selectedDiagramParcelId.value))
const activeSideEditor = ref<{ side: string; role: SideRole; label: string; widthM: number | null; end: 'from' | 'to' | 'both' } | null>(null)
const selectedDiagramStand = computed(() => {
  const p = parcels.value.find((x: any) => String(x.id) === String(selectedDiagramParcelId.value))
  return p?.stand ?? null
})

const diagramSubjectOptions = computed(() =>
  // Diagram: the subject is a single stand, so the Outside Figure is excluded.
  // General plans annotate roads/servitudes/contiguous neighbours on the Outside
  // Figure perimeter AND (optionally) individual stands, so the Outside Figure is
  // a selectable subject there.
  buildParcelOptions(parcels.value, {
    excludeId: isDiagramMode.value ? (getOutsideFigureParcel()?.id ?? null) : null,
  }))

function onDiagramSubjectPicked(option: { id: string | number }) {
  applyDiagramHighlight(option.id)
  zoomToParcel(option.id)
}

function zoomToParcel(id: string | number) {
  if (!map.value) return
  const parcel = parcels.value.find((p: any) => String(p.id) === String(id))
  if (!parcel?.geom) return
  const feature = transformParcelGeometry(parcel.geom)
  const ring = feature?.geometry?.coordinates?.[0] as [number, number][] | undefined
  if (!ring || ring.length === 0) return
  const bounds = new maplibregl.LngLatBounds(ring[0], ring[0])
  for (const c of ring) bounds.extend(c as [number, number])
  map.value.fitBounds(bounds, { padding: 60, maxZoom: 19 })
}

const isDiagramMode = computed(() => getPlanTypeMeta(config.value.planType).subjectMode === 'single-parcel')
const isGeneralPlanMode = computed(() =>
  config.value.planType === 'general-undeveloped' || config.value.planType === 'general-developed')
// The side-annotation UI (subject picker + click-a-side classifier) is shared by
// the Diagram and the General Plans. On general plans the tagged sides drive the
// same road/servitude/contiguous rendering (roads label-only, no burnt-sienna).
const isSideAnnotationMode = computed(() => isDiagramMode.value || isGeneralPlanMode.value)
const exportFormats = reactive({ pdf: true, dxf: true })
const planTypeLabel = computed(() => getPlanTypeMeta(config.value.planType).label)

// ⭐ MULTI-SHEET: Active tile grid (computed reactively from outside figure + plan config)
const activeTileGrid = ref<TileGrid | null>(null)
// Sheet Review panel state
const showSheetReview = ref(false)
const activeReviewSheet = ref(1)

// Per-sheet OFD overrides: keyed by sheetNumber, stores user-edited vertex lists
const sheetOfdOverrides = ref<Record<number, OfdVertex[]>>({})

// OFD vertex editing state
const isEditingSheetOfd = ref(false)
// Working copy of the active sheet's vertices while in edit mode
const editingVerts = ref<OfdVertex[]>([])

function normalizeCapeLoYX(y: number, x: number): [number, number] {
  if (!Number.isFinite(y) || !Number.isFinite(x)) return [y, x]
  const ay = Math.abs(y)
  const ax = Math.abs(x)
  if ((ay > 1000000 && ax < 1000000) || ay > ax * 2) return [x, y]
  return [y, x]
}

// Computed
const surveyedParcels = computed(() => {
  return parcels.value.filter(p => {
    const stand = String(p?.stand ?? '').toLowerCase()
    const designation = String(p?.designation ?? '').toLowerCase()
    return !stand.includes('outside figure') && !designation.includes('outside figure')
  })
})

const totalArea = computed(() => {
  return surveyedParcels.value.reduce((sum, p) => {
    const area = Number(p?.area_m2)
    return sum + (Number.isFinite(area) ? area : 0)
  }, 0)
})


const extent = computed(() => {
  if (coordinatePoints.value.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  }
  
  const xs = coordinatePoints.value.map(p => p.x)
  const ys = coordinatePoints.value.map(p => p.y)
  
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  }
})

const extentInfo = computed(() => {
  const width = extent.value.maxX - extent.value.minX
  const height = extent.value.maxY - extent.value.minY
  return `${width.toFixed(0)}m × ${height.toFixed(0)}m`
})

// Computed beacon description groups to prevent infinite loop
const beaconDescriptionGroups = computed(() => {
  return formatBeaconDescriptionGroups(coordinatePoints.value)
})

// SI 727 recommended sheet size
const recommendedSheetSize = computed(() => {
  if (config.value.sheetSize !== 'auto') {
    return config.value.sheetSize
  }
  
  if (intelligentPreview.value) {
    return intelligentPreview.value.sheetSize
  }
  
  // Fallback to Medium if no intelligent preview yet
  return 'Medium'
})

// ⭐ PHASE 1: SINGLE SOURCE OF TRUTH FOR ALL LABELS
// This computed property is the ONLY source for map labels
// Every label is validated to belong to an actual parcel/beacon/edge
const validatedLabels = computed(() => {
  const labels = {
    stands: [] as Array<{
      text: string
      coordinates: [number, number]
      parcelId: number
      type: 'stand'
      parcelStand: string
    }>,
    beacons: [] as Array<{
      text: string
      coordinates: [number, number]
      parcelId: number | null
      type: 'beacon'
      beaconName: string
      isInsideParcel: boolean
    }>,
    edges: [] as Array<{
      distance: string
      bearing: string
      coordinates: [number, number]
      parcelId: number
      type: 'edge'
      edgeIndex: number
    }>
  }
  
  // Skip if no data loaded
  if (parcels.value.length === 0 || coordinatePoints.value.length === 0) {
    return labels
  }
  
  const outsideFigureId = getOutsideFigureParcel()?.id
  
  // Get Outside Figure polygon for spatial filtering
  const outsideFigurePolygon = getOutsideFigurePolygonWgs84()
  const outsideFigureRing = outsideFigurePolygon?.coordinates?.[0] || null
  const outsideFigureCapeLoRing = getOutsideFigureCapeLoRing()
  const outsideFigureBufferMeters = 2.0
  
  // Helper: Check if point is inside Outside Figure
  const isInOutsideFigure = (lng: number, lat: number, capeLoPoint?: { x: number; y: number }): boolean => {
    if (!outsideFigureRing) return true // No filter if no Outside Figure
    if (isPointInRing([lng, lat], outsideFigureRing)) return true
    if (capeLoPoint && outsideFigureCapeLoRing) {
      return isPointNearRing(capeLoPoint, outsideFigureCapeLoRing, outsideFigureBufferMeters)
    }
    return false
  }
  
  // Helper: Check if point is inside a specific parcel polygon (WGS84 coordinates)
  const isPointInParcel = (lng: number, lat: number, parcel: any): boolean => {
    if (!parcel.geom?.coordinates?.[0]) return false
    
    // Transform parcel coordinates from Cape Lo to WGS84 (batch)
    const capeLoCoords = parcel.geom.coordinates[0]
    const capeLoPoints: CapeLoPoint[] = capeLoCoords.map((coord: number[], i: number) => ({
      id: `pip${i}`,
      x: coord[0], // Southing (X coordinate)
      y: coord[1]  // Westing (Y coordinate)
    }))
    const wgs84Points = capeLoArrayToWGS84(capeLoPoints, config.value.centralMeridian)
    const wgs84Ring: [number, number][] = wgs84Points.map(p => [p.lng, p.lat])
    
    return isPointInRing([lng, lat], wgs84Ring)
  }
  
  // Helper: Check if point is near a line segment (for edge label validation)
  const isPointNearEdge = (
    pointY: number, 
    pointX: number, 
    edge1Y: number, 
    edge1X: number, 
    edge2Y: number, 
    edge2X: number, 
    tolerance: number = 2.0 // meters
  ): boolean => {
    // Calculate distance from point to line segment
    const dx = edge2X - edge1X
    const dy = edge2Y - edge1Y
    const lengthSquared = dx * dx + dy * dy
    
    if (lengthSquared === 0) {
      // Edge is a point, check distance to that point
      const dist = Math.sqrt(Math.pow(pointX - edge1X, 2) + Math.pow(pointY - edge1Y, 2))
      return dist <= tolerance
    }
    
    // Calculate projection of point onto line segment
    const t = Math.max(0, Math.min(1, ((pointX - edge1X) * dx + (pointY - edge1Y) * dy) / lengthSquared))
    const projX = edge1X + t * dx
    const projY = edge1Y + t * dy
    
    // Calculate distance from point to projection
    const dist = Math.sqrt(Math.pow(pointX - projX, 2) + Math.pow(pointY - projY, 2))
    return dist <= tolerance
  }
  
  // Helper: Calculate polygon centroid
  const calculateCentroid = (coords: number[][]): [number, number] => {
    let sumX = 0, sumY = 0
    const validCoords = coords.slice(0, -1) // Remove duplicate last point
    validCoords.forEach(coord => {
      sumX += coord[0]
      sumY += coord[1]
    })
    return [sumX / validCoords.length, sumY / validCoords.length]
  }
  
  // Helper: Find beacon name by coordinates
  const findBeaconName = (y: number, x: number): string | null => {
    const tolerance = 1.0 // meters
    const [targetY, targetX] = normalizeCapeLoYX(y, x)
    
    if (coordinatePoints.value.length === 0) return null
    
    for (const cp of coordinatePoints.value) {
      const [cpY, cpX] = normalizeCapeLoYX(cp.y, cp.x)
      const dist = Math.sqrt(Math.pow(cpY - targetY, 2) + Math.pow(cpX - targetX, 2))
      if (dist < tolerance) return cp.name
    }
    return null
  }
  
  // 1. STAND LABELS - One per parcel (except Outside Figure)
  parcels.value.forEach(parcel => {
    if (parcel.id === outsideFigureId) return // Skip Outside Figure
    if (!parcel.stand || !parcel.geom) return
    
    const coords = parcel.geom.coordinates[0]
    if (!coords || coords.length < 3) return
    
    // Calculate centroid in Cape Lo
    // centroidCape returns [avgX, avgY] = [avgSouthing, avgWesting] since coords are [X, Y]
    const centroidCape = calculateCentroid(coords)
    
    // Transform to WGS84 (single point - use direct call)
    const centroidWgs84 = capeLoToWGS84({
      id: `centroid-${parcel.stand}`,
      x: centroidCape[0], // Southing (X coordinate from centroid)
      y: centroidCape[1]  // Westing (Y coordinate from centroid)
    } as CapeLoPoint, config.value.centralMeridian)
    
    const lng = centroidWgs84.lng
    const lat = centroidWgs84.lat
    
    // Validate: centroid must be inside Outside Figure
    if (!isInOutsideFigure(lng, lat, { x: centroidCape[0], y: centroidCape[1] })) {
      console.warn(`[SurveyPlanMap] ⚠️ Stand ${parcel.stand} centroid outside Outside Figure - skipped`)
      return
    }
    
    // Validate: centroid must be inside its own parcel (topological relationship)
    if (!isPointInParcel(lng, lat, parcel)) {
      console.warn(`[SurveyPlanMap] ⚠️ Stand ${parcel.stand} centroid NOT inside its own parcel - skipped`)
      return
    }
    
    labels.stands.push({
      text: parcel.stand,
      coordinates: [lng, lat],
      parcelId: parcel.id,
      type: 'stand',
      parcelStand: parcel.stand
    })
  })
  
  // 2. BEACON LABELS - Only for parcel vertices
  const beaconMap = new Map<string, {
    name: string
    coordinates: [number, number]
    parcels: Set<number>
  }>()
  
  parcels.value.forEach(parcel => {
    if (parcel.id === outsideFigureId) return // Skip Outside Figure
    if (!parcel.geom) return
    
    const coords = parcel.geom.coordinates[0]
    if (!coords || coords.length < 3) return
    
    // Process each vertex
    // GeoJSON from PostGIS stores [Southing, Westing] i.e. [coord[0]≈2246xxx, coord[1]≈97xxx].
    // Always normalise before use — normalizeCapeLoYX detects and swaps if needed.
    coords.slice(0, -1).forEach(coord => {
      const [normY, normX] = normalizeCapeLoYX(coord[0], coord[1])

      // Find beacon name using normalised Cape Lo Y (Westing) / X (Southing)
      const beaconName = findBeaconName(normY, normX)
      if (!beaconName) return

      // Transform to WGS84 with correctly ordered Cape Lo coordinates
      const wgs84 = capeLoToWGS84({ id: beaconName, y: normY, x: normX } as CapeLoPoint, config.value.centralMeridian)
      const lng = wgs84.lng
      const lat = wgs84.lat

      // Validate: beacon must be inside Outside Figure
      if (!isInOutsideFigure(lng, lat, { x: normX, y: normY })) return
      
      // Track which parcels this beacon belongs to
      if (!beaconMap.has(beaconName)) {
        beaconMap.set(beaconName, {
          name: beaconName,
          coordinates: [lng, lat],
          parcels: new Set()
        })
      }
      beaconMap.get(beaconName)!.parcels.add(parcel.id)
    })
  })
  
  // Add beacon labels (all beacons that are parcel vertices)
  // CADASTRAL STANDARD: Refined beacon labeling logic with international best practices
  // 1. Primary match: Prefix matches parcel → show suffix inside that parcel
  // 2. Shared beacon: Show suffix only in prefix-matching parcel
  // 3. Non-matching: Show full name outside parcel
  // 4. Control beacons (M5, ZE, etc.): Always show full name
  console.log(`[SurveyPlanMap] 🔍 Processing ${beaconMap.size} beacons with refined labeling logic...`)
  
  let primaryMatchCount = 0
  let sharedMatchCount = 0
  let nonMatchCount = 0
  let controlBeaconCount = 0
  let suppressedCount = 0
  
  // Track which beacons should be labeled in which parcels
  const beaconLabels: Array<{
    text: string
    coordinates: [number, number]
    parcelId: number | null
    type: 'beacon'
    beaconName: string
    isInsideParcel: boolean
    displayInParcel: number | null  // Which parcel should display this label
    labelType: 'suffix' | 'full' | 'suppressed'
  }> = []
  
  beaconMap.forEach(beacon => {
    // Extract numeric prefix from beacon name (e.g., "2474A" -> "2474")
    const prefixMatch = beacon.name.match(/^(\d+)([a-z]+)$/i)
    
    // Control/reference beacons (no numeric prefix) - always show full name
    if (!prefixMatch) {
      controlBeaconCount++
      console.log(`[SurveyPlanMap] 🎯 Control beacon "${beacon.name}": showing full name`)
      beaconLabels.push({
        text: beacon.name,
        coordinates: beacon.coordinates,
        parcelId: null,
        type: 'beacon',
        beaconName: beacon.name,
        isInsideParcel: false,
        displayInParcel: null,
        labelType: 'full'
      })
      return
    }
    
    const beaconPrefix = prefixMatch[1]
    const beaconSuffix = prefixMatch[2].toUpperCase()
    
    // Find parcel(s) that match the beacon prefix
    const matchingParcelIds = Array.from(beacon.parcels).filter(parcelId => {
      const parcel = parcels.value.find(p => p.id === parcelId)
      return parcel?.stand?.toString() === beaconPrefix
    })
    
    // Diagnostic logging for beacons 2474C and 2475C
    if (beacon.name === '2474C' || beacon.name === '2475C') {
      console.log(`[SurveyPlanMap] 🔍 DIAGNOSTIC for ${beacon.name}:`)
      console.log(`  - Beacon prefix: "${beaconPrefix}"`)
      console.log(`  - Beacon parcels:`, Array.from(beacon.parcels))
      console.log(`  - Matching parcel IDs:`, matchingParcelIds)
      Array.from(beacon.parcels).forEach(parcelId => {
        const p = parcels.value.find(parcel => parcel.id === parcelId)
        console.log(`    Parcel ID ${parcelId}: stand="${p?.stand}", matches="${p?.stand?.toString() === beaconPrefix}"`)
      })
    }
    
    if (matchingParcelIds.length > 0) {
      // Case 1 & 2: Prefix matches at least one parcel
      const displayParcelId = matchingParcelIds[0]  // Use first matching parcel
      const displayParcel = parcels.value.find(p => p.id === displayParcelId)
      
      if (beacon.parcels.size === 1) {
        // Case 1: Primary match - single parcel, prefix matches
        primaryMatchCount++
        console.log(`[SurveyPlanMap] ✂️ Primary match: "${beacon.name}" on stand ${displayParcel?.stand}: showing suffix "${beaconSuffix}"`)
      } else {
        // Case 2: Shared beacon - show suffix only in prefix-matching parcel
        sharedMatchCount++
        suppressedCount += beacon.parcels.size - 1
        const parcelStands = Array.from(beacon.parcels).map(id => {
          const p = parcels.value.find(parcel => parcel.id === id)
          return p?.stand || `ID:${id}`
        })
        console.log(`[SurveyPlanMap] 🔗 Shared beacon: "${beacon.name}" on stands [${parcelStands.join(', ')}]: showing suffix "${beaconSuffix}" in stand ${displayParcel?.stand} only`)
      }
      
      beaconLabels.push({
        text: beaconSuffix,
        coordinates: beacon.coordinates,
        parcelId: displayParcelId,
        type: 'beacon',
        beaconName: beacon.name,
        isInsideParcel: true,
        displayInParcel: displayParcelId,
        labelType: 'suffix'
      })
    } else {
      // Case 3: Non-matching - prefix doesn't match any parcel it belongs to
      nonMatchCount++
      const parcelStands = Array.from(beacon.parcels).map(id => {
        const p = parcels.value.find(parcel => parcel.id === id)
        return p?.stand || `ID:${id}`
      })
      console.log(`[SurveyPlanMap] ⚠️ Non-matching: "${beacon.name}" on stands [${parcelStands.join(', ')}]: showing full name outside parcel`)
      
      beaconLabels.push({
        text: beacon.name,
        coordinates: beacon.coordinates,
        parcelId: null,
        type: 'beacon',
        beaconName: beacon.name,
        isInsideParcel: false,
        displayInParcel: null,
        labelType: 'full'
      })
    }
  })
  
  // Add all beacon labels to the main labels array
  labels.beacons.push(...beaconLabels)
  
  // Summary of refined labeling results
  console.log(`[SurveyPlanMap] 📊 Refined beacon labeling summary:`)
  console.log(`  ✂️ Primary match (suffix only): ${primaryMatchCount}`)
  console.log(`  🔗 Shared match (suffix in prefix parcel): ${sharedMatchCount}`)
  console.log(`  ⚠️ Non-matching (full name outside): ${nonMatchCount}`)
  console.log(`  🎯 Control beacons (full name): ${controlBeaconCount}`)
  console.log(`  🚫 Labels suppressed (shared, non-matching parcel): ${suppressedCount}`)
  console.log(`  📝 Total beacons processed: ${beaconMap.size}`)
  console.log(`  🏷️ Total labels created: ${beaconLabels.length}`)
  
  // Store refined beacon labels for PDF generation
  refinedBeaconLabels.value = beaconLabels
  console.log(`[SurveyPlanMap] 💾 Stored ${refinedBeaconLabels.value.length} refined beacon labels for PDF export`)
  
  // 3. EDGE LABELS - For parcel edges (with or without stored metadata)
  let totalEdges = 0
  let shortEdgesFiltered = 0
  
  parcels.value.forEach(parcel => {
    if (parcel.id === outsideFigureId) return // Skip Outside Figure
    
    const coords = parcel.geom?.coordinates?.[0]
    if (!coords || coords.length < 3) return
    
    // Try to use stored edges first, otherwise compute from geometry
    const storedEdges = parcel.metadata?.residuals?.edges || []
    const hasStoredEdges = storedEdges.length > 0
    
    // Process each edge
    const edgeCount = coords.length - 1 // Exclude duplicate last point
    for (let index = 0; index < edgeCount; index++) {
      totalEdges++
      let distance: number | string = ''
      let direction: string = ''
      
      if (hasStoredEdges && storedEdges[index]) {
        // Use stored metadata
        const edge = storedEdges[index]
        distance = edge.distanceRounded ?? edge.distance
        direction = edge.directionDMS || ''
      } else {
        // Compute from geometry as fallback
        const p1 = coords[index]
        const p2 = coords[index + 1] || coords[0]
        
        const dy = p2[1] - p1[1]
        const dx = p2[0] - p1[0]
        const dist = Math.sqrt(dx * dx + dy * dy)
        
        // Simple bearing calculation (Cape Lo coordinates)
        let bearing = Math.atan2(dy, dx) * (180 / Math.PI)
        if (bearing < 0) bearing += 360
        
        distance = dist.toFixed(2)
        direction = `${Math.floor(bearing)}°` // Simplified
      }
      
      if (!distance || !direction) continue
      
      // Filter: Skip edges ≤7.5m (will be shown via insets later)
      const distanceValue: number = typeof distance === 'number' ? distance : parseFloat(String(distance))
      if (distanceValue <= 7.5) {
        shortEdgesFiltered++
        continue
      }
      
      // Calculate edge midpoint
      const p1 = coords[index]
      const p2 = coords[index + 1] || coords[0]
      
      // GeoJSON coords are [Southing, Westing] (coord[0]=Southing, coord[1]=Westing)
      // Cape Lo convention: y=Westing, x=Southing
      const midX = (p1[0] + p2[0]) / 2  // coord[0] = Southing → x
      const midY = (p1[1] + p2[1]) / 2  // coord[1] = Westing  → y

      // Validate: midpoint must be near the actual edge (topological relationship)
      if (!isPointNearEdge(midY, midX, p1[1], p1[0], p2[1], p2[0], 2.0)) {
        continue
      }

      // Transform to WGS84 (single point - no log for single transforms)
      const midWgs84 = capeLoToWGS84({ id: `mid${index}`, y: midY, x: midX } as CapeLoPoint, config.value.centralMeridian)
      const lng = midWgs84.lng
      const lat = midWgs84.lat
      
      // Validate: midpoint must be inside Outside Figure
      if (!isInOutsideFigure(lng, lat, { x: midX, y: midY })) {
        continue
      }
      
      const distanceText = Number.isFinite(distanceValue) ? distanceValue.toFixed(2) : String(distance)

      labels.edges.push({
        distance: distanceText,
        bearing: direction,
        coordinates: [lng, lat],
        parcelId: parcel.id,
        type: 'edge',
        edgeIndex: index
      })
    }
  })
  
  // Debug logging
  console.log('[SurveyPlanMap] 🏷️ VALIDATED LABELS (Single Source of Truth):', {
    stands: labels.stands.length,
    beacons: labels.beacons.length,
    edges: labels.edges.length,
    total: labels.stands.length + labels.beacons.length + labels.edges.length
  })
  
  console.log('[SurveyPlanMap] 📏 EDGE FILTERING:', {
    totalEdges,
    shortEdgesFiltered,
    edgesShown: labels.edges.length,
    filterThreshold: '≤7.5m'
  })
  
  return labels
})

// ⭐ SINGLE SOURCE OF TRUTH: Backend Premium Quality System
// All scale and paper size recommendations come from the backend
// intelligentPreview.scaleValidation contains:
// - isValid: boolean
// - narrowestParcel: string
// - narrowestWidth: number
// - recommendedScale: number
// - currentScale: number
// - reason: string
//
// Backend considers:
// - Outside Figure extent (200m × 300m)
// - Parcel count (9 parcels)
// - Beacon density (300 beacons = 5 beacons/1000m²)
// - Premium Quality defaults (1:500 for urban, A0 for high density)

// Functions
function parseScale(scaleStr: string): number | undefined {
  if (scaleStr === 'auto') {
    return undefined // Let backend determine optimal scale
  }
  const parts = scaleStr.split(':')
  return parseInt(parts[1])
}

function calculateOptimalPaperSize(ext: any, scale: number) {
  const widthMeters = ext.maxX - ext.minX
  const heightMeters = ext.maxY - ext.minY
  
  // Calculate required paper dimensions at scale (in mm)
  const widthMM = (widthMeters / scale) * 1000
  const heightMM = (heightMeters / scale) * 1000
  
  // Paper sizes (width x height in mm)
  const sizes = [
    { name: 'A4', width: 210, height: 297 },
    { name: 'A3', width: 297, height: 420 },
    { name: 'A2', width: 420, height: 594 },
    { name: 'A1', width: 594, height: 841 },
    { name: 'A0', width: 841, height: 1189 }
  ]
  
  const margin = 40 // mm (for title block, legend, etc.)
  
  // Try portrait first
  for (const size of sizes) {
    if (widthMM <= size.width - margin && heightMM <= size.height - margin) {
      return { size: size.name, orientation: 'portrait' as const }
    }
  }
  
  // Try landscape
  for (const size of sizes) {
    if (widthMM <= size.height - margin && heightMM <= size.width - margin) {
      return { size: size.name, orientation: 'landscape' as const }
    }
  }
  
  return { size: 'A0', orientation: 'landscape' as const }
}

async function loadData() {
  try {
    console.log('[SurveyPlanMap] 🔄 Loading data for project:', props.projectId)
    console.log('[SurveyPlanMap] 📋 Project Info:', props.projectInfo)

    // Load parcels via authenticated axios service (avoids localStorage token drift)
    const parcelData = await listLandParcels(props.projectId)

    console.log('[SurveyPlanMap] 📦 Parsed parcel data:', parcelData)
    console.log('[SurveyPlanMap] 📦 Is array?', Array.isArray(parcelData))
    
    // Log first parcel geometry structure
    if (parcelData.length > 0) {
      console.log('[SurveyPlanMap] 📦 First parcel structure:', parcelData[0])
      console.log('[SurveyPlanMap] 📦 First parcel geom:', parcelData[0].geom)
      console.log('[SurveyPlanMap] 📦 Geom type:', typeof parcelData[0].geom)
    }
    
    // Assign colors to parcels
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F']
    parcels.value = parcelData.map((p: any, i: number) => ({
      ...p,
      geom: p?.geom ?? p?.geometry ?? null,
      area_m2: Number.isFinite(Number(p?.area_m2)) ? Number(p.area_m2) : 0,
      designation: p?.designation ?? p?.stand ?? null,
      description: p?.description ?? p?.notes ?? null,
      color: colors[i % colors.length]
    }))

    // Repair null geom on coordinate points (happens when batch-inserted without geometry)
    try {
      const repairResp = await api.post('/coordinate-points/repair-geom', { project_id: props.projectId })
      if (repairResp.data?.repaired > 0) {
        console.log(`[SurveyPlanMap] 🔧 Repaired ${repairResp.data.repaired} coordinate point geometries`)
      }
    } catch (repairErr: any) {
      console.warn('[SurveyPlanMap] ⚠️ Geom repair skipped:', repairErr?.response?.data?.error || repairErr.message)
    }

    // Load coordinate points via authenticated axios service
    const allPoints = await listCoordinatePoints(props.projectId)
    
    // Use all project coordinate points — backend handles spatial filtering
    coordinatePoints.value = allPoints
    console.log(`[SurveyPlanMap] 📍 Loaded ${allPoints.length} coordinate points (no frontend spatial filter)`)
    
    console.log(`[SurveyPlanMap] 📊 Loaded ${parcels.value.length} parcels and ${coordinatePoints.value.length} points`)
    console.log(`[SurveyPlanMap] 👤 Surveyor: ${config.value.surveyorName}`)
    console.log(`[SurveyPlanMap] 📍 Location: ${props.projectInfo.designation}, ${props.projectInfo.township}, ${props.projectInfo.district}`)
    
    // Log extent calculation
    if (coordinatePoints.value.length > 0) {
      console.log('[SurveyPlanMap] 📏 Sample coordinates:', {
        first: coordinatePoints.value[0],
        last: coordinatePoints.value[coordinatePoints.value.length - 1]
      })
      console.log('[SurveyPlanMap] 📐 Extent:', extent.value)
      console.log('[SurveyPlanMap] 📐 Extent Info:', extentInfo.value)
    } else {
      console.warn('[SurveyPlanMap] ⚠️ No coordinate points loaded!')
    }
    
    // Log schedule of areas data
    console.log('[SurveyPlanMap] 📋 Schedule of Areas:')
    parcels.value.forEach((p, i) => {
      const areaM2 = Number.isFinite(Number(p?.area_m2)) ? Number(p.area_m2) : 0
      console.log(`  ${i + 1}. ${p.stand || `Parcel ${p.id}`}: ${areaM2.toFixed(2)} m² (${(areaM2 / 10000).toFixed(4)} ha)`)
    })
    console.log(`  Total: ${totalArea.value.toFixed(2)} m² (${(totalArea.value / 10000).toFixed(4)} ha)`)
    
    // Load intelligent preview data (Phase 1-3 integration)
    await loadIntelligentPreview()
    
    // Initialize map after data is loaded
    initializeMap()
  } catch (error) {
    console.error('[SurveyPlanMap] ❌ Error loading data:', error)
  }
}

// Load intelligent preview with topology, labels, and SI 727 layout
async function loadIntelligentPreview() {
  try {
    console.log('[SurveyPlanMap] 🧠 Loading intelligent preview...')
    console.log('[SurveyPlanMap] 🔍 Request params:', {
      projectId: props.projectId,
      scale: parseScale(config.value.scale),
      sheetSize: config.value.sheetSize !== 'auto' ? config.value.sheetSize : undefined,
      areaType: config.value.areaType
    })
    
    const preview = await getSurveyPlanPreview(props.projectId, {
      scale: parseScale(config.value.scale),
      sheetSize: config.value.sheetSize !== 'auto' ? config.value.sheetSize : undefined,
      areaType: config.value.areaType,
      planType: config.value.planType as any  // SI 727 Reg 32(3): 'general-developed' → 1:500 ceiling
    })
    
    intelligentPreview.value = preview
    
    console.log('[SurveyPlanMap] ✅ Intelligent preview loaded:', {
      scale: preview.scale.label,
      sheetSize: preview.sheetSize,
      sharedBeacons: preview.metadata.sharedBeacons,
      labelCollisions: preview.metadata.labelCollisions,
      topology: preview.topology.summary,
      beaconLabels: preview.beaconLabels?.length || 0
    })
    
    // Log beacon labels for debugging
    if (preview.beaconLabels && preview.beaconLabels.length > 0) {
      console.log('[SurveyPlanMap] 🏷️ Beacon labels from preview:', {
        total: preview.beaconLabels.length,
        sample: preview.beaconLabels.slice(0, 3)
      })
    } else {
      console.warn('[SurveyPlanMap] ⚠️ No beacon labels in preview response!')
    }
    
    // SI 727 Reg 32(3): Developed-township plans are capped at 1:500.
    // Scale validation from the backend may have been computed at a different (larger) scale.
    // When the plan type enforces the 1:500 ceiling, any "too narrow" warning at a larger
    // scale is a false alarm — at 1:500, 13 m on paper = 26 mm, ample room for labels.
    const si727CeilingApplies = ['general-developed', 'developed-township'].includes(config.value.planType)
    const SI727_CEIL_DENOM = 500

    if (preview.scaleValidation) {
      if (!preview.scaleValidation.isValid) {
        const checkedAt = preview.scaleValidation.currentScale ?? preview.scale?.denominator
        if (si727CeilingApplies && checkedAt > SI727_CEIL_DENOM) {
          // Warning is for a scale larger than what will actually be used — suppress it
          console.log(
            `[SurveyPlanMap] ℹ️ Scale validation flagged 1:${checkedAt} ` +
            `(narrowest parcel: ${preview.scaleValidation.narrowestParcel}, ` +
            `${preview.scaleValidation.narrowestWidth}m wide) — ` +
            `suppressed: SI 727 Reg 32(3) forces 1:${SI727_CEIL_DENOM}, ` +
            `where ${preview.scaleValidation.narrowestWidth}m = ` +
            `${((preview.scaleValidation.narrowestWidth / SI727_CEIL_DENOM) * 1000).toFixed(0)}mm on paper (sufficient).`
          )
        } else {
          console.error('[SurveyPlanMap] ❌ Scale validation failed:', {
            currentScale: preview.scaleValidation.currentScale,
            recommendedScale: preview.scaleValidation.recommendedScale,
            narrowestParcel: preview.scaleValidation.narrowestParcel,
            narrowestWidth: preview.scaleValidation.narrowestWidth,
            reason: preview.scaleValidation.reason
          })
          console.warn(`⚠️ SCALE WARNING: ${preview.scaleValidation.reason} Consider using 1:${preview.scaleValidation.recommendedScale} instead.`)
        }
      } else {
        console.log('[SurveyPlanMap] ✅ Scale validation passed:', {
          narrowestParcel: preview.scaleValidation.narrowestParcel,
          narrowestWidth: preview.scaleValidation.narrowestWidth
        })
      }
    }

    // Report the effective export scale — tile grid takes priority over preview recommendation
    const effectiveScale = activeTileGrid.value
      ? activeTileGrid.value.scaleLabel
      : (preview.scale?.label ?? 'auto')
    console.log('[SurveyPlanMap] 📐 Effective export scale:', effectiveScale,
      activeTileGrid.value ? `(SI 727 Reg 32(3) — ${activeTileGrid.value.totalSheets} sheets)` : '(single sheet)')

    if (preview.sheetSize) {
      console.log('[SurveyPlanMap] 💡 Recommended sheet:', preview.sheetSize)
    }
    
  } catch (error) {
    console.error('[SurveyPlanMap] ⚠️ Failed to load intelligent preview:', error)
    console.error('[SurveyPlanMap] Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    })
    // Non-critical - continue without intelligent features
  }
}

function initializeMap() {
  if (!mapContainer.value) return
  
  console.log('[SurveyPlanMap] 🗺️ Initializing map with satellite imagery...')
  
  map.value = new maplibregl.Map({
    container: mapContainer.value,
    preserveDrawingBuffer: true,
    // ... (rest of the code remains the same)
    style: {
      version: 8,
      sources: {
        // OpenStreetMap raster tiles (free basemap)
        'osm-raster': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        },
        // Satellite imagery (Esri World Imagery - free tier)
        'satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© Esri',
          scheme: 'xyz',
          volatile: false
        }
      },
      layers: [
        // Fallback background color
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': '#f0f0f0'
          }
        },
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite',
          layout: {
            visibility: 'visible'
          }
        },
        {
          id: 'osm-layer',
          type: 'raster',
          source: 'osm-raster',
          layout: {
            visibility: 'none'
          }
        }
      ]
    },
    center: [29.8, -19.4], // Gweru, Zimbabwe (was [30.0, -20.0] - Indian Ocean!)
    zoom: 16,
    minZoom: 12,
    maxZoom: 19,
    pitch: 0,
    bearing: 0
  } as any)
  
  // Add navigation controls
  map.value.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.value.addControl(new maplibregl.ScaleControl(), 'bottom-left')
  
  console.log('[SurveyPlanMap] ⏳ Waiting for map to load...')
  
  map.value.on('load', () => {
    console.log('[SurveyPlanMap] ✅ Map loaded successfully')
    console.log('[SurveyPlanMap] 📊 Data ready:', {
      parcels: parcels.value.length,
      points: coordinatePoints.value.length
    })
    
    if (parcels.value.length > 0) {
      addParcelsToMap()
    } else {
      console.warn('[SurveyPlanMap] ⚠️ No parcels to display')
    }
    
    if (coordinatePoints.value.length > 0) {
      addPointsToMap()
      fitBounds()
    } else {
      console.warn('[SurveyPlanMap] ⚠️ No coordinate points to display')
    }
    
    // Add topology layer if intelligent preview is available
    if (intelligentPreview.value) {
      addTopologyToMap()
      addLabelsToMap()
      addLayoutGuidesToMap()
    }
  })
  
  // Log map errors
  map.value.on('error', (e: any) => {
    console.error('[SurveyPlanMap] ⚠️ Map error:', e.error)
  })
  
  // ⭐ Add zoom event listener to update geocoded layout dynamically
  let zoomDebounceTimer: any
  console.log('[SurveyPlanMap] 🎯 Registering zoom event listener...')
  map.value.on('zoom', () => {
    if (!intelligentPreview.value) return
    
    // Debounce to avoid excessive updates during zoom animation
    clearTimeout(zoomDebounceTimer)
    zoomDebounceTimer = setTimeout(() => {
      // Update geocoded layout to match new view scale
      if (showLayoutGuides.value) {
        addLayoutGuidesToMap()
      }
    }, 100)
  })
}

function addParcelsToMap() {
  if (!map.value) return
  
  console.log('[SurveyPlanMap] 🗺️ Adding parcels to map...')
  console.log('[SurveyPlanMap] Total parcels:', parcels.value.length)

  const outsideFigurePolygon = getOutsideFigurePolygonWgs84()
  const outsideFigureRing = outsideFigurePolygon?.coordinates?.[0] || null
  const outsideFigureParcelId = getOutsideFigureParcel()?.id

  // Create deduplicated parcels array to avoid duplicate source IDs
  const allParcels = parcels.value || []
  const uniqueParcels = allParcels.filter((parcel, index, self) => 
    allParcels.findIndex(p => p.id === parcel.id) === index
  )
  
  const parcelsToRender = outsideFigureRing
    ? uniqueParcels.filter(p => {
        if (p.id === outsideFigureParcelId) return true
        const transformed = transformParcelGeometry(p.geom)
        if (!transformed) {
          return false
        }

        const c = calculateCentroid(transformed)
        return isPointInRing([c.lng, c.lat], outsideFigureRing)
      })
    : uniqueParcels

  console.log('[SurveyPlanMap] Parcels in Outside Figure:', parcelsToRender.length)
  
  parcelsToRender.forEach((parcel, index) => {
    const sourceId = `parcel-${parcel.id}`
    const transformedGeom = transformParcelGeometry(parcel.geom)

    if (!transformedGeom) {
      console.warn(`[SurveyPlanMap] ⚠️ Skipping parcel ${parcel.stand || parcel.id}: invalid or missing geometry`)
      return
    }
    
    // Check if source already exists to avoid duplicates
    if (!map.value!.getSource(sourceId)) {
      const originalCoords = transformedGeom.geometry.coordinates?.[0]?.length || 0
      const transformedCoords = transformedGeom.geometry.coordinates?.[0]?.length || 0

      console.log(`[SurveyPlanMap] Parcel ${parcel.stand || parcel.id}:`, {
        originalCoords,
        transformedCoords
      })
      
      // Add source
      map.value!.addSource(sourceId, {
        type: 'geojson',
        data: transformedGeom
      })
    } else {
      console.warn(`[SurveyPlanMap] ⚠️ Source ${sourceId} already exists, skipping parcel ${parcel.stand || parcel.id}`)
    }
    
    // Add fill layer (transparent for regular parcels, semi-transparent for Outside Figure)
    map.value!.addLayer({
      id: `${sourceId}-fill`,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': parcel.id === outsideFigureParcelId ? '#ef4444' : parcel.color,
        'fill-opacity': parcel.id === outsideFigureParcelId ? 0.1 : 0
      }
    })
    
    // Add outline layer (red for Outside Figure, dark for regular parcels)
    map.value!.addLayer({
      id: `${sourceId}-outline`,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': parcel.id === outsideFigureParcelId ? '#ef4444' : '#0f172a',
        'line-width': parcel.id === outsideFigureParcelId ? 3 : 2
      }
    })
    
    // (Centroid markers removed: use label layers + popups on click if needed)
  })

  // Diagram subject picking (single registration; handler no-ops unless in diagram mode)
  map.value!.off('click', onMapClickSelectParcel)
  map.value!.on('click', onMapClickSelectParcel)
  applyDiagramHighlight(selectedDiagramParcelId.value)
  updateSubjectSidesLayer()

  // ⭐ PHASE 3 (SI 727): Use ALL validated labels (no overlap allowed)
  const edgeAnnotationFeatures = validatedLabels.value.edges.map(edge => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: edge.coordinates
    },
    properties: {
      distance: edge.distance,
      bearing: edge.bearing,
      label: `${edge.distance}\n${edge.bearing}`,
      parcelId: edge.parcelId
    }
  }))
  
  if (!map.value.getSource('edge-annotations')) {
    map.value.addSource('edge-annotations', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: edgeAnnotationFeatures
      }
    } as any)
    
    // ⭐ SI 727: Standard font sizes - paper size/scale adjusted to prevent overlap
    map.value.addLayer({
      id: 'edge-annotations-layer',
      type: 'symbol',
      source: 'edge-annotations',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 3.5,
          14, 4,
          16, 4.5,
          18, 5,
          20, 5.5
        ],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-anchor': 'center',
        'text-allow-overlap': false,  // SI 727: NO overlap allowed
        'text-ignore-placement': false,
        'text-optional': false,
        'text-padding': 2,
        'text-line-height': 1.2
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
        'text-halo-blur': 0.5
      }
    } as any)
    
    console.log('[SurveyPlanMap] ✅ VALIDATED edge labels:', edgeAnnotationFeatures.length)
  } else {
    // Update existing source with validated labels
    const source = map.value.getSource('edge-annotations') as maplibregl.GeoJSONSource
    source.setData({
      type: 'FeatureCollection',
      features: edgeAnnotationFeatures
    } as any)
  }
  
  // ⭐ PHASE 3 (SI 727): Use ALL validated labels (no overlap allowed)
  const standFeatures = validatedLabels.value.stands.map(stand => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: stand.coordinates
    },
    properties: {
      stand: stand.text,
      parcelId: stand.parcelId
    }
  }))
  
  if (!map.value.getSource('stand-labels')) {
    map.value.addSource('stand-labels', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: standFeatures
      }
    } as any)
    
    // ⭐ SI 727: Standard font sizes - paper size/scale adjusted to prevent overlap
    map.value.addLayer({
      id: 'stand-labels-layer',
      type: 'symbol',
      source: 'stand-labels',
      layout: {
        'text-field': ['get', 'stand'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 5,
          14, 6,
          16, 7,
          18, 8,
          20, 9
        ],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
        'text-radial-offset': 0.2,
        'text-allow-overlap': false,  // SI 727: NO overlap allowed
        'text-ignore-placement': false,
        'text-optional': false,  // SI 727: Never hide stand labels
        'text-padding': 3
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 1.2,
          16, 1.8,
          20, 2.2
        ],
        'text-halo-blur': 1
      }
    } as any)
    
    console.log('[SurveyPlanMap] ✅ VALIDATED stand labels:', standFeatures.length)
  } else {
    // Update existing source with validated labels
    const source = map.value.getSource('stand-labels') as maplibregl.GeoJSONSource
    source.setData({
      type: 'FeatureCollection',
      features: standFeatures
    } as any)
  }
  
  console.log('[SurveyPlanMap] ✅ All parcels added to map')
}

function applyDiagramHighlight(selectedId: string | number | null) {
  if (!map.value) return
  parcels.value.forEach((p: any) => {
    const layerId = `parcel-${p.id}-outline`
    if (!map.value!.getLayer(layerId)) return
    const isOutsideFig = p.id === getOutsideFigureParcel()?.id
    const isSelected = selectedId != null && String(p.id) === String(selectedId)
    map.value!.setPaintProperty(
      layerId, 'line-color',
      isOutsideFig ? '#ef4444' : isSelected ? '#2563eb' : '#0f172a',
    )
    map.value!.setPaintProperty(
      layerId, 'line-width',
      isOutsideFig ? 3 : isSelected ? 4 : 2,
    )
  })
}

function updateSubjectSidesLayer() {
  if (!map.value) return
  const srcId = 'diagram-subject-sides'
  const feats: any[] = []
  const subj = parcels.value.find((p: any) => String(p.id) === String(selectedDiagramParcelId.value))
  if (isSideAnnotationMode.value && subj?.geom) {
    const tf = transformParcelGeometry(subj.geom)
    const ring = tf?.geometry?.coordinates?.[0] as [number, number][] | undefined
    if (ring) {
      const roleBySide = new Map(currentSideAnnotations.value.map(a => [a.side, a.role]))
      for (const s of subjectSides(ring)) {
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
  if (existing) { existing.setData(data); return }
  map.value.addSource(srcId, { type: 'geojson', data })
  const colour = ['match', ['get', 'role'], 'road', '#B7410E', 'servitude', '#1F6FB2', 'contiguous', '#000000', '#9aa0a6'] as any
  // Solid layer for road/servitude.
  map.value.addLayer({
    id: `${srcId}-solid`, type: 'line', source: srcId,
    filter: ['any', ['==', ['get', 'role'], 'road'], ['==', ['get', 'role'], 'servitude']] as any,
    paint: { 'line-color': colour, 'line-width': 4 },
  })
  // Dashed layer for contiguous + unannotated (dasharray is not data-driven, so a
  // separate fixed-dash layer).
  map.value.addLayer({
    id: `${srcId}-dashed`, type: 'line', source: srcId,
    filter: ['!', ['any', ['==', ['get', 'role'], 'road'], ['==', ['get', 'role'], 'servitude']]] as any,
    paint: { 'line-color': colour, 'line-width': 4, 'line-dasharray': [2, 2] },
  })
  // Wide transparent hit line: easy click target + hover cursor.
  map.value.addLayer({
    id: `${srcId}-hit`, type: 'line', source: srcId,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 14 },
  })
  map.value.on('mouseenter', `${srcId}-hit`, () => { if (map.value) map.value.getCanvas().style.cursor = 'pointer' })
  map.value.on('mouseleave', `${srcId}-hit`, () => { if (map.value) map.value.getCanvas().style.cursor = '' })
}

function onMapClickSelectParcel(e: maplibregl.MapMouseEvent) {
  if (!map.value || !isSideAnnotationMode.value) return
  // Side classification takes priority over re-selecting the subject.
  const hitLayer = 'diagram-subject-sides-hit'
  if (map.value.getLayer(hitLayer)) {
    const sideHits = map.value.queryRenderedFeatures(e.point, { layers: [hitLayer] })
    if (sideHits.length) {
      const side = String(sideHits[0].properties?.side ?? '')
      if (side) {
        // Which terminal(s)? Project the click onto the side in SCREEN space (metric-accurate
        // for short sides) to get a fraction from the 'from' terminal, then classify.
        const coords = (sideHits[0].geometry as any)?.coordinates as [number, number][] | undefined
        let end: 'from' | 'to' | 'both' = 'both'
        if (coords && coords.length >= 2) {
          const pa = map.value!.project(coords[0] as any)
          const pb = map.value!.project(coords[1] as any)
          end = endFromFraction(fractionAlongSide([pa.x, pa.y], [pb.x, pb.y], [e.point.x, e.point.y]))
        }
        // One annotation per side. Editing an existing contiguous entry shows its stored
        // abutment; a fresh tag takes the abutment implied by where you clicked.
        const cur = currentSideAnnotations.value.find(a => a.side === side)
        activeSideEditor.value = {
          side,
          role: cur?.role ?? 'contiguous',
          label: cur?.label ?? '',
          widthM: cur?.widthM ?? null,
          end: cur?.role === 'contiguous' ? (cur.end ?? 'both') : end,
        }
        return
      }
    }
  }
  const outsideFigureId = getOutsideFigureParcel()?.id ?? null
  const fillLayers = parcels.value
    .filter((p: any) => outsideFigureId == null || p.id !== outsideFigureId) // never pick the Outside Figure
    .map((p: any) => `parcel-${p.id}-fill`)
    .filter((id: string) => map.value!.getLayer(id))
  if (fillLayers.length === 0) return
  const hits = map.value.queryRenderedFeatures(e.point, { layers: fillLayers })
  // Drop the Outside Figure (defensive) and prefer the smallest overlapping stand.
  const picked = pickDiagramSubjectId(
    hits.map(h => h.layer.id),
    parcels.value,
    outsideFigureId,
  )
  if (picked == null) return
  selectedDiagramParcelId.value = picked
  applyDiagramHighlight(selectedDiagramParcelId.value)
}

function saveSideEditor() {
  const ed = activeSideEditor.value
  if (!ed || selectedDiagramParcelId.value == null) return
  const ann: SideAnnotation = {
    side: ed.side,
    role: ed.role,
    label: ed.label?.trim() || undefined,
    widthM: (ed.role === 'servitude' || ed.role === 'road') && ed.widthM != null ? ed.widthM : undefined,
    end: ed.role === 'contiguous' ? ed.end : undefined,
  }
  const list = upsertAnnotation(currentSideAnnotations.value, ann)
  sideAnnotationsBySubject.value = withSubjectAnnotations(sideAnnotationsBySubject.value, selectedDiagramParcelId.value, list)
  activeSideEditor.value = null
  updateSubjectSidesLayer()
  persistSideAnnotations()
}

function clearSideEditor() {
  const ed = activeSideEditor.value
  if (!ed || selectedDiagramParcelId.value == null) return
  const list = removeAnnotation(currentSideAnnotations.value, ed.side)
  sideAnnotationsBySubject.value = withSubjectAnnotations(sideAnnotationsBySubject.value, selectedDiagramParcelId.value, list)
  activeSideEditor.value = null
  updateSubjectSidesLayer()
  persistSideAnnotations()
}

/** The subject's Cape Lo outer ring ([Y, X] pairs), or null. Works for any
 *  parcel including the Outside Figure. Vertex order matches subjectSides() so the
 *  side letters resolve to the same edges on the backend. */
function capeLoRingForSubject(subjectId: string | number): [number, number][] | null {
  const p = parcels.value.find((x: any) => String(x.id) === String(subjectId))
  const ring = p?.geom?.coordinates?.[0]
  return Array.isArray(ring) && ring.length >= 3 ? (ring as [number, number][]) : null
}

/** One entry per tagged subject: its Cape Lo ring + its side annotations. Drives
 *  the general-plan road/servitude/contiguous rendering in the PDF and DXF. */
function buildAdjoiningSubjects(): Array<{ subjectId: string; ring: [number, number][]; annotations: SideAnnotation[] }> {
  const out: Array<{ subjectId: string; ring: [number, number][]; annotations: SideAnnotation[] }> = []
  for (const [subjectId, annotations] of Object.entries(sideAnnotationsBySubject.value)) {
    if (!Array.isArray(annotations) || annotations.length === 0) continue
    const ring = capeLoRingForSubject(subjectId)
    if (!ring) continue
    out.push({ subjectId, ring, annotations })
  }
  return out
}

async function persistSideAnnotations() {
  try {
    await api.patch(`/survey-projects/${props.projectId}/workflow`, {
      step: 'survey-plan',
      action: 'update',
      metadata: { sideAnnotations: sideAnnotationsBySubject.value },
    })
  } catch (e: any) {
    console.warn('[SurveyPlanMap] failed to persist side annotations:', e?.message)
  }
}

/** Hydrate the per-subject annotation map from the saved survey-plan workflow step (on mount). */
async function loadSideAnnotations() {
  try {
    const resp = await api.get(`/survey-projects/${props.projectId}/workflow`)
    const ws = resp.data?.workflow_state
    sideAnnotationsBySubject.value = hydrateAnnotationsMap(ws?.step_data?.['survey-plan']?.sideAnnotations)
    updateSubjectSidesLayer()
  } catch (e: any) {
    console.warn('[SurveyPlanMap] failed to load side annotations:', e?.message)
  }
}

function addPointsToMap() {
  if (!map.value || coordinatePoints.value.length === 0) return
  
  console.log('[SurveyPlanMap] 📍 Adding coordinate points to map...')
  console.log('[SurveyPlanMap] Total points:', coordinatePoints.value.length)
  console.log('[SurveyPlanMap] 📏 Sample Cape Lo point:', {
    name: coordinatePoints.value[0].name,
    y: coordinatePoints.value[0].y,
    x: coordinatePoints.value[0].x
  })
  
  // Transform Cape Lo coordinates to WGS84
  // Database columns are correctly named: y=Westing (~97k), x=Southing (~2247k)
  // Cape Lo format needs: y=Westing, x=Southing
  const capeLoPoints: CapeLoPoint[] = coordinatePoints.value.map(p => ({
    id: p.name,
    y: p.y,  // Database y (Westing ~97k) → Cape Lo y (Westing)
    x: p.x,  // Database x (Southing ~2247k) → Cape Lo x (Southing)
    description: p.description
  }))
  
  const wgs84Points = capeLoArrayToWGS84(capeLoPoints, config.value.centralMeridian)

  const outsideFigurePolygon = getOutsideFigurePolygonWgs84()
  const outsideFigureRing = outsideFigurePolygon?.coordinates?.[0] || null

  const allPoints = wgs84Points.map((wgsPoint, index) => ({
    wgsPoint,
    originalPoint: coordinatePoints.value[index]
  }))

  const pointsInOutsideFigure = outsideFigureRing
    ? allPoints.filter(p => isPointInRing([p.wgsPoint.lng, p.wgsPoint.lat], outsideFigureRing))
    : allPoints

  console.log('[SurveyPlanMap] Points in Outside Figure:', pointsInOutsideFigure.length)
  
  console.log('[SurveyPlanMap] ✅ Transformed points to WGS84')
  console.log('[SurveyPlanMap] 📍 Sample WGS84 point:', {
    id: wgs84Points[0].id,
    lng: wgs84Points[0].lng.toFixed(6),
    lat: wgs84Points[0].lat.toFixed(6)
  })
  console.log('[SurveyPlanMap] 📍 Expected: lng ~30.07°E, lat ~-20.32°S')
  
  // ⭐ PHASE 3 (SI 727): Use ALL validated labels (no overlap allowed)
  const beaconFeatures = validatedLabels.value.beacons.map(beacon => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: beacon.coordinates
    },
    properties: {
      name: beacon.text,
      beaconName: beacon.beaconName,
      parcelId: beacon.parcelId,
      isInsideParcel: beacon.isInsideParcel
    }
  }))
  
  console.log('[SurveyPlanMap] 🏷️ COLLISION-FREE beacon labels:', beaconFeatures.length)
  
  // Add beacon labels layer (consolidated - no more inside/outside split)
  if (!map.value.getSource('beacon-labels')) {
    map.value.addSource('beacon-labels', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: beaconFeatures
      }
    } as any)
    
    // ⭐ SI 727: Standard font sizes - paper size/scale adjusted to prevent overlap
    // CADASTRAL STANDARD: Intelligent label positioning for inside/outside parcels
    // - Inside labels (suffix only): prefer center/top-right to stay within parcel
    // - Outside labels (full name): use radial offset to avoid beacon circle
    map.value.addLayer({
      id: 'beacon-labels-layer',
      type: 'symbol',
      source: 'beacon-labels',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 5,
          14, 6,
          16, 7,
          18, 8,
          20, 9
        ],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        // SI 727: Position beacon suffix labels INSIDE parcels with same padding as edge labels
        // Use negative offset to pull labels inward from beacon point toward parcel center
        'text-variable-anchor': ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right'],
        'text-radial-offset': -0.5,  // NEGATIVE offset pulls label INSIDE parcel boundary
        'text-justify': 'center',
        'text-allow-overlap': false,  // SI 727: NO overlap allowed
        'text-ignore-placement': false,
        'text-optional': false,  // SI 727: Never hide beacon labels
        'text-padding': 2  // Reduced from 3 for better clearance detection
      },
      paint: {
        'text-color': '#1e293b',
        'text-halo-color': '#ffffff',
        'text-halo-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 1.5,
          16, 2.0,
          20, 2.5
        ],
        'text-halo-blur': 0.5
      }
    } as any)
    
    console.log('[SurveyPlanMap] ✅ VALIDATED beacon labels:', beaconFeatures.length)
  } else {
    // Update existing source with validated labels
    const source = map.value.getSource('beacon-labels') as maplibregl.GeoJSONSource
    source.setData({
      type: 'FeatureCollection',
      features: beaconFeatures
    } as any)
  }
  
  // ⭐ PHASE 2: Beacon circle markers still use all coordinate points for visualization
  // (These are the actual beacon positions, not labels)
  const sharedBeaconNames = new Set(
    (intelligentPreview.value?.topology?.beacons || []).filter((b: any) => b.shared).map((b: any) => b.name)
  )

  const outsideFigureCapeLoRing = getOutsideFigureCapeLoRing()
  const boundaryToleranceMeters = 0.5

  const beaconCircleFeatures = pointsInOutsideFigure.map(p => {
    const description = p.originalPoint.description?.toLowerCase() || ''
    const isFound = description.includes('found') || description.includes('existing')
    const isShared = sharedBeaconNames.has(p.wgsPoint.id)
    const isBoundary = outsideFigureCapeLoRing
      ? isPointNearRing(
          { x: p.originalPoint.x, y: p.originalPoint.y },
          outsideFigureCapeLoRing,
          boundaryToleranceMeters
        )
      : false
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.wgsPoint.lng, p.wgsPoint.lat]
      },
      properties: {
        id: p.wgsPoint.id,
        isFound,
        isShared,
        isBoundary
      }
    }
  })

  if (!map.value.getSource('beacons')) {
    map.value.addSource('beacons', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: beaconCircleFeatures
      }
    } as any)
  }

  // Progressive disclosure:
  // - zoom < 16: show shared beacons only
  // - zoom >= 16: show all beacons

  if (!map.value.getLayer('beacons-circle-shared')) {
    map.value.addLayer({
      id: 'beacons-circle-shared',
      type: 'circle',
      source: 'beacons',
      maxzoom: 16,
      filter: ['any', ['==', ['get', 'isShared'], true], ['==', ['get', 'isBoundary'], true]],
      paint: {
        'circle-color': '#ffffff',
        'circle-stroke-color': '#0f172a',
        'circle-stroke-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 1.2,
          16, 1.8,
          20, 2.2
        ],
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 4,
          16, 6,
          20, 8
        ]
      }
    } as any)
  }

  if (!map.value.getLayer('beacons-dot-found-shared')) {
    map.value.addLayer({
      id: 'beacons-dot-found-shared',
      type: 'circle',
      source: 'beacons',
      maxzoom: 16,
      filter: [
        'all',
        ['any', ['==', ['get', 'isShared'], true], ['==', ['get', 'isBoundary'], true]],
        ['==', ['get', 'isFound'], true]
      ],
      paint: {
        'circle-color': '#0f172a',
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 1.4,
          16, 2.2,
          20, 3.0
        ]
      }
    } as any)
  }

  if (!map.value.getLayer('beacons-circle-all')) {
    map.value.addLayer({
      id: 'beacons-circle-all',
      type: 'circle',
      source: 'beacons',
      minzoom: 16,
      paint: {
        'circle-color': '#ffffff',
        'circle-stroke-color': '#0f172a',
        'circle-stroke-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 1,
          16, 1.5,
          20, 2
        ],
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 3,
          16, 5,
          20, 7
        ]
      }
    } as any)
  }

  if (!map.value.getLayer('beacons-dot-found-all')) {
    map.value.addLayer({
      id: 'beacons-dot-found-all',
      type: 'circle',
      source: 'beacons',
      minzoom: 16,
      filter: ['==', ['get', 'isFound'], true],
      paint: {
        'circle-color': '#0f172a',
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 1.2,
          16, 2,
          20, 2.8
        ]
      }
    } as any)
  }

  console.log(`[SurveyPlanMap] ✅ Added ${beaconFeatures.length} beacons as scalable circle layers`)
}

// Cached Outside Figure parcel lookup (avoids repeated full-list logging)
let _outsideFigureCache: { parcelsLen: number; result: any | null } | null = null

function getOutsideFigureParcel(): any | null {
  // Return cached result if parcels haven't changed
  if (_outsideFigureCache && _outsideFigureCache.parcelsLen === parcels.value.length) {
    return _outsideFigureCache.result
  }
  
  const outsideFigureParcel = parcels.value.find(p =>
    p.designation?.toLowerCase().includes('outside figure') ||
    p.designation?.toLowerCase().includes('outside_figure') ||
    p.designation?.toLowerCase().includes('outsidefigure') ||
    p.stand?.toLowerCase().includes('outside figure') ||
    p.stand?.toLowerCase().includes('outside_figure') ||
    p.stand?.toLowerCase() === 'of' ||
    p.description?.toLowerCase().includes('outside figure') ||
    p.metadata?.isOutsideFigure === true ||
    p.metadata?.is_outside_figure === true ||
    p.is_outside_figure === true
  )
  
  const result = outsideFigureParcel || null
  _outsideFigureCache = { parcelsLen: parcels.value.length, result }
  
  if (result) {
    console.log('[SurveyPlanMap] ✅ Outside Figure parcel:', result.stand || result.designation)
  } else {
    console.warn('[SurveyPlanMap] ⚠️ No Outside Figure parcel found among', parcels.value.length, 'parcels')
  }
  
  return result
}

function getOutsideFigurePolygonWgs84(): any | null {
  const outsideFigureParcel = getOutsideFigureParcel()
  if (!outsideFigureParcel) return null
  const transformed = transformParcelGeometry(outsideFigureParcel.geom)
  if (!transformed) {
    return null
  }
  return transformed.geometry
}

// Helper function: Point-in-polygon test using ray casting
// Proven implementation from backend pdfkitGeoPDF.js
// CRITICAL: Both point and polygon must use same coordinate order [y, x]
const isPointInPolygon = (point: [number, number], polygon: [number, number][]): boolean => {
  const [y, x] = point // Cape Lo: [Y, X]
  let inside = false
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    
    const intersect = ((xi > x) !== (xj > x)) &&
      (y < (yj - yi) * (x - xi) / (xj - xi) + yi)
    
    if (intersect) inside = !inside
  }
  
  return inside
}

// Helper function: Point-in-polygon test for WGS84 coordinates [lng, lat]
// Generic implementation that works with any coordinate system
const isPointInRing = (point: [number, number], ring: [number, number][]): boolean => {
  const [p0, p1] = point
  let inside = false
  
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [r0_i, r1_i] = ring[i]
    const [r0_j, r1_j] = ring[j]
    
    const intersect = ((r1_i > p1) !== (r1_j > p1)) &&
      (p0 < (r0_j - r0_i) * (p1 - r1_i) / (r1_j - r1_i) + r0_i)
    
    if (intersect) inside = !inside
  }
  
  return inside
}

function getOutsideFigureCapeLoRing(): Array<{ x: number; y: number }> | null {
  const outsideFigureParcel = getOutsideFigureParcel()
  const points = outsideFigureParcel?.metadata?.cape_lo_points
  if (!points || !Array.isArray(points) || points.length < 3) return null

  const ring = points
    .map((p: any) => ({ x: Number(p.x), y: Number(p.y) }))
    .filter((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y))

  if (ring.length < 3) return null

  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first.x !== last.x || first.y !== last.y) {
    ring.push({ x: first.x, y: first.y })
  }
  return ring
}

function isPointNearRing(
  point: { x: number; y: number },
  ring: Array<{ x: number; y: number }>,
  toleranceMeters: number
): boolean {
  if (!ring || ring.length < 2) return false
  const tol2 = toleranceMeters * toleranceMeters
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]
    const b = ring[i + 1]
    const d2 = pointToSegmentDistanceSquared(point, a, b)
    if (d2 <= tol2) return true
  }
  return false
}

function pointToSegmentDistanceSquared(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const wx = p.x - a.x
  const wy = p.y - a.y

  const c1 = wx * vx + wy * vy
  if (c1 <= 0) {
    const dx = p.x - a.x
    const dy = p.y - a.y
    return dx * dx + dy * dy
  }

  const c2 = vx * vx + vy * vy
  if (c2 <= c1) {
    const dx = p.x - b.x
    const dy = p.y - b.y
    return dx * dx + dy * dy
  }

  const t = c1 / c2
  const projX = a.x + t * vx
  const projY = a.y + t * vy
  const dx = p.x - projX
  const dy = p.y - projY
  return dx * dx + dy * dy
}

// Add topology layer (beacons with shared/unique visualization)
function addTopologyToMap() {
  if (!map.value || !intelligentPreview.value) return

  // Topology is already represented by the scalable beacon layers (shared vs unique styling)
  // Avoid adding DOM markers here because they bypass collision handling and add clutter.
  // Early return - no need to add additional topology markers
  
  // The following code is disabled but kept for reference:
  /*
  console.log('[SurveyPlanMap] 🔗 Adding topology layer...')
  console.log('[SurveyPlanMap] Total beacons:', intelligentPreview.value.topology.beacons.length)
  console.log('[SurveyPlanMap] Shared beacons:', intelligentPreview.value.metadata.sharedBeacons)
  
  const beacons = intelligentPreview.value.topology.beacons
  
  // Transform Cape Lo coordinates to WGS84
  const capeLoBeacons: CapeLoPoint[] = beacons.map(b => ({
    id: b.name,
    x: b.y,  // Swap: y → x (Southing)
    y: b.x,  // Swap: x → y (Westing)
    description: b.shared ? `Shared by: ${b.parcels.join(', ')}` : `Parcel: ${b.parcels[0]}`
  }))
  
  const wgs84Beacons = capeLoArrayToWGS84(capeLoBeacons, config.value.centralMeridian)
  
  beacons.forEach((beacon, index) => {
    const wgsPoint = wgs84Beacons[index]
    
    // Create custom marker element
    const el = document.createElement('div')
    el.className = 'beacon-marker'
    el.innerHTML = beacon.name
    
    // Color based on shared status
    const color = beacon.shared ? '#ef4444' : '#22c55e' // Red for shared, green for unique
    const borderWidth = beacon.shared ? '3px' : '2px'
    
    el.style.cssText = `
      background: ${color};
      border: ${borderWidth} solid white;
      border-radius: 50%;
      width: ${beacon.shared ? '32px' : '28px'};
      height: ${beacon.shared ? '32px' : '28px'};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      color: white;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `
    
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([wgsPoint.lng, wgsPoint.lat])
      .setPopup(new maplibregl.Popup().setHTML(`
        <div style="min-width: 150px;">
          <strong style="font-size: 14px;">${beacon.name}</strong>
          <div style="margin-top: 8px;">
            <span style="display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 50%; margin-right: 5px;"></span>
            <strong>${beacon.shared ? 'SHARED' : 'Unique'}</strong>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">
            <strong>Parcels:</strong><br>
            ${beacon.parcels.join('<br>')}
          </div>
          <div style="margin-top: 8px; font-size: 11px; color: #999;">
            Y: ${beacon.y.toFixed(3)}<br>
            X: ${beacon.x.toFixed(3)}
          </div>
        </div>
      `))
      .addTo(map.value!)
    
    // Store marker reference (we'll need this for toggling)
    topologyMarkers.value.push(marker)
  })
  
  console.log(`[SurveyPlanMap] ✅ Added ${beacons.length} beacon markers`)
  console.log(`[SurveyPlanMap] 🔴 Shared: ${beacons.filter(b => b.shared).length}`)
  console.log(`[SurveyPlanMap] 🟢 Unique: ${beacons.filter(b => !b.shared).length}`)
  */
}

// Add adaptive label layer (parcel labels with collision detection)
function addLabelsToMap() {
  if (!map.value || !intelligentPreview.value) return
  
  console.log('[SurveyPlanMap] 🏷️ Adding adaptive label layer...')
  console.log('[SurveyPlanMap] Total labels:', intelligentPreview.value.labels.length)
  console.log('[SurveyPlanMap] Label collisions:', intelligentPreview.value.metadata.labelCollisions)
  
  const labels = intelligentPreview.value.labels
  
  // Create GeoJSON source for labels
  // label.x = Southing, label.y = Westing — must transform to WGS84 before use in MapLibre
  const labelFeatures = labels
    .map(label => {
      try {
        const wgs84 = capeLoToWGS84(
          { id: `lbl-${label.parcel || label.text}`, x: label.x, y: label.y } as CapeLoPoint,
          config.value.centralMeridian
        )
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [wgs84.lng, wgs84.lat]
          },
          properties: {
            stand: label.parcel || label.text,
            fontSize: label.fontSize,
            hasCollision: label.hasCollision,
            area: label.area
          }
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
  
  const labelSource = {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: labelFeatures
    }
  }
  
  // Add source
  if (!map.value.getSource('parcel-labels')) {
    map.value.addSource('parcel-labels', labelSource as any)
  }
  
  // Add label layer with adaptive styling
  if (!map.value.getLayer('parcel-labels-layer')) {
    map.value.addLayer({
      id: 'parcel-labels-layer',
      type: 'symbol',
      source: 'parcel-labels',
      layout: {
        'text-field': ['get', 'stand'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['get', 'fontSize'],
          2.0, 10,
          3.0, 14,
          4.0, 18
        ],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-anchor': 'center',
        'text-allow-overlap': false,
        'text-ignore-placement': false
      },
      paint: {
        'text-color': [
          'case',
          ['get', 'hasCollision'],
          '#f59e0b', // Amber for collisions
          '#1e40af'  // Blue for normal
        ],
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 1
      }
    } as any)
  }
  
  console.log(`[SurveyPlanMap] ✅ Added ${labels.length} adaptive labels`)
  console.log(`[SurveyPlanMap] 🔵 Normal: ${labels.filter(l => !l.hasCollision).length}`)
  console.log(`[SurveyPlanMap] 🟡 Collisions: ${labels.filter(l => l.hasCollision).length}`)
}

// ⭐ GEOCODED LAYOUT: Position sheet and data blocks at actual geographic coordinates
function addLayoutGuidesToMap() {
  if (!map.value || !intelligentPreview.value || !intelligentPreview.value.layout) return
  
  console.log('[SurveyPlanMap] 🗺️ Adding GEOCODED SI 727 layout...')
  
  const layout = intelligentPreview.value.layout
  // Priority order:
  //  1. activeTileGrid.scaleDenominator  — always correct per SI 727 Reg 32(3)
  //  2. intelligentPreview.scale.denominator — backend recommendation
  //  3. Manually selected scale
  //  4. Fallback 2000
  const scale =
    activeTileGrid.value?.scaleDenominator
    ?? intelligentPreview.value.scale?.denominator
    ?? parseScale(config.value.scale)
    ?? 2000
  
  // Get outside figure for geographic positioning
  const outsideFigurePolygon = getOutsideFigurePolygonWgs84()
  if (!outsideFigurePolygon?.coordinates?.[0]) {
    console.warn('[SurveyPlanMap] ⚠️ No outside figure - falling back to viewport center')
    addLayoutGuidesToMapViewportCenter() // Fallback
    return
  }
  
  // Calculate outside figure bounding box
  const coords = outsideFigurePolygon.coordinates[0] as [number, number][]
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  })
  
  const ofCenterLng = (minLng + maxLng) / 2
  const ofCenterLat = (minLat + maxLat) / 2
  const ofWidthMeters = calculateDistanceMeters(minLng, minLat, maxLng, minLat)
  const ofHeightMeters = calculateDistanceMeters(minLng, minLat, minLng, maxLat)
  
  console.log('[SurveyPlanMap] 📍 Outside Figure bounds:', {
    center: [ofCenterLng.toFixed(6), ofCenterLat.toFixed(6)],
    width: `${ofWidthMeters.toFixed(1)}m`,
    height: `${ofHeightMeters.toFixed(1)}m`
  })
  
  // Convert mm to meters on the ground using the scale
  // At 1:2000, 1mm on paper = 2000mm on ground = 2 meters
  const mmToGroundMeters = (mm: number) => (mm / 1000) * scale
  
  // Sheet dimensions in meters on the ground (true ground scale)
  // Paper mm × print scale = actual ground meters for collision detection
  const sheetWidthM = mmToGroundMeters(layout.sheet.width)
  const sheetHeightM = mmToGroundMeters(layout.sheet.height)
  const marginLeftM = mmToGroundMeters(layout.margins.left)
  const marginRightM = mmToGroundMeters(layout.margins.right)
  const marginTopM = mmToGroundMeters(layout.margins.top)
  const marginBottomM = mmToGroundMeters(layout.margins.bottom)
  
  // Drawing area dimensions in meters
  const drawingWidthM = mmToGroundMeters(layout.drawingArea.width)
  const drawingHeightM = mmToGroundMeters(layout.drawingArea.height)
  const drawingOffsetXM = mmToGroundMeters(layout.drawingArea.x)
  const drawingOffsetYM = mmToGroundMeters(layout.drawingArea.y)
  
  // ⭐ Position sheet so outside figure is centered in the drawing area
  // The drawing area should contain the outside figure with some padding
  
  // Debug the input values
  console.log('[SurveyPlanMap] 🔍 DEBUG coordinate conversion:', {
    ofCenterLng,
    ofCenterLat,
    sheetWidthM,
    sheetHeightM,
    drawingWidthM,
    drawingHeightM,
    marginLeftM,
    marginBottomM,
    scale
  })
  
  // Convert meters to degrees
  // At equator: 1° ≈ 111.32km longitude, 110.54km latitude
  // At latitude φ: 1° longitude = 111.32km * cos(φ)
  const latRad = ofCenterLat * Math.PI / 180
  const metersPerDegreeLng = 111320 * Math.cos(latRad)
  const metersPerDegreeLat = 110540
  
  console.log('[SurveyPlanMap] 🔍 DEBUG meters per degree:', {
    metersPerDegreeLng,
    metersPerDegreeLat,
    latRad,
    cosLat: Math.cos(latRad)
  })
  
  // Calculate dimensions in degrees
  const sheetWidthDegrees = sheetWidthM / metersPerDegreeLng
  const sheetHeightDegrees = sheetHeightM / metersPerDegreeLat
  const drawingWidthDegrees = drawingWidthM / metersPerDegreeLng
  const drawingHeightDegrees = drawingHeightM / metersPerDegreeLat
  const marginLeftDegrees = marginLeftM / metersPerDegreeLng
  const marginBottomDegrees = marginBottomM / metersPerDegreeLat
  
  console.log('[SurveyPlanMap] 🔍 DEBUG dimensions in degrees:', {
    sheetWidthDegrees,
    sheetHeightDegrees,
    drawingWidthDegrees,
    drawingHeightDegrees,
    marginLeftDegrees,
    marginBottomDegrees
  })
  
  // Center the drawing area on the outside figure
  const sheetOriginLng = ofCenterLng - (drawingWidthDegrees / 2) - marginLeftDegrees
  const sheetOriginLat = ofCenterLat - (drawingHeightDegrees / 2) - marginBottomDegrees
  
  console.log('[SurveyPlanMap] 🔍 DEBUG sheet origin:', {
    sheetOriginLng,
    sheetOriginLat,
    expectedLng: ofCenterLng,
    offsetLng: (drawingWidthDegrees / 2) + marginLeftDegrees
  })
  
  // Calculate sheet corners in geographic coordinates
  const sheetCorners = [
    [sheetOriginLng, sheetOriginLat], // Bottom-left
    [sheetOriginLng + sheetWidthDegrees, sheetOriginLat], // Bottom-right
    [sheetOriginLng + sheetWidthDegrees, sheetOriginLat + sheetHeightDegrees], // Top-right
    [sheetOriginLng, sheetOriginLat + sheetHeightDegrees], // Top-left
    [sheetOriginLng, sheetOriginLat] // Close
  ]
  
  // Drawing area corners (inside margins)
  const drawingOriginLng = sheetOriginLng + marginLeftDegrees
  const drawingOriginLat = sheetOriginLat + marginBottomDegrees
  const drawingCorners = [
    [drawingOriginLng, drawingOriginLat],
    [drawingOriginLng + drawingWidthDegrees, drawingOriginLat],
    [drawingOriginLng + drawingWidthDegrees, drawingOriginLat + drawingHeightDegrees],
    [drawingOriginLng, drawingOriginLat + drawingHeightDegrees],
    [drawingOriginLng, drawingOriginLat]
  ]
  
  // Create geocoded features
  const layoutFeatures: any[] = []
  
  // 1. ⭐ Sheet boundary polygon (geocoded)
  layoutFeatures.push({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [sheetCorners]
    },
    properties: { 
      type: 'sheet-boundary', 
      label: `${layout.sheet.name} (${layout.sheet.width}×${layout.sheet.height}mm @ 1:${scale})`,
      sheetSize: `${layout.sheet.width}×${layout.sheet.height}mm`,
      scale: `1:${scale}`
    }
  })
  
  // 2. ⭐ Drawing area polygon (geocoded)
  layoutFeatures.push({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [drawingCorners]
    },
    properties: { 
      type: 'drawing-area', 
      label: 'Drawing Area'
    }
  })
  
  // 3. ⭐ Data blocks positioned at geographic coordinates
  // Title block: top-left corner of sheet
  const titleBlockX = marginLeftM
  const titleBlockY = sheetHeightM - marginTopM - 40 // 40mm title block height
  layoutFeatures.push(createGeocodedBlock(
    'title-block', 'Title Block',
    sheetOriginLng, sheetOriginLat, sheetWidthM, sheetHeightM,
    titleBlockX, titleBlockY, 180, 40, // 180mm × 40mm
    metersPerDegreeLng, metersPerDegreeLat
  ))
  
  // Schedule of Areas: bottom-left
  const scheduleX = marginLeftM
  const scheduleY = marginBottomM + 20
  layoutFeatures.push(createGeocodedBlock(
    'schedule-areas', 'Schedule of Areas',
    sheetOriginLng, sheetOriginLat, sheetWidthM, sheetHeightM,
    scheduleX, scheduleY, 100, 80,
    metersPerDegreeLng, metersPerDegreeLat
  ))
  
  // Outside Figure Data: left side, middle
  const ofdX = marginLeftM
  const ofdY = sheetHeightM / 2
  layoutFeatures.push(createGeocodedBlock(
    'outside-figure-data', 'Outside Figure Data',
    sheetOriginLng, sheetOriginLat, sheetWidthM, sheetHeightM,
    ofdX, ofdY, 120, 100,
    metersPerDegreeLng, metersPerDegreeLat
  ))
  
  // North Arrow: top-right of drawing area
  const northArrowX = marginLeftM + drawingWidthM - 30
  const northArrowY = sheetHeightM - marginTopM - 30
  layoutFeatures.push(createGeocodedBlock(
    'north-arrow', 'North Arrow',
    sheetOriginLng, sheetOriginLat, sheetWidthM, sheetHeightM,
    northArrowX, northArrowY, 25, 25,
    metersPerDegreeLng, metersPerDegreeLat
  ))
  
  // Scale Bar: bottom-center of drawing area
  const scaleBarX = marginLeftM + drawingWidthM / 2 - 40
  const scaleBarY = marginBottomM + 10
  layoutFeatures.push(createGeocodedBlock(
    'scale-bar', 'Scale Bar',
    sheetOriginLng, sheetOriginLat, sheetWidthM, sheetHeightM,
    scaleBarX, scaleBarY, 80, 15,
    metersPerDegreeLng, metersPerDegreeLat
  ))
  
  // Add sources and layers
  const sourceId = 'geocoded-layout'
  if (map.value.getSource(sourceId)) {
    (map.value.getSource(sourceId) as any).setData({
      type: 'FeatureCollection',
      features: layoutFeatures
    })
  } else {
    map.value.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: layoutFeatures
      }
    } as any)
  }
  
  // Sheet boundary layer (thick purple line)
  if (!map.value.getLayer('geocoded-sheet-boundary')) {
    map.value.addLayer({
      id: 'geocoded-sheet-boundary',
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'type'], 'sheet-boundary'],
      paint: {
        'line-color': '#8b5cf6',
        'line-width': 3,
        'line-dasharray': [2, 2]
      },
      layout: {
        'visibility': 'visible'
      }
    } as any)
  }
  
  // Drawing area layer (light purple fill)
  if (!map.value.getLayer('geocoded-drawing-area')) {
    map.value.addLayer({
      id: 'geocoded-drawing-area',
      type: 'fill',
      source: sourceId,
      filter: ['==', ['get', 'type'], 'drawing-area'],
      paint: {
        'fill-color': '#8b5cf6',
        'fill-opacity': 0.1
      },
      layout: {
        'visibility': 'visible'
      }
    } as any)
  }
  
  // Data blocks layer (outlines with labels)
  if (!map.value.getLayer('geocoded-data-blocks')) {
    map.value.addLayer({
      id: 'geocoded-data-blocks',
      type: 'line',
      source: sourceId,
      filter: ['in', ['get', 'type'], ['literal', ['title-block', 'schedule-areas', 'outside-figure-data', 'north-arrow', 'scale-bar']]],
      paint: {
        'line-color': '#f59e0b',
        'line-width': 2,
        'line-dasharray': [3, 3]
      },
      layout: {
        'visibility': 'visible'
      }
    } as any)
  }
  
  // Data block labels
  if (!map.value.getLayer('geocoded-block-labels')) {
    map.value.addLayer({
      id: 'geocoded-block-labels',
      type: 'symbol',
      source: sourceId,
      filter: ['has', 'label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-anchor': 'center',
        'text-offset': [0, 0],
        'text-max-width': 0, // ⭐ Prevent text wrapping
        'visibility': 'visible'
      },
      paint: {
        'text-color': '#f59e0b',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
      }
    } as any)
  }
  
  console.log('[SurveyPlanMap] ✅ GEOCODED layout added:')
  console.log(`  📄 Sheet: ${layout.sheet.name} (${layout.sheet.width}×${layout.sheet.height}mm)`)
  console.log(`  📐 Drawing area: ${layout.drawingArea.width}×${layout.drawingArea.height}mm`)
  console.log(`  📍 Scale: 1:${scale}`)
  console.log(`  🗺️  Sheet corners:`, sheetCorners.map(c => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`))
  
  // ⭐ FORCE visibility on all geocoded layers (override any toggle state)
  const geocodedLayerIds = [
    'geocoded-sheet-boundary',
    'geocoded-drawing-area', 
    'geocoded-data-blocks',
    'geocoded-block-labels'
  ]
  geocodedLayerIds.forEach(layerId => {
    if (map.value!.getLayer(layerId)) {
      map.value!.setLayoutProperty(layerId, 'visibility', 'visible')
      console.log(`[SurveyPlanMap] 👁️  Layer ${layerId} visibility: FORCED VISIBLE`)
    }
  })
  
  // ⭐ ALSO force all parcel layers to be visible (especially outside figure)
  parcels.value.forEach(parcel => {
    const fillLayerId = `parcel-${parcel.id}-fill`
    const outlineLayerId = `parcel-${parcel.id}-outline`
    
    if (map.value!.getLayer(fillLayerId)) {
      map.value!.setLayoutProperty(fillLayerId, 'visibility', 'visible')
    }
    if (map.value!.getLayer(outlineLayerId)) {
      map.value!.setLayoutProperty(outlineLayerId, 'visibility', 'visible')
      // Bring outside figure outline to front so it's visible above geocoded layers
      map.value!.moveLayer(outlineLayerId)
    }
  })
  console.log('[SurveyPlanMap] 👁️  All parcel layers forced VISIBLE and brought to front')
}

// Helper function to create a geocoded data block feature
function createGeocodedBlock(
  type: string,
  label: string,
  sheetOriginLng: number,
  sheetOriginLat: number,
  sheetWidthM: number,
  sheetHeightM: number,
  offsetXM: number,
  offsetYM: number,
  widthMM: number,
  heightMM: number,
  metersPerDegreeLng: number,
  metersPerDegreeLat: number
): any {
  const scale = intelligentPreview.value?.scale?.denominator || 2000
  const widthM = (widthMM / 1000) * scale
  const heightM = (heightMM / 1000) * scale
  
  // PDF coordinates: origin at bottom-left, Y increases upward
  // Geographic: origin at bottom-left, Lat increases upward
  const blockOriginLng = sheetOriginLng + (offsetXM / metersPerDegreeLng)
  const blockOriginLat = sheetOriginLat + (offsetYM / metersPerDegreeLat)
  
  const corners = [
    [blockOriginLng, blockOriginLat],
    [blockOriginLng + (widthM / metersPerDegreeLng), blockOriginLat],
    [blockOriginLng + (widthM / metersPerDegreeLng), blockOriginLat + (heightM / metersPerDegreeLat)],
    [blockOriginLng, blockOriginLat + (heightM / metersPerDegreeLat)],
    [blockOriginLng, blockOriginLat]
  ]
  
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [corners]
    },
    properties: {
      type,
      label,
      widthMM,
      heightMM,
      offsetXM,
      offsetYM,
      widthM,
      heightM
    }
  }
}



// Fallback function - original viewport-centered layout
function addLayoutGuidesToMapViewportCenter() {
  if (!map.value || !intelligentPreview.value || !intelligentPreview.value.layout) return
  
  const layout = intelligentPreview.value.layout
  const mmToMeters = (mm: number) => mm / 1000 * (intelligentPreview.value?.scale?.denominator || 2000)
  
  const bounds = map.value.getBounds()
  const center = bounds.getCenter()
  
  const layoutFeatures: any[] = []
  
  // Sheet boundary
  const sheetWidth = mmToMeters(layout.sheet.width)
  const sheetHeight = mmToMeters(layout.sheet.height)
  
  layoutFeatures.push({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [center.lng - sheetWidth/2, center.lat - sheetHeight/2],
        [center.lng + sheetWidth/2, center.lat - sheetHeight/2],
        [center.lng + sheetWidth/2, center.lat + sheetHeight/2],
        [center.lng - sheetWidth/2, center.lat + sheetHeight/2],
        [center.lng - sheetWidth/2, center.lat - sheetHeight/2]
      ]
    },
    properties: { type: 'sheet-boundary', label: `${layout.sheet.name} (${layout.sheet.width}×${layout.sheet.height}mm)` }
  })
  
  // Drawing area
  const drawingOffsetX = mmToMeters(layout.drawingArea.x)
  const drawingOffsetY = mmToMeters(layout.drawingArea.y)
  const drawingWidth = mmToMeters(layout.drawingArea.width)
  const drawingHeight = mmToMeters(layout.drawingArea.height)
  
  layoutFeatures.push({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [center.lng - sheetWidth/2 + drawingOffsetX, center.lat + sheetHeight/2 - drawingOffsetY],
        [center.lng - sheetWidth/2 + drawingOffsetX + drawingWidth, center.lat + sheetHeight/2 - drawingOffsetY],
        [center.lng - sheetWidth/2 + drawingOffsetX + drawingWidth, center.lat + sheetHeight/2 - drawingOffsetY - drawingHeight],
        [center.lng - sheetWidth/2 + drawingOffsetX, center.lat + sheetHeight/2 - drawingOffsetY - drawingHeight],
        [center.lng - sheetWidth/2 + drawingOffsetX, center.lat + sheetHeight/2 - drawingOffsetY]
      ]]
    },
    properties: { type: 'drawing-area', label: 'Drawing Area' }
  })
  
  // Add sources and layers (original implementation)
  if (!map.value.getSource('layout-guides')) {
    map.value.addSource('layout-guides', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: layoutFeatures
      }
    } as any)
  }
  
  if (!map.value.getLayer('layout-sheet-boundary')) {
    map.value.addLayer({
      id: 'layout-sheet-boundary',
      type: 'line',
      source: 'layout-guides',
      filter: ['==', ['get', 'type'], 'sheet-boundary'],
      paint: {
        'line-color': '#8b5cf6',
        'line-width': 3,
        'line-dasharray': [2, 2]
      },
      layout: {
        'visibility': 'visible'
      }
    } as any)
  }
  
  if (!map.value.getLayer('layout-drawing-area')) {
    map.value.addLayer({
      id: 'layout-drawing-area',
      type: 'fill',
      source: 'layout-guides',
      filter: ['==', ['get', 'type'], 'drawing-area'],
      paint: {
        'fill-color': '#8b5cf6',
        'fill-opacity': 0.1
      },
      layout: {
        'visibility': 'visible'
      }
    } as any)
  }
  
  console.log('[SurveyPlanMap] ✅ Viewport-centered layout guides added (fallback)')
}

// Helper: Calculate distance in meters between two WGS84 points
function calculateDistanceMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

function transformParcelGeometry(geom: any) {
  // Parse geometry if it's a string (from database)
  let geometry = geom
  if (!geometry) {
    return null
  }

  if (typeof geometry === 'string') {
    try {
      geometry = JSON.parse(geometry)
    } catch (e) {
      console.error('[SurveyPlanMap] ❌ Failed to parse geometry:', e)
      return null
    }
  }

  // Accept GeoJSON Feature wrappers
  if (geometry?.type === 'Feature' && geometry?.geometry) {
    geometry = geometry.geometry
  }
  
  // ⭐ CHECK CRS: Skip transformation if already WGS84
  const crs = geometry?.crs
  const crsName = crs?.properties?.name || crs?.name || ''
  const isAlreadyWGS84 = crsName.includes('EPSG:4326') || crsName.includes('WGS84')
  
  if (isAlreadyWGS84) {
    console.log('[SurveyPlanMap] ✅ Geometry already WGS84, skipping transformation:', crsName)
    delete geometry.crs // Remove CRS for MapLibre
    return {
      type: 'Feature' as const,
      geometry: {
        type: geometry.type as const,
        coordinates: geometry.coordinates
      },
      properties: {}
    }
  }
  
  // Remove CRS from geometry (MapLibre doesn't support it)
  if (geometry && geometry.crs) {
    delete geometry.crs
  }
  
  // Transform Cape Lo coordinates to WGS84 for MapLibre
  if (geometry && geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const loZone = config.value.centralMeridian
    
    const transformedCoords = geometry.coordinates.map((ring: number[][]) => {
      // Batch transform entire ring at once (not one vertex at a time)
      const capeLoPoints: CapeLoPoint[] = ring.map((coord: number[], i: number) => ({
        id: `v${i}`,
        x: coord[0],  // Southing
        y: coord[1]   // Westing
      }))
      const wgs84Points = capeLoArrayToWGS84(capeLoPoints, loZone)
      return wgs84Points.map(p => [p.lng, p.lat])
    })
    
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: transformedCoords
      },
      properties: {}
    }
  }

  // Accept MultiPolygon by taking the first polygon as fallback
  if (geometry && geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates?.[0])) {
    return transformParcelGeometry({
      type: 'Polygon',
      coordinates: geometry.coordinates[0]
    })
  }
  
  console.warn('[SurveyPlanMap] ⚠️ Unknown geometry format (skipping):', geometry)
  return null
}

function calculateCentroid(geom: any) {
  const coords = geom.coordinates ? geom.coordinates[0] : geom.geometry.coordinates[0]
  const sum = coords.reduce((acc: any, coord: any) => ({
    lng: acc.lng + coord[0],
    lat: acc.lat + coord[1]
  }), { lng: 0, lat: 0 })
  
  return {
    lng: sum.lng / coords.length,
    lat: sum.lat / coords.length
  }
}

function fitBounds() {
  if (!map.value || coordinatePoints.value.length === 0) return
  
  console.log('[SurveyPlanMap] 🎯 Fitting bounds to data...')
  
  // Transform points to WGS84 for bounds calculation
  // CRITICAL: Database columns are SWAPPED from their names!
  // Database column 'y' actually contains Southing (~2247k)
  // Database columns are correctly named: y=Westing (~97k), x=Southing (~2247k)
  const capeLoPoints: CapeLoPoint[] = coordinatePoints.value.map(p => ({
    id: p.name,
    y: p.y,  // Database y (Westing ~97k) → Cape Lo y (Westing)
    x: p.x   // Database x (Southing ~2247k) → Cape Lo x (Southing)
  }))
  
  const wgs84Points = capeLoArrayToWGS84(capeLoPoints, config.value.centralMeridian)
  const boundsData = calculateWGS84Bounds(wgs84Points)
  
  console.log('[SurveyPlanMap] 📍 Bounds:', boundsData)
  console.log('[SurveyPlanMap] 📍 Center:', boundsData.center)
  console.log(`[SurveyPlanMap] 📍 Using Lo zone: ${config.value.centralMeridian}`)
  
  const bounds = new maplibregl.LngLatBounds(
    [boundsData.minLng, boundsData.minLat],
    [boundsData.maxLng, boundsData.maxLat]
  )
  
  map.value.fitBounds(bounds, { 
    padding: 50,
    maxZoom: 17 // Don't zoom in too much
  })
  
  console.log('[SurveyPlanMap] ✅ Map fitted to bounds')
  console.log('[SurveyPlanMap] 📍 Final center:', map.value.getCenter())
  console.log('[SurveyPlanMap] 📍 Final zoom:', map.value.getZoom())
}

function updateScale() {
  // Reload intelligent preview with new scale
  loadIntelligentPreview()
}

function onSheetSizeChange() {
  // Reload intelligent preview with new sheet size
  loadIntelligentPreview()
}


function toggleParcelsVisibility() {
  if (!map.value) return
  
  console.log('[SurveyPlanMap] 🎨 Toggle parcels:', showParcels.value)
  
  // Toggle all parcel layers
  parcels.value.forEach(parcel => {
    const fillLayerId = `parcel-${parcel.id}-fill`
    const outlineLayerId = `parcel-${parcel.id}-outline`
    
    if (map.value!.getLayer(fillLayerId)) {
      map.value!.setLayoutProperty(
        fillLayerId,
        'visibility',
        showParcels.value ? 'visible' : 'none'
      )
    }
    
    if (map.value!.getLayer(outlineLayerId)) {
      map.value!.setLayoutProperty(
        outlineLayerId,
        'visibility',
        showParcels.value ? 'visible' : 'none'
      )
    }
  })
  
  // Toggle parcel centroid markers
  parcelMarkers.value.forEach(marker => {
    const element = marker.getElement()
    if (element) {
      element.style.display = showParcels.value ? 'block' : 'none'
    }
  })
}

function togglePointsVisibility() {
  if (!map.value) return
  
  console.log('[SurveyPlanMap] 📍 Toggle points:', showPoints.value)
  
  // Toggle all point markers
  pointMarkers.value.forEach(marker => {
    const element = marker.getElement()
    if (element) {
      element.style.display = showPoints.value ? 'block' : 'none'
    }
  })
}

function toggleTopologyVisibility() {
  if (!map.value) return
  
  console.log('[SurveyPlanMap] 🔗 Toggle topology:', showTopology.value)
  
  // Toggle all topology markers
  topologyMarkers.value.forEach(marker => {
    const element = marker.getElement()
    if (element) {
      element.style.display = showTopology.value ? 'block' : 'none'
    }
  })
}

function toggleLabelsVisibility() {
  if (!map.value) return
  
  console.log('[SurveyPlanMap] 🏷️ Toggle labels:', showAdaptiveLabels.value)
  
  // Toggle label layer visibility
  if (map.value.getLayer('parcel-labels-layer')) {
    map.value.setLayoutProperty(
      'parcel-labels-layer',
      'visibility',
      showAdaptiveLabels.value ? 'visible' : 'none'
    )
  }
}

function toggleLayoutGuidesVisibility() {
  if (!map.value) return
  
  console.log('[SurveyPlanMap] 📐 Toggle layout guides:', showLayoutGuides.value)
  
  // Toggle all layout guide layers (legacy + geocoded)
  const layoutLayers = [
    // Legacy layers
    'layout-sheet-boundary',
    'layout-margins',
    'layout-title-block',
    'layout-drawing-area',
    'layout-components',
    // ⭐ New geocoded layers
    'geocoded-sheet-boundary',
    'geocoded-drawing-area',
    'geocoded-data-blocks',
    'geocoded-block-labels'
  ]
  
  layoutLayers.forEach(layerId => {
    if (map.value!.getLayer(layerId)) {
      map.value!.setLayoutProperty(
        layerId,
        'visibility',
        showLayoutGuides.value ? 'visible' : 'none'
      )
    }
  })
}


// GeoJSON Export Functions for Vector GeoPDF
function exportParcelsAsGeoJSON(): GeoJSON.FeatureCollection {
  console.log('[SurveyPlanMap] 📦 Exporting parcels as GeoJSON...')
  
  const features: GeoJSON.Feature[] = []
  const outsideFigureParcelId = getOutsideFigureParcel()?.id
  
  // Include ALL parcels (including Outside Figure) - backend will suppress Outside Figure labels
  const parcelsToExport = parcels.value
  
  console.log(`[SurveyPlanMap] 📦 Total parcels: ${parcels.value.length}, Exporting: ${parcelsToExport.length} (including Outside Figure)`)
  
  parcelsToExport.forEach(parcel => {
    // Use the original Cape Lo geometry from database
    if (parcel.geom && parcel.geom.coordinates && parcel.geom.coordinates.length > 0) {
      const coords = parcel.geom.coordinates[0] // First ring (outer boundary)
      
      // USE PRE-CALCULATED EDGE DATA: Prefer area consistency data (single source of truth)
      let edges = []
      
      if (parcel.metadata?.residuals?.edges && Array.isArray(parcel.metadata.residuals.edges)) {
        // Use pre-calculated edges from area consistency data
        edges = parcel.metadata.residuals.edges.map(edge => ({
          distance: edge.distance,
          bearing: edge.bearingDeg || edge.bearing,
          from: edge.from,  // Preserve from coordinate {y, x}
          to: edge.to        // Preserve to coordinate {y, x}
        }))
        console.log(`[SurveyPlanMap] ✅ Using ${edges.length} pre-calculated edges for parcel ${parcel.stand}`)
      } else {
        // Fallback: Calculate edge data if no area consistency data available
        console.log(`[SurveyPlanMap] ⚠️ No area consistency data for parcel ${parcel.stand}, calculating edges`)
        for (let i = 0; i < coords.length - 1; i++) {
          const p1 = coords[i]
          const p2 = coords[i + 1]
          
          // Calculate distance (Pythagorean theorem)
          const dy = p2[0] - p1[0] // Y difference (Westing)
          const dx = p2[1] - p1[1] // X difference (Southing)
          const distance = Math.sqrt(dy * dy + dx * dx)
          
          // Calculate bearing (azimuth from north)
          // Cape Lo: Y=Westing (increases west), X=Southing (increases south)
          // For north-oriented bearing: atan2(-dx, -dy) converts to north-based azimuth
          let bearing = Math.atan2(-dy, -dx) * (180 / Math.PI)
          
          // Normalize to 0-360 range
          if (bearing < 0) bearing += 360
          
          edges.push({
            distance: distance,
            bearing: bearing,
            from: { y: p1[0], x: p1[1] },  // Store actual coordinates
            to: { y: p2[0], x: p2[1] }      // Store actual coordinates
          })
        }
      }
      
      // Mark Outside Figure parcel for label suppression in backend
      const isOutsideFigure = parcel.id === outsideFigureParcelId
      
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: parcel.geom.coordinates // Cape Lo coordinates
        },
        properties: {
          stand: parcel.stand,
          area_m2: parcel.area_m2,
          area_ha: (parcel.area_m2 / 10000).toFixed(4),
          description: parcel.description || '',
          id: parcel.id,
          edges: edges, // Edge data for oriented boundary labels
          isOutsideFigure: isOutsideFigure // Flag for backend to suppress labels
        }
      })
    } else {
      console.warn(`[SurveyPlanMap] ⚠️ Parcel ${parcel.stand} has no geometry`)
    }
  })
  
  console.log(`[SurveyPlanMap] ✅ Exported ${features.length} parcel features`)
  
  return {
    type: 'FeatureCollection',
    features
  }
}

function exportBeaconsAsGeoJSON(): GeoJSON.FeatureCollection {
  console.log('[SurveyPlanMap] 📍 Exporting beacons as GeoJSON...')
  console.log('[SurveyPlanMap] 📊 Input data:', {
    totalPoints: coordinatePoints.value.length,
    parcels: parcels.value.length,
    hasOutsideFigure: !!outsideFigureData.value
  })
  
  // Export all coordinate points — backend filterBeaconsInBoundary handles spatial filtering.
  // The previous parcel-vertex string-match (toFixed(3)) silently dropped all beacons due to
  // floating-point precision mismatches between polygon storage and coordinate_points storage.
  const features: GeoJSON.Feature[] = []
  const seenNames = new Set<string>()
  const duplicates: string[] = []
  
  coordinatePoints.value.forEach(point => {
    // Skip points with null/undefined coordinates (geom not yet repaired in DB)
    if (point.y == null || point.x == null || !Number.isFinite(Number(point.y)) || !Number.isFinite(Number(point.x))) {
      return
    }

    // Check for duplicate beacon names
    if (seenNames.has(point.name)) {
      duplicates.push(point.name)
    }
    seenNames.add(point.name)
    
    // CRITICAL: Database stores as (y, x) but we need to verify the actual values
    // Cape Lo format is [Y=Westing, X=Southing]
    // If Y value is > 1,000,000, the database has them swapped
    const isSwapped = Number(point.y) > 1000000
    const actualY = isSwapped ? Number(point.x) : Number(point.y)
    const actualX = isSwapped ? Number(point.y) : Number(point.x)
    
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [actualY, actualX] // GeoJSON: [longitude, latitude] = [Y, X] in Cape Lo
      },
      properties: {
        name: point.name,
        type: point.type || 'beacon',
        description: point.description || '',
        y: actualY,
        x: actualX
      }
    })
  })
  
  console.log(`[SurveyPlanMap] ✅ Exported ${features.length} land parcel beacon features`)
  console.log(`[SurveyPlanMap] 🎯 Matched ${seenNames.size} unique beacon names to parcel vertices`)
  if (duplicates.length > 0) {
    console.warn(`[SurveyPlanMap] ⚠️ DUPLICATE BEACONS DETECTED:`, duplicates)
  }
  
  return {
    type: 'FeatureCollection',
    features
  }
}

function exportEdgeAnnotationsAsGeoJSON(): GeoJSON.FeatureCollection {
  console.log('[SurveyPlanMap] 📏 Exporting SPLIT LABELING edge annotations...')
  
  const features: GeoJSON.Feature[] = []
  const outsideFigureParcelId = getOutsideFigureParcel()?.id
  
  // SPLIT LABELING: Track which labels have been placed for each edge
  // Map key: edge key, Value: { distance: boolean, bearing: boolean }
  const labeledEdges = new Map<string, { distance: boolean; bearing: boolean }>()
  
  // Helper: Create unique edge key (order-independent)
  const createEdgeKey = (p1: number[], p2: number[]): string => {
    const [y1, x1] = p1
    const [y2, x2] = p2
    const key1 = `${y1.toFixed(6)},${x1.toFixed(6)}`
    const key2 = `${y2.toFixed(6)},${x2.toFixed(6)}`
    return key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`
  }
  
  // Helper: Calculate parcel centroid
  const calculateCentroid = (coords: number[][]): { y: number; x: number } => {
    let sumY = 0, sumX = 0
    const count = coords.length - 1 // Exclude closing point
    for (let i = 0; i < count; i++) {
      sumY += coords[i][0]
      sumX += coords[i][1]
    }
    return { y: sumY / count, x: sumX / count }
  }
  
  // Helper: Calculate perpendicular offset for inside placement
  const calculateInsideOffset = (start: number[], end: number[], centroid: { y: number; x: number }, offsetDist: number): { dy: number; dx: number } => {
    // Edge vector
    const edgeY = end[0] - start[0]
    const edgeX = end[1] - start[1]
    const edgeLen = Math.sqrt(edgeY * edgeY + edgeX * edgeX)
    
    // Perpendicular vector (rotate 90° left)
    const perpY = -edgeX / edgeLen
    const perpX = edgeY / edgeLen
    
    // Midpoint of edge
    const midY = (start[0] + end[0]) / 2
    const midX = (start[1] + end[1]) / 2
    
    // Vector from midpoint to centroid
    const toCentroidY = centroid.y - midY
    const toCentroidX = centroid.x - midX
    
    // Determine which side of edge the centroid is on
    const dotProduct = perpY * toCentroidY + perpX * toCentroidX
    const direction = dotProduct > 0 ? 1 : -1
    
    return {
      dy: perpY * direction * offsetDist,
      dx: perpX * direction * offsetDist
    }
  }
  
  parcels.value.forEach(parcel => {
    if (parcel.id === outsideFigureParcelId) return // Skip Outside Figure
    if (!parcel.geom || !parcel.geom.coordinates || !parcel.geom.coordinates[0]) return
    
    const coords = parcel.geom.coordinates[0]
    const centroid = calculateCentroid(coords)
    
    // Create line annotations for each edge
    for (let i = 0; i < coords.length - 1; i++) {
      const start = coords[i]
      const end = coords[i + 1]
      
      // SPLIT LABELING: Check if this edge has been labeled before
      const edgeKey = createEdgeKey(start, end)
      const edgeInfo = labeledEdges.get(edgeKey)
      const isCommonBoundary = edgeInfo !== undefined
      
      // Determine what to label based on split labeling logic
      let shouldLabelDistance = true
      let shouldLabelBearing = true
      
      if (isCommonBoundary) {
        // Common boundary detected - implement split labeling
        if (edgeInfo.distance && edgeInfo.bearing) {
          // Both already labeled - skip this edge entirely
          console.log(`[Split Label] ${parcel.stand} edge ${i + 1}: Both labels present, skipping`)
          continue
        } else if (edgeInfo.distance && !edgeInfo.bearing) {
          // Distance already labeled, only label bearing
          shouldLabelDistance = false
          shouldLabelBearing = true
          console.log(`[Split Label] ${parcel.stand} edge ${i + 1}: Bearing only (distance already placed)`)
        } else if (!edgeInfo.distance && edgeInfo.bearing) {
          // Bearing already labeled, only label distance (rare case)
          shouldLabelDistance = true
          shouldLabelBearing = false
          console.log(`[Split Label] ${parcel.stand} edge ${i + 1}: Distance only (bearing already placed)`)
        }
      } else {
        // First parcel to encounter this edge - label distance only
        shouldLabelDistance = true
        shouldLabelBearing = false
        console.log(`[Split Label] ${parcel.stand} edge ${i + 1}: First encounter - distance only`)
        
        // Track this edge
        labeledEdges.set(edgeKey, { distance: false, bearing: false })
      }
      
      // Calculate midpoint for label placement
      const midY = (start[0] + end[0]) / 2
      const midX = (start[1] + end[1]) / 2
      
      // Calculate bearing and distance using SI 727 standards
      // GeoJSON coords: [0] = Southing (Cape Lo X), [1] = Westing (Cape Lo Y)
      const dY = end[1] - start[1]  // Westing difference (Cape Lo Y)
      const dX = end[0] - start[0]  // Southing difference (Cape Lo X)
      const rawDistance = Math.sqrt(dY * dY + dX * dX)
      
      // Apply banker's rounding to distance (2 decimal places)
      const multiplier = 100
      const shifted = rawDistance * multiplier
      const floor = Math.floor(shifted)
      const decimal = shifted - floor
      let distance
      if (decimal === 0.5) {
        distance = (floor % 2 === 0 ? floor : floor + 1) / multiplier
      } else {
        distance = Math.round(shifted) / multiplier
      }
      
      // Bearing calculation (south-oriented)
      let bearingDeg = Math.atan2(dY, dX) * (180 / Math.PI)
      if (bearingDeg < 0) bearingDeg += 360
      
      // Format bearing with SI 727 rounding rules
      const degrees = Math.floor(bearingDeg)
      const minutesDecimal = (bearingDeg - degrees) * 60
      const minutes = Math.floor(minutesDecimal)
      const secondsDecimal = (minutesDecimal - minutes) * 60
      
      let seconds
      if (distance < 6000) {
        seconds = Math.round(secondsDecimal / 10) * 10
      } else {
        seconds = Math.round(secondsDecimal)
      }
      
      // Handle carry-over
      let finalDegrees = degrees
      let finalMinutes = minutes
      let finalSeconds = seconds
      
      if (finalSeconds >= 60) {
        finalSeconds = 0
        finalMinutes++
      }
      if (finalMinutes >= 60) {
        finalMinutes = 0
        finalDegrees++
      }
      if (finalDegrees >= 360) {
        finalDegrees = finalDegrees % 360
      }
      
      const bearingDMS = `${finalDegrees}°${finalMinutes.toString().padStart(2, '0')}'${finalSeconds.toString().padStart(2, '0')}"`
      
      // Calculate offset for direction label (inside parcel)
      // Offset distance in map units (adjust based on scale)
      const insideOffset = calculateInsideOffset(start, end, centroid, 2.5)
      
      // SPLIT LABELING: Only include the labels that should be rendered
      const annotationProperties: any = {
        parcel: parcel.stand,
        edge: i + 1,
        midY: midY,
        midX: midX,
        directionOffsetY: insideOffset.dy,
        directionOffsetX: insideOffset.dx,
        type: 'edge_annotation'
      }
      
      // Add distance if it should be labeled
      if (shouldLabelDistance) {
        annotationProperties.distance = distance
      }
      
      // Add bearing if it should be labeled
      if (shouldLabelBearing) {
        annotationProperties.bearing = bearingDMS
        annotationProperties.bearingDeg = bearingDeg
      }
      
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [start, end]
        },
        properties: annotationProperties
      })
      
      // Update tracking: mark which labels were placed
      const currentEdgeInfo = labeledEdges.get(edgeKey)
      if (currentEdgeInfo) {
        if (shouldLabelDistance) currentEdgeInfo.distance = true
        if (shouldLabelBearing) currentEdgeInfo.bearing = true
      } else {
        labeledEdges.set(edgeKey, {
          distance: shouldLabelDistance,
          bearing: shouldLabelBearing
        })
      }
    }
  })
  
  console.log(`[SurveyPlanMap] ✅ Exported ${features.length} SPLIT LABELED edge annotations`)
  console.log(`[SurveyPlanMap] 📊 Split labeling summary: ${labeledEdges.size} unique edges processed`)
  
  return {
    type: 'FeatureCollection',
    features
  }
}

// Generate beacon labels for PDF export
function generateBeaconLabelsForPDF() {
  console.log('[SurveyPlanMap] 🏷️ Generating beacon labels for PDF export...')
  console.log('[SurveyPlanMap] 📊 Data check:', {
    parcels: parcels.value.length,
    coordinatePoints: coordinatePoints.value.length
  })
  
  // CRITICAL: Validate data exists
  if (!coordinatePoints.value || coordinatePoints.value.length === 0) {
    console.error('[SurveyPlanMap] ❌ No coordinate points available for beacon label generation!')
    return []
  }
  
  if (!parcels.value || parcels.value.length === 0) {
    console.error('[SurveyPlanMap] ❌ No parcels available for beacon label generation!')
    return []
  }
  
  // Get Outside Figure parcel ID
  const outsideFigureParcel = parcels.value.find(p => 
    p.stand?.toLowerCase().includes('outside figure')
  )
  const outsideFigureId = outsideFigureParcel?.id
  
  // Helper: Find beacon name by coordinates
  const findBeaconName = (y: number, x: number): string | null => {
    const tolerance = 1.0 // meters
    const [targetY, targetX] = normalizeCapeLoYX(y, x)
    
    for (const cp of coordinatePoints.value) {
      const [cpY, cpX] = normalizeCapeLoYX(cp.y, cp.x)
      const dist = Math.sqrt(Math.pow(cpY - targetY, 2) + Math.pow(cpX - targetX, 2))
      if (dist < tolerance) {
        return cp.name
      }
    }
    return null
  }
  
  // Build beacon map from parcels
  const beaconMap = new Map<string, {
    name: string
    coordinates: [number, number]
    parcels: Set<number>
  }>()
  
  parcels.value.forEach(parcel => {
    if (parcel.id === outsideFigureId) return // Skip Outside Figure
    if (!parcel.geom) return
    
    const coords = parcel.geom.coordinates[0]
    if (!coords || coords.length < 3) return
    
    // Process each vertex
    coords.slice(0, -1).forEach(coord => {
      const [y, x] = normalizeCapeLoYX(coord[0], coord[1])
      
      // Find beacon name
      const beaconName = findBeaconName(y, x)
      if (!beaconName) return
      
      // Transform to WGS84 (single point - use direct call to avoid log spam)
      const wgs84 = capeLoToWGS84({ id: beaconName, y, x } as CapeLoPoint, config.value.centralMeridian)
      const lng = wgs84.lng
      const lat = wgs84.lat
      
      // Track which parcels this beacon belongs to
      if (!beaconMap.has(beaconName)) {
        beaconMap.set(beaconName, {
          name: beaconName,
          coordinates: [lng, lat],
          parcels: new Set()
        })
      }
      beaconMap.get(beaconName)!.parcels.add(parcel.id)
    })
  })
  
  console.log(`[SurveyPlanMap] 🔍 Processing ${beaconMap.size} beacons with refined labeling logic...`)
  
  const beaconLabels: Array<{
    text: string
    coordinates: [number, number]
    parcelId: number | null
    type: 'beacon'
    beaconName: string
    isInsideParcel: boolean
    displayInParcel: number | null
    labelType: 'suffix' | 'full' | 'suppressed'
  }> = []
  
  beaconMap.forEach(beacon => {
    // Extract numeric prefix from beacon name
    const prefixMatch = beacon.name.match(/^(\d+)([a-z]+)$/i)
    
    // Control/reference beacons - always show full name
    if (!prefixMatch) {
      beaconLabels.push({
        text: beacon.name,
        coordinates: beacon.coordinates,
        parcelId: null,
        type: 'beacon',
        beaconName: beacon.name,
        isInsideParcel: false,
        displayInParcel: null,
        labelType: 'full'
      })
      return
    }
    
    const beaconPrefix = prefixMatch[1]
    const beaconSuffix = prefixMatch[2].toUpperCase()
    
    // Find parcel(s) that match the beacon prefix
    const matchingParcelIds = Array.from(beacon.parcels).filter(parcelId => {
      const parcel = parcels.value.find(p => p.id === parcelId)
      return parcel?.stand?.toString() === beaconPrefix
    })
    
    if (matchingParcelIds.length > 0) {
      // Prefix matches - show suffix inside matching parcel
      const displayParcelId = matchingParcelIds[0]
      beaconLabels.push({
        text: beaconSuffix,
        coordinates: beacon.coordinates,
        parcelId: displayParcelId,
        type: 'beacon',
        beaconName: beacon.name,
        isInsideParcel: true,
        displayInParcel: displayParcelId,
        labelType: 'suffix'
      })
    } else {
      // Non-matching - show full name outside parcel
      beaconLabels.push({
        text: beacon.name,
        coordinates: beacon.coordinates,
        parcelId: null,
        type: 'beacon',
        beaconName: beacon.name,
        isInsideParcel: false,
        displayInParcel: null,
        labelType: 'full'
      })
    }
  })
  
  console.log(`[SurveyPlanMap] ✅ Generated ${beaconLabels.length} beacon labels for PDF`)
  return beaconLabels
}

// ---- Plan-type-driven generation orchestrator (Task 7) ----

function gatherPlanContext(): PlanPayloadContext {
  const parcelsGeoJSON = exportParcelsAsGeoJSON()
  const beaconsGeoJSON = exportBeaconsAsGeoJSON()

  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity
  parcelsGeoJSON.features.forEach((feature: any) => {
    if (feature.geometry.type === 'Polygon') {
      feature.geometry.coordinates[0].forEach((coord: number[]) => {
        minY = Math.min(minY, coord[0]); maxY = Math.max(maxY, coord[0])
        minX = Math.min(minX, coord[1]); maxX = Math.max(maxX, coord[1])
      })
    }
  })
  beaconsGeoJSON.features.forEach((feature: any) => {
    if (feature.geometry.type === 'Point') {
      minY = Math.min(minY, feature.geometry.coordinates[0]); maxY = Math.max(maxY, feature.geometry.coordinates[0])
      minX = Math.min(minX, feature.geometry.coordinates[1]); maxX = Math.max(maxX, feature.geometry.coordinates[1])
    }
  })
  const extent = { minY, maxY, minX, maxX }

  const metadata = {
    title: `${getPlanTypeMeta(config.value.planType).label} - ${props.projectInfo.designation || 'Survey Plan'}`,
    planType: config.value.planType,
    surveyor: config.value.surveyorName,
    date: config.value.surveyDate,
    designation: props.projectInfo.designation,
    surveyOf: props.projectInfo.surveyOf || '',
    district: props.projectInfo.district,
    township: props.projectInfo.township,
    firm: config.value.firm,
    licenseNumber: config.value.licenseNumber,
    parentProperty: props.projectInfo.parentProperty || '',
    wholePortion: props.projectInfo.wholePortion || 'the whole',
    priorDiagrams: props.projectInfo.priorDiagrams || [],
    ...diagramReferenceMetadata(props.projectInfo as any),
    sideAnnotations: currentSideAnnotations.value,
    // General plans render road/servitude/contiguous annotations for EVERY tagged
    // subject (the Outside Figure perimeter and/or individual stands), so send the
    // whole per-subject set, each entry carrying its own Cape Lo ring (no backend
    // id-matching needed). Empty for the diagram, which renders its single subject
    // from `sideAnnotations` via its own renderer.
    adjoiningSubjects: isDiagramMode.value ? [] : buildAdjoiningSubjects(),
  }

  let beaconLabels = generateBeaconLabelsForPDF()
  if (beaconLabels.length === 0 && validatedLabels.value.beacons.length > 0) {
    beaconLabels = validatedLabels.value.beacons.map((label: any) => ({
      text: label.text, coordinates: label.coordinates, parcelId: label.parcelId,
      type: 'beacon' as const, beaconName: label.beaconName, isInsideParcel: label.isInsideParcel,
      displayInParcel: label.displayInParcel ?? null,
      labelType: label.labelType ?? (label.isInsideParcel ? 'suffix' : 'full'),
    }))
  }

  const epsgCode = `EPSG:${22260 + parseInt(config.value.centralMeridian || '31')}`
  // Diagram: use the surveyor's explicit scale if chosen, otherwise leave it
  // undefined so the diagram renderer auto-picks an SI 727 scale responsive to
  // the subject parcel (not the whole-site intelligentPreview scale).
  const resolvedScale = config.value.planType === 'diagram'
    ? (config.value.scale && config.value.scale !== 'auto' ? config.value.scale : undefined)
    : (intelligentPreview.value?.scale?.label || undefined)
  const resolvedSheetSize = config.value.planType === 'diagram'
    ? (config.value.sheetSize === 'A3' ? 'A3' : 'A4')
    : (intelligentPreview.value?.sheetSize || undefined)
  const _sheet = intelligentPreview.value?.layout?.sheet
  const orientation: 'landscape' | 'portrait' =
    _sheet ? (_sheet.width > _sheet.height ? 'landscape' : 'portrait') : 'landscape'

  return {
    planType: config.value.planType as any,
    subjectParcelId: selectedDiagramParcelId.value,
    parcels: parcelsGeoJSON,
    beacons: beaconsGeoJSON,
    beaconLabels,
    projection: epsgCode,
    projectId: props.projectId,
    metadata,
    extent,
    scale: resolvedScale,
    sheetSize: resolvedSheetSize,
    orientation,
    outsideFigureData: outsideFigureData.value,
    beaconGroups: props.projectInfo.beaconGroups || [],
    annotations: { type: 'FeatureCollection', features: [] },
    renderEngine: 'pdfkit',
  }
}

async function generatePlanDocuments() {
  const meta = getPlanTypeMeta(config.value.planType)
  const v = validateGenerateRequest(meta, selectedDiagramParcelId.value, parcels.value.length, exportFormats)
  if (!v.ok) { alert(v.error); return }

  // General Plans are built around the Outside Figure (the remainder-of-parent
  // figure). Diagram and Working Plan legitimately don't need one. Fail fast
  // with a clear message for the general-plan types, mirroring the old export.
  const requiresOutsideFigure =
    config.value.planType === 'general-undeveloped' ||
    config.value.planType === 'general-developed'
  if (requiresOutsideFigure && !outsideFigureData.value) {
    alert('Outside Figure data required. Designate a parcel as "Outside Figure" and run Compute Area & Consistency before generating a General Plan.')
    return
  }

  isExporting.value = true
  try {
    await loadData()
    const ctx = gatherPlanContext()
    const payload = buildPlanPayload(ctx)
    const docs: PlanDocumentSet = {}
    let usedScale: string | undefined

    if (exportFormats.pdf) {
      let result = await generateVectorGeoPDF(payload)
      if (result.suggestedScale) {
        result = await generateVectorGeoPDF({ ...payload, scale: result.suggestedScale })
      }
      docs.pdf = result.blob
      usedScale = result.usedScale || undefined
      if (result.usedScale) pdfFinalScale.value = result.usedScale

      if (result.tileGrid) {
        const tg = result.tileGrid
        alert(
          `SI 727 Reg 32(3) — Multi-sheet plan.\n\n` +
          `${tg.totalSheets} sheets (${tg.cols}×${tg.rows}) at ${tg.scaleLabel} on ${tg.sheetSize}.\n` +
          `Sheet 0: Key Plan; Sheets 1–${tg.totalSheets}: tiles with 5% overlap.`
        )
      }

      if (meta.includesSummary) {
        try {
          docs.summary = generatePlanStatisticsPDF({
            projectInfo: {
              designation: props.projectInfo.designation || '',
              surveyOf: props.projectInfo.surveyOf || '',
              district: props.projectInfo.district,
              township: props.projectInfo.township,
              surveyDate: props.projectInfo.surveyDate || new Date().toISOString(),
              surveyorName: props.projectInfo.surveyorName || config.value.surveyorName,
              licenseNumber: props.projectInfo.licenseNumber || config.value.licenseNumber,
              firm: props.projectInfo.firm,
            },
            parcels: parcels.value.map((p: any) => ({
              id: p.id, stand: p.stand, area_m2: p.area_m2 || 0, description: p.description,
            })),
            outsideFigureData: outsideFigureData.value || undefined,
            beaconGroups: formatBeaconDescriptionGroups(coordinatePoints.value),
            scale: usedScale || intelligentPreview.value?.scale?.label || config.value.scale || '1:1000',
            sheetSize: result.usedSheetSize || intelligentPreview.value?.sheetSize || 'ISO_A0',
            orientation: 'landscape',
            centralMeridian: parseInt(config.value.centralMeridian || '31'),
            generatedAt: new Date(),
          })
        } catch (summaryErr: any) {
          console.warn('[PlanDocs] Summary PDF failed (plan still generated):', summaryErr?.message)
        }
      }
    }

    if (exportFormats.dxf) {
      const dxfPayload = { ...payload, scale: usedScale || payload.scale, sheetSize: payload.sheetSize || 'ISO_A2' }
      const { blob, warningCount, warningsSummary } = await generateDXF(dxfPayload)
      docs.dxf = blob
      if (warningCount > 0 && warningsSummary) {
        const parts: string[] = []
        if (warningsSummary.beacons) parts.push(`${warningsSummary.beacons} beacon(s) skipped`)
        if (warningsSummary.parcels) parts.push(`${warningsSummary.parcels} parcel(s) skipped`)
        if (warningsSummary.beaconDescTruncated) parts.push(`${warningsSummary.beaconDescTruncated} beacon description(s) truncated`)
        if (warningsSummary.priorDiagramsTruncated) parts.push(`${warningsSummary.priorDiagramsTruncated} prior diagram(s) truncated`)
        if (warningsSummary.scaleFallback) parts.push('scale fell back to 1:500')
        if (parts.length) console.warn('[PlanDocs] DXF warnings:', parts.join(', '))
      }
    }

    // A diagram is for ONE subject parcel — name the file after that parcel
    // (e.g. "STAND 404 …"), not the whole-project designation, so each parcel's
    // diagram is a distinct file. Whole-set plans keep the project designation.
    const subjectParcel = parcels.value.find((x: any) => String(x.id) === String(selectedDiagramParcelId.value))
    const planDesignation = isDiagramMode.value
      ? resolveSubjectDesignation(subjectParcel?.designation, subjectParcel?.stand, props.projectInfo.designation)
      : props.projectInfo.designation
    const baseName = composePlanBaseName(config.value.planType, planDesignation, props.projectId)
    const workingDirectory = (props.projectInfo as any).workingDirectory
    if (!workingDirectory) {
      alert('Set the project working directory (Project Setup) before generating plans.')
      return
    }
    const subdir = planTypeOutputSubdir(config.value.planType)
    let overwriteAll = false
    const confirmOverwrite = async (name: string): Promise<boolean> => {
      if (overwriteAll) return true
      const ok = window.confirm(`"${name}" already exists in output/${subdir}. Overwrite it (and any other existing files in this plan)?`)
      if (ok) overwriteAll = true
      return ok
    }
    const saved: string[] = []
    const skipped: string[] = []
    for (const kind of ['pdf', 'dxf', 'summary'] as const) {
      const blob = (docs as PlanDocumentSet)[kind]
      if (!(blob instanceof Blob)) continue
      const ext = kind === 'dxf' ? 'dxf' : 'pdf'
      const suffix = kind === 'summary' ? '-summary' : ''
      const fileName = `${baseName}${suffix}.${ext}`
      const res = await saveWithOverwritePrompt({ workingDirectory, subdir, fileName, blob }, confirmOverwrite)
      if (res.success) saved.push(fileName)
      else if (res.skipped) skipped.push(fileName)
      else throw new Error(res.error || `Failed to save ${fileName}`)
    }
    const summaryMsg = `Saved to output/${subdir}/:\n${saved.join('\n') || '(none)'}` +
      (skipped.length ? `\n\nKept existing (not overwritten):\n${skipped.join('\n')}` : '')
    alert(summaryMsg)
    emit('export-complete', { format: config.value.planType, filename: saved[0] || '' })
  } catch (error: any) {
    console.error('[PlanDocs] Generation failed:', error)
    alert(`Generation failed: ${error.message}`)
  } finally {
    isExporting.value = false
  }
}

/**
 * Generate Complete Survey Record (Comprehensive_Latest PDF)
 * Includes: Field Book, Coordinate List, Calculations Part 1, and Area & Consistency
 */
async function generateComprehensivePDF() {
  console.log('[ComprehensivePDF] 📚 Starting Complete Survey Record generation...')
  isExporting.value = true
  
  try {
    // Load workflow state to get ALL survey points
    console.log('[ComprehensivePDF] 📥 Loading workflow state from API...')
    const workflowResponse = await api.get(`/survey-projects/${props.projectId}/workflow`)
    const workflowState = workflowResponse.data.workflow_state

    // Extract data from workflow
    const adjustedCoords = workflowState?.step_data?.['calculations-part1']?.adjusted_coordinates || []
    const observations = workflowState?.step_data?.['field-book']?.observations || []
    const duplicateAnalyses = workflowState?.step_data?.['calculations-part1']?.duplicate_analyses || []
    
    console.log('[ComprehensivePDF] 📊 Workflow state loaded:', {
      adjustedCoordinates: adjustedCoords.length,
      observations: observations.length,
      duplicateAnalyses: duplicateAnalyses.length
    })
    
    if (adjustedCoords.length === 0) {
      throw new Error('No adjusted coordinates found in workflow state. Please complete Calculations Part 1 first.')
    }
    
    // Load ALL parcels from database
    console.log('[ComprehensivePDF] 📥 Loading all parcels from database...')
    const dbParcels = await listLandParcels(props.projectId)
    console.log(`[ComprehensivePDF] 📊 Loaded ${dbParcels.length} parcels from database`)
    
    // Load coordinate points for spatial matching
    console.log('[ComprehensivePDF] 📍 Loading coordinate points for spatial matching...')
    const coordinatePointsForMatching = await getCoordinatePointsForProject(props.projectId)
    console.log(`[ComprehensivePDF] 📍 Loaded ${coordinatePointsForMatching.length} coordinate points`)
    
    // Convert workflow adjusted coordinates to SurveyPoint format
    const surveyPoints: SurveyPoint[] = adjustedCoords.map((coord: any) => ({
      pointId: coord.id || coord.point_id || coord.pointId || coord.name || coord.label,
      y: parseFloat(coord.y),
      x: parseFloat(coord.x),
      status: coord.status || 'P',
      description: coord.description || coord.desc || '',
      surveyDate: coord.surveyDate || workflowState?.surveyorInfo?.surveyDate || config.value.surveyDate || new Date().toISOString().split('T')[0]
    }))
    
    console.log(`[ComprehensivePDF] 📊 Converted ${surveyPoints.length} survey points for PDF generation`)
    
    // Prepare cover page info
    const latestStepWithSurveyorInfo = Object.values(workflowState?.step_data || {})
      .reverse()
      .find((stepData: any) => stepData?.surveyor_info)
    
    const workflowSurveyorInfo = latestStepWithSurveyorInfo?.surveyor_info
    const projectSetupData = workflowState?.step_data?.['project-setup']
    const controlPointSelectionData = workflowState?.step_data?.['control-point-selection']
    
    const projectName = props.projectInfo.designation || workflowSurveyorInfo?.surveyOf || projectSetupData?.project_name || 'Survey Project'
    const surveyorName = workflowSurveyorInfo?.landSurveyor || config.value.surveyorName || props.projectInfo.surveyorName || 'Licensed Surveyor'
    const licenseNumber = workflowSurveyorInfo?.licenseNumber || config.value.licenseNumber || props.projectInfo.licenseNumber || ''
    const surveyDate = workflowSurveyorInfo?.surveyDate || config.value.surveyDate || new Date().toISOString().split('T')[0]
    const district = props.projectInfo.district || projectSetupData?.district || 'Unknown District'

    // Existence check for enclosed documents (ticks + optional warning).
    const recordWorkingDirectory = (props.projectInfo as any).workingDirectory
    const { documents: lodgementDocs, missing: missingDocs } =
      await checkLodgementDocuments(recordWorkingDirectory)
    if (recordWorkingDirectory && missingDocs.length) {
      const proceed = window.confirm(
        `⚠ ${missingDocs.length} document(s) not found in the output folder:\n` +
        missingDocs.map((m) => `  • ${m}`).join('\n') +
        `\n\nGenerate anyway?`
      )
      if (!proceed) {
        console.log('[ComprehensivePDF] Generation cancelled by user (missing documents)')
        return
      }
    }

    // Stand names for the subject line (exclude the Outside Figure parcel).
    const recordStandNames = (dbParcels as any[])
      .map((p) => String(p.stand ?? p.designation ?? '').trim())
      .filter((s) => s && !s.toLowerCase().includes('outside figure'))

    const coverPageInfo: CoverPageInfo = {
      firmName: 'C PARADZAYI LAND SURVEYORS',
      firmSubtitle: 'Cadastral, Engineering, Topographic & Mining Surveyors',
      phone: '+263 774 003 137',
      email: 'cparadzayi@gmail.com',
      website: 'www.mataranyika.com',
      address: '6322 Hwari Matongo Street, Southview, Gweru, Zimbabwe',
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      projectTitle: projectName,
      surveyorName: surveyorName,
      licenseNumber: licenseNumber,
      surveyDate: surveyDate,
      district: district,
      surveyType:
        buildPlanDesignation(recordStandNames, (props.projectInfo as any).surveyOf || workflowSurveyorInfo?.surveyOf || '')
        || props.projectInfo.surveyType
        || `SURVEY OF ${projectName.toUpperCase()}`,
      documents: lodgementDocs,
      pointsAnalyzed: surveyPoints.length
    }
    
    const surveyorInfo = {
      name: surveyorName,
      licenseNumber: licenseNumber,
      firm: workflowSurveyorInfo?.firm || coverPageInfo.firmName,
      address: workflowSurveyorInfo?.address || coverPageInfo.address || '',
      surveyDate: surveyDate,
      projectTitle: projectName,
      district: district,
      centralMeridian: (props.projectInfo as any).centralMeridian ?? projectSetupData?.central_meridian ?? 31
    }
    
    // Process ALL parcels with on-the-fly metadata computation
    console.log('[ComprehensivePDF] 🔄 Processing parcels with on-the-fly metadata computation...')
    
    const computedParcels = await Promise.all(dbParcels.map(async (dbParcel: any) => {
      const capeLoPoints = await computeCapeLoPointsFromGeometry(dbParcel, coordinatePointsForMatching)
      
      let updatedAreaResult = null
      if (capeLoPoints.length > 0) {
        try {
          const { areaCompute } = await import('../../../services/compute')
          const response = await areaCompute({
            points: capeLoPoints.map(pt => ({ y: pt.y, x: pt.x, id: pt.id, name: pt.id })),
            includeResiduals: true,
            roundMetersDecimals: 2,
            roundHectaresDecimals: 4
          })
          updatedAreaResult = response
        } catch (error) {
          console.error(`[ComprehensivePDF] ❌ Failed to recompute ${dbParcel.stand}:`, error)
        }
      }
      
      const finalAreaResult = updatedAreaResult || {
        area: {
          abs_m2: Number(dbParcel.area_m2) || 0,
          display: (Number(dbParcel.area_m2) || 0) >= 10000 
            ? { hectares: (Number(dbParcel.area_m2) || 0) / 10000, unit: 'ha' as const }
            : { square_meters: Number(dbParcel.area_m2) || 0, unit: 'm2' as const }
        },
        residuals: dbParcel.metadata?.residuals || { edges: [] },
        closure: dbParcel.metadata?.closure
      }
      
      return {
        designation: dbParcel.stand,
        areaResult: finalAreaResult,
        points: capeLoPoints.map(pt => ({ id: pt.id, name: pt.id, y: pt.y, x: pt.x }))
      }
    }))
    
    console.log(`[ComprehensivePDF] ✅ Processed ${computedParcels.length} parcels`)
    
    // Prepare adjusted coordinates
    const adjustedCoordinates = adjustedCoords.map((coord: any) => ({
      pointId: coord.id || coord.point_id || coord.pointId || coord.name || coord.label,
      y: parseFloat(coord.y),
      x: parseFloat(coord.x),
      status: coord.status || 'P',
      description: coord.description || coord.desc || '',
      surveyDate: coord.surveyDate || surveyDate,
      fieldBookPage: coord.fieldBookPage || coord.fb_reference || '',
      calculationsPage: coord.calculationsPage || coord.calcs_reference || 0,
      adjustment: coord.adjustment || {
        isDuplicate: false,
        observationCount: 1,
        method: 'gps' as const
      }
    }))
    
    // Fetch control points if project has them
    let controlPoints: any[] = []
    const centralMeridian = (props.projectInfo as any).centralMeridian ?? controlPointSelectionData?.central_meridian ?? projectSetupData?.central_meridian ?? 31
    const controlPointIds = controlPointSelectionData?.control_point_ids || projectSetupData?.control_point_ids || []
    
    if (controlPointIds.length > 0) {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3050/api'
        const response = await fetch(`${API_BASE}/control-points?gauss_lo=${centralMeridian}&limit=5000`)
        const data = await response.json()
        
        if (data.data && Array.isArray(data.data)) {
          controlPoints = data.data.filter((cp: any) => controlPointIds.includes(cp.id))
          console.log(`[ComprehensivePDF] ✅ Found ${controlPoints.length} control points`)
        }
      } catch (error) {
        console.error('[ComprehensivePDF] ❌ Failed to fetch control points:', error)
      }
    }
    
    // Generate Field Book, Coordinate List, and Calculations Part 1 using TWO-PASS
    console.log('[ComprehensivePDF] 🎯 Generating Field Book, Coordinate List, and Calculations Part 1...')
    const generator = new ComprehensiveDocumentGenerator()

    // Rebuilt from the persisted workflow state (step_data['report-on-survey']).
    const reportData = buildReportDataFromWorkflow(workflowState)
    const reportOptions = {
      surveyorName: surveyorInfo.name || '',
      licenseNumber: surveyorInfo.licenseNumber || '',
      surveyDate: surveyorInfo.surveyDate || '',
      surveyOf: surveyorInfo.projectTitle || projectName || '',
    }
    const narrativeOptions = {
      ...reportOptions,
      firm: surveyorInfo.firm || '',
      address: surveyorInfo.address || '',
      district: surveyorInfo.district || '',
      assistant: 'N/A',
    }

    const result = await generator.generateWithTwoPass({
      projectInfo: coverPageInfo,
      surveyorInfo: surveyorInfo,
      fieldBookObservations: observations,
      surveyPoints: surveyPoints,
      adjustedCoordinates: adjustedCoordinates,
      projectControlPoints: controlPoints,
      duplicateAnalyses: duplicateAnalyses,
      parcels: computedParcels.map(p => ({
        id: p.designation,
        name: p.designation,
        coordinates: p.points.map(pt => ({ x: pt.x, y: pt.y })),
        area: (p.areaResult?.area?.display as any)?.hectares || (p.areaResult?.area?.abs_m2 ? p.areaResult.area.abs_m2 / 10000 : 0)
      })),
      beaconLabels: intelligentPreview.value?.beaconLabels || [],
      reportData,
      reportOptions
    })
    
    console.log('[ComprehensivePDF] ✅ Field Book + Coordinate List + Calculations Part 1 generated')
    
    const lastDisplayedPageNumber = result.measurements 
      ? result.measurements.calculations.endPage 
      : result.actualCalcLastPage || 132
    
    // Add Area & Consistency section
    console.log('[ComprehensivePDF] 📋 Adding Area & Consistency section...')
    const { generateComprehensiveLatestPDF: generateComprehensivePDFComposable } = useComprehensivePDF()
    
    const workingDirectory = (props.projectInfo as any).workingDirectory
    
    const finalResult = await generateComprehensivePDFComposable({
      computedParcels: computedParcels as any,
      calcPart1Blob: result.pdf,
      projectName: projectName,
      projectId: props.projectId,  // Added for coordinate point fetching
      lastDisplayedPageNumber: lastDisplayedPageNumber,
      beaconLabels: intelligentPreview.value?.beaconLabels || [],
      workingDirectory: workingDirectory,
      onNewParcels: async (newParcels) => {
        console.log('[ComprehensivePDF] 📝 Marking parcels as included in PDF...')
        for (const parcel of newParcels) {
          const dbParcel = dbParcels.find((p: any) => p.stand === parcel.designation)
          if (dbParcel) {
            await updateLandParcel(dbParcel.id, {
              metadata: {
                ...dbParcel.metadata,
                included_in_pdf: true,
                pdf_generated_at: new Date().toISOString()
              }
            })
          }
        }
      },
      reportData,
      narrativeOptions
    })

    if (!finalResult.success) {
      throw new Error(finalResult.error || 'PDF generation failed')
    }
    
    // Show success message
    if (finalResult.filePath) {
      console.log('[ComprehensivePDF] ✅ Comprehensive_Latest.pdf saved to:', finalResult.filePath)
      const contentsLines = [
        `• Cover Letter (professional letterhead)`,
        `• CALCULATIONS PART 1 Title Page`,
        `• Electronic Field Book (${surveyPoints.length} points)`,
        `• Coordinate List`,
      ]
      if (result.sections?.beaconComparison) {
        contentsLines.push(`• Beacon Comparison Report`)
      }
      contentsLines.push(
        `• Calculations (duplicate analysis)`,
        `• Area & Consistency (${computedParcels.length} parcels)`,
      )
      if (finalResult.narrativeBlob) {
        contentsLines.push(`• Report of Survey`)
      }
      alert(
        `✅ Complete Survey Record Generated!\n\n` +
        `Document: Comprehensive_Latest.pdf\n` +
        `Location: ${finalResult.filePath}\n\n` +
        `This document contains:\n` +
        `${contentsLines.join('\n')}\n\n` +
        `The document provides a complete survey record.`
      )
    } else if (finalResult.pdfBlob) {
      console.log('[ComprehensivePDF] 📥 Downloading PDF...')
      const url = URL.createObjectURL(finalResult.pdfBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Comprehensive_Latest.pdf'
      a.click()
      URL.revokeObjectURL(url)
    }

    // Save each section of the record as its own file for independent retrieval.
    if (workingDirectory && result.sections && finalResult.areasOnlyBlob) {
      const split = await saveSurveyRecordSections({
        workingDirectory,
        sections: {
          fieldBook: result.sections.fieldBook,
          coordinateList: result.sections.coordinateList,
          calculations: result.sections.calculations,
          areas: finalResult.areasOnlyBlob,
          beaconComparison: result.sections.beaconComparison,
          reportOnSurvey: finalResult.narrativeBlob,
        },
      });
      if (split.failed.length) {
        console.warn('[ComprehensivePDF] ⚠️ Some record sections did not save:',
          split.failed.map(f => `${f.label}: ${f.error}`).join('; '));
      }
    }

    console.log('[ComprehensivePDF] ✅ Complete Survey Record generation complete')
    
  } catch (error: any) {
    console.error('[ComprehensivePDF] ❌ Complete Survey Record generation failed:', error)
    alert(`Complete Survey Record generation failed: ${error.message}`)
  } finally {
    isExporting.value = false
  }
}

// Raster GeoPDF Export Function (DEPRECATED - kept for backward compatibility)
async function exportGeoPDF() {
  console.log('[SurveyPlanMap] 🌍 Starting Raster GeoPDF export (DEPRECATED)...')
  console.log('[SurveyPlanMap] ⚠️ Consider using generatePlanDocuments() for true vector output')
  isExporting.value = true
  
  try {
    if (!map.value) throw new Error('Map not initialized')
    if (!outsideFigureData.value) throw new Error('Outside Figure data required for georeferencing')
    
    // Overlays removed (WYSIWYG system removed)
    
    // CRITICAL: Use the EXACT same capture logic as Professional PDF Export
    console.log('[SurveyPlanMap] 📸 Capturing map using Professional PDF Export technique...')
    
    let mapImage = ''
    const rasterLayerIds = ['satellite-layer', 'osm-layer']
    const previousRasterVisibility = new Map<string, string>()
    
    // Store original label and symbol sizes for restoration
    const exportSymbolLayersToSize = [
      'stand-labels-layer',
      'parcel-labels-layer',
      'beacon-labels-inside-layer',
      'beacon-labels-outside-layer',
      'edge-annotations-layer'
    ]
    const exportPrevTextSize = new Map<string, any>()
    const exportPrevHaloWidth = new Map<string, any>()
    
    const beaconCircleLayers = ['beacons-circle-shared', 'beacons-circle-all']
    const beaconDotLayers = ['beacons-dot-found-shared', 'beacons-dot-found-all']
    const exportPrevCircleRadius = new Map<string, any>()
    const exportPrevCircleStrokeWidth = new Map<string, any>()
    const exportPrevDotRadius = new Map<string, any>()
    
    try {
      // 1. Increase label sizes for visibility (same as Professional PDF Export)
      const minLabelPx = 14 // Readable label size
      exportSymbolLayersToSize.forEach(id => {
        if (map.value!.getLayer(id)) {
          exportPrevTextSize.set(id, map.value!.getLayoutProperty(id, 'text-size'))
          exportPrevHaloWidth.set(id, map.value!.getPaintProperty(id, 'text-halo-width'))
          map.value!.setLayoutProperty(id, 'text-size', minLabelPx)
          map.value!.setPaintProperty(id, 'text-halo-width', Math.max(1.2, minLabelPx * 0.12))
        }
      })
      
      // 2. Increase beacon sizes for visibility (same as Professional PDF Export)
      const beaconRadiusPx = 6 // Visible beacon size
      beaconCircleLayers.forEach(id => {
        if (map.value!.getLayer(id)) {
          exportPrevCircleRadius.set(id, map.value!.getPaintProperty(id, 'circle-radius'))
          exportPrevCircleStrokeWidth.set(id, map.value!.getPaintProperty(id, 'circle-stroke-width'))
          map.value!.setPaintProperty(id, 'circle-radius', beaconRadiusPx)
          map.value!.setPaintProperty(id, 'circle-stroke-width', Math.max(1, beaconRadiusPx * 0.15))
        }
      })
      
      beaconDotLayers.forEach(id => {
        if (map.value!.getLayer(id)) {
          exportPrevDotRadius.set(id, map.value!.getPaintProperty(id, 'circle-radius'))
          map.value!.setPaintProperty(id, 'circle-radius', beaconRadiusPx * 0.35)
        }
      })
      
      // 3. Hide raster basemap layers
      rasterLayerIds.forEach(id => {
        if (map.value!.getLayer(id)) {
          previousRasterVisibility.set(id, map.value!.getLayoutProperty(id, 'visibility') || 'visible')
          map.value!.setLayoutProperty(id, 'visibility', 'none')
        }
      })
      
      // 4. Set white background
      if (map.value!.getLayer('background')) {
        map.value!.setPaintProperty('background', 'background-color', '#ffffff')
      }
      
      // 5. Wait until MapLibre is fully rendered
      await new Promise<void>(resolve => {
        map.value!.once('idle', () => resolve())
        map.value!.triggerRepaint()
      })
      
      // 6. Capture directly using toDataURL
      mapImage = map.value!.getCanvas().toDataURL('image/png')
      
      console.log('[SurveyPlanMap] ✅ Map captured:', {
        size: `${(mapImage.length / 1024).toFixed(2)} KB`,
        hasContent: mapImage.length > 1000
      })
      
    } finally {
      // 7. Restore label sizes
      exportSymbolLayersToSize.forEach(id => {
        if (map.value!.getLayer(id)) {
          if (exportPrevTextSize.has(id)) map.value!.setLayoutProperty(id, 'text-size', exportPrevTextSize.get(id))
          if (exportPrevHaloWidth.has(id)) map.value!.setPaintProperty(id, 'text-halo-width', exportPrevHaloWidth.get(id))
        }
      })
      
      // 8. Restore beacon sizes
      beaconCircleLayers.forEach(id => {
        if (map.value!.getLayer(id)) {
          if (exportPrevCircleRadius.has(id)) map.value!.setPaintProperty(id, 'circle-radius', exportPrevCircleRadius.get(id))
          if (exportPrevCircleStrokeWidth.has(id)) map.value!.setPaintProperty(id, 'circle-stroke-width', exportPrevCircleStrokeWidth.get(id))
        }
      })
      
      beaconDotLayers.forEach(id => {
        if (map.value!.getLayer(id)) {
          if (exportPrevDotRadius.has(id)) map.value!.setPaintProperty(id, 'circle-radius', exportPrevDotRadius.get(id))
        }
      })
      
      // 9. Restore raster layers
      rasterLayerIds.forEach(id => {
        if (map.value!.getLayer(id) && previousRasterVisibility.has(id)) {
          map.value!.setLayoutProperty(id, 'visibility', previousRasterVisibility.get(id)!)
        }
      })
      
      // 10. Restore background color
      if (map.value!.getLayer('background')) {
        map.value!.setPaintProperty('background', 'background-color', '#f0f0f0')
      }
    }
    

    
    // 2. Get extent from Outside Figure
    const extent = {
      minX: outsideFigureData.value.constants.x,
      maxX: outsideFigureData.value.constants.x,
      minY: outsideFigureData.value.constants.y,
      maxY: outsideFigureData.value.constants.y
    }
    
    // Calculate actual extent from all edges
    outsideFigureData.value.edges.forEach((edge: any) => {
      extent.minX = Math.min(extent.minX, edge.x)
      extent.maxX = Math.max(extent.maxX, edge.x)
      extent.minY = Math.min(extent.minY, edge.y)
      extent.maxY = Math.max(extent.maxY, edge.y)
    })
    
    console.log('[SurveyPlanMap] 📐 Extent:', extent)
    
    // 3. Prepare metadata
    const metadata = {
      title: `Survey Plan - ${props.projectInfo.designation || 'Project'}`,
      surveyor: config.value.surveyorName,
      date: config.value.surveyDate,
      designation: props.projectInfo.designation,
      surveyOf: props.projectInfo.surveyOf || '',
      district: props.projectInfo.district,
      township: props.projectInfo.township
    }
    
    // 4. Generate GeoPDF via backend
    console.log('[SurveyPlanMap] 🔧 Calling GeoPDF service...')
    // Cape Lo projection: EPSG:22291 for Lo 31, EPSG:22289 for Lo 29, etc.
    const epsgCode = `EPSG:${22260 + parseInt(config.value.centralMeridian || '31')}`
    console.log('[SurveyPlanMap] 📍 Projection:', epsgCode)
    
    const pdfBlob = await generateGeoPDF({
      mapImage,
      extent,
      projection: epsgCode,
      metadata
    })
    
    // 5. Download
    const filename = `geopdf-${props.projectId}-${Date.now()}.pdf`
    downloadBlob(pdfBlob, filename)
    
    console.log('[SurveyPlanMap] ✅ GeoPDF export complete')
    alert('GeoPDF generated! Open in Adobe Reader and click the map to see coordinates.')
    emit('export-complete', { format: 'geopdf', filename })
    
  } catch (error: any) {
    console.error('[SurveyPlanMap] ❌ GeoPDF export failed:', error)
    

    
    // If error response is a Blob, parse it as JSON
    let errorDetails = error?.response?.data
    if (errorDetails instanceof Blob) {
      try {
        const text = await errorDetails.text()
        errorDetails = JSON.parse(text)
        console.error('[SurveyPlanMap] Parsed error response:', errorDetails)
      } catch (e) {
        console.error('[SurveyPlanMap] Failed to parse error blob:', e)
      }
    }
    
    const errorMsg = errorDetails?.message || error?.message || 'Unknown error'
    const stderr = errorDetails?.stderr || ''
    const stdout = errorDetails?.stdout || ''
    const stack = errorDetails?.stack || ''
    
    console.error('[SurveyPlanMap] Error message:', errorMsg)
    console.error('[SurveyPlanMap] STDERR:', stderr)
    console.error('[SurveyPlanMap] STDOUT:', stdout)
    console.error('[SurveyPlanMap] Stack:', stack)
    
    alert(`Failed to generate GeoPDF: ${errorMsg}\n\nCheck console for details.`)
  } finally {
    isExporting.value = false
  }
}

// Export functions
async function exportToPDF() {
  isExporting.value = true
  
  try {
    console.log('[SurveyPlanMap] 📄 Starting PDF export...')
    
    // Capture the entire map canvas container
    if (!mapCanvasContainer.value) throw new Error('Map canvas container not found')
    
    console.log('[SurveyPlanMap] 📸 Capturing map and overlays...')
    const canvas = await html2canvas(mapCanvasContainer.value, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scale: 2, // Higher resolution
      logging: false
    })
    
    const imgData = canvas.toDataURL('image/png')
    
    // Determine page size based on sheet size
    let pageFormat: [number, number] = [210, 297] // A4 default
    let orientation: 'portrait' | 'landscape' = 'landscape'
    
    if (intelligentPreview.value) {
      const sheet = intelligentPreview.value.layout.sheet
      pageFormat = [sheet.width, sheet.height]
      orientation = sheet.width > sheet.height ? 'landscape' : 'portrait'
    }
    
    console.log('[SurveyPlanMap] 📋 Creating PDF:', { pageFormat, orientation })
    
    // Create PDF
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: pageFormat
    })
    
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    
    // Add captured image
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight)
    
    // Save
    const filename = `survey-plan-${props.projectInfo.designation || props.projectId}-${Date.now()}.pdf`
    pdf.save(filename)
    
    console.log('[SurveyPlanMap] ✅ PDF exported:', filename)
    
    emit('export-complete', { format: 'pdf', filename })
  } catch (error) {
    console.error('[SurveyPlanMap] ❌ PDF export error:', error)
    alert(`Failed to export PDF: ${error.message}`)
  } finally {
    isExporting.value = false
  }
}

async function exportToPNG() {
  isExporting.value = true
  
  try {
    const canvas = map.value?.getCanvas()
    if (!canvas) throw new Error('Map canvas not found')
    
    const filename = `survey-plan-${props.projectId}-${Date.now()}.png`
    
    canvas.toBlob((blob) => {
      if (!blob) return
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      
      emit('export-complete', { format: 'png', filename })
    })
  } catch (error) {
    console.error('PNG export error:', error)
    alert('Failed to export PNG')
  } finally {
    isExporting.value = false
  }
}

/**
 * Export Survey Plan Summary PDF
 * Generates a reference document with survey details, printing specs, and scale verification
 */
async function exportSurveyPlanSummary() {
  console.log('[SurveyPlanMap] 📋 Generating Survey Plan Summary...')
  isExporting.value = true
  
  try {
    // Get paper dimensions based on selected sheet size
    // ISO A-series paper sizes as approved by Surveyor General
    const paperDimensionsMap: Record<string, { width: number; height: number }> = {
      'ISO_A0': { width: 1189, height: 841 },  // Landscape
      'ISO_A1': { width: 841, height: 594 },   // Landscape
      'ISO_A2': { width: 594, height: 420 },   // Landscape
      'A0': { width: 1189, height: 841 },
      'A1': { width: 841, height: 594 },
      'A2': { width: 594, height: 420 }
    }
    
    // Get selected sheet and scale from config
    const sheetConfig = config.value.sheetSize || 'auto'
    const scaleConfig = config.value.scale || 'auto'
    
    // Default to ISO A1 for auto (most common survey plan size)
    const selectedSheet = sheetConfig === 'auto' ? 'ISO_A1' : sheetConfig
    
    // Get scale value
    const selectedScale = scaleConfig === 'auto' ? '1:2000' : scaleConfig
    const scaleValue = parseInt(selectedScale.split(':')[1]) || 2000
    const paperDims = paperDimensionsMap[selectedSheet] || { width: 500, height: 400 }
    
    // Calculate outside figure vertices string
    const outsideFigure = outsideFigureData.value
    let verticesStr = ''
    if (outsideFigure && outsideFigure.edges && outsideFigure.edges.length > 0) {
      const beaconNames = outsideFigure.edges.map((e: any) => e.pointId || e.constant || e.label).filter(Boolean)
      if (beaconNames.length > 0) {
        // Add closing beacon if not already there
        if (beaconNames[0] !== beaconNames[beaconNames.length - 1]) {
          beaconNames.push(beaconNames[0])
        }
        verticesStr = beaconNames.join(', ')
      }
    }
    
    // Prepare summary data
    const summaryData: SurveyPlanSummaryData = {
      // Survey details
      designation: props.projectInfo.designation || props.projectInfo.surveyOf || 'N/A',
      district: props.projectInfo.district || 'N/A',
      township: props.projectInfo.township,
      surveyDate: props.projectInfo.surveyDate || new Date().toISOString().split('T')[0],
      
      // Plan details
      standCount: parcels.value.filter(p => 
        !p.designation?.toLowerCase().includes('outside figure') &&
        !p.stand?.toLowerCase().includes('outside figure')
      ).length,
      totalArea: totalArea.value,
      beaconCount: coordinatePoints.value.length,
      outsideFigureVertices: verticesStr || undefined,
      
      // Printing details
      scale: selectedScale,
      scaleValue: scaleValue,
      paperSize: selectedSheet,
      paperDimensions: paperDims,
      orientation: exportOptions.value.orientation || 'landscape',
      
      // Surveyor details
      surveyorName: config.value.surveyorName || props.projectInfo.surveyorName || 'N/A',
      licenseNumber: config.value.licenseNumber || props.projectInfo.licenseNumber || 'N/A',
      firm: props.projectInfo.firm,
      address: props.projectInfo.address
    }
    
    console.log('[SurveyPlanMap] 📋 Summary data:', summaryData)
    
    // Generate PDF
    const { pdf, pageCount } = await generateSurveyPlanSummaryPDF(summaryData)
    
    // Download
    const filename = `survey-plan-summary-${props.projectId}-${Date.now()}.pdf`
    const url = URL.createObjectURL(pdf)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    
    console.log(`[SurveyPlanMap] ✅ Summary PDF exported: ${filename} (${pageCount} pages)`)
    emit('export-complete', { format: 'summary-pdf', filename })
    
  } catch (error: any) {
    console.error('[SurveyPlanMap] ❌ Summary PDF export failed:', error)
    alert(`Failed to generate summary PDF: ${error?.message || 'Unknown error'}`)
  } finally {
    isExporting.value = false
  }
}

// Utility functions
// formatAreaSquareMetres is now replaced by formatAreaCompact from areaFormatting.ts
function formatAreaSquareMetres(areaM2: number): string {
  return formatAreaCompact(areaM2)
}

// formatArea and bankersRound are now imported from areaFormatting.ts
// This ensures consistent banker's rounding across the entire application

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB')
}

function calculateStandCount(designation: string): number {
  // Calculate the number of stands from a designation string
  // Examples:
  // "2283-2293" → 11 stands
  // "2283-2293, 2309-2315" → 18 stands
  // "2835" → 1 stand
  
  if (!designation) return 0
  
  // Extract all stand numbers and ranges
  // Match patterns like "2283-2293" or "2835"
  const rangePattern = /(\d+)(?:\s*-\s*(\d+))?/g
  let totalCount = 0
  let match
  
  while ((match = rangePattern.exec(designation)) !== null) {
    const start = parseInt(match[1])
    const end = match[2] ? parseInt(match[2]) : start
    
    // Calculate count for this range (inclusive)
    const rangeCount = end - start + 1
    totalCount += rangeCount
  }
  
  return totalCount
}

function formatDescriptionLine(projectInfo: any, parcelCount: number): string {
  // Format the description line according to SI 727
  // Example: "Widdicombe Township comprising 60 stands and public places"
  
  const township = projectInfo.township || 'Township'
  
  // Try to calculate from surveyOf or designation first
  let count = 0
  
  if (projectInfo.surveyOf) {
    count = calculateStandCount(projectInfo.surveyOf)
  } else if (projectInfo.designation) {
    count = calculateStandCount(projectInfo.designation)
  }
  
  // Fall back to parcelCount if calculation yields 0
  if (count === 0) {
    count = parcelCount || 0
  }
  
  return `${township} comprising ${count} stand${count !== 1 ? 's' : ''} and public places`
}

function formatLocationLine(projectInfo: any): string {
  // Format the location line according to SI 727
  // Example: "being the whole/the remainder/a portion* of Subdivision A"
  // "of Widdicombe, situate in the district of Salisbury."
  
  const subdivision = projectInfo.subdivision || ''
  const locationDetail = projectInfo.locationDetail || projectInfo.township || ''
  const district = projectInfo.district || 'District'
  
  let line = 'being '
  
  // Add subdivision if available
  if (subdivision) {
    line += `the whole/the remainder/a portion* of ${subdivision}`
  } else {
    line += 'the whole/the remainder/a portion*'
  }
  
  // Add location detail
  if (locationDetail && locationDetail !== subdivision) {
    line += ` of ${locationDetail}`
  }
  
  // Add district
  line += `, situate in the district of ${district}.`
  
  return line
}

function formatSurveyStatement(): string {
  // Format: "Surveyed in February 2021 by me"
  const surveyDate = props.projectInfo.surveyDate || config.value.surveyDate
  
  if (!surveyDate) {
    return 'Surveyed in [Month] [Year] by me'
  }
  
  try {
    const date = new Date(surveyDate)
    const month = date.toLocaleString('en-US', { month: 'long' })
    const year = date.getFullYear()
    
    return `Surveyed in ${month} ${year} by me`
  } catch (error) {
    console.error('[SurveyStatement] Error formatting date:', error)
    return 'Surveyed in [Month] [Year] by me'
  }
}

/**
 * Filter beacons for Beacon Description table
 * Includes: beacons inside polygon + beacons within 5m buffer + found beacons + calculated beacons
 * Uses point-in-polygon test and distance calculation for buffer zone
 */
function filterBeaconsWithinExtent(
  points: any[], 
  outsideFigureData: any | null
): any[] {
  console.log('[BeaconFilter] 🚀 FUNCTION CALLED - Version 2026-01-03-23:21-SPATIAL-FILTER')
  console.log('[BeaconFilter] 📊 Input:', {
    pointCount: points.length,
    hasOutsideFigure: !!outsideFigureData,
    hasEdges: !!outsideFigureData?.edges,
    edgeCount: outsideFigureData?.edges?.length || 0
  })
  
  if (!outsideFigureData || !outsideFigureData.edges || outsideFigureData.edges.length === 0) {
    console.log('[BeaconFilter] ⚠️ No Outside Figure data - including all beacons')
    return points
  }
  
  // Build polygon ring from Outside Figure edges
  // Cape Lo coordinates: Y=Westing, X=Southing
  // CRITICAL: Check what coordinate order the edges actually have
  console.log('[BeaconFilter] 🔍 First edge from outsideFigureData:', {
    edge: outsideFigureData.edges[0],
    y: outsideFigureData.edges[0].y,
    x: outsideFigureData.edges[0].x
  })
  
  // The isPointInRing function uses generic x,y variables but the algorithm is coordinate-system agnostic
  // We keep the original [y, x] order that was working for point-in-polygon test
  const polygonRing: Array<[number, number]> = outsideFigureData.edges.map((e: any) => [e.y, e.x])
  
  // Close the ring if not already closed
  const first = polygonRing[0]
  const last = polygonRing[polygonRing.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    polygonRing.push([first[0], first[1]])
  }
  
  console.log('[BeaconFilter] 📐 Outside Figure polygon (Cape Lo Y,X):', {
    vertices: polygonRing.length,
    firstPoint: `Y=${polygonRing[0][0].toFixed(2)}, X=${polygonRing[0][1].toFixed(2)}`,
    lastPoint: `Y=${polygonRing[polygonRing.length - 1][0].toFixed(2)}, X=${polygonRing[polygonRing.length - 1][1].toFixed(2)}`,
    bufferZone: '50 meters'
  })
  
  const BUFFER_DISTANCE = 50.0 // 50 meters buffer zone to include beacons along Outside Figure edges
  
  // Helper function to calculate distance from point to line segment
  // Proven implementation from backend pdfkitGeoPDF.js
  // CRITICAL: Both point and segments must use same coordinate order [y, x]
  const pointToLineDistance = (point: [number, number], lineStart: [number, number], lineEnd: [number, number]): number => {
    const [py, px] = point
    const [y1, x1] = lineStart
    const [y2, x2] = lineEnd
    
    // Vector from line start to end
    const dy = y2 - y1
    const dx = x2 - x1
    const lineLengthSquared = dy * dy + dx * dx
    
    if (lineLengthSquared === 0) {
      // Line segment is a point
      const distY = py - y1
      const distX = px - x1
      return Math.sqrt(distY * distY + distX * distX)
    }
    
    // Calculate projection parameter t
    const t = Math.max(0, Math.min(1, ((py - y1) * dy + (px - x1) * dx) / lineLengthSquared))
    
    // Find closest point on line segment
    const closestY = y1 + t * dy
    const closestX = x1 + t * dx
    
    // Return distance to closest point
    const distY = py - closestY
    const distX = px - closestX
    return Math.sqrt(distY * distY + distX * distX)
  }
  
  // Filter beacons: interior + within buffer + found + calculated
  const filteredPoints = points.filter((point, index) => {
    const x = point.x  // Cape Lo X (Southing)
    const y = point.y  // Cape Lo Y (Westing)
    const desc = (point.description || '').toLowerCase()
    const status = (point.status || '').toLowerCase()
    
    // Debug first 3 beacons to see coordinate values
    if (index < 3) {
      console.log(`[BeaconFilter] 🔍 Testing beacon ${point.name}:`, {
        y: y,
        x: x,
        testPoint: [y, x],
        description: point.description,
        status: point.status
      })
    }
    
    // Always include found beacons (existing reference points)
    const isFound = desc.includes('found') || status === 'f' || status.includes('found')
    
    // Always include calculated beacons (mathematical points, not physically beaconed)
    const isCalculated = status === 'c' || status === 'calc' || status.includes('calculated') || 
                        desc.includes('calculated') || desc.includes('not beaconed')
    
    if (isFound) {
      console.log(`[BeaconFilter] ✅ Including FOUND beacon ${point.name} (regardless of location)`)
      return true
    }
    
    if (isCalculated) {
      console.log(`[BeaconFilter] ✅ Including CALCULATED beacon ${point.name} (regardless of location)`)
      return true
    }
    
    // Check if inside the polygon using proven backend algorithm
    const isInside = isPointInPolygon([y, x], polygonRing)
    
    if (isInside) {
      return true
    }
    
    // Not inside - check if within buffer of polygon boundary
    let minDistance = Infinity
    for (let i = 0; i < polygonRing.length - 1; i++) {
      const dist = pointToLineDistance([y, x], polygonRing[i], polygonRing[i + 1])
      minDistance = Math.min(minDistance, dist)
    }
    
    const isWithinBuffer = minDistance <= BUFFER_DISTANCE
    
    if (isWithinBuffer) {
      console.log(`[BeaconFilter] ✅ Including ${point.name}: within ${minDistance.toFixed(2)}m buffer (outside polygon)`)
      return true
    }
    
    console.log(`[BeaconFilter] ❌ Excluded ${point.name}: ${minDistance.toFixed(2)}m from boundary (outside ${BUFFER_DISTANCE}m buffer)`)
    return false
  })
  
  console.log(`[BeaconFilter] ✅ Filtered: ${filteredPoints.length}/${points.length} beacons (interior + ${BUFFER_DISTANCE}m buffer + found + calculated)`)
  
  return filteredPoints
}

/**
 * Filter beacon labels to only include those within the Outside Figure polygon
 * Beacon labels have coordinates in Cape Lo format
 */
function filterBeaconLabelsWithinOutsideFigure(
  beaconLabels: any[],
  outsideFigureData: any | null
): any[] {
  if (!outsideFigureData || !outsideFigureData.edges || outsideFigureData.edges.length === 0) {
    console.log('[BeaconLabelFilter] ⚠️ No Outside Figure data - including all beacon labels')
    return beaconLabels
  }
  
  // Build polygon ring from Outside Figure edges (Cape Lo coordinates: Y=Westing, X=Southing)
  const polygonRing: Array<[number, number]> = outsideFigureData.edges.map((e: any) => [e.y, e.x])
  
  // Close the ring if not already closed
  const first = polygonRing[0]
  const last = polygonRing[polygonRing.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    polygonRing.push([first[0], first[1]])
  }
  
  console.log('[BeaconLabelFilter] 📐 Outside Figure polygon (Cape Lo Y,X):', {
    vertices: polygonRing.length,
    firstPoint: `Y=${polygonRing[0][0].toFixed(2)}, X=${polygonRing[0][1].toFixed(2)}`,
    lastPoint: `Y=${polygonRing[polygonRing.length - 1][0].toFixed(2)}, X=${polygonRing[polygonRing.length - 1][1].toFixed(2)}`
  })
  
  // Filter beacon labels: only those inside the polygon
  const filteredLabels = beaconLabels.filter(label => {
    // Beacon labels have coordinates property with x, y in Cape Lo
    const x = label.coordinates?.x || label.x
    const y = label.coordinates?.y || label.y
    
    if (x === undefined || y === undefined) {
      console.warn('[BeaconLabelFilter] ⚠️ Beacon label missing coordinates:', label)
      return false
    }
    
    // Check if point is inside the polygon
    const isInside = isPointInRing([x, y], polygonRing)
    
    if (!isInside) {
      console.log(`[BeaconLabelFilter] ❌ Excluded label ${label.name || label.beaconName}: (${x.toFixed(2)}, ${y.toFixed(2)}) outside polygon`)
    }
    
    return isInside
  })
  
  console.log(`[BeaconLabelFilter] ✅ Filtered: ${filteredLabels.length}/${beaconLabels.length} beacon labels (inside polygon only)`)
  
  return filteredLabels
}

function formatBeaconDescriptionGroups(points: any[]): Array<{ points: string; description: string }> {
  // Format beacon descriptions according to SI 727 template
  // Example from template:
  // M5, M6, M7, M8, M9 : Not beaconed
  // ZE, ZD             : 50mm Iron Pipe in Concrete
  // Others             : 12mm iron peg in concrete
  
  if (!points || points.length === 0) {
    return [{ points: 'All', description: '12mm iron peg in concrete' }]
  }
  
  console.log('[BeaconDescription] 📊 Analyzing beacons from database...')
  console.log(`[BeaconDescription] Total beacons: ${points.length}`)
  
  // Classify beacons by their NAME pattern to determine beacon type
  // This is a heuristic based on common cadastral naming conventions
  const beaconTypeGroups: Map<string, string[]> = new Map()
  
  points.forEach(point => {
    const name = point.name || ''
    let beaconType = ''
    
    // Classify based on naming patterns
    // M-series typically = Not beaconed (monument points)
    // Single letter + number (P2, Z1, etc.) or multi-letter codes (ZE, ZD) = Special markers
    // Numeric with letter suffix (2283A, 2284B) = Standard concrete beacons
    
    if (name.match(/^M\d+/i)) {
      // M5, M6, M7, M8, M9 = Not beaconed
      beaconType = 'Not beaconed'
    } else if (name.match(/^[A-Z]\d+$/i) || name.match(/^[A-Z]{2,}$/i)) {
      // P2, Z1, ZE, ZD = Special markers (single letter + number OR multi-letter codes)
      beaconType = '50mm Iron Pipe in Concrete'
    } else {
      // 2283A, 2283L, N1, etc. = Standard concrete beacons (default)
      beaconType = '12mm iron peg in concrete'
    }
    
    if (!beaconTypeGroups.has(beaconType)) {
      beaconTypeGroups.set(beaconType, [])
    }
    beaconTypeGroups.get(beaconType)!.push(name)
  })
  
  // Log statistics
  console.log('[BeaconDescription] 📈 Beacon type classification:')
  const sortedTypes = Array.from(beaconTypeGroups.entries())
    .sort((a, b) => b[1].length - a[1].length) // Sort by count descending
  
  sortedTypes.forEach(([type, names]) => {
    console.log(`  - "${type}": ${names.length} beacons`)
    console.log(`    Points: ${names.slice(0, 10).join(', ')}${names.length > 10 ? '...' : ''}`)
  })
  
  // Find the most common type (this becomes "Others")
  const mostCommonType = sortedTypes[0]?.[0] || '12mm iron peg in concrete'
  const mostCommonCount = sortedTypes[0]?.[1].length || 0
  
  console.log(`[BeaconDescription] 🎯 Most common type: "${mostCommonType}" (${mostCommonCount} beacons)`)
  
  // Build result array
  const result: Array<{ points: string; description: string }> = []
  
  // First, add all unique types (not the most common one)
  beaconTypeGroups.forEach((pointNames, beaconType) => {
    if (beaconType !== mostCommonType) {
      // This is a unique type - list the specific beacons
      const pointsStr = pointNames.join(', ')
      result.push({
        points: pointsStr,
        description: beaconType
      })
      console.log(`[BeaconDescription] ✅ Unique group: ${pointsStr} → "${beaconType}"`)
    }
  })
  
  // Finally, add "Others" for the most common type
  if (beaconTypeGroups.has(mostCommonType)) {
    result.push({
      points: 'Others',
      description: mostCommonType
    })
    console.log(`[BeaconDescription] ✅ Others group: ${mostCommonCount} beacons → "${mostCommonType}"`)
  }
  
  console.log(`[BeaconDescription] 📋 Final output: ${result.length} groups`)
  
  return result
}

// Watch for overlay scaling changes (removed - overlayScaling computed removed)
// watch(overlayScaling, (newScaling) => {
//   if (newScaling && intelligentPreview.value) {
//     console.log('[SurveyPlanMap] Adaptive Overlay Scaling Updated:')
//     console.log('  North Arrow:', {
//       size: newScaling.northArrow?.size,
//       fontSize: newScaling.northArrow.fontSize
//     })
//   }
// }, { deep: true })

// ⭐ Watch for intelligentPreview changes to update geocoded layout when scale changes
watch(intelligentPreview, (newPreview, oldPreview) => {
  if (!newPreview || !map.value) return
  
  // Check if scale changed
  const newScale = newPreview.scale?.denominator
  const oldScale = oldPreview?.scale?.denominator
  
  if (newScale !== oldScale) {
    console.log('[SurveyPlanMap] 📐 Scale changed:', { from: oldScale, to: newScale })
    console.log('[SurveyPlanMap] 🗺️ Recalculating geocoded layout...')
    
    // Update geocoded layout with new scale
    nextTick(() => {
      addLayoutGuidesToMap()
    })
  }
}, { deep: true })

// Helper: Banker's rounding (round half to even) - Zimbabwe SGO requirement
// MUST be defined BEFORE outsideFigureData computed property
function bankersRound(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals)
  const shifted = value * multiplier
  const floor = Math.floor(shifted)
  const decimal = shifted - floor
  
  if (decimal === 0.5) {
    // Exactly at midpoint - round to even
    return (floor % 2 === 0 ? floor : floor + 1) / multiplier
  } else {
    // Not at midpoint - use standard rounding
    return Math.round(shifted) / multiplier
  }
}

// Helper: Convert decimal degrees to DMS format with banker's rounding
// Matches backend's roundBearingSouth logic for consistency
// @param decimal - bearing in decimal degrees
// @param distance - edge distance in meters (determines seconds resolution)
function decimalToDMS(decimal: number | undefined, distance: number = 0): string {
  if (decimal === undefined || decimal === null || isNaN(decimal)) {
    return '---'
  }
  
  // ⭐ SECONDS RESOLUTION: Same rule as backend (compute.js)
  // <6000m uses 10" resolution, >=6000m uses 1" resolution
  const secRes = distance < 6000 ? 10 : 1
  
  // Convert to total seconds
  const absolute = Math.abs(decimal)
  const totalSeconds = absolute * 3600
  
  // Round to nearest resolution using banker's rounding
  const roundedSeconds = bankersRound(totalSeconds / secRes, 0) * secRes
  
  // Convert back to DMS
  let degrees = Math.floor(roundedSeconds / 3600)
  let minutes = Math.floor((roundedSeconds - degrees * 3600) / 60)
  let seconds = roundedSeconds - degrees * 3600 - minutes * 60
  
  // Normalize
  if (seconds >= 60) { seconds -= 60; minutes += 1 }
  if (minutes >= 60) { minutes -= 60; degrees += 1 }
  if (degrees >= 360) { degrees = degrees % 360 }
  
  return `${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}"`
}

// ⭐ Outside Figure Data - Computed property for traverse table
// ⭐ SINGLE SOURCE OF TRUTH: Uses metadata.residuals.edges from Area/Consistency computation
// This ensures Vue, PDF, and Area/Consistency all show IDENTICAL data
const outsideFigureData = computed(() => {
  console.log('[SurveyPlanMap] 🔍 Checking for Outside Figure parcel...')
  
  // ⭐ CRITICAL FIX: Return early if coordinate points aren't loaded yet
  // This prevents spam warnings during initial data loading
  if (!coordinatePoints.value || coordinatePoints.value.length === 0) {
    console.log('[SurveyPlanMap] ⏳ Coordinate points not loaded yet, skipping outside figure data computation')
    return null
  }
  
  // Find the "Outside Figure" parcel
  const outsideFigureParcel = parcels.value.find(p => 
    p.designation?.toLowerCase().includes('outside figure') ||
    p.stand?.toLowerCase().includes('outside figure') ||
    p.metadata?.isOutsideFigure === true
  )
  
  if (!outsideFigureParcel) {
    console.log('[SurveyPlanMap] ⚠️ No Outside Figure parcel found')
    return null
  }
  
  // ⭐ SINGLE SOURCE OF TRUTH: Use pre-computed edges from Area/Consistency
  // This is stored in metadata.residuals.edges after area computation
  const storedEdges = outsideFigureParcel.metadata?.residuals?.edges
  
  // ⭐ STALE DETECTION: Compare geometry vertex count with stored edges
  // If they don't match, the metadata is outdated (geometry changed in QGIS)
  const parcelGeom = outsideFigureParcel.geom
  const geomVertexCount = parcelGeom?.coordinates?.[0]?.length ? parcelGeom.coordinates[0].length - 1 : 0 // -1 for closing point
  const storedEdgeCount = storedEdges?.length || 0
  const isMetadataStale = storedEdgeCount > 0 && geomVertexCount > 0 && storedEdgeCount !== geomVertexCount
  
  if (isMetadataStale) {
    console.log(`[SurveyPlanMap] ⚠️ STALE METADATA DETECTED: stored ${storedEdgeCount} edges vs geometry ${geomVertexCount} vertices`)
    console.log('[SurveyPlanMap] ⚠️ Please re-run "Compute Area & Consistency" for Outside Figure to update metadata')
  }
  
  if (storedEdges && Array.isArray(storedEdges) && storedEdges.length > 0 && !isMetadataStale) {
    console.log('[SurveyPlanMap] ✅ Using STORED edges from metadata.residuals.edges (single source of truth)')
    console.log('[SurveyPlanMap] 📊 Edge count:', storedEdges.length)
    
    // Helper to match vertex to coordinate point
    const findPointName = (vertexY: number, vertexX: number, isGenericFallback = false): string | null => {
      const tolerance = 2.0  // Increased tolerance for floating point precision issues
      let closestMatch = null
      let closestDist = Infinity
      
      // ⭐ CRITICAL FIX: If coordinate points aren't loaded, we can't match
      if (!coordinatePoints.value || coordinatePoints.value.length === 0) {
        console.warn(`[SurveyPlanMap] ⚠️ No coordinate points available for matching!`)
        return null
      }
      
      for (const cp of coordinatePoints.value) {
        // CRITICAL: Cape Lo coordinates - Y = Westing, X = Southing
        // coordinate_points table: cp.y = Westing, cp.x = Southing
        // stored edges: vertexY = Westing, vertexX = Southing
        const cpY = Number(cp.y)  // Westing
        const cpX = Number(cp.x)  // Southing
        const dist = Math.sqrt(Math.pow(cpY - vertexY, 2) + Math.pow(cpX - vertexX, 2))
        
        if (dist < closestDist) {
          closestDist = dist
          closestMatch = cp.name
        }
        
        if (dist < tolerance) {
          console.log(`[SurveyPlanMap] ✅ Matched vertex (${vertexY.toFixed(2)}, ${vertexX.toFixed(2)}) to ${cp.name} (dist: ${dist.toFixed(3)}m)`)
          return cp.name
        }
      }
      
      // ⭐ CRITICAL FIX: If we're trying to fix a generic fallback name, try with a larger tolerance
      if (isGenericFallback && closestMatch && closestDist < tolerance * 5) {
        console.log(`[SurveyPlanMap] ✅ Found close match for generic fallback: ${closestMatch} (${closestDist.toFixed(3)}m) with extended tolerance`)
        return closestMatch
      }
      
      console.log(`[SurveyPlanMap] ⚠️ No match for vertex (${vertexY.toFixed(2)}, ${vertexX.toFixed(2)}) - closest: ${closestMatch} (${closestDist.toFixed(3)}m)`)
      return null
    }
    
    // ⭐ CRITICAL FIX: Helper to detect generic fallback names like "PEGGINGA", "P1", etc.
    const isGenericFallbackName = (name: string): boolean => {
      if (!name) return true
      // Detect patterns like: PEGGINGA, PEGGINGB, STANDA, STANDB, P1, P2, A, B, etc.
      const genericPatterns = [
        /^PEGGING[A-Z]$/,           // PEGGINGA, PEGGINGB, etc.
        /^[A-Z]+[A-Z]$/,            // STANDA, STANDB, etc. (stand name + letter)
        /^P\d+$/,                   // P1, P2, etc.
        /^[A-Z]$/,                   // Single letters A, B, C...
        /^POINT\d+$/,               // POINT1, POINT2...
        /^BEACON\d+$/               // BEACON1, BEACON2...
      ]
      return genericPatterns.some(pattern => pattern.test(name))
    }
    
    // Format edges from stored data (matches Area/Consistency exactly)
    const formattedEdges = storedEdges.map((edge: any, index: number) => {
      // ⭐ ALWAYS use spatial matching to get correct beacon names from coordinate_points
      // This ensures we use the latest coordinate_points data, not stale metadata
      let fromName = null
      let toName = null
      
      // Match coordinates to coordinate points (single source of truth)
      if (edge.from?.y !== undefined && edge.from?.x !== undefined) {
        fromName = findPointName(edge.from.y, edge.from.x)
      }
      if (edge.to?.y !== undefined && edge.to?.x !== undefined) {
        toName = findPointName(edge.to.y, edge.to.x)
      }
      
      // ⭐ CRITICAL FIX: Check if stored names are generic fallbacks (e.g., "PEGGINGA", "P1", "A")
      // If spatial matching failed but we have a stored name, check if it's generic
      const storedFromName = edge.from?.id || edge.from?.name
      const storedToName = edge.to?.id || edge.to?.name
      
      // If spatial matching failed and stored name is generic, try again with extended tolerance
      if (!fromName && storedFromName && isGenericFallbackName(storedFromName)) {
        console.warn(`[SurveyPlanMap] ⚠️ Generic from-name detected: "${storedFromName}" - trying extended tolerance...`)
        fromName = findPointName(edge.from.y, edge.from.x, true) // true = isGenericFallback
      }
      if (!toName && storedToName && isGenericFallbackName(storedToName)) {
        console.warn(`[SurveyPlanMap] ⚠️ Generic to-name detected: "${storedToName}" - trying extended tolerance...`)
        toName = findPointName(edge.to.y, edge.to.x, true) // true = isGenericFallback
      }
      
      // Fallback to stored names only if spatial matching fails AND no generic name detected
      if (!fromName) {
        fromName = storedFromName || String.fromCharCode(65 + index)
        if (isGenericFallbackName(fromName)) {
          console.warn(`[SurveyPlanMap] ⚠️ USING GENERIC FROM-NAME: "${fromName}" for edge ${index} - please verify coordinate points are loaded and match parcel vertices`)
        }
      }
      if (!toName) {
        toName = storedToName || String.fromCharCode(65 + ((index + 1) % storedEdges.length))
        if (isGenericFallbackName(toName)) {
          console.warn(`[SurveyPlanMap] ⚠️ USING GENERIC TO-NAME: "${toName}" for edge ${index} - please verify coordinate points are loaded and match parcel vertices`)
        }
      }
      
      // Use pre-computed values (banker's rounded) from Area/Consistency
      const distance = edge.distanceRounded ?? edge.distance
      
      // Get direction from metadata, or compute on-the-fly if missing
      let direction = edge.directionDMS || ''
      
      // If direction is missing, compute it from coordinates
      if (!direction && edge.from?.y !== undefined && edge.from?.x !== undefined && 
          edge.to?.y !== undefined && edge.to?.x !== undefined) {
        const deltaY = edge.to.y - edge.from.y  // Westing difference
        const deltaX = edge.to.x - edge.from.x  // Southing difference
        
        // Calculate bearing in degrees (0° = South, clockwise)
        let bearingDeg = Math.atan2(deltaY, deltaX) * (180 / Math.PI)
        if (bearingDeg < 0) bearingDeg += 360
        
        // Convert to DMS using the helper function (with distance for correct resolution)
        const rawDistance = edge.distance || Math.sqrt(deltaY * deltaY + deltaX * deltaX)
        direction = decimalToDMS(bearingDeg, rawDistance)
        
        console.log(`[SurveyPlanMap] 🧭 Computed direction for ${fromName}-${toName}: ${direction}`)
      }
      
      // Get coordinates for the "to" point (end of edge)
      const toY = edge.to?.y ?? 0
      const toX = edge.to?.x ?? 0
      
      const side = `${fromName}-${toName}`
      
      console.log(`[SurveyPlanMap] 📐 Edge ${index}: ${side} (${distance}m, ${direction}) - beacon: ${fromName}`)
      
      return {
        side,
        distance,
        direction,
        pointId: fromName,
        y: toY,
        x: toX
      }
    })
    
    // Constants row: first point coordinates from first edge
    // ⭐ ALWAYS use spatial matching first (single source of truth)
    let firstName = null
    
    // Match coordinates to coordinate points
    if (storedEdges[0]?.from?.y !== undefined && storedEdges[0]?.from?.x !== undefined) {
      firstName = findPointName(storedEdges[0].from.y, storedEdges[0].from.x)
    }
    
    // Fallback to stored name if spatial matching fails
    if (!firstName) {
      firstName = storedEdges[0]?.from?.id || storedEdges[0]?.from?.name || 'A'
    }
    
    const firstY = storedEdges[0]?.from?.y ?? 0
    const firstX = storedEdges[0]?.from?.x ?? 0
    
    console.log('[SurveyPlanMap] 📐 First point (Constants):', firstName, `Y=${firstY.toFixed(2)}, X=${firstX.toFixed(2)}`)
    
    return {
      edges: formattedEdges,
      constants: {
        pointId: firstName,
        y: firstY,
        x: firstX
      }
    }
  }
  
  // ⚠️ FALLBACK: No stored edges or stale - compute from geometry (less accurate)
  // This should only happen if Area/Consistency hasn't been run yet or geometry changed
  console.log('[SurveyPlanMap] ⚠️ No valid stored edges - computing from geometry (run Area/Consistency for accurate data)')
  
  // Reuse parcelGeom from stale detection above
  if (!parcelGeom || !parcelGeom.coordinates || !parcelGeom.coordinates[0] || parcelGeom.coordinates[0].length < 3) {
    console.log('[SurveyPlanMap] ⚠️ Outside Figure parcel found but no valid geometry')
    return null
  }
  
  const coords = parcelGeom.coordinates[0]
  const vertices = coords.slice(0, -1)
  
  // Helper function to generate letter labels
  const getLetterLabel = (index: number): string => {
    const cycle = Math.floor(index / 26)
    const letter = String.fromCharCode(65 + (index % 26))
    return cycle === 0 ? letter : `${letter}${cycle}`
  }
  
  // Helper to match vertex to coordinate point
  const findPointName = (vertexY: number, vertexX: number): string | null => {
    const tolerance = 1.0
    for (const cp of coordinatePoints.value) {
      const cpWesting = Number(cp.x)
      const cpSouthing = Number(cp.y)
      const dist = Math.sqrt(Math.pow(cpWesting - vertexY, 2) + Math.pow(cpSouthing - vertexX, 2))
      if (dist < tolerance) return cp.name
    }
    return null
  }
  
  const formattedEdges = vertices.map((coord: number[], index: number) => {
    const nextIndex = (index + 1) % vertices.length
    const nextCoord = vertices[nextIndex]
    const fromY = coord[0], fromX = coord[1]
    const toY = nextCoord[0], toX = nextCoord[1]
    
    const fromName = findPointName(fromY, fromX) || getLetterLabel(index)
    const toName = findPointName(toY, toX) || getLetterLabel(nextIndex)
    
    const rawDistance = Math.sqrt(Math.pow(toY - fromY, 2) + Math.pow(toX - fromX, 2))
    const distance = bankersRound(rawDistance, 2)
    let bearing = Math.atan2(toY - fromY, toX - fromX) * (180 / Math.PI)
    if (bearing < 0) bearing += 360
    // ⭐ Pass distance for correct seconds resolution (10" for <6km, 1" for >=6km)
    const direction = decimalToDMS(bearing, rawDistance)
    
    return {
      side: `${fromName}-${toName}`,
      distance,
      direction,
      pointId: fromName,
      y: toY,
      x: toX
    }
  })
  
  const firstCoord = vertices[0]
  const firstName = findPointName(firstCoord[0], firstCoord[1]) || 'A'
  
  return {
    edges: formattedEdges,
    constants: {
      pointId: firstName,
      y: firstCoord[0],
      x: firstCoord[1]
    }
  }
})

// =====================================================================
// MULTI-SHEET: Reactive tile grid computation
// Placed AFTER outsideFigureData computed to avoid temporal dead zone.
// =====================================================================

/**
 * Recomputes the active tile grid whenever the outside figure data or
 * plan configuration changes — so the user sees sheet count BEFORE export.
 */
function recomputeTileGrid() {
  const ofd = outsideFigureData.value
  if (!ofd || !ofd.edges || ofd.edges.length === 0) {
    activeTileGrid.value = null
    return
  }

  // Build extent from OFD edge coordinates
  const coords = ofd.edges.map((e: any) => ({ y: e.y, x: e.x }))
  const minX = Math.min(...coords.map((c: any) => c.x))
  const maxX = Math.max(...coords.map((c: any) => c.x))
  const minY = Math.min(...coords.map((c: any) => c.y))
  const maxY = Math.max(...coords.map((c: any) => c.y))
  const extentW = maxY - minY
  const extentH = maxX - minX

  if (extentW <= 0 || extentH <= 0) {
    activeTileGrid.value = null
    return
  }

  const result = calculateOptimalScaleAndSheet(
    { width: extentW, height: extentH },
    parcels.value.length,
    ofd.edges.length,
    0, // beaconGroupCount — conservative: unknown at this stage
    'landscape',
    undefined,
    {
      planType: config.value.planType as any,
      outsideFigureBounds: { minY, maxY, minX, maxX }
    }
  )

  activeTileGrid.value = result.tileGrid ?? null

  if (activeTileGrid.value) {
    console.log(
      `[SurveyPlanMap] 🗺️ Tile grid updated: ${activeTileGrid.value.totalSheets} sheets` +
      ` (${activeTileGrid.value.cols}×${activeTileGrid.value.rows}) at ${activeTileGrid.value.scaleLabel}`
    )
  }
}

// Watch outside figure data and plan type — recompute tile grid when either changes
watch(
  [outsideFigureData, () => config.value.planType, () => config.value.scale],
  () => { recomputeTileGrid() },
  { immediate: true }
)

// Clear diagram selection when leaving diagram mode
watch(() => config.value.planType, () => {
  if (!isDiagramMode.value) {
    selectedDiagramParcelId.value = null
  }
  applyDiagramHighlight(selectedDiagramParcelId.value)
})

// Reset side annotations whenever the diagram subject changes
watch(selectedDiagramParcelId, () => {
  activeSideEditor.value = null
  updateSubjectSidesLayer()
})

// Keep the paper size valid for the plan type: Diagram → A4/A3; others → auto/ISO.
watch(() => config.value.planType, (pt) => {
  if (pt === 'diagram') {
    if (config.value.sheetSize !== 'A4' && config.value.sheetSize !== 'A3') {
      config.value.sheetSize = 'A4'
    }
  } else if (config.value.sheetSize === 'A4' || config.value.sheetSize === 'A3') {
    config.value.sheetSize = 'auto'
  }
}, { immediate: true })

// Current tile descriptor (1-based index → 0-based array)
const currentTile = computed(() => {
  if (!activeTileGrid.value) return null
  return activeTileGrid.value.tiles[activeReviewSheet.value - 1] ?? null
})

// ─────────────────────────────────────────────────────────────────────────────
// PER-SHEET OFD — proper S-H clipped outside figure for every tile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Master polygon vertices extracted from the computed outsideFigureData.
 * Null when no valid outside figure parcel exists.
 */
const masterOfdVerts = computed((): OfdVertex[] | null => {
  const ofd = outsideFigureData.value
  if (!ofd || !ofd.edges || ofd.edges.length === 0) return null
  return masterVerticesFromOfd(ofd)
})

/**
 * Per-sheet OFD objects, one per tile.  Each has properly clipped vertices,
 * a ready-to-render SI 727 edge table, and an `isEdited` flag.
 *
 * For single-sheet plans the one entry uses the full master polygon unchanged.
 */
const perSheetOfd = computed((): SheetOfd[] => {
  const master = masterOfdVerts.value
  if (!master || master.length === 0) return []
  const tiles = (activeTileGrid.value?.tiles ?? []) as OfdTile[]
  if (tiles.length === 0) return []
  return computeAllSheetOfds(master, tiles, sheetOfdOverrides.value)
})

/**
 * SheetOfd for the currently selected tab in the Sheet Review panel.
 */
const activeSheetOfd = computed((): SheetOfd | null => {
  return perSheetOfd.value.find(s => s.sheetNumber === activeReviewSheet.value) ?? null
})

// Convenience alias used in the template (replaces the old activeSheetOFEdges)
const activeSheetOFEdges = computed(() => activeSheetOfd.value?.edges ?? [])

// Sheet Review modal controls
function openSheetReview() {
  activeReviewSheet.value = 1
  showSheetReview.value = true
  // Add tile grid + sub-figure layer after a tick so the panel is mounted first
  nextTick(() => {
    addTileGridToMap()
    addSubFigureToMap()
    zoomToActiveTile()
  })
}

function closeSheetReview() {
  cancelOfdEdit()
  showSheetReview.value = false
  removeTileGridFromMap()
  removeSubFigureFromMap()
}

function confirmSheetReview() {
  cancelOfdEdit()
  showSheetReview.value = false
  removeTileGridFromMap()
  removeSubFigureFromMap()
}

// ─────────────────────────────────────────────────────────────────────────────
// OFD VERTEX EDITING — per-sheet editable outside figure
// ─────────────────────────────────────────────────────────────────────────────

/** Enter edit mode: load the active sheet's current vertices into editingVerts */
function startOfdEdit() {
  const sheet = activeSheetOfd.value
  if (!sheet) return
  // Deep copy so edits don't mutate the computed value
  editingVerts.value = sheet.vertices.map(v => ({ ...v }))
  isEditingSheetOfd.value = true
}

/** Discard edits and exit edit mode */
function cancelOfdEdit() {
  editingVerts.value = []
  isEditingSheetOfd.value = false
}

/** Update a single vertex field (y or x) in the working copy */
function updateEditingVert(idx: number, field: 'y' | 'x', raw: string) {
  const val = parseFloat(raw)
  if (!isNaN(val)) {
    editingVerts.value[idx] = { ...editingVerts.value[idx], [field]: val }
  }
}

/** Update the pointId label of a vertex in the working copy */
function updateEditingVertName(idx: number, name: string) {
  editingVerts.value[idx] = { ...editingVerts.value[idx], pointId: name }
}

/** Delete a vertex from the working copy (minimum 3 required) */
function deleteEditingVert(idx: number) {
  if (editingVerts.value.length <= 3) return
  editingVerts.value.splice(idx, 1)
}

/** Move a vertex up (earlier in traversal order) */
function moveEditingVertUp(idx: number) {
  if (idx <= 0) return
  const arr = editingVerts.value
  ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
}

/** Move a vertex down (later in traversal order) */
function moveEditingVertDown(idx: number) {
  const arr = editingVerts.value
  if (idx >= arr.length - 1) return
  ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
}

/**
 * Insert a vertex after position `idx` by picking the nearest unused
 * coordinate point as a suggested position.  Falls back to a midpoint
 * between the vertex at idx and idx+1.
 */
function insertVertexAfter(idx: number) {
  const arr = editingVerts.value
  const after = arr[(idx + 1) % arr.length]
  const before = arr[idx]
  const midY = (before.y + after.y) / 2
  const midX = (before.x + after.x) / 2
  const newVert: OfdVertex = {
    id: `user-${Date.now()}`,
    pointId: `NEW`,
    y: midY,
    x: midX,
    type: 'survey',
  }
  editingVerts.value.splice(idx + 1, 0, newVert)
}

/**
 * Commit the edited vertex list:
 * 1. Store in sheetOfdOverrides for this sheet
 * 2. Propagate shared boundary changes to adjacent sheets
 * 3. Exit edit mode and update the sub-figure map layer
 */
function saveOfdEdit() {
  const sheetNum = activeReviewSheet.value
  const tiles = (activeTileGrid.value?.tiles ?? []) as OfdTile[]
  const master = masterOfdVerts.value ?? []

  const newOverrides = propagateSharedBoundary(
    sheetNum,
    editingVerts.value,
    tiles,
    master,
    sheetOfdOverrides.value,
  )
  sheetOfdOverrides.value = newOverrides
  isEditingSheetOfd.value = false
  editingVerts.value = []

  // Refresh the sub-figure map layer with the updated clipped polygon
  nextTick(() => updateSubFigureLayer())
}

/** Reset a single sheet back to auto-computed (remove its override) */
function resetSheetOfd(sheetNum: number) {
  const next = { ...sheetOfdOverrides.value }
  delete next[sheetNum]
  sheetOfdOverrides.value = next
  if (isEditingSheetOfd.value && activeReviewSheet.value === sheetNum) {
    cancelOfdEdit()
  }
  nextTick(() => updateSubFigureLayer())
}

/** Reset ALL sheets back to auto-computed */
function resetAllSheetOfds() {
  sheetOfdOverrides.value = {}
  cancelOfdEdit()
  nextTick(() => updateSubFigureLayer())
}

// =====================================================================
// TILE GRID MAP PREVIEW — MapLibre layers showing each tile's extent
// =====================================================================

const TILE_GRID_SOURCE = 'tile-grid-source'
const TILE_GRID_LAYERS = [
  'tile-grid-fill-active',
  'tile-grid-fill-inactive',
  'tile-grid-outline-active',
  'tile-grid-outline-inactive',
  'tile-grid-labels',
]

/**
 * Convert a Cape Lo tile bounding box to a WGS84 GeoJSON polygon ring.
 * Cape Lo: Y = Westing, X = Southing
 */
function tileToWGS84Polygon(tile: { minY: number; maxY: number; minX: number; maxX: number }) {
  const cm = config.value.centralMeridian
  const nw = capeLoToWGS84({ id: 'nw', y: tile.minY, x: tile.maxX } as CapeLoPoint, cm)
  const ne = capeLoToWGS84({ id: 'ne', y: tile.maxY, x: tile.maxX } as CapeLoPoint, cm)
  const se = capeLoToWGS84({ id: 'se', y: tile.maxY, x: tile.minX } as CapeLoPoint, cm)
  const sw = capeLoToWGS84({ id: 'sw', y: tile.minY, x: tile.minX } as CapeLoPoint, cm)
  return [
    [nw.lng, nw.lat],
    [ne.lng, ne.lat],
    [se.lng, se.lat],
    [sw.lng, sw.lat],
    [nw.lng, nw.lat], // close ring
  ]
}

/**
 * Build the GeoJSON FeatureCollection for all tiles, tagging each with
 * isActive so the MapLibre style filter can pick active vs inactive.
 */
function buildTileGridGeoJSON(activeTileNum: number) {
  if (!activeTileGrid.value) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: activeTileGrid.value.tiles.map((tile) => ({
      type: 'Feature',
      properties: {
        sheetNumber: tile.sheetNumber,
        label: tile.label,
        isActive: tile.sheetNumber === activeTileNum,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [tileToWGS84Polygon(tile)],
      },
    })),
  }
}

function addTileGridToMap() {
  const m = map.value
  if (!m || !activeTileGrid.value) return

  const geojson = buildTileGridGeoJSON(activeReviewSheet.value)

  if (m.getSource(TILE_GRID_SOURCE)) {
    ;(m.getSource(TILE_GRID_SOURCE) as maplibregl.GeoJSONSource).setData(geojson as any)
    return
  }

  m.addSource(TILE_GRID_SOURCE, { type: 'geojson', data: geojson as any })

  // Inactive tile fill (light translucent)
  m.addLayer({
    id: 'tile-grid-fill-inactive',
    type: 'fill',
    source: TILE_GRID_SOURCE,
    filter: ['==', ['get', 'isActive'], false],
    paint: { 'fill-color': '#93c5fd', 'fill-opacity': 0.08 },
  })

  // Active tile fill (blue)
  m.addLayer({
    id: 'tile-grid-fill-active',
    type: 'fill',
    source: TILE_GRID_SOURCE,
    filter: ['==', ['get', 'isActive'], true],
    paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.18 },
  })

  // Inactive tile outline (dashed)
  m.addLayer({
    id: 'tile-grid-outline-inactive',
    type: 'line',
    source: TILE_GRID_SOURCE,
    filter: ['==', ['get', 'isActive'], false],
    paint: {
      'line-color': '#3b82f6',
      'line-width': 1.5,
      'line-dasharray': [4, 3],
      'line-opacity': 0.7,
    },
  })

  // Active tile outline (solid, thicker)
  m.addLayer({
    id: 'tile-grid-outline-active',
    type: 'line',
    source: TILE_GRID_SOURCE,
    filter: ['==', ['get', 'isActive'], true],
    paint: { 'line-color': '#1d4ed8', 'line-width': 3, 'line-opacity': 1 },
  })

  // Sheet number labels
  m.addLayer({
    id: 'tile-grid-labels',
    type: 'symbol',
    source: TILE_GRID_SOURCE,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 13,
      'text-anchor': 'center',
    },
    paint: {
      'text-color': '#1d4ed8',
      'text-halo-color': 'rgba(255,255,255,0.9)',
      'text-halo-width': 2,
    },
  })
}

function updateTileGridHighlight() {
  const m = map.value
  if (!m || !m.getSource(TILE_GRID_SOURCE)) return
  ;(m.getSource(TILE_GRID_SOURCE) as maplibregl.GeoJSONSource).setData(
    buildTileGridGeoJSON(activeReviewSheet.value) as any
  )
  zoomToActiveTile()
}

function removeTileGridFromMap() {
  const m = map.value
  if (!m) return
  TILE_GRID_LAYERS.forEach((id) => { if (m.getLayer(id)) m.removeLayer(id) })
  if (m.getSource(TILE_GRID_SOURCE)) m.removeSource(TILE_GRID_SOURCE)
}

function zoomToActiveTile() {
  const m = map.value
  const tile = currentTile.value
  if (!m || !tile) return
  const cm = config.value.centralMeridian
  const nw = capeLoToWGS84({ id: 'nw', y: tile.minY, x: tile.maxX } as CapeLoPoint, cm)
  const se = capeLoToWGS84({ id: 'se', y: tile.maxY, x: tile.minX } as CapeLoPoint, cm)
  m.fitBounds(
    [[Math.min(nw.lng, se.lng), Math.min(nw.lat, se.lat)],
     [Math.max(nw.lng, se.lng), Math.max(nw.lat, se.lat)]],
    { padding: 60, duration: 500 }
  )
}

// Watch active sheet tab — update highlighting, zoom, and sub-figure layer
watch(activeReviewSheet, () => {
  if (showSheetReview.value) {
    updateTileGridHighlight()
    updateSubFigureLayer()
  }
})

// =====================================================================
// SUB-FIGURE MAP LAYER — shows the clipped outside figure for the active tile
// =====================================================================

const SUB_FIGURE_SOURCE = 'sub-figure-source'
const SUB_FIGURE_LAYERS = ['sub-figure-fill', 'sub-figure-outline', 'sub-figure-verts']

/**
 * Convert a vertex array to WGS84 using the component's capeLoToWGS84 helper.
 */
function ofdVertsToWGS84Ring(verts: OfdVertex[]): number[][] {
  return vertsToWGS84Ring(verts, (y, x) => {
    const result = capeLoToWGS84({ id: 'v', y, x } as CapeLoPoint, config.value.centralMeridian)
    return { lng: result.lng, lat: result.lat }
  })
}

/**
 * Build the GeoJSON for the sub-figure layer:
 *  - One polygon feature for the clipped area
 *  - One point feature per vertex (for the dot overlay)
 */
function buildSubFigureGeoJSON() {
  const sheet = activeSheetOfd.value
  if (!sheet || sheet.vertices.length < 3) {
    return { type: 'FeatureCollection', features: [] as any[] }
  }
  const ring = ofdVertsToWGS84Ring(sheet.vertices)
  const features: any[] = [
    {
      type: 'Feature',
      properties: { kind: 'polygon' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
    ...sheet.vertices.map((v, i) => {
      const { lng, lat } = capeLoToWGS84({ id: v.id, y: v.y, x: v.x } as CapeLoPoint, config.value.centralMeridian)
      return {
        type: 'Feature',
        properties: { kind: 'vertex', type: v.type, pointId: v.pointId, index: i },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      }
    }),
  ]
  return { type: 'FeatureCollection', features }
}

function addSubFigureToMap() {
  const m = map.value
  if (!m) return
  const geojson = buildSubFigureGeoJSON()
  if (m.getSource(SUB_FIGURE_SOURCE)) {
    ;(m.getSource(SUB_FIGURE_SOURCE) as maplibregl.GeoJSONSource).setData(geojson as any)
    return
  }
  m.addSource(SUB_FIGURE_SOURCE, { type: 'geojson', data: geojson as any })

  // Translucent green fill for the sub-figure area
  m.addLayer({
    id: 'sub-figure-fill',
    type: 'fill',
    source: SUB_FIGURE_SOURCE,
    filter: ['==', ['get', 'kind'], 'polygon'],
    paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.12 },
  })

  // Solid green outline
  m.addLayer({
    id: 'sub-figure-outline',
    type: 'line',
    source: SUB_FIGURE_SOURCE,
    filter: ['==', ['get', 'kind'], 'polygon'],
    paint: { 'line-color': '#16a34a', 'line-width': 2.5, 'line-opacity': 0.9 },
  })

  // Vertex dots: survey points = filled green circles, clip points = hollow orange
  m.addLayer({
    id: 'sub-figure-verts',
    type: 'circle',
    source: SUB_FIGURE_SOURCE,
    filter: ['==', ['get', 'kind'], 'vertex'],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'type'], 'clip'], 5, 6],
      'circle-color': ['case', ['==', ['get', 'type'], 'clip'], '#f97316', '#16a34a'],
      'circle-stroke-width': 2,
      'circle-stroke-color': 'white',
      'circle-opacity': 0.95,
    },
  })
}

function updateSubFigureLayer() {
  const m = map.value
  if (!m) return
  if (!m.getSource(SUB_FIGURE_SOURCE)) {
    addSubFigureToMap()
    return
  }
  ;(m.getSource(SUB_FIGURE_SOURCE) as maplibregl.GeoJSONSource).setData(
    buildSubFigureGeoJSON() as any,
  )
}

function removeSubFigureFromMap() {
  const m = map.value
  if (!m) return
  SUB_FIGURE_LAYERS.forEach(id => { if (m.getLayer(id)) m.removeLayer(id) })
  if (m.getSource(SUB_FIGURE_SOURCE)) m.removeSource(SUB_FIGURE_SOURCE)
}

// Helper: Format coordinate with + prefix and 2 decimal places
function formatCoordinate(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

// Helper: Format coordinate with + prefix (alias for template compatibility)
function formatCoordinateWithSign(value: number): string {
  const sign = value >= 0 ? '+ ' : '- '
  return `${sign}${Math.abs(value).toFixed(2)}`
}

// Lifecycle
onMounted(async () => {
  console.log('[SurveyPlanMap] 🚀 Component mounted')
  console.log('[SurveyPlanMap] Props:', {
    projectId: props.projectId,
    projectInfo: props.projectInfo
  })
  console.log('[SurveyPlanMap] Map container ref:', mapContainer.value)
  
  if (!props.projectId) {
    console.error('[SurveyPlanMap] ❌ No project ID provided!')
    return
  }
  
  if (!mapContainer.value) {
    console.error('[SurveyPlanMap] ❌ Map container not found!')
    return
  }
  
  // Check GeoPDF availability
  try {
    const status = await checkGeoPDFAvailability()
    geoPDFAvailable.value = status.available
    geoPDFStatus.value = status
    console.log('[SurveyPlanMap] 🌍 GeoPDF status:', status)
  } catch (error) {
    console.warn('[SurveyPlanMap] ⚠️ Could not check GeoPDF availability:', error)
    geoPDFAvailable.value = false
    geoPDFStatus.value = { available: false, message: 'GeoPDF service unavailable' }
  }
  
  loadData()
  loadSideAnnotations()

})

onUnmounted(() => {
  console.log('[SurveyPlanMap] 🔚 Component unmounting')
  if (map.value) {
    map.value.remove()
  }
})
</script>

<style scoped>
.survey-plan-map-container {
  display: grid;
  grid-template-columns: 1fr 300px;
  grid-template-rows: 1fr auto;
  height: calc(100vh - 200px);
  gap: 1rem;
  transition: grid-template-columns 0.3s ease;
}

.survey-plan-map-container.panel-collapsed {
  grid-template-columns: 1fr 0px;
  gap: 0;
}

.config-panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow-y: auto;
}

.config-header {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.collapse-btn {
  background: #f3f4f6;
  border: none;
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 1rem;
  color: #6b7280;
  transition: all 0.2s;
}

.collapse-btn:hover {
  background: #e5e7eb;
  color: #374151;
}

.expand-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1000;
  background: white;
  border: 2px solid #4f46e5;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: #4f46e5;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.expand-btn:hover {
  background: #4f46e5;
  color: white;
  transform: translateX(-2px);
  box-shadow: 0 6px 8px rgba(0,0,0,0.15);
}

.config-content {
  padding: 1rem;
}

.config-group {
  margin-bottom: 1rem;
}

.config-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.25rem;
}

.config-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.875rem;
}

.paper-size-display {
  padding: 0.5rem;
  background: #f3f4f6;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.export-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 2px solid #e5e7eb;
}

.export-header {
  margin-bottom: 1rem;
}

.export-header .config-label {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.export-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.btn-export {
  padding: 0.75rem;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-professional {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  padding: 1rem;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.2);
}

.btn-professional:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
}

.btn-geopdf {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  font-weight: 600;
  padding: 1rem;
  box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);
}

.btn-geopdf:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(16, 185, 129, 0.3);
}

.btn-geopdf:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  opacity: 0.5;
}

.btn-optimize {
  background: #f59e0b;
  color: white;
}

.btn-optimize:hover:not(:disabled) {
  background: #d97706;
}

.btn-pdf {
  background: #ef4444;
  color: white;
}

.btn-pdf:hover:not(:disabled) {
  background: #dc2626;
}

.btn-dxf {
  background: #3b82f6;
  color: white;
}

.btn-dxf:hover:not(:disabled) {
  background: #2563eb;
}

.btn-png {
  background: #10b981;
  color: white;
}

.btn-png:hover:not(:disabled) {
  background: #059669;
}

.btn-summary {
  background: #8b5cf6;
  color: white;
}

.btn-summary:hover:not(:disabled) {
  background: #7c3aed;
}

.btn-export:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.map-canvas-container {
  position: relative;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
  min-height: 600px;
}

.map-canvas {
  width: 100%;
  height: 100%;
  min-height: 600px;
}








































/* SI 727 Schedule of Areas Table */
.schedule-table-si727 {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Arial', sans-serif;
  font-size: 11px;
  background: white;
}

.schedule-table-si727 th,
.schedule-table-si727 td {
  border: 1px solid #000;
  padding: 4px 6px;
  text-align: center;
  vertical-align: middle;
  line-height: 1.3;
}

/* Header cells */
.schedule-table-si727 thead th {
  font-weight: bold;
  font-size: 10px;
  background: white;
}

/* Column widths */
.schedule-table-si727 .stand-col {
  width: 60px;
}

.schedule-table-si727 .area-col {
  width: 80px;
}

.schedule-table-si727 .diagram-col {
  width: 70px;
}

.schedule-table-si727 .deed-header {
  font-weight: bold;
}

.schedule-table-si727 .deed-number-col {
  width: 70px;
}

.schedule-table-si727 .deed-date-col {
  width: 70px;
}

.schedule-table-si727 .surveyor-col {
  width: 80px;
}

/* Body cells */
.schedule-table-si727 tbody td {
  font-size: 11px;
  padding: 2px 4px;
}

.schedule-table-si727 .stand-cell {
  text-align: center;
  font-weight: 500;
}

.schedule-table-si727 .area-cell {
  text-align: center;
}

/* Old schedule table (keep for compatibility) */
.schedule-table {
  width: 100%;
  font-size: 0.75rem;
}

.schedule-table th,
.schedule-table td {
  padding: 0.25rem;
  text-align: right;
}

.schedule-table th:first-child,
.schedule-table td:first-child {
  text-align: left;
}

.schedule-table thead {
  border-bottom: 1px solid #e5e7eb;
}

.schedule-table tfoot {
  border-top: 1px solid #e5e7eb;
  font-weight: 600;
}

.stand-cell {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.stand-number {
  font-weight: 600;
  color: #111827;
}

.stand-desc {
  font-size: 0.625rem;
  color: #6b7280;
  font-style: italic;
}

.area-value {
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
}

/* ⭐ Outside Figure Data Table */
.outside-figure-data {
  background: white;
  border: 2px solid #000;
  max-width: 600px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.outside-figure-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Arial', sans-serif;
  font-size: 8px;
}

.outside-figure-table th,
.outside-figure-table td {
  border: 1px solid #000;
  padding: 2px 4px;
  text-align: center;
  vertical-align: middle;
}

/* Header styling */
.outside-figure-table .section-header {
  font-weight: bold;
  font-size: 9px;
  background: white;
  padding: 4px;
}

/* Column widths - DYNAMIC to avoid wrapping */
.outside-figure-table .col-sides {
  white-space: nowrap;
  font-weight: bold;
}

.outside-figure-table .col-metres {
  white-space: nowrap;
}

.outside-figure-table .col-direction {
  white-space: nowrap;
}

.outside-figure-table .col-constants {
  white-space: nowrap;
}

.outside-figure-table .col-y,
.outside-figure-table .col-x {
  white-space: nowrap;
}

/* Body cells */
.outside-figure-table .constants-row {
  background: #f9f9f9;
}

.outside-figure-table .constants-cell {
  font-weight: bold;
  text-align: center;
}

.outside-figure-table .side-cell {
  font-weight: 600;
  font-size: 8px;
  white-space: nowrap;
}

.outside-figure-table .distance-cell,
.outside-figure-table .coord-cell {
  font-family: 'Courier New', monospace;
  font-size: 7px;
  text-align: right;
  padding-right: 6px;
  white-space: nowrap;
}

.outside-figure-table .direction-cell {
  font-family: 'Courier New', monospace;
  font-size: 7px;
  white-space: nowrap;
}

.outside-figure-table .point-cell {
  font-weight: 600;
  font-size: 8px;
  white-space: nowrap;
}

/* Utility class for no-wrap */
.outside-figure-table .nowrap {
  white-space: nowrap;
}

.map-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.control-btn {
  width: 40px;
  height: 40px;
  background: white;
  border: none;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  cursor: pointer;
  font-size: 1.25rem;
  transition: all 0.2s;
}

.control-btn:hover {
  background: #f3f4f6;
}

.status-bar {
  grid-column: 1 / -1;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 0.75rem 1rem;
  display: flex;
  gap: 2rem;
}

.status-item {
  display: flex;
  gap: 0.5rem;
}

.status-label {
  font-weight: 500;
  color: #6b7280;
}

.status-value {
  color: #111827;
  font-weight: 600;
}








/* SI 727 Label Density Warning Banner */
.label-warning {
  margin: 1rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.label-warning.warning-moderate {
  background: #fef3c7;
  border: 2px solid #fbbf24;
}

.label-warning.warning-high {
  background: #fed7aa;
  border: 2px solid #f97316;
}

.label-warning.warning-critical {
  background: #fecaca;
  border: 2px solid #ef4444;
}

.label-warning.warning-success {
  background: #d1fae5;
  border: 2px solid #10b981;
}

.label-warning .warning-icon {
  font-size: 2rem;
  line-height: 1;
}

.label-warning .warning-content {
  flex: 1;
}

.label-warning .warning-title {
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 0.25rem;
  color: #1f2937;
}

.label-warning .warning-message {
  font-size: 0.875rem;
  color: #374151;
  margin-bottom: 0.5rem;
}

.label-warning .warning-details {
  font-size: 0.75rem;
  color: #6b7280;
  font-family: 'Courier New', monospace;
}

.label-warning .warning-action {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 4px;
  font-size: 0.875rem;
  color: #1f2937;
}

.label-warning.warning-critical .warning-action {
  background: rgba(255, 255, 255, 0.9);
  border-left: 4px solid #ef4444;
}

/* ⭐ WYSIWYG LAYOUT EDITOR STYLES */





/* Shared row styles */



/* =====================================================================
   OUTSIDE FIGURE DATA — sidebar panel styles
   ===================================================================== */
.ofd-multisheet-badge {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 11px;
  color: #92400e;
  margin-bottom: 6px;
}
.ofd-multisheet-icon { font-size: 14px; flex-shrink: 0; }
.ofd-coord-system {
  font-size: 10px;
  color: #6b7280;
  margin-bottom: 4px;
}
.ofd-constants-row {
  font-size: 10px;
  color: #374151;
  margin-bottom: 4px;
}
.ofd-label { font-weight: 600; }
.ofd-table-wrapper {
  overflow-x: auto;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
.ofd-sidebar-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5px;
  font-family: monospace;
}
.ofd-sidebar-table th {
  background: #1e3a5f;
  color: white;
  padding: 3px 4px;
  text-align: center;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
.ofd-sidebar-table td {
  padding: 2px 4px;
  border-bottom: 1px solid #f3f4f6;
  text-align: right;
  white-space: nowrap;
}
.ofd-sidebar-table td:first-child { text-align: left; }
.ofd-sidebar-table tr:nth-child(even) td { background: #f8fafc; }
.ofd-no-data {
  font-size: 11px;
  color: #6b7280;
  font-style: italic;
  padding: 4px 0;
}
.ofd-review-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 9px 12px;
  margin-bottom: 8px;
  background: #1e3a5f;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.ofd-review-btn:hover { background: #2d5b8e; }
.ofd-review-btn-icon { font-size: 14px; }
.ofd-review-btn-arrow { margin-left: auto; opacity: 0.7; }


/* =====================================================================
   SHEET REVIEW PANEL — right-side sliding panel so map stays visible
   ===================================================================== */
.sheet-review-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 460px;
  max-width: 100%;
  background: white;
  box-shadow: -6px 0 32px rgba(0, 0, 0, 0.25);
  z-index: 3000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 3px solid #1e3a5f;
}

/* Header */
.sr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: #1e3a5f;
  color: white;
  flex-shrink: 0;
}
.sr-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}
.sr-icon { font-size: 18px; }
.sr-subtitle {
  font-size: 11px;
  font-weight: 400;
  color: #93c5fd;
  margin-left: 4px;
}
.sr-close {
  background: rgba(255,255,255,0.15);
  border: none;
  color: white;
  width: 28px; height: 28px;
  border-radius: 50%;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.sr-close:hover { background: rgba(255,255,255,0.3); }

/* Map hint bar */
.sr-map-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: #eff6ff;
  border-bottom: 1px solid #bfdbfe;
  font-size: 11px;
  color: #1e40af;
  flex-shrink: 0;
}
.sr-map-hint-icon { font-size: 14px; }

/* Sheet tabs */
.sr-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.sr-tab {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  background: white;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
  transition: all 0.15s;
}
.sr-tab:hover { border-color: #0369a1; color: #0369a1; }
.sr-tab.sr-tab-active {
  background: #0369a1;
  border-color: #0369a1;
  color: white;
  font-weight: 600;
}

/* Sheet info strip */
.sr-sheet-info {
  padding: 8px 16px;
  background: #eff6ff;
  border-bottom: 1px solid #bfdbfe;
  flex-shrink: 0;
}
.sr-info-row {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #1e40af;
  margin-bottom: 2px;
}
.sr-info-label { font-weight: 600; white-space: nowrap; }
.sr-info-val { color: #374151; }

/* Table */
.sr-table-wrapper {
  overflow: auto;
  flex: 1;
  padding: 12px 16px;
}
.sr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  font-family: monospace;
}
.sr-table th {
  background: #1e3a5f;
  color: white;
  padding: 5px 8px;
  text-align: center;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
.sr-table td {
  padding: 4px 8px;
  border-bottom: 1px solid #f3f4f6;
  text-align: right;
  white-space: nowrap;
}
.sr-table td:first-child { text-align: left; }
.sr-table tr:nth-child(even) td { background: #f8fafc; }
.sr-placeholder-row td { color: #9ca3af; font-size: 10px; }
.sr-no-edges {
  padding: 24px;
  text-align: center;
  color: #6b7280;
  font-size: 12px;
  font-style: italic;
}

/* Actions */
.sr-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  background: #f8fafc;
  flex-shrink: 0;
}
.sr-actions-spacer { flex: 1; }
.sr-hint { font-size: 11px; color: #6b7280; }
.sr-btn-back {
  padding: 7px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: #374151;
  transition: all 0.15s;
}
.sr-btn-back:hover { border-color: #6b7280; }
.sr-btn-confirm {
  padding: 7px 20px;
  background: #16a34a;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.sr-btn-confirm:hover:not(:disabled) { background: #15803d; }
.sr-btn-confirm:disabled { background: #6b7280; cursor: not-allowed; opacity: 0.6; }

/* ── Edited / auto badges ──────────────────────────────── */
.sr-edited-badge {
  margin-left: 6px;
  padding: 1px 7px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
}
.sr-auto-badge {
  margin-left: 6px;
  padding: 1px 7px;
  background: #dcfce7;
  color: #166534;
  border-radius: 10px;
  font-size: 10px;
}

/* ── Edit / Reset toolbar ──────────────────────────────── */
.sr-edit-toolbar {
  display: flex;
  gap: 6px;
  padding: 6px 0 8px;
}
.sr-btn-edit {
  padding: 5px 12px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: white;
  font-size: 11.5px;
  cursor: pointer;
  color: #374151;
  transition: all 0.15s;
}
.sr-btn-edit:hover { background: #f0fdf4; border-color: #16a34a; color: #166534; }
.sr-btn-reset {
  padding: 5px 12px;
  border: 1px solid #f59e0b;
  border-radius: 5px;
  background: #fffbeb;
  font-size: 11.5px;
  cursor: pointer;
  color: #92400e;
  transition: all 0.15s;
}
.sr-btn-reset:hover { background: #fef3c7; }
.sr-btn-reset-all {
  padding: 5px 11px;
  border: 1px solid #f59e0b;
  border-radius: 5px;
  background: #fffbeb;
  font-size: 11px;
  cursor: pointer;
  color: #92400e;
}
.sr-btn-reset-all:hover { background: #fef3c7; }

/* Clip-generated row highlight */
.sr-row-clip td { background: #fff7ed !important; color: #7c3b07; }

/* Legend */
.sr-clip-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #6b7280;
  padding: 4px 0 2px;
}
.sr-clip-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #f97316;
  flex-shrink: 0;
}

/* ── EDIT MODE ─────────────────────────────────────────── */
.sr-edit-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
.sr-edit-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 14px 6px;
  background: #f0fdf4;
  border-bottom: 1px solid #bbf7d0;
  flex-shrink: 0;
  font-size: 12px;
  color: #166534;
}
.sr-edit-hint { font-size: 10px; color: #6b7280; }

.sr-vert-list {
  overflow-y: auto;
  flex: 1;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sr-vert-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 5px;
  border: 1px solid transparent;
  font-size: 11px;
}
.sr-vert-survey { background: #f0fdf4; border-color: #bbf7d0; }
.sr-vert-clip   { background: #fff7ed; border-color: #fed7aa; }

.sr-vert-num {
  width: 18px;
  text-align: right;
  color: #9ca3af;
  flex-shrink: 0;
  font-size: 10px;
}
.sr-vert-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
  flex-shrink: 0;
  text-transform: uppercase;
}
.badge-survey { background: #dcfce7; color: #166534; }
.badge-clip   { background: #fed7aa; color: #7c3b07; }

.sr-vert-name {
  width: 68px;
  padding: 2px 5px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  font-size: 10px;
  font-family: monospace;
  flex-shrink: 0;
}
.sr-vert-coord-label {
  font-size: 9px;
  color: #6b7280;
  flex-shrink: 0;
}
.sr-vert-coord {
  width: 86px;
  padding: 2px 4px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  font-size: 10px;
  font-family: monospace;
  flex-shrink: 0;
}
.sr-vert-btn {
  width: 22px; height: 22px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  background: white;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  padding: 0;
}
.sr-vert-btn:hover:not(:disabled) { background: #f3f4f6; }
.sr-vert-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.sr-vert-del { color: #dc2626; border-color: #fca5a5; }
.sr-vert-del:hover:not(:disabled) { background: #fef2f2; }
.sr-vert-ins { color: #16a34a; border-color: #86efac; }
.sr-vert-ins:hover { background: #f0fdf4; }

.sr-edit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid #e5e7eb;
  background: #f8fafc;
  flex-shrink: 0;
}
.sr-btn-cancel-edit {
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: white;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
}
.sr-btn-cancel-edit:hover { background: #f3f4f6; }
.sr-btn-save-edit {
  padding: 6px 16px;
  background: #16a34a;
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.sr-btn-save-edit:hover { background: #15803d; }
.sr-propagate-hint {
  font-size: 10px;
  color: #6b7280;
  font-style: italic;
  flex: 1;
  text-align: right;
}
.layer-controls-sidebar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.layer-sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}
.layer-sidebar-item input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.layer-controls-sidebar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.layer-sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}
.layer-sidebar-item input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.side-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.side-modal {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  min-width: 260px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}
.side-modal-title { font-weight: 600; font-size: 14px; }
.side-modal label { display: flex; flex-direction: column; gap: 3px; }
.side-modal select, .side-modal input { padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; }
.side-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
.side-modal button { cursor: pointer; padding: 5px 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; }
.side-modal .btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }

</style>
