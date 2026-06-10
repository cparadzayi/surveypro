<template>
  <div class="h-screen flex flex-col bg-gray-50 relative">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4 z-20 relative">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-gray-900">📐 Area Computation & Consistency</h2>
          <p class="text-sm text-gray-600 mt-1">🛰️ Satellite overlay with interactive parcel digitizing</p>
        </div>
        <!-- Auto-save indicator -->
        <div class="flex items-center gap-3">
          <div v-if="isSaving" class="text-xs text-blue-600 flex items-center gap-1">
            <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
            <span>Auto-saving...</span>
          </div>
          <div v-else-if="lastSaved" class="text-xs text-green-600">
            ✅ Last saved: {{ formatTime(lastSaved) }}
          </div>
          <div v-if="savedParcels.size > 0" class="text-xs text-gray-500">
            💾 {{ savedParcels.size }} parcel(s) in database
          </div>
        </div>
      </div>

      <!-- Toolbar row -->
      <div class="flex flex-wrap items-center gap-2 mt-3">
        <!-- Edit Point Names toggle -->
        <button
          @click="showRenamePanel = !showRenamePanel; console.log('[PointRename] toggled. surveyPegPoints:', surveyPegPoints.length, 'adjustedCoords:', workflowState?.adjustedCoordinates?.length)"
          :class="[
            'flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
            showRenamePanel
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
          ]"
          :title="showRenamePanel ? 'Hide point name editor' : 'Edit imported point names before digitizing'"
        >
          ✏️ {{ showRenamePanel ? 'Hide' : 'Edit Point Names' }}
          <span class="ml-1 text-xs opacity-75">({{ surveyPegPoints.length }})</span>
        </button>
        <!-- Repair button: fixes stale beacon names in saved parcels after rename -->
        <button
          @click="repairParcelBeaconNames"
          :disabled="isRecomputing"
          class="flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors border bg-white text-amber-700 border-amber-300 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Re-match parcel beacon names to current coordinate point names. Use after renaming beacons that were already digitized into parcels."
        >
          🔧 Repair Beacon Names
        </button>
        <!-- Auto-calculation info banner -->
        <div class="flex-1 min-w-0 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-800">
          <span class="font-semibold">⚡ Auto-calculation enabled:</span>
          <span class="ml-1">Areas, perimeters, and centroids are automatically computed from geometry when parcels are saved.</span>
        </div>
      </div>


      <div
        v-if="overlapMessage"
        class="absolute top-4 left-1/2 transform -translate-x-1/2 mt-28 bg-red-50 border border-red-300 text-red-800 px-4 py-2 rounded-md shadow-lg z-30 max-w-xl text-sm flex items-center gap-3"
      >
        <div class="flex-1 flex items-center gap-2">
          <span class="font-semibold">Parcel overlap detected:</span>
          <span>{{ overlapMessage }}</span>
        </div>
        <button
          type="button"
          @click="dismissOverlapWarning"
          class="text-xs px-2 py-1 rounded border border-red-300 bg-white text-red-700 hover:bg-red-100 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>

    <!-- Point Rename Panel (in-flow, between header and map) -->
    <div v-if="showRenamePanel" class="bg-white border-b border-gray-200 px-4 py-3 overflow-y-auto" style="max-height: 380px; flex-shrink: 0;">
      <div v-if="surveyPegPoints.length === 0" class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        ⚠️ No survey points available. Complete Calculations Part 1 first to load coordinate points.
      </div>
      <PointRenamePanel
        v-else
        :points="surveyPegPoints"
        :edit-handler="editPanelHandler"
        :delete-handler="deletePanelHandler"
        @close="showRenamePanel = false"
        @edit-complete="(payload) => handleRenameComplete(payload.patch?.name ? [{ oldName: payload.oldName, newName: payload.patch.name }] : [])"
      />
    </div>

    <!-- Map Container -->
    <div class="flex-1 relative bg-gray-200">
      <div ref="mapContainer" class="absolute inset-0 w-full h-full"></div>
      
      <!-- Loading Overlay -->
      <div v-if="isLoading" class="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p class="text-gray-700 font-medium">Transforming coordinates...</p>
          <p class="text-sm text-gray-500">Converting {{ coordinatePoints.length }} points to WGS84</p>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-2 flex flex-col gap-2 z-10">
        <!-- Drawing Controls -->
        <button
          v-if="!isDrawing"
          @click="startDrawing"
          class="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-md text-sm font-medium transition-all hover:from-green-700 hover:to-green-800 shadow-md"
          title="Start polygon drawing"
        >
          ✏️ Start Drawing
        </button>
        
        <!-- Normal drawing controls -->
        <div v-if="isDrawing && !isEditingVertices" class="flex flex-col gap-2 border-t border-gray-200 pt-2">
          <button
            @click="undoLastPoint"
            :disabled="selectedPoints.length === 0"
            class="px-4 py-2 bg-yellow-600 text-white rounded-md text-sm font-medium transition-colors hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Remove last point"
          >
            ↩️ Undo ({{ selectedPoints.length }})
          </button>
          
          <button
            @click="completePolygon"
            :disabled="selectedPoints.length < 3"
            class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Complete polygon (or press ESC)"
          >
            ✅ Complete
          </button>
          
          <button
            @click="cancelDrawing"
            class="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium transition-colors hover:bg-red-700"
            title="Cancel drawing"
          >
            ❌ Cancel
          </button>
        </div>

        <!-- Vertex-editing controls (edit existing parcel geometry) -->
        <div v-if="isEditingVertices" class="flex flex-col gap-2 border-t border-gray-200 pt-2">
          <div class="px-2 py-1 bg-orange-100 border border-orange-300 rounded text-xs text-orange-800 font-semibold text-center">
            ✏️ Editing: {{ editingParcelDesignation }}
          </div>
          <p class="text-xs text-gray-500 px-1">
            <span v-if="insertAfterIndex === null">Click a beacon on the map to <strong>append</strong> it, or press ➕ to <strong>insert after</strong> a specific vertex.</span>
            <span v-else class="text-orange-700 font-semibold">⬇️ Click a beacon to insert after vertex {{ insertAfterIndex + 1 }} ({{ selectedPoints[insertAfterIndex]?.id }})</span>
          </p>
          <div class="max-h-48 overflow-y-auto border border-gray-200 rounded p-1 bg-gray-50">
            <template v-for="(pt, idx) in selectedPoints" :key="pt.id + '-' + idx">
              <!-- Vertex row -->
              <div
                :class="[
                  'flex items-center justify-between text-xs rounded px-2 py-0.5',
                  insertAfterIndex === idx
                    ? 'bg-orange-100 border border-orange-400'
                    : 'bg-white border border-gray-200'
                ]"
              >
                <span class="font-mono text-gray-800">{{ idx + 1 }}. {{ pt.id }}</span>
                <div class="flex items-center gap-1 ml-2">
                  <!-- Insert-after toggle -->
                  <button
                    @click="setInsertAfter(idx)"
                    :class="[
                      'font-bold leading-none transition-colors',
                      insertAfterIndex === idx
                        ? 'text-orange-600 hover:text-orange-800'
                        : 'text-green-500 hover:text-green-700'
                    ]"
                    :title="insertAfterIndex === idx ? 'Cancel insert mode' : `Insert new vertex after ${pt.id}`"
                  >{{ insertAfterIndex === idx ? '✕ins' : '➕' }}</button>
                  <!-- Remove vertex -->
                  <button
                    @click="removeVertexByIndex(idx)"
                    :disabled="selectedPoints.length <= 3"
                    class="text-red-500 hover:text-red-700 disabled:opacity-30 font-bold leading-none"
                    title="Remove this vertex"
                  >✕</button>
                </div>
              </div>
              <!-- Insert-here indicator -->
              <div
                v-show="insertAfterIndex === idx"
                class="text-center text-xs text-orange-600 font-semibold py-0.5 bg-orange-50 border-x border-orange-200"
              >⬇ next click inserts here ⬇</div>
            </template>
          </div>
          <button
            @click="commitVertexEdit"
            :disabled="selectedPoints.length < 3 || isComputing"
            class="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save vertex changes"
          >
            <span v-if="isComputing" class="inline-block animate-spin mr-1">⏳</span>
            💾 Save Changes ({{ selectedPoints.length }} pts)
          </button>
          <button
            @click="cancelVertexEdit"
            class="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium transition-colors hover:bg-red-700"
            title="Cancel without saving"
          >
            ❌ Cancel Edit
          </button>
        </div>

        <div class="border-t border-gray-200 pt-2"></div>
        
        <!-- AI Detection Button -->
        <button
          v-if="!isDrawing"
          @click="showAIPanel = !showAIPanel"
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            showAIPanel ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          ]"
          title="AI Parcel Detection"
        >
          🤖 AI Detect
        </button>
        
        <button
          @click="toggleLabels"
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            showLabels ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          ]"
          title="Toggle point labels"
        >
          🏷️ Labels
        </button>
        
        <button
          @click="fitToPoints"
          class="px-4 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md text-sm font-medium transition-colors"
          title="Fit view to all points"
        >
          🎯 Fit View
        </button>
        
        <button
          @click="refreshParcelsFromDatabase"
          class="px-4 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md text-sm font-medium transition-colors"
          title="Reload parcels from database"
        >
          🔄 Refresh
        </button>
        
        <button
          v-if="!isDrawing"
          @click="openAddBeaconModal"
          class="px-4 py-2 bg-teal-600 text-white hover:bg-teal-700 rounded-md text-sm font-medium transition-colors"
          title="Add a new survey beacon (Cape Lo coordinates)"
        >
          ➕ Add Beacon
        </button>

        <button
          @click="recomputeAllParcels"
          :disabled="isRecomputing || savedParcels.size === 0"
          class="px-4 py-2 bg-orange-600 text-white hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors"
          title="Recompute all parcels with latest backend code (includes banker's rounding)"
        >
          {{ isRecomputing ? '⏳ Recomputing...' : '🔧 Recompute All' }}
        </button>
        
        <button
          v-if="trigBeacons.length > 0"
          @click="showTrigInset = !showTrigInset"
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            showTrigInset ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          ]"
          title="Toggle trig beacon inset"
        >
          🔺 Trigs ({{ trigBeacons.length }})
        </button>
        
        <button
          @click="toggleSatellite"
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            satelliteVisible ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          ]"
          title="Toggle satellite imagery"
        >
          {{ satelliteVisible ? '🛰️ Satellite ON' : '🗺️ Satellite OFF' }}
        </button>
      </div>

      <!-- Trig Beacon Inset Map -->
      <div v-if="showTrigInset && trigBeacons.length > 0" class="absolute top-4 right-4 bg-white rounded-lg shadow-xl border-2 border-red-500 z-20" style="width: 300px; height: 250px;">
        <div class="bg-gradient-to-r from-red-600 to-red-700 text-white px-3 py-1.5 rounded-t-lg flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-sm">🔺</span>
            <h3 class="font-semibold text-xs">Control Points & Trig Beacons</h3>
          </div>
          <button 
            @click="showTrigInset = false"
            class="text-white hover:bg-red-800 rounded px-1.5 py-0.5 text-xs transition-colors"
          >
            ✕
          </button>
        </div>
        <!-- Mini map container for trig beacons -->
        <div ref="insetMapContainer" class="w-full h-full rounded-b-lg" style="height: calc(100% - 32px);"></div>
      </div>

      <!-- AI Detection Panel -->
      <div v-if="showAIPanel && !isDrawing" class="absolute top-20 left-4 z-30 w-96 max-h-[calc(100vh-200px)] overflow-y-auto">
        <ParcelDetectionPanel
          :coordinates="adjustedCoordinatesForDetection"
          :min-points="3"
          @parcel-selected="handleAIParcelSelected"
          @parcels-detected="handleAIParcelsDetected"
        />
      </div>

      <!-- Drawing Status Bar (bottom, non-obstructive) -->
      <div
        v-if="isDrawing"
        class="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-3 py-1.5 z-30 text-xs"
        :class="isEditingVertices ? 'bg-orange-600/90' : 'bg-gray-900/80'"
      >
        <span class="font-semibold text-white whitespace-nowrap">
          {{ isEditingVertices ? `✏️ Editing: ${editingParcelDesignation}` : '✏️ Drawing' }}
        </span>
        <span class="text-white/70">·</span>
        <span class="text-white/90">
          {{ selectedPoints.length }} pt{{ selectedPoints.length !== 1 ? 's' : '' }} selected
        </span>
        <span class="text-white/50">·</span>
        <span class="text-white/70">
          <template v-if="isEditingVertices && insertAfterIndex !== null">
            Click beacon to insert after <strong class="text-white">{{ selectedPoints[insertAfterIndex]?.id }}</strong>
          </template>
          <template v-else-if="isEditingVertices">Click beacon to append · ➕ to insert at position</template>
          <template v-else>Click pegs to build polygon · click start to close · <kbd class="bg-white/20 px-1 rounded">ESC</kbd> to finish</template>
        </span>
        <span class="flex-1"></span>
        <span v-if="selectedPoints.length < 3" class="text-yellow-300 text-xs">min 3 pts</span>
      </div>

      <!-- Parcel Status Legend -->
      <div :class="['absolute right-4 bg-white rounded-lg shadow-lg p-3 z-20 border-2 border-gray-200', isDrawing ? 'bottom-10' : 'bottom-4']">
        <h3 class="font-semibold text-gray-900 text-xs mb-2">🎨 Parcel Status</h3>
        <div class="space-y-1.5 text-xs">
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded border-2 border-amber-600 bg-amber-400 bg-opacity-30"></div>
            <span class="text-gray-700">📝 Draft</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded border-2 border-blue-700 bg-blue-500 bg-opacity-30"></div>
            <span class="text-gray-700">✅ Finalized</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded border-2 border-green-700 bg-green-500 bg-opacity-30"></div>
            <span class="text-gray-700">🎯 Approved</span>
          </div>
        </div>
        <div class="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600">
          <p class="font-medium">🛡️ Overlap Protection:</p>
          <p class="text-gray-500">All existing parcels checked</p>
        </div>
      </div>

      <!-- Saved Parcels Panel (Database) -->
      <div v-if="savedParcels.size > 0 && parcels.length === 0" class="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-md z-20">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-900 text-sm">💾 Saved Parcels ({{ savedParcels.size }})</h3>
          <button
            @click="refreshParcelsFromDatabase"
            class="px-3 py-1 bg-gray-600 text-white rounded-md text-xs font-medium hover:bg-gray-700 transition-colors"
            title="Refresh from database"
          >
            🔄 Refresh
          </button>
        </div>
        <div class="space-y-2 max-h-64 overflow-y-auto">
          <div 
            v-for="[designation, dbParcel] in Array.from(savedParcels.entries())" 
            :key="dbParcel.id"
            :class="[
              'border-2 rounded-lg p-3',
              dbParcel.status === 'finalized' ? 'border-blue-600 bg-blue-50' :
              dbParcel.status === 'approved' ? 'border-green-600 bg-green-50' :
              'border-amber-500 bg-amber-50'
            ]"
          >
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-semibold text-gray-900 text-sm">{{ designation }}</h4>
              <div class="flex items-center gap-2">
                <span :class="[
                  'text-xs font-bold px-2 py-0.5 rounded',
                  dbParcel.status === 'finalized' ? 'bg-blue-200 text-blue-900' :
                  dbParcel.status === 'approved' ? 'bg-green-200 text-green-900' :
                  'bg-amber-200 text-amber-900'
                ]">
                  {{ dbParcel.status === 'finalized' ? '✅ FINALIZED' : 
                     dbParcel.status === 'approved' ? '🎯 APPROVED' : 
                     '📝 DRAFT' }}
                </span>
                <button
                  @click="startEditingVertices(designation)"
                  :disabled="isDrawing || isEditingVertices"
                  class="text-orange-600 hover:text-orange-800 hover:bg-orange-100 rounded p-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Edit vertices (add/remove beacons)"
                >
                  🔺
                </button>
                <button
                  @click="openParcelRenameModal({ id: dbParcel.id, oldName: designation, source: 'saved' })"
                  class="text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded p-1 transition-colors"
                  title="Rename parcel"
                >
                  ✏️
                </button>
                <button
                  @click="deleteSavedParcel(dbParcel)"
                  class="text-red-600 hover:text-red-800 hover:bg-red-100 rounded p-1 transition-colors"
                  title="Delete parcel from database"
                >
                  🗑️
                </button>
              </div>
            </div>
            
            <div class="text-xs text-gray-700 space-y-1">
              <p><strong>Area:</strong> {{ Number(dbParcel.area_m2 || 0).toFixed(2) }} m² ({{ (Number(dbParcel.area_m2 || 0) / 10000).toFixed(4) }} ha)</p>
              <p v-if="dbParcel.metadata?.points_count"><strong>Points:</strong> {{ dbParcel.metadata.points_count }}</p>
              <p v-if="dbParcel.metadata?.closure_ratio"><strong>Closure Ratio:</strong> {{ dbParcel.metadata.closure_ratio }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Parcels Panel (In-Memory) -->
      <div v-if="parcels.length > 0" class="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-md z-20">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-900 text-sm">📊 Computed Parcels ({{ parcels.length }})</h3>
          <div class="flex gap-2">
            <button
              @click="exportAreaConsistencyPDF"
              class="px-3 py-1 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors"
              title="Export Area & Consistency PDF (SGO Format)"
            >
              📄 PDF
            </button>
            <button
              @click="saveAllParcels"
              class="px-3 py-1 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 transition-colors"
            >
              💾 Save All
            </button>
          </div>
        </div>
        <div class="space-y-2 max-h-64 overflow-y-auto">
          <div 
            v-for="(parcel, idx) in parcels" 
            :key="idx"
            :class="[
              'border-2 rounded-lg p-3',
              parcel.areaResult 
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-gray-50'
            ]"
          >
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-semibold text-gray-900 text-sm">{{ parcel.designation }}</h4>
              <div class="flex items-center gap-2">
                <span v-if="parcel.areaResult" class="text-xs font-bold px-2 py-0.5 rounded bg-blue-200 text-blue-900">
                  ✅ COMPUTED
                </span>
                <span v-else class="text-xs text-gray-500">Computing...</span>
                <button
                  @click="startEditingVertices(parcel.designation)"
                  :disabled="isDrawing || isEditingVertices"
                  class="text-orange-600 hover:text-orange-800 hover:bg-orange-100 rounded p-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Edit vertices (add/remove beacons)"
                >
                  🔺
                </button>
                <button
                  @click="openParcelRenameModal({ id: typeof parcel.id === 'number' ? parcel.id : undefined, oldName: parcel.designation, source: 'memory', parcelRef: parcel })"
                  class="text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded p-1 transition-colors"
                  title="Rename parcel"
                >
                  ✏️
                </button>
                <button
                  @click="deleteParcelConfirm(parcel)"
                  class="text-red-600 hover:text-red-800 hover:bg-red-100 rounded p-1 transition-colors"
                  title="Delete parcel"
                >
                  🗑️
                </button>
              </div>
            </div>
            
            <div v-if="parcel.areaResult" class="text-xs text-gray-700 space-y-1">
              <p><strong>Area:</strong> {{ formatArea(parcel.areaResult.area) }}</p>
              <p><strong>Points:</strong> {{ parcel.points.length }}</p>
              <p><strong>Closure Ratio:</strong> 1:{{ Math.round(calculateClosureRatio(parcel)).toLocaleString() }}</p>
              <p class="text-gray-600 italic">
                <strong>Closure Error:</strong> {{ (Math.sqrt((parcel.areaResult.residuals?.sumDy || 0)**2 + (parcel.areaResult.residuals?.sumDx || 0)**2)).toFixed(3) }}m
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Info Panel -->
      <div class="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-4 max-w-md z-10">
        <h3 class="font-semibold text-gray-900 mb-2">🌍 Coordinate System Info</h3>
        <div class="text-sm text-gray-600 space-y-1">
          <p><strong>Source:</strong> {{ sourceEPSG }} ({{ loZoneDisplay }})</p>
          <p><strong>Display:</strong> EPSG:4326 (WGS84)</p>
          <p><strong>Points:</strong> {{ coordinatePoints.length }} survey points</p>
          <p><strong>Trig Beacons:</strong> <span class="text-red-600 font-semibold">{{ trigBeacons.length }}</span></p>
          <p v-if="parcels.length > 0" class="text-green-700 font-semibold">
            <strong>Parcels:</strong> {{ parcels.length }} computed
          </p>
          <p class="text-xs text-gray-500 mt-2">
            ℹ️ Coordinates transformed once at load - no runtime overhead
          </p>
        </div>
      </div>
    </div>

    <!-- Parcel rename modal -->
    <Teleport to="body">
    <Transition name="map-rename-modal">
      <div
        v-if="parcelRenameModal"
        class="fixed inset-0 flex items-center justify-center"
        style="z-index: 99999;"
        @click.self="parcelRenameModal = null"
        @keydown.escape="parcelRenameModal = null"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <div class="bg-indigo-600 px-5 py-4">
            <h3 class="text-white font-semibold text-base">Rename Land Parcel</h3>
            <p class="text-indigo-200 text-xs mt-0.5">Enter the correct parcel designation</p>
          </div>
          <div class="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-4">
            <div class="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-xs flex-shrink-0 text-center leading-tight px-1">
              {{ parcelRenameModal.oldName }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-gray-500">Current name</p>
              <p class="font-semibold text-gray-900 text-sm truncate">{{ parcelRenameModal.oldName }}</p>
            </div>
          </div>
          <div class="px-5 py-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">New designation</label>
            <input
              ref="parcelRenameInputRef"
              v-model="parcelRenameModal.newName"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              placeholder="e.g. 1735"
              @keydown.enter="confirmParcelRename"
              @keydown.escape="parcelRenameModal = null"
            />
            <p v-if="parcelRenameModal.error" class="mt-2 text-xs text-red-600">{{ parcelRenameModal.error }}</p>
          </div>
          <div class="px-5 pb-5 flex gap-3 justify-end">
            <button
              @click="parcelRenameModal = null"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >Cancel</button>
            <button
              @click="confirmParcelRename"
              :disabled="parcelRenameModal.saving || !parcelRenameModal.newName.trim() || parcelRenameModal.newName.trim() === parcelRenameModal.oldName"
              class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <span v-if="parcelRenameModal.saving" class="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></span>
              {{ parcelRenameModal.saving ? 'Saving...' : 'Rename' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
    </Teleport>

    <!-- Add / Edit Beacon modal -->
    <Teleport to="body">
    <Transition name="map-rename-modal">
      <div
        v-if="beaconModal"
        class="fixed inset-0 flex items-center justify-center"
        style="z-index: 99999;"
        @click.self="beaconModal = null"
        @keydown.escape="beaconModal = null"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <!-- Header -->
          <div class="bg-teal-600 px-5 py-4">
            <h3 class="text-white font-semibold text-base">
              {{ beaconModal.mode === 'add' ? '➕ Add New Beacon' : '✏️ Edit Beacon' }}
            </h3>
            <p class="text-teal-200 text-xs mt-0.5">Cape Lo coordinates (EPSG:22291)</p>
          </div>
          <!-- Fields -->
          <div class="px-5 py-4 space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">Name / ID</label>
              <input
                ref="beaconModalNameRef"
                v-model="beaconModal.name"
                type="text"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="e.g. 1718A"
                @keydown.enter="confirmBeaconSave"
                @keydown.escape="beaconModal = null"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Y — Westing</label>
                <input
                  v-model="beaconModal.y"
                  type="number"
                  step="0.001"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="e.g. 97581.234"
                  @keydown.enter="confirmBeaconSave"
                  @keydown.escape="beaconModal = null"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">X — Southing</label>
                <input
                  v-model="beaconModal.x"
                  type="number"
                  step="0.001"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="e.g. 2247733.456"
                  @keydown.enter="confirmBeaconSave"
                  @keydown.escape="beaconModal = null"
                />
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">Description <span class="text-gray-400">(optional)</span></label>
              <input
                v-model="beaconModal.description"
                type="text"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="e.g. Corner beacon"
                @keydown.enter="confirmBeaconSave"
                @keydown.escape="beaconModal = null"
              />
            </div>
            <p v-if="beaconModal.error" class="text-xs text-red-600">{{ beaconModal.error }}</p>
          </div>
          <!-- Actions -->
          <div class="px-5 pb-5 flex gap-3 justify-end">
            <button
              @click="beaconModal = null"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >Cancel</button>
            <button
              @click="confirmBeaconSave"
              :disabled="beaconModal.saving || !beaconModal.name.trim() || !beaconModal.y || !beaconModal.x"
              class="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <span v-if="beaconModal.saving" class="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></span>
              {{ beaconModal.saving ? 'Saving...' : (beaconModal.mode === 'add' ? 'Add Beacon' : 'Save Changes') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
    </Teleport>

    <!-- Map click-to-rename modal -->
    <Teleport to="body">
    <Transition name="map-rename-modal">
      <div
        v-if="mapRenameModal"
        class="fixed inset-0 flex items-center justify-center"
        style="z-index: 99999;"
        @click.self="closeMapRenameModal"
        @keydown.escape="closeMapRenameModal"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <!-- Header -->
          <div :class="mapRenameModal.conflictPoint ? 'bg-amber-500' : 'bg-blue-600'" class="px-5 py-4">
            <h3 class="text-white font-semibold text-base">
              {{ mapRenameModal.conflictPoint ? 'Name Conflict' : 'Rename Survey Point' }}
            </h3>
            <p class="text-white/70 text-xs mt-0.5">{{ mapRenameModal.lngLat }}</p>
          </div>

          <!-- ── Normal rename view ── -->
          <template v-if="!mapRenameModal.conflictPoint">
            <!-- Point badge -->
            <div class="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-4">
              <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm flex-shrink-0">
                {{ mapRenameModal.status || 'P' }}
              </div>
              <div>
                <p class="font-mono font-bold text-gray-900 text-base">{{ mapRenameModal.pointId }}</p>
                <p class="text-xs text-gray-500 mt-0.5">Click Rename to save, Escape to cancel</p>
              </div>
            </div>
            <!-- Input -->
            <div class="px-5 py-4">
              <label class="block text-xs font-medium text-gray-600 mb-1.5">New name</label>
              <input
                ref="mapRenameInputRef"
                v-model="mapRenameModal.newName"
                @keydown.enter="confirmMapRename"
                @keydown.escape="closeMapRenameModal"
                @input="mapRenameModal.error = ''"
                type="text"
                :class="[
                  'w-full border rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 transition-colors',
                  mapRenameModal.error
                    ? 'border-red-400 bg-red-50 focus:ring-red-400'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                ]"
                :placeholder="mapRenameModal.pointId"
              />
              <p v-if="mapRenameModal.error" class="mt-1.5 text-xs text-red-600">{{ mapRenameModal.error }}</p>
            </div>
            <!-- Actions -->
            <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button
                @click="closeMapRenameModal"
                :disabled="mapRenameModal.saving"
                class="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                @click="confirmMapRename"
                :disabled="mapRenameModal.saving || !mapRenameModal.newName.trim() || mapRenameModal.newName.trim() === mapRenameModal.pointId"
                class="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <span v-if="mapRenameModal.saving" class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                {{ mapRenameModal.saving ? 'Saving...' : 'Rename' }}
              </button>
            </div>
          </template>

          <!-- ── Conflict resolution view ── -->
          <template v-else>
            <div class="px-5 py-4 border-b border-gray-100">
              <p class="text-sm text-gray-700 mb-3">
                A point named <span class="font-mono font-semibold text-gray-900">{{ mapRenameModal.newName }}</span> already exists.
                Choose which one to keep.
              </p>
              <!-- Two-point comparison -->
              <div class="flex gap-3">
                <!-- Existing point (conflicting) -->
                <div class="flex-1 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
                  <p class="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">Existing</p>
                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center font-bold text-amber-700 text-xs flex-shrink-0">
                      {{ mapRenameModal.conflictPoint.status || 'P' }}
                    </div>
                    <p class="font-mono font-bold text-gray-900 text-sm">{{ mapRenameModal.conflictPoint.id }}</p>
                  </div>
                  <p class="text-[11px] text-gray-500 font-mono leading-tight">
                    <template v-if="mapRenameModal.conflictPoint.x || mapRenameModal.conflictPoint.y">
                      Y: {{ mapRenameModal.conflictPoint.y.toFixed(3) }}<br>
                      X: {{ mapRenameModal.conflictPoint.x.toFixed(3) }}
                    </template>
                    <template v-else>Coordinates not in current session</template>
                  </p>
                </div>
                <!-- This point (being renamed) -->
                <div class="flex-1 rounded-lg border-2 border-blue-300 bg-blue-50 p-3">
                  <p class="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1.5">This point</p>
                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center font-bold text-blue-700 text-xs flex-shrink-0">
                      {{ mapRenameModal.status || 'P' }}
                    </div>
                    <p class="font-mono font-bold text-gray-900 text-sm">{{ mapRenameModal.pointId }}</p>
                  </div>
                  <p class="text-[11px] text-gray-500 leading-tight">{{ mapRenameModal.lngLat }}</p>
                </div>
              </div>
            </div>
            <!-- Conflict actions -->
            <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex flex-col gap-2">
              <button
                @click="resolveRenameConflict(true)"
                :disabled="mapRenameModal.saving"
                class="w-full px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <span v-if="mapRenameModal.saving" class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                <template v-else>
                  Delete "{{ mapRenameModal.conflictPoint.id }}" and rename this point
                </template>
                <template v-if="mapRenameModal.saving">Processing...</template>
              </button>
              <button
                @click="resolveRenameConflict(false)"
                :disabled="mapRenameModal.saving"
                class="w-full px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel — keep both points
              </button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
    </Teleport>

    <!-- Affected-parcels confirm modal (destructive point edits/deletes) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="affectedParcelsConfirm"
          class="fixed inset-0 flex items-center justify-center"
          style="z-index: 99999;"
          @click.self="rejectAffectedParcelsConfirm"
        >
          <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
          <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div class="px-5 py-4 bg-amber-500">
              <h3 class="text-white font-semibold text-base">
                {{ affectedParcelsConfirm.intent === 'delete' ? 'Delete this point?' : 'Apply this change?' }}
              </h3>
              <p class="text-amber-100 text-xs mt-0.5">
                Point "{{ affectedParcelsConfirm.pointName }}" is used by {{ affectedParcelsConfirm.parcels.length }} parcel{{ affectedParcelsConfirm.parcels.length === 1 ? '' : 's' }}.
              </p>
            </div>
            <div class="px-5 py-3 max-h-48 overflow-y-auto bg-gray-50">
              <ul class="text-xs text-gray-700 space-y-1 font-mono">
                <li v-for="p in affectedParcelsConfirm.parcels" :key="p.id">
                  &bull; {{ p.stand }} &mdash; {{ p.designation }}
                </li>
              </ul>
            </div>
            <div class="px-5 py-3 text-xs text-gray-600 bg-amber-50 border-t border-amber-100">
              Proceeding will apply the change and re-run parcel computation so the affected parcels pick up the new beacon geometry.
            </div>
            <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button
                @click="rejectAffectedParcelsConfirm"
                class="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                @click="resolveAffectedParcelsConfirm"
                class="px-4 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, inject, computed, watch, defineAsyncComponent, nextTick } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import axios from 'axios';
import { capeLoToWGS84, capeLoArrayToWGS84, calculateWGS84Bounds, geoJsonToCapeLoPoint, type CapeLoPoint } from '../../../utils/coordinateTransform';
import { areaCompute, type AreaComputeResponse } from '../../../services/compute';
import { useAreaCompliance, type AreaType, type Parcel } from '../../../composables/useAreaCompliance';
import { useParcelGeometry } from '../../../composables/useParcelGeometry';
import { useComprehensivePDF } from '../../../composables/useComprehensivePDF';
import { useAreaConsistencyPDF } from '../../../composables/useAreaConsistencyPDF';
import { CalculationsPart1Generator, type SurveyPoint } from '../../../utils/calculations-part1';
import { ComprehensiveDocumentGenerator } from '../../../utils/comprehensive-document';
import { PageAllocationService } from '../../../services/pageAllocation';
import { autoSaveStepProducts } from '../../../services/workflowProductStorage';
import { polygon as turfPolygon, featureCollection } from '@turf/helpers';
import booleanContains from '@turf/boolean-contains';
import intersect from '@turf/intersect';
import area from '@turf/area';
import { listLandParcels, createLandParcel, finalizeLandParcels, deleteLandParcel, updateLandParcel, listCoordinatePoints, renameCoordinatePoint, createCoordinatePoint, updateCoordinatePoint, deleteCoordinatePoint, deleteCoordinatePointByName, type LandParcel, type CoordinatePoint } from '../../../services/spatial';
import { useCadastralWorkflow } from '../../../composables/useCadastralWorkflow';
import api from '../../../services/api';
import { saveDocument } from '../../../services/documentStorage';
import { validateParcel, formatValidationMessage, type ValidationResult } from '../../../services/parcelValidation';
import type { DetectedParcel } from '../../../utils/automatedParcelDetector';
import type { ParcelDetectionResult } from '../../../services/parcelDetection';
import PointRenamePanel from '../../../components/cadastral/PointRenamePanel.vue';

const ParcelDetectionPanel = defineAsyncComponent(() => import('../../../components/ParcelDetectionPanel.vue'));

// Inject workflow state
const workflowState = inject<any>('workflowState');

// Map references
const mapContainer = ref<HTMLDivElement | null>(null);
const insetMapContainer = ref<HTMLDivElement | null>(null);
let map: maplibregl.Map | null = null;
let insetMap: maplibregl.Map | null = null;
const isLoading = ref(true);
const showLabels = ref(true);
const satelliteVisible = ref(false); // Start with OSM - satellite tiles may be blocked
const showTrigInset = ref(true); // Show trig beacon inset by default

// No emits needed - MapLibre is the only viewer

// ── Point Rename ──────────────────────────────────────────────────────────────
const showRenamePanel = ref(false);
const { saveWorkflowState: _saveWorkflowState } = useCadastralWorkflow();

// Live set of point names from DB — fetched on init and kept up-to-date after renames.
// Used for pre-flight duplicate detection so stale in-memory state never causes a missed conflict.
const dbPointNames = ref<Set<string>>(new Set());

// Map of point name → numeric DB row id — used by openEditBeaconModal to pass _dbId.
const dbPointIds = ref<Map<string, number>>(new Map());

async function refreshDbPointNames() {
  const pid = workflowState?.projectInfo?.projectId;
  if (!pid) return;
  try {
    const pts = await listCoordinatePoints(Number(pid));
    dbPointNames.value = new Set(pts.map((p: any) => p.name));
    dbPointIds.value = new Map(pts.map((p: any) => [p.name, p.id]));

    // Reconcile: patch any adjustedCoordinates entries whose pointId no longer matches
    // the DB name for those coordinates (happens when a previous rename save silently failed).
    if (!Array.isArray(workflowState?.adjustedCoordinates) || pts.length === 0) return;

    // Build a coordinate-keyed map: "y_rounded,x_rounded" -> current DB name
    // Round to 2 dp to absorb trivial float differences between DB and in-memory values.
    const coordToName = new Map<string, string>();
    for (const p of pts) {
      const key = `${Number(p.y).toFixed(2)},${Number(p.x).toFixed(2)}`;
      coordToName.set(key, p.name);
    }

    let patched = false;
    const reconciled = workflowState.adjustedCoordinates.map((c: any) => {
      const key = `${Number(c.y).toFixed(2)},${Number(c.x).toFixed(2)}`;
      const dbName = coordToName.get(key);
      const currentId = c.pointId || c.id || c.name;
      if (dbName && dbName !== currentId) {
        console.log(`[Reconcile] Patching stale name: "${currentId}" → "${dbName}"`);
        patched = true;
        return {
          ...c,
          ...(('pointId' in c) && { pointId: dbName }),
          ...(('id' in c) && { id: dbName }),
          ...(('name' in c) && { name: dbName }),
        };
      }
      return c;
    });

    if (patched) {
      workflowState.adjustedCoordinates = reconciled;
      // Persist the corrected coordinates so future reloads are already correct.
      try {
        await api.patch(`/survey-projects/${pid}/workflow`, {
          step: 'calculations-part1',
          action: 'update',
          metadata: {
            adjusted_coordinates: reconciled,
            timestamp: new Date().toISOString()
          }
        });
        console.log('[Reconcile] ✅ Persisted corrected adjusted_coordinates to step_data');
      } catch (e) {
        console.warn('[Reconcile] ⚠️ Could not persist reconciled coordinates:', e);
      }
    }
  } catch {
    // Non-fatal: fall back to in-memory check
  }
}

// Tracked GeoJSON for live map updates — updated immediately on rename
const livePegGeojson = ref<GeoJSON.FeatureCollection | null>(null);
watch(livePegGeojson, (geojson) => {
  if (!geojson || !map) return;
  const src = map.getSource('survey-pegs') as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(geojson);
}, { deep: false });

// Map click-to-rename modal state
const mapRenameModal = ref<{
  pointId: string;
  newName: string;
  status: string;
  lngLat: string;
  error: string;
  saving: boolean;
  conflictPoint?: { id: string; x: number; y: number; status: string } | null;
} | null>(null);
const mapRenameInputRef = ref<HTMLInputElement | null>(null);

// Affected-parcels confirm gate (destructive point edits / deletes)
const affectedParcelsConfirm = ref<{
  pointName: string;
  parcels: Array<{ id: number; stand: string; designation: string }>;
  intent: 'edit' | 'delete';
  resolve: () => void;
  reject: (e: Error) => void;
} | null>(null);

function resolveAffectedParcelsConfirm() {
  const m = affectedParcelsConfirm.value;
  if (!m) return;
  affectedParcelsConfirm.value = null;
  m.resolve();
}

function rejectAffectedParcelsConfirm() {
  const m = affectedParcelsConfirm.value;
  if (!m) return;
  affectedParcelsConfirm.value = null;
  m.reject(new Error('cancelled'));
}

function openMapRenameModal(pointId: string, status: string, lngLat: string) {
  mapRenameModal.value = { pointId, newName: pointId, status, lngLat, error: '', saving: false, conflictPoint: null };
  nextTick(() => { mapRenameInputRef.value?.focus(); mapRenameInputRef.value?.select(); });
}

function closeMapRenameModal() {
  mapRenameModal.value = null;
}

function _findConflictPoint(name: string): { id: string; x: number; y: number; status: string } {
  // Try in-memory first; fall back to a stub so the conflict UI always shows
  const found = coordinatePoints.value.find((p: any) => p.id === name);
  return found
    ? { id: found.id, x: found.x ?? 0, y: found.y ?? 0, status: found.status || 'P' }
    : { id: name, x: 0, y: 0, status: 'P' };
}

async function confirmMapRename() {
  const modal = mapRenameModal.value;
  if (!modal || modal.saving) return;
  const trimmed = modal.newName.trim();
  if (!trimmed || trimmed === modal.pointId) { closeMapRenameModal(); return; }
  if (!trimmed) { modal.error = 'Name cannot be empty'; return; }

  // In-memory duplicate check — also covers memory-only points not yet in DB
  const inMemory = coordinatePoints.value.some((p: any) => p.id !== modal.pointId && p.id === trimmed);
  if (inMemory) {
    modal.conflictPoint = _findConflictPoint(trimmed);
    modal.error = '';
    return;
  }

  modal.saving = true;
  modal.error = '';
  modal.conflictPoint = null;
  try {
    await handlePointRename({ oldName: modal.pointId, newName: trimmed });
    handleRenameComplete([{ oldName: modal.pointId, newName: trimmed }]);
    closeMapRenameModal();
  } catch (e: any) {
    const backendMsg = e?.response?.data?.error;
    if (e?.response?.status === 409) {
      // Always show conflict UI — _findConflictPoint stubs missing points
      modal.conflictPoint = _findConflictPoint(trimmed);
      modal.error = '';
    } else if (e?.response?.status === 404) {
      modal.error = backendMsg || `Point "${modal.pointId}" not found — try reloading`;
    } else {
      modal.error = backendMsg || e?.message || 'Rename failed';
    }
    modal.saving = false;
  }
}

async function resolveRenameConflict(deleteConflicting: boolean) {
  const modal = mapRenameModal.value;
  if (!modal || modal.saving || !modal.conflictPoint) return;
  const trimmed = modal.newName.trim();
  const conflictName = modal.conflictPoint.id;

  if (!deleteConflicting) {
    modal.conflictPoint = null;
    return;
  }

  modal.saving = true;
  const projectId = workflowState?.projectInfo?.projectId;
  try {
    // Delete the conflicting point from DB (404 = memory-only, that's fine)
    try {
      await deleteCoordinatePointByName(Number(projectId), conflictName);
    } catch (dbErr: any) {
      if (dbErr?.response?.status !== 404) throw dbErr;
    }
    // Remove from workflowState
    if (Array.isArray(workflowState?.adjustedCoordinates)) {
      workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.filter((c: any) => {
        const cId = c.id || c.pointId || c.name || c.label;
        return cId !== conflictName;
      });
    }
    dbPointNames.value.delete(conflictName);
    dbPointIds.value.delete(conflictName);

    // Now perform the rename
    await handlePointRename({ oldName: modal.pointId, newName: trimmed });
    handleRenameComplete([{ oldName: modal.pointId, newName: trimmed }]);
    closeMapRenameModal();
  } catch (e: any) {
    modal.conflictPoint = null;
    modal.error = e?.response?.data?.error || e?.message || 'Operation failed';
    modal.saving = false;
  }
}

// ── Parcel rename modal state ─────────────────────────────────────────────────
const parcelRenameModal = ref<{
  id: number | undefined;
  oldName: string;
  newName: string;
  source: 'saved' | 'memory';
  parcelRef?: any;
  error: string;
  saving: boolean;
} | null>(null);
const parcelRenameInputRef = ref<HTMLInputElement | null>(null);

function openParcelRenameModal(opts: { id: number | undefined; oldName: string; source: 'saved' | 'memory'; parcelRef?: any }) {
  parcelRenameModal.value = { ...opts, newName: opts.oldName, error: '', saving: false };
  nextTick(() => { parcelRenameInputRef.value?.focus(); parcelRenameInputRef.value?.select(); });
}

async function confirmParcelRename() {
  const modal = parcelRenameModal.value;
  if (!modal || modal.saving) return;
  const newName = modal.newName.trim();
  if (!newName || newName === modal.oldName) { parcelRenameModal.value = null; return; }

  // Duplicate guard: new name must not already exist in savedParcels or parcels
  const nameExists =
    savedParcels.value.has(newName) ||
    parcels.value.some((p: any) => p.designation === newName);
  if (nameExists) {
    modal.error = `"${newName}" already exists. Each parcel must have a unique designation.`;
    return;
  }

  modal.saving = true;
  modal.error = '';

  try {
    // 1. Persist to DB if we have a DB id
    if (modal.id) {
      await updateLandParcel(modal.id, { stand: newName, designation: newName });
    }

    const oldName = modal.oldName;

    // 2. Update savedParcels map (re-key with new name)
    if (savedParcels.value.has(oldName)) {
      const entry = savedParcels.value.get(oldName)!;
      entry.stand = newName;
      entry.designation = newName;
      savedParcels.value.delete(oldName);
      savedParcels.value.set(newName, entry);
    }

    // 3. Update existingParcelIds map
    if (existingParcelIds.value.has(oldName)) {
      const id = existingParcelIds.value.get(oldName)!;
      existingParcelIds.value.delete(oldName);
      existingParcelIds.value.set(newName, id);
    }

    // 4. Update in-memory parcels array
    const memParcel = modal.parcelRef ?? parcels.value.find((p: any) => p.designation === oldName);
    if (memParcel) {
      memParcel.designation = newName;
    }

    // 5. Refresh map source so the label updates immediately
    const source = map?.getSource('parcels') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      // Rebuild features from savedParcels (same logic as refreshParcelsFromDatabase)
      const features = Array.from(savedParcels.value.values()).map((dbParcel) => {
        const parcelName = dbParcel.designation || dbParcel.stand;
        const areaValue = Math.abs(Number(dbParcel.area_m2 ?? 0));
        const areaDisplay = areaValue >= 10000
          ? `${(areaValue / 10000).toFixed(4)} ha`
          : `${areaValue.toFixed(2)} m²`;
        let geometry = dbParcel.geom || (dbParcel as any).geometry;
        if (typeof geometry === 'string') { try { geometry = JSON.parse(geometry); } catch { return null; } }
        if (geometry?.crs) delete geometry.crs;
        if (geometry?.coordinates) {
          const loZone = workflowState?.projectInfo?.centralMeridian || 31;
          geometry = transformGeometryToWGS84(geometry, loZone);
        }
        return geometry ? {
          type: 'Feature' as const,
          geometry,
          properties: { designation: parcelName, area: areaDisplay, status: dbParcel.status || 'draft' }
        } : null;
      }).filter(Boolean);
      source.setData({ type: 'FeatureCollection', features: features as any });
    }

    console.log(`[ParcelRename] ✅ Renamed "${oldName}" → "${newName}"`);
    parcelRenameModal.value = null;
  } catch (e: any) {
    const backendMsg = e?.response?.data?.error;
    modal.error = backendMsg || e?.message || 'Rename failed';
    modal.saving = false;
  }
}

const surveyPegPoints = computed(() =>
  coordinatePoints.value.filter((p: any) => p.status !== 'TRIG')
);

async function findAffectedParcels(
  pointName: string
): Promise<Array<{ id: number; stand: string; designation: string }>> {
  const projectId = workflowState?.projectInfo?.projectId;
  if (!projectId) return [];
  const parcels = await listLandParcels(Number(projectId));
  const out: Array<{ id: number; stand: string; designation: string }> = [];
  for (const p of parcels) {
    const capeLoPoints: any[] = (p.metadata as any)?.cape_lo_points ?? [];
    if (capeLoPoints.some(v => v?.id === pointName)) {
      out.push({
        id: p.id,
        stand: p.stand,
        designation: (p as any).designation ?? p.stand,
      });
    }
  }
  return out;
}

async function requireAffectedParcelsConfirm(
  pointName: string,
  intent: 'edit' | 'delete'
): Promise<void> {
  const parcels = await findAffectedParcels(pointName);
  if (parcels.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    affectedParcelsConfirm.value = { pointName, parcels, intent, resolve, reject };
  });
}

async function editPanelHandler(
  oldName: string,
  patch: { name?: string; y?: number; x?: number; description?: string }
): Promise<void> {
  // Classify the patch. Description-only is non-destructive: no affected-
  // parcels confirm, no recompute. Anything else (name / y / x) is destructive.
  const onlyDescription =
    patch.description !== undefined
    && patch.name === undefined
    && patch.y === undefined
    && patch.x === undefined;

  if (!onlyDescription) {
    try {
      await requireAffectedParcelsConfirm(oldName, 'edit');
    } catch (e: any) {
      throw new Error('cancelled');
    }
  }

  // Name change goes through the existing rename pipeline (DB + workflow +
  // land_parcels.metadata.cape_lo_points + map labels).
  if (patch.name && patch.name !== oldName) {
    await handlePointRename({ oldName, newName: patch.name });
  }

  // Y / X / description go through PUT /coordinate-points/:id.
  const hasFieldChange = patch.y !== undefined
    || patch.x !== undefined
    || patch.description !== undefined;

  if (hasFieldChange) {
    const currentName = patch.name ?? oldName;

    // Resolve numeric DB id via dbPointIds (with listCoordinatePoints fallback).
    let resolvedDbId = dbPointIds.value.get(currentName);
    if (resolvedDbId === undefined) {
      const projectId = workflowState?.projectInfo?.projectId;
      if (!projectId) {
        throw new Error(`Cannot find point id for "${currentName}": no project loaded`);
      }
      try {
        const all = await listCoordinatePoints(Number(projectId));
        const match = all.find((p: any) => p.name === currentName);
        if (match?.id !== undefined) {
          dbPointIds.value.set(currentName, match.id);
          resolvedDbId = match.id;
        }
      } catch {
        // fall through to throw below
      }
    }
    if (resolvedDbId === undefined) {
      throw new Error(`Cannot find point id for "${currentName}"`);
    }

    const apiPatch: { y?: number; x?: number; description?: string } = {};
    if (patch.y !== undefined)           apiPatch.y = patch.y;
    if (patch.x !== undefined)           apiPatch.x = patch.x;
    if (patch.description !== undefined) apiPatch.description = patch.description;
    await updateCoordinatePoint(resolvedDbId, apiPatch);

    const updateEntry = (entry: any) => {
      if (entry === null || typeof entry !== 'object') return entry;
      const id = entry.pointId ?? entry.id ?? entry.name;
      if (id !== currentName) return entry;
      return {
        ...entry,
        ...(patch.y !== undefined && { y: patch.y }),
        ...(patch.x !== undefined && { x: patch.x }),
        ...(patch.description !== undefined && { description: patch.description }),
      };
    };
    if (Array.isArray(workflowState?.adjustedCoordinates)) {
      workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.map(updateEntry);
    }
    if (Array.isArray(workflowState?.importedPoints)) {
      workflowState.importedPoints = workflowState.importedPoints.map(updateEntry);
    }

    const projectId = workflowState?.projectInfo?.projectId;
    if (projectId) {
      try {
        await api.patch(`/survey-projects/${projectId}/workflow`, {
          step: 'calculations-part1',
          action: 'update',
          metadata: {
            adjusted_coordinates: workflowState.adjustedCoordinates,
            point_edit: { name: currentName, patch: apiPatch, at: new Date().toISOString() },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (e) {
        console.warn('[PointEdit] Could not persist edit to workflow state:', e);
      }
    }
  }

  // Recompute once, at the end, for destructive changes only.
  if (!onlyDescription) {
    await recomputeAllParcels({ skipConfirm: true });
  }
}

async function deletePanelHandler(name: string): Promise<void> {
  try {
    await requireAffectedParcelsConfirm(name, 'delete');
  } catch (e: any) {
    throw new Error('cancelled');
  }

  // ── unchanged Task 3 body: point lookup + deleteCoordinatePoint + workflow sync ──
  let resolvedDbId = dbPointIds.value.get(name);
  if (resolvedDbId === undefined) {
    const projectId = workflowState?.projectInfo?.projectId;
    if (!projectId) {
      throw new Error(`Cannot find point id for "${name}": no project loaded`);
    }
    const all = await listCoordinatePoints(Number(projectId));
    const match = all.find((p: any) => p.name === name);
    if (match?.id !== undefined) {
      dbPointIds.value.set(name, match.id);
      resolvedDbId = match.id;
    } else {
      throw new Error(`Cannot find point id for "${name}"`);
    }
  }
  await deleteCoordinatePoint(resolvedDbId);

  const stripEntry = (entry: any) => {
    if (entry === null || typeof entry !== 'object') return true;
    const id = entry.pointId ?? entry.id ?? entry.name;
    return id !== name;
  };
  if (Array.isArray(workflowState?.adjustedCoordinates)) {
    workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.filter(stripEntry);
  }
  if (Array.isArray(workflowState?.importedPoints)) {
    workflowState.importedPoints = workflowState.importedPoints.filter(stripEntry);
  }

  if (dbPointNames.value.has(name)) dbPointNames.value.delete(name);
  if (dbPointIds.value.has(name))   dbPointIds.value.delete(name);

  const projectId = workflowState?.projectInfo?.projectId;
  if (projectId) {
    try {
      await api.patch(`/survey-projects/${projectId}/workflow`, {
        step: 'calculations-part1',
        action: 'update',
        metadata: {
          adjusted_coordinates: workflowState.adjustedCoordinates,
          point_delete: { name, at: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.warn('[PointDelete] Could not persist delete to workflow state:', e);
    }
  }

  await recomputeAllParcels({ skipConfirm: true });
}

async function handlePointRename(payload: { oldName: string; newName: string }) {
  const projectId = workflowState?.projectInfo?.projectId;
  if (!projectId) throw new Error('No project ID available');

  // 1. Persist name change to database (coordinate_points table)
  await renameCoordinatePoint(projectId, payload.oldName, payload.newName);

  // 2. Replace array items with new objects so Vue reactive system detects the change
  //    and coordinatePoints computed re-evaluates immediately.
  //    In-place property mutation on reactive array items does NOT trigger Vue reactivity.
  if (Array.isArray(workflowState?.adjustedCoordinates)) {
    workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.map((c: any) => {
      const currentId = c.pointId || c.id || c.name;
      if (currentId !== payload.oldName) return c;
      return {
        ...c,
        ...(('pointId' in c) && { pointId: payload.newName }),
        ...(('id' in c) && { id: payload.newName }),
        ...(('name' in c) && { name: payload.newName }),
      };
    });
  }

  // 3. Also replace importedPoints item so field book regeneration sees new name
  if (Array.isArray(workflowState?.importedPoints)) {
    workflowState.importedPoints = workflowState.importedPoints.map((p: any) =>
      p.id === payload.oldName ? { ...p, id: payload.newName } : p
    );
  }

  // 4. Persist back to calculations-part1 step — that is where loadWorkflowState
  //    reads adjustedCoordinates from on reload (step_data['calculations-part1'].adjusted_coordinates).
  //    Use api directly (not _saveStepData) to guarantee the correct projectId is used,
  //    since the composable's module-level projectId.value may be null in this component context.
  try {
    const resp = await api.patch(`/survey-projects/${projectId}/workflow`, {
      step: 'calculations-part1',
      action: 'update',
      metadata: {
        adjusted_coordinates: workflowState.adjustedCoordinates,
        point_rename: { from: payload.oldName, to: payload.newName, at: new Date().toISOString() },
        timestamp: new Date().toISOString()
      }
    });
    if (resp.data.ok) {
      console.log(`[PointRename] ✅ Persisted rename to calculations-part1 step_data`);
    } else {
      console.warn('[PointRename] ⚠️ Workflow PATCH returned not-ok:', resp.data);
    }
  } catch (e) {
    console.warn('[PointRename] ⚠️ Could not persist rename to workflow state:', e);
  }

  // Keep dbPointNames in sync
  dbPointNames.value.delete(payload.oldName);
  dbPointNames.value.add(payload.newName);

  // Keep dbPointIds in sync — without this a combined rename+coord edit
  // would fall back to listCoordinatePoints because dbPointIds still holds
  // the old name as its key after handlePointRename returns.
  const oldDbId = dbPointIds.value.get(payload.oldName);
  if (oldDbId !== undefined) {
    dbPointIds.value.delete(payload.oldName);
    dbPointIds.value.set(payload.newName, oldDbId);
  }

  // 5. Propagate rename into land_parcels.metadata.cape_lo_points
  //    Without this, saved parcels still reference the old beacon name.
  const affectedParcels: string[] = [];
  for (const [designation, dbParcel] of savedParcels.value.entries()) {
    const capeLoPoints: any[] = dbParcel.metadata?.cape_lo_points ?? [];
    const hasOldName = capeLoPoints.some((p: any) => p.id === payload.oldName);
    if (!hasOldName) continue;

    const updatedPoints = capeLoPoints.map((p: any) =>
      p.id === payload.oldName ? { ...p, id: payload.newName, description: p.description === payload.oldName ? payload.newName : p.description } : p
    );
    const updatedMetadata = { ...dbParcel.metadata, cape_lo_points: updatedPoints };

    try {
      await updateLandParcel(dbParcel.id, { metadata: updatedMetadata });
      // Keep local cache in sync
      dbParcel.metadata = updatedMetadata;
      savedParcels.value.set(designation, dbParcel);
      // Also update in-memory parcels array
      const memParcel = parcels.value.find((p: any) => p.designation === designation);
      if (memParcel) {
        memParcel.points = memParcel.points.map((p: any) =>
          p.id === payload.oldName ? { ...p, id: payload.newName, description: p.description === payload.oldName ? payload.newName : p.description } : p
        );
      }
      affectedParcels.push(designation);
    } catch (e) {
      console.warn(`[PointRename] ⚠️ Could not update parcel "${designation}" metadata:`, e);
    }
  }

  if (affectedParcels.length > 0) {
    console.log(`[PointRename] ✅ Updated beacon name in ${affectedParcels.length} parcel(s): ${affectedParcels.join(', ')}`);
  }

  console.log(`[PointRename] ✅ Renamed "${payload.oldName}" → "${payload.newName}"`);
}

/**
 * Repair stale beacon names in all saved parcels.
 * Fetches both parcels and coordinate points directly from the API (does NOT rely
 * on in-memory state), re-matches each parcel's cape_lo_points by coordinate
 * proximity, and writes back corrected names to the DB.
 * Use this after beacon renames that happened before the auto-propagation fix.
 */
async function repairParcelBeaconNames() {
  const projectId = workflowState?.projectInfo?.projectId;
  if (!projectId) {
    alert('No project loaded. Please select a project first.');
    return;
  }

  isRecomputing.value = true;
  try {
    // Fetch fresh data directly from API — don't rely on possibly-empty in-memory state
    console.log('[RepairBeacons] Fetching parcels and coordinate points from API...');
    const [dbParcels, dbPoints] = await Promise.all([
      listLandParcels(Number(projectId)),
      listCoordinatePoints(Number(projectId))
    ]);

    if (dbParcels.length === 0) {
      alert('No saved parcels found in the database for this project.');
      return;
    }
    if (dbPoints.length === 0) {
      alert('No coordinate points found in the database. Cannot re-match beacon names.');
      return;
    }

    console.log(`[RepairBeacons] ${dbParcels.length} parcel(s), ${dbPoints.length} coordinate point(s)`);

    // Normalise coordinate points: use .name as id (same as listCoordinatePoints returns)
    const currentPoints = dbPoints.map((p: any) => ({
      id: p.name,
      y: typeof p.y === 'number' ? p.y : parseFloat(p.y),
      x: typeof p.x === 'number' ? p.x : parseFloat(p.x),
    }));

    const TOLERANCE = 0.5; // metres
    let repairedCount = 0;
    let skippedCount = 0;
    const details: string[] = [];

    for (const dbParcel of dbParcels) {
      const designation = dbParcel.stand || dbParcel.designation;
      const oldPoints: any[] = dbParcel.metadata?.cape_lo_points ?? [];

      if (oldPoints.length === 0) {
        skippedCount++;
        continue;
      }

      let changed = false;
      const repairedPoints = oldPoints.map((p: any) => {
        const py = typeof p.y === 'number' ? p.y : parseFloat(p.y);
        const px = typeof p.x === 'number' ? p.x : parseFloat(p.x);
        let bestMatch: any = null;
        let minDist = Infinity;
        for (const cp of currentPoints) {
          const dist = Math.sqrt(Math.pow(cp.y - py, 2) + Math.pow(cp.x - px, 2));
          if (dist < minDist) { minDist = dist; bestMatch = cp; }
        }
        if (bestMatch && minDist <= TOLERANCE && bestMatch.id !== p.id) {
          changed = true;
          details.push(`  ${designation}: "${p.id}" → "${bestMatch.id}" (${minDist.toFixed(3)}m)`);
          return { ...p, id: bestMatch.id, description: bestMatch.id };
        }
        return p;
      });

      if (!changed) { skippedCount++; continue; }

      const updatedMetadata = { ...dbParcel.metadata, cape_lo_points: repairedPoints };
      try {
        await updateLandParcel(dbParcel.id, { metadata: updatedMetadata });
        // Keep in-memory caches in sync
        const cached = savedParcels.value.get(designation);
        if (cached) { cached.metadata = updatedMetadata; savedParcels.value.set(designation, cached); }
        const mem = parcels.value.find((p: any) => p.designation === designation);
        if (mem) {
          mem.points = repairedPoints.map((p: any) => ({
            id: p.id, y: p.y, x: p.x,
            status: p.status || 'P', description: p.description || p.id
          }));
        }
        repairedCount++;
        console.log(`[RepairBeacons] ✅ Repaired "${designation}"`);
      } catch (e) {
        console.error(`[RepairBeacons] ❌ Failed to patch "${designation}":`, e);
      }
    }

    const msg = [
      `Beacon name repair complete.`,
      `✅ Repaired: ${repairedCount} parcel(s)`,
      `⏭️ No changes needed: ${skippedCount} parcel(s)`,
      details.length > 0 ? `\nChanges made:\n${details.join('\n')}` : ''
    ].filter(Boolean).join('\n');
    alert(msg);
    console.log('[RepairBeacons]', msg);
  } catch (e: any) {
    console.error('[RepairBeacons] ❌ Error:', e);
    alert(`Repair failed: ${e?.message || 'Unknown error'}`);
  } finally {
    isRecomputing.value = false;
  }
}

function handleRenameComplete(renames: Array<{ oldName: string; newName: string }>) {
  if (!map || !map.isStyleLoaded()) return;

  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  const rawCoords = (workflowState?.adjustedCoordinates ?? []) as any[];

  // Normalize to CapeLoPoint using same id-resolution as coordinatePoints computed
  const capePoints: CapeLoPoint[] = rawCoords.map((c: any, i: number) => ({
    id: c.id || c.point_id || c.pointId || c.name || c.label || `P${i + 1}`,
    x: parseFloat(c.x),
    y: parseFloat(c.y),
    status: c.status || 'P',
    description: c.description || ''
  }));

  const wgs84 = capeLoArrayToWGS84(capePoints, loZone);

  const newGeojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: wgs84
      .filter((p: any) => p.status !== 'TRIG')
      .map((p: any) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { id: p.id, status: p.status }
      }))
  };

  // Assigning a new object triggers the watcher → setData → map redraws labels
  livePegGeojson.value = newGeojson;

  console.log(`[PointRename] ${renames.length} rename(s) complete. Map labels updated immediately.`);
}

// ============================================================================
// BEACON ADD / EDIT MODAL
// ============================================================================

const beaconModal = ref<{
  mode: 'add' | 'edit';
  dbId: number | null;       // null when adding a new beacon
  name: string;
  y: string;                 // Cape Lo Y (Westing)
  x: string;                 // Cape Lo X (Southing)
  description: string;
  error: string;
  saving: boolean;
} | null>(null);

const beaconModalNameRef = ref<HTMLInputElement | null>(null);

function openAddBeaconModal() {
  beaconModal.value = { mode: 'add', dbId: null, name: '', y: '', x: '', description: '', error: '', saving: false };
  nextTick(() => { beaconModalNameRef.value?.focus(); });
}

function openEditBeaconModal(pt: { id: string | number; y: number; x: number; description?: string; _dbId?: number }) {
  // _dbId is the numeric DB row id (set during loadParcelsFromDatabase / listCoordinatePoints reconcile)
  const resolvedId = pt._dbId ?? dbPointIds.value.get(String(pt.id)) ?? null;
  beaconModal.value = {
    mode: 'edit',
    dbId: resolvedId,
    name: String(pt.id),
    y: String(pt.y),
    x: String(pt.x),
    description: pt.description ?? '',
    error: '',
    saving: false
  };
  // If we still don't have a DB id, refresh in the background so the save handler finds it
  if (!resolvedId) refreshDbPointNames().catch(() => {});
  nextTick(() => { beaconModalNameRef.value?.focus(); });
}

async function confirmBeaconSave() {
  const modal = beaconModal.value;
  if (!modal || modal.saving) return;

  const name = modal.name.trim();
  const yVal = parseFloat(modal.y);
  const xVal = parseFloat(modal.x);

  if (!name) { modal.error = 'Name is required.'; return; }
  if (isNaN(yVal) || isNaN(xVal)) { modal.error = 'Y and X must be valid numbers.'; return; }

  const projectId = workflowState?.projectInfo?.projectId;
  if (!projectId) { modal.error = 'No project loaded.'; return; }

  modal.saving = true;
  modal.error = '';

  try {
    let saved: CoordinatePoint;

    if (modal.mode === 'add') {
      // Duplicate name check
      if (coordinatePoints.value.some((p: any) => p.id === name)) {
        modal.error = `"${name}" already exists.`;
        modal.saving = false;
        return;
      }
      saved = await createCoordinatePoint({
        project_id: projectId,
        name,
        y: yVal,
        x: xVal,
        description: modal.description.trim() || undefined
      });

      // Append to workflowState.adjustedCoordinates so it appears on the map immediately
      if (Array.isArray(workflowState?.adjustedCoordinates)) {
        workflowState.adjustedCoordinates = [
          ...workflowState.adjustedCoordinates,
          { id: name, pointId: name, name, y: yVal, x: xVal, status: 'P', description: modal.description.trim() }
        ];
      }
      dbPointNames.value.add(name);

    } else {
      // Edit existing — resolve numeric DB id (dbPointIds may be stale if point was added post-init)
      let resolvedDbId = modal.dbId ?? dbPointIds.value.get(modal.name) ?? null;
      if (!resolvedDbId) {
        // Last resort: fetch from backend by name
        try {
          const pts = await listCoordinatePoints(Number(projectId));
          const match = pts.find((p: any) => p.name === modal.name);
          if (match?.id) {
            resolvedDbId = match.id;
            // Refresh the map so future edits don't need this fallback
            dbPointIds.value.set(modal.name, match.id);
            dbPointNames.value.add(modal.name);
          }
        } catch { /* ignore — will fail below */ }
      }
      if (!resolvedDbId) {
        modal.error = 'Cannot edit: no database ID found. Try refreshing the page.';
        modal.saving = false;
        return;
      }
      saved = await updateCoordinatePoint(resolvedDbId, {
        name,
        y: yVal,
        x: xVal,
        description: modal.description.trim() || undefined
      });

      // Patch workflowState.adjustedCoordinates in-place (replace old entry)
      if (Array.isArray(workflowState?.adjustedCoordinates)) {
        workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.map((c: any) => {
          const cId = c.id || c.pointId || c.name;
          if (cId !== modal.name && cId !== name) return c;
          return { ...c, id: name, pointId: name, name, y: yVal, x: xVal, description: modal.description.trim() };
        });
      }
    }

    // Persist updated coordinates array to workflow step so reload works
    try {
      await api.patch(`/survey-projects/${projectId}/workflow`, {
        step: 'calculations-part1',
        action: 'update',
        metadata: {
          adjusted_coordinates: workflowState.adjustedCoordinates,
          beacon_edit: { mode: modal.mode, name, at: new Date().toISOString() },
          timestamp: new Date().toISOString()
        }
      });
    } catch (e) {
      console.warn('[BeaconEdit] ⚠️ Could not persist to workflow state:', e);
    }

    // Refresh map survey peg layer so the new/edited point renders
    handleRenameComplete([]);

    console.log(`[BeaconEdit] ✅ ${modal.mode === 'add' ? 'Added' : 'Updated'} beacon "${name}" (Y=${yVal}, X=${xVal})`);
    beaconModal.value = null;

  } catch (e: any) {
    modal.error = e?.response?.data?.error || e?.message || 'Save failed';
    modal.saving = false;
  }
}

// SI 727/1979 Compliance Composable
const {
  calculateClosureRatio,
  validateSI727Compliance,
  getSI727Tolerance,
  formatArea,
  formatCoordinate,
  getAreaTypeLabel
} = useAreaCompliance();

// Helper function to format time
function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function transformGeometryToWGS84(geometry: any, loZone: number | string): any {
  if (!geometry?.coordinates) {
    return geometry;
  }

  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring: number[][]) => {
        // Batch transform entire ring at once (not one vertex at a time)
        const capeLoPoints: CapeLoPoint[] = ring.map((coord: number[], i: number) => {
          const clp = geoJsonToCapeLoPoint(coord as [number, number]);
          return { id: `v${i}`, y: clp.y, x: clp.x } as CapeLoPoint;
        });
        const wgs84Points = capeLoArrayToWGS84(capeLoPoints, loZone);
        return wgs84Points.map(p => [p.lng, p.lat]);
      })
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon: number[][][]) =>
        polygon.map((ring: number[][]) => {
          // Batch transform entire ring at once
          const capeLoPoints: CapeLoPoint[] = ring.map((coord: number[], i: number) => {
            const clp = geoJsonToCapeLoPoint(coord as [number, number]);
            return { id: `v${i}`, y: clp.y, x: clp.x } as CapeLoPoint;
          });
          const wgs84Points = capeLoArrayToWGS84(capeLoPoints, loZone);
          return wgs84Points.map(p => [p.lng, p.lat]);
        })
      )
    };
  }

  return geometry;
}

function getExteriorRingForBounds(geometry: any): number[][] {
  if (!geometry?.coordinates) {
    return [];
  }

  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
    return geometry.coordinates[0] as number[][];
  }

  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates?.[0]?.[0])) {
    return geometry.coordinates[0][0] as number[][];
  }

  return [];
}

// PDF Generation Composables
const { generateAreaConsistencyPDF } = useAreaConsistencyPDF();

// Drawing state
const isDrawing = ref(false);
const selectedPoints = ref<any[]>([]);
const areaType = ref<AreaType>('urban'); // Default to urban
const isComputing = ref(false);
const overlapMessage = ref<string | null>(null);

// Vertex-editing state (edit existing saved parcel geometry)
const isEditingVertices = ref(false)
const editingParcelDesignation = ref<string | null>(null)
const editingParcelDbId = ref<number | null>(null)
const insertAfterIndex = ref<number | null>(null)
const setInsertAfter = (index: number | null) => {
  insertAfterIndex.value = index
}

// Parcels
const parcels = ref<Parcel[]>([]);

// Beacon labels (intelligent labeling: suffix inside parcels, full names outside)
interface BeaconLabel {
  beaconName: string;
  displayLabel: string;
  stand: string;
  beaconY: number;
  beaconX: number;
  y: number;
  x: number;
  offset: number;
  clearance: number;
  parcelId: string;
}
const beaconLabels = ref<BeaconLabel[]>([]);

// Auto-save state
const isSaving = ref(false);
const lastSaved = ref<Date | null>(null);
const isRecomputing = ref(false);
const savedParcels = ref<Map<string, LandParcel>>(new Map()); // designation -> LandParcel
const existingParcelIds = ref<Map<string, number>>(new Map()); // designation -> database ID (ALL parcels, including geometry-less)

// AI Detection state
const showAIPanel = ref(false);
const detectedParcels = ref<DetectedParcel[]>([]);
const aiDetectionResult = ref<ParcelDetectionResult | null>(null);

// MapLibre drawing layer sources
let tempPolygonSource: maplibregl.GeoJSONSource | null = null;
let parcelsSource: maplibregl.GeoJSONSource | null = null;
let overlapSource: maplibregl.GeoJSONSource | null = null;

// Control points fetched from API
const controlPoints = ref<any[]>([]);

// Fetch control points from API (same logic as coordinate list generator)
const fetchControlPoints = async () => {
  const projectId = workflowState?.projectInfo?.projectId;
  const controlPointIds = workflowState?.projectInfo?.controlPointIds || [];
  const centralMeridian = workflowState?.projectInfo?.centralMeridian || 31;
  
  if (!projectId || controlPointIds.length === 0) {
    console.log('[MapLibre] No control points configured');
    controlPoints.value = [];
    return;
  }
  
  try {
    const API_BASE = '/api';
    console.log(`[MapLibre] Fetching control points for Lo${centralMeridian}, IDs:`, controlPointIds);
    
    const response = await fetch(`${API_BASE}/control-points?gauss_lo=${centralMeridian}&limit=5000`);
    const data = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
      controlPoints.value = data.data.filter((cp: any) => controlPointIds.includes(cp.id));
      console.log(`[MapLibre] ✅ Fetched ${controlPoints.value.length} control points:`, 
                  controlPoints.value.map((cp: any) => cp.monu_num));
      
      // Log full details of first control point to debug naming
      if (controlPoints.value.length > 0) {
        console.log('[MapLibre] 🔍 First control point FULL DATA:', controlPoints.value[0]);
      }
      
      // Log selected control points with details
      console.log('\n========== SELECTED CONTROL POINTS ==========');
      console.log(`Total: ${controlPoints.value.length} control points`);
      controlPoints.value.forEach((cp: any, index: number) => {
        console.log(`${index + 1}. ${cp.monu_num || cp.name || 'Unnamed'} - [Y: ${cp.y?.toFixed(6)}, X: ${cp.x?.toFixed(6)}]`);
      });
      console.log('=============================================\n');
    } else {
      console.error('[MapLibre] Unexpected API response format:', data);
      controlPoints.value = [];
    }
  } catch (error) {
    console.error('[MapLibre] Error fetching control points:', error);
    controlPoints.value = [];
  }
};

// Coordinate points from workflow
// Combine adjusted coordinates with project control points (same as coordinate list generator)
const coordinatePoints = computed(() => {
  const coords = workflowState?.adjustedCoordinates || [];
  
  console.log('[MapLibre] Adjusted coordinates:', coords.length, 'points');
  console.log('[MapLibre] Control points from API:', controlPoints.value.length, 'points');
  
  // Map adjusted coordinates
  const adjustedPoints = coords.map((c: any) => ({
    id: c.id || c.point_id || c.pointId || c.name || c.label || `P${coords.indexOf(c) + 1}`,
    x: parseFloat(c.x),
    y: parseFloat(c.y),
    status: c.status || 'P',
    description: c.description || c.desc || ''
  }));
  
  // Map control points (same format as coordinate list generator)
  const controlPointsMapped = controlPoints.value.map((cp: any, index: number) => {
    const yRaw = cp.y_gauss || cp.yGauss || cp.y_coordinate || cp.y || cp.Y || cp.northing;
    const xRaw = cp.x_gauss || cp.xGauss || cp.x_coordinate || cp.x || cp.X || cp.easting;
    
    const y = typeof yRaw === 'number' ? yRaw : parseFloat(yRaw) || 0;
    const x = typeof xRaw === 'number' ? xRaw : parseFloat(xRaw) || 0;
    
    // Extract trig beacon name from various possible fields
    const trigName = cp.monu_name || cp.name || cp.description || cp.desc || cp.monument_name || cp.monu_num || `Control Point ${index + 1}`;
    
    console.log(`[MapLibre] Control point ${index + 1}:`, {
      id: cp.monu_num || cp.id,
      monu_name: cp.monu_name,
      name: cp.name,
      description: cp.description,
      desc: cp.desc,
      monument_name: cp.monument_name,
      finalName: trigName
    });
    
    return {
      id: cp.monu_num || cp.id || `CP${index + 1}`,
      x: x,
      y: y,
      status: 'TRIG',
      description: trigName
    };
  });
  
  // Combine control points first, then adjusted coordinates (same order as coordinate list)
  const allPoints = [...controlPointsMapped, ...adjustedPoints];
  
  console.log('[MapLibre] Total combined points:', allPoints.length);
  if (allPoints.length > 0) {
    console.log('[MapLibre] First point (should be control point):', allPoints[0]);
  }
  
  return allPoints;
});

// Separate trig beacons from regular survey points
// Use ONLY the explicitly selected control points from workflow state
const trigBeacons = computed(() => {
  // Return only the control points that were explicitly selected in the Control Point Selection step
  // These are already filtered in coordinatePoints by the selected IDs
  const trigs = coordinatePoints.value.filter((p: any) => p.status === 'TRIG');
  
  console.log(`[MapLibre] 🔺 Trig beacons (selected control points): ${trigs.length}`, trigs.map((p: any) => p.id));
  
  return trigs;
});

const surveyPegs = computed(() => {
  // Return all points that are NOT control points (status !== 'TRIG')
  const pegs = coordinatePoints.value.filter((p: any) => p.status !== 'TRIG');
  console.log(`[MapLibre] 📍 Survey pegs (non-control points): ${pegs.length}`, pegs.map((p: any) => p.id));
  
  return pegs;
});

// Dynamic EPSG code and Lo zone display
const sourceEPSG = computed(() => {
  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  const epsgMap: Record<number, string> = {
    25: 'EPSG:22285',  // Cape Lo 25
    27: 'EPSG:22287',  // Cape Lo 27
    29: 'EPSG:22289',  // Cape Lo 29
    31: 'EPSG:22291',  // Cape Lo 31
    33: 'EPSG:22293'   // Cape Lo 33
  };
  return epsgMap[loZone] || 'EPSG:22291';
});

const loZoneDisplay = computed(() => {
  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  return `Cape Lo${loZone}`;
});

// Prepare coordinates for AI detection (convert to AdjustedCoordinate format)
const adjustedCoordinatesForDetection = computed(() => {
  return coordinatePoints.value.map((pt: any) => ({
    pointId: pt.id,
    y: pt.y,
    x: pt.x,
    description: pt.description || '',
    status: pt.status || 'F',
    surveyDate: pt.surveyDate || new Date().toISOString().split('T')[0],
    calculationsPage: 0,
    fieldBookPage: 'E1'
  }));
});

// Initialize MapLibre map
async function initializeMap() {
  if (!mapContainer.value) return;

  console.log('[MapLibre] 🗺️ Initializing main map (survey pegs only)...');
  console.log(`[MapLibre] 📊 Total points: ${coordinatePoints.value.length}`);

  try {
    isLoading.value = true;

    // Check if we have points to transform
    if (coordinatePoints.value.length === 0) {
      throw new Error('No coordinate points available to display on map');
    }

    console.log('[MapLibre] 🔄 Starting coordinate transformation...');
    console.log(`[MapLibre] 📊 Points to transform: ${coordinatePoints.value.length}`);
    
    // Get Lo zone from workflow state
    const loZone = workflowState?.projectInfo?.centralMeridian || 31;
    console.log(`[MapLibre] 🎯 Using Lo ${loZone} for transformation`);
    
    // Transform ALL points for adding to map
    const allWgs84Points = capeLoArrayToWGS84(coordinatePoints.value as CapeLoPoint[], loZone);
    console.log(`[MapLibre] ✅ Transformation complete: ${allWgs84Points.length} WGS84 points`);
    
    // Calculate and log survey centroid
    if (allWgs84Points.length > 0) {
      const surveyPegsOnly = allWgs84Points.filter((p: any) => 
        p.id && !p.id.toString().toUpperCase().startsWith('CP')
      );
      
      if (surveyPegsOnly.length > 0) {
        const centroidLat = surveyPegsOnly.reduce((sum: number, p: any) => sum + p.lat, 0) / surveyPegsOnly.length;
        const centroidLng = surveyPegsOnly.reduce((sum: number, p: any) => sum + p.lng, 0) / surveyPegsOnly.length;
        
        console.log('\n========== SURVEY CENTROID ==========');
        console.log(`Calculated from ${surveyPegsOnly.length} survey pegs`);
        console.log(`Latitude:  ${centroidLat.toFixed(6)}°`);
        console.log(`Longitude: ${centroidLng.toFixed(6)}°`);
        console.log(`WGS84: [${centroidLat.toFixed(6)}, ${centroidLng.toFixed(6)}]`);
        console.log('=====================================\n');
      }
    }
    
    // Calculate bounds based on survey pegs only (for zooming)
    const surveyPegsOnly = surveyPegs.value;
    console.log(`[MapLibre] 📍 Survey pegs for main map bounds: ${surveyPegsOnly.length}`);
    
    let bounds;
    if (surveyPegsOnly.length > 0) {
      const wgs84Pegs = capeLoArrayToWGS84(surveyPegsOnly as CapeLoPoint[], loZone);
      bounds = calculateWGS84Bounds(wgs84Pegs);
      console.log('[MapLibre] 📍 Bounds (from survey pegs):', bounds);
    } else {
      // Fallback: use all points if no survey pegs
      console.warn('[MapLibre] ⚠️ No survey pegs found, using all points for bounds');
      bounds = calculateWGS84Bounds(allWgs84Points);
      console.log('[MapLibre] 📍 Bounds (from all points):', bounds);
    }

    // Create map
    map = new maplibregl.Map({
      container: mapContainer.value,
      style: {
        version: 8,
        sources: {
          // OpenStreetMap raster tiles (free basemap)
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,  // OSM tiles max at z19; MapLibre overzooms beyond this
            attribution: '© OpenStreetMap contributors'
          },
          // Satellite imagery (Esri World Imagery - free tier)
          'satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            maxzoom: 23,  // Esri native tiles go to z23
            attribution: '© Esri',
            // Add these to help with loading
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
              visibility: satelliteVisible.value ? 'visible' : 'none'
            }
          },
          {
            id: 'osm-layer',
            type: 'raster',
            source: 'osm-raster',
            layout: {
              visibility: satelliteVisible.value ? 'none' : 'visible'
            }
          }
        ]
      },
      center: bounds.center,
      zoom: 16,        // Higher initial zoom for survey data detail
      minZoom: 12,     // Prevent zooming out too far (keeps survey area visible)
      maxZoom: 24,     // Allow overzooming past tile z19 for close-up beacon inspection
      pitch: 0,
      bearing: 0
    });

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    let suppressedOsmTileErrors = 0;

    // Listen for tile errors (filter expected OSM CORS noise)
    map.on('error', (e: any) => {
      const message = String(e?.error?.message || '');
      const isOsmTileCorsError =
        message.includes('tile.openstreetmap.org') &&
        message.toLowerCase().includes('failed to fetch');

      if (isOsmTileCorsError) {
        suppressedOsmTileErrors += 1;
        if (suppressedOsmTileErrors <= 3) {
          console.warn('[MapLibre] ⚠️ OSM tile request failed (likely CORS/network).');
        } else if (suppressedOsmTileErrors === 4) {
          console.warn('[MapLibre] ⚠️ Suppressing further repeated OSM tile fetch errors.');
        }
        return;
      }

      console.error('[MapLibre] ⚠️ Map error:', e.error);
      if (message) {
        console.error('[MapLibre] Error details:', message);
      }
    });

    // Log successful tile loads (once per source) and style loading
    const loggedSources = new Set<string>();
    map.on('data', (e: any) => {
      if (e.dataType === 'source' && e.isSourceLoaded && e.tile) {
        if (!loggedSources.has(e.sourceId)) {
          loggedSources.add(e.sourceId);
          console.log('[MapLibre] ✅ Tiles loaded for:', e.sourceId);
        }
      }
      if (e.dataType === 'style') {
        console.debug('[MapLibre] 🎨 Style data event:', e.sourceDataType);
      }
    });
    
    // Track style load
    map.once('styledata', () => {
      console.log('[MapLibre] 🎨 Style loaded');
    });

    // Wait for map to load with timeout - must wait for BOTH load AND style to be ready
    console.log('[MapLibre] ⏳ Waiting for map to load...');
    
    try {
      // Check if already loaded (shouldn't happen, but defensive)
      if (map!.loaded() && map!.isStyleLoaded()) {
        console.log('[MapLibre] ⚡ Map and style already loaded');
      } else {
        // Wait for BOTH 'load' event AND style to be ready
        await Promise.race([
          new Promise<void>(resolve => {
            const checkReady = () => {
              if (map!.loaded() && map!.isStyleLoaded()) {
                console.log('[MapLibre] ✅ Map loaded and style ready');
                resolve();
              } else {
                // Check again on next frame
                requestAnimationFrame(checkReady);
              }
            };
            
            // Start checking after load event
            map!.once('load', () => {
              console.log('[MapLibre] 🎯 Map "load" event fired, waiting for style...');
              checkReady();
            });
          }),
          new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Map load timeout after 30 seconds')), 30000)
          )
        ]);
      }
      console.log('[MapLibre] ✅ Map and style loaded successfully');
    } catch (error) {
      console.error('[MapLibre] ❌ Map load failed:', error);
      console.log('[MapLibre] 🔄 Attempting to continue anyway...');
      // Don't throw - try to continue
    }
    console.log('[MapLibre] Current center:', map!.getCenter());
    console.log('[MapLibre] Current zoom:', map!.getZoom());
    
    // Check if canvas exists in DOM
    const canvas = mapContainer.value?.querySelector('canvas');
    console.log('[MapLibre] Canvas element:', canvas ? '✅ Found in DOM' : '❌ NOT FOUND');
    if (canvas) {
      console.log('[MapLibre] Canvas size:', canvas.width, 'x', canvas.height);
      console.log('[MapLibre] Canvas style:', canvas.style.cssText);
    }

    // Create custom triangle icon for trig beacons (SGO cadastral standard symbol)
    const triangleSize = 48;
    const triangleCanvas = document.createElement('canvas');
    triangleCanvas.width = triangleSize;
    triangleCanvas.height = triangleSize;
    const ctx = triangleCanvas.getContext('2d')!;
    
    // Draw black triangle (cadastral symbol for trigonometrical beacon)
    ctx.fillStyle = '#000000'; // Black fill (SGO standard)
    ctx.strokeStyle = '#ffffff'; // White border for visibility
    ctx.lineWidth = 3;
    
    // Triangle path (equilateral triangle pointing up)
    ctx.beginPath();
    ctx.moveTo(triangleSize / 2, 8); // Top point
    ctx.lineTo(triangleSize - 8, triangleSize - 8); // Bottom right
    ctx.lineTo(8, triangleSize - 8); // Bottom left
    ctx.closePath();
    
    // Fill and stroke
    ctx.fill();
    ctx.stroke();
    
    // Draw white inscribed circle (SGO standard enhancement)
    // Calculate incircle for equilateral triangle
    const triangleHeight = triangleSize - 16; // Height of the triangle (32px)
    const side = (triangleHeight * 2) / Math.sqrt(3); // Side length from height
    const fullInRadius = (side * Math.sqrt(3)) / 6; // Full incircle radius
    const inRadius = fullInRadius * 0.25; // Reduce by 75% (keep 25%)
    
    // Position at centroid (center of mass) of the triangle
    // For equilateral triangle, centroid is at 1/3 of height from base
    const centerX = triangleSize / 2; // Horizontal center
    const centerY = triangleSize - 8 - (triangleHeight / 3); // Centroid Y position
    
    ctx.fillStyle = '#ffffff'; // White circle fill
    ctx.strokeStyle = '#000000'; // Black circle outline
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, inRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke(); // Add black circumference
    
    // Add the triangle icon to the map
    map!.addImage('trig-triangle', ctx.getImageData(0, 0, triangleSize, triangleSize));
    console.log('[MapLibre] ✅ SGO cadastral triangle symbol added (with inscribed circle)');

    // Add all survey points (trigs and pegs)
    addSurveyPoints(allWgs84Points);

    // ========== DRAWING LAYERS - SI 727/1979 Interactive Polygon Builder ==========
    // Add temporary polygon source and layer (for real-time preview)
    map.addSource('temp-polygon', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'temp-polygon-line',
      type: 'line',
      source: 'temp-polygon',
      paint: {
        'line-color': '#fbbf24',
        'line-width': 3,
        'line-dasharray': [2, 2]
      }
    });

    tempPolygonSource = map.getSource('temp-polygon') as maplibregl.GeoJSONSource;

    // Add completed parcels source and layers
    map.addSource('parcels', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'parcels-fill',
      type: 'fill',
      source: 'parcels',
      paint: {
        'fill-color': [
          'match',
          ['get', 'status'],
          'draft', '#fbbf24',      // Amber/yellow for draft parcels
          'finalized', '#3b82f6',  // Blue for finalized parcels
          'approved', '#10b981',   // Green for approved parcels
          '#9ca3af'                // Gray fallback
        ],
        'fill-opacity': 0.4  // Increased from 0.2 for better visibility
      }
    });

    map.addLayer({
      id: 'parcels-outline',
      type: 'line',
      source: 'parcels',
      paint: {
        'line-color': [
          'match',
          ['get', 'status'],
          'draft', '#f59e0b',      // Dark amber for draft parcels
          'finalized', '#1d4ed8',  // Dark blue for finalized parcels
          'approved', '#059669',   // Dark green for approved parcels
          '#6b7280'                // Dark gray fallback
        ],
        'line-width': 3
      }
    });

    map.addLayer({
      id: 'parcels-labels',
      type: 'symbol',
      source: 'parcels',
      layout: {
        'text-field': [
          'concat',
          ['get', 'designation'],
          '\n',
          ['get', 'area'],
          ' • ',
          [
            'match',
            ['get', 'status'],
            'draft', '📝 Draft',
            'finalized', '✅ Final',
            'approved', '🎯 Approved',
            ''
          ]
        ],
        'text-size': 13,
        'text-anchor': 'center',
        'text-line-height': 1.2
      },
      paint: {
        'text-color': '#1f2937',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
      }
    });

    parcelsSource = map.getSource('parcels') as maplibregl.GeoJSONSource;

    map.addSource('parcel-overlap', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'parcel-overlap-outline',
      type: 'line',
      source: 'parcel-overlap',
      paint: {
        'line-color': '#dc2626',
        'line-width': 4,
        'line-dasharray': [1, 1]
      }
    });

    overlapSource = map.getSource('parcel-overlap') as maplibregl.GeoJSONSource;

    console.log('[MapLibre] ✅ Drawing layers initialized');
    // ========== END DRAWING LAYERS ==========

    // Render any parcels that were loaded from database before map initialization
    if (savedParcels.value.size > 0) {
      try {
        console.log(`[MapLibre] 🎨 Rendering ${savedParcels.value.size} loaded parcels on map...`);
        console.log('[MapLibre] Sample parcel:', Array.from(savedParcels.value.values())[0]);
        
        const features = Array.from(savedParcels.value.values()).map((dbParcel, index) => {
          const parcelName = dbParcel.designation || dbParcel.stand;
          console.log(`[MapLibre] Processing parcel ${index + 1}/${savedParcels.value.size}:`, parcelName);
          
          // DEBUG: Log full parcel object to see geometry
          console.log(`[MapLibre] 📦 Full parcel object:`, JSON.parse(JSON.stringify(dbParcel)));
          
          // Format area properly based on size
          const areaValue = Math.abs(Number(dbParcel.area_m2) || 0);
          const areaDisplay = areaValue >= 10000
            ? `${(areaValue / 10000).toFixed(4)} ha`
            : `${areaValue.toFixed(2)} m²`;
          
          // Parse geometry - handle both GeoJSON object and string
          let geometry = dbParcel.geom || dbParcel.geometry;
          
          // DEBUG: Log geometry before parsing
          console.log(`[MapLibre] 🔍 Raw geometry type:`, typeof geometry);
          console.log(`[MapLibre] 🔍 Has geom:`, !!dbParcel.geom, '| Has geometry:', !!dbParcel.geometry);
          
          if (typeof geometry === 'string') {
            try {
              geometry = JSON.parse(geometry);
              console.log(`[MapLibre] ✅ Parsed geometry from string`);
            } catch (e) {
              console.error(`[MapLibre] ❌ Failed to parse geometry for ${parcelName}:`, e);
              return null;
            }
          }
          
          // Validate geometry
          if (!geometry) {
            console.error(`[MapLibre] ❌ No geometry for parcel ${parcelName}`);
            return null;
          }
          
          if (!geometry.coordinates || !Array.isArray(geometry.coordinates)) {
            console.error(`[MapLibre] ❌ Invalid geometry coordinates for parcel ${parcelName}:`, geometry);
            return null;
          }
          
          // Remove CRS from geometry (MapLibre doesn't support it)
          if (geometry.crs) {
            delete geometry.crs;
          }
          
          // Transform Cape Lo coordinates to WGS84 for MapLibre
          // CRITICAL: Backend ST_Transform may not actually convert coordinate values
          // The coordinates appear to be in the project's native CRS (Lo 29), not Lo 31
          // Use the project's central meridian for correct transformation
          const loZone = workflowState?.projectInfo?.centralMeridian || 31;
          geometry = transformGeometryToWGS84(geometry, loZone);
          console.log(`[MapLibre] ✅ Transformed ${parcelName} from Cape Lo ${loZone} to WGS84`);
          
          const feature = {
            type: 'Feature' as const,
            geometry: geometry,
            properties: {
              designation: parcelName,
              area: areaDisplay,
              status: dbParcel.status || 'draft',
              closureRatio: dbParcel.metadata?.closure_ratio,
              closureError: typeof dbParcel.closure_error_m === 'number' ? dbParcel.closure_error_m.toFixed(3) : '0.000'
            }
          };
          
          console.log(`[MapLibre] ✅ Created feature for ${parcelName}`);
          return feature;
        }).filter(f => f !== null);
        
        console.log(`[MapLibre] Total features created: ${features.length}`);
        console.log('[MapLibre] Features array:', features);
        
        // Debug: Log first feature's coordinates
        if (features.length > 0 && features[0].geometry?.coordinates) {
          const sampleRing = getExteriorRingForBounds(features[0].geometry);
          console.log('[MapLibre] 🔍 First parcel coordinates (should be WGS84 lon/lat):', sampleRing.slice(0, 3));
        }
        
        // Check if parcelsSource is available
        if (!parcelsSource) {
          console.error('[MapLibre] ❌ parcelsSource is null - map not fully initialized');
          console.log('[MapLibre] 💡 Attempting to get source from map...');
          parcelsSource = map?.getSource('parcels') as maplibregl.GeoJSONSource;
        }
        
        if (parcelsSource) {
          parcelsSource.setData({
            type: 'FeatureCollection',
            features: features
          });
          
          console.log(`[MapLibre] ✅ Rendered ${features.length} parcels on map`);
          console.log('[MapLibre] Parcels source data set successfully');
        } else {
          console.error('[MapLibre] ❌ Failed to get parcels source - parcels will not display');
        }
        
        // Fit map to parcels if they exist
        if (features.length > 0) {
          setTimeout(() => {
            console.log('[MapLibre] 🎯 Fitting map to parcels...');
            const bounds = features.reduce((acc, feature) => {
              const coords = getExteriorRingForBounds(feature.geometry);
              coords.forEach((coord: number[]) => {
                if (!acc) {
                  acc = { minLng: coord[0], maxLng: coord[0], minLat: coord[1], maxLat: coord[1] };
                } else {
                  acc.minLng = Math.min(acc.minLng, coord[0]);
                  acc.maxLng = Math.max(acc.maxLng, coord[0]);
                  acc.minLat = Math.min(acc.minLat, coord[1]);
                  acc.maxLat = Math.max(acc.maxLat, coord[1]);
                }
              });
              return acc;
            }, null as any);
            
            if (bounds && map) {
              console.log('[MapLibre] 📍 Parcel bounds:', bounds);
              map.fitBounds(
                [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
                { padding: 100, duration: 1000 }
              );
            }
          }, 500);
        }
        
      } catch (error) {
        console.error('[MapLibre] ❌ Error rendering parcels:', error);
        console.error('[MapLibre] Error details:', error);
      }
    } else {
      console.log('[MapLibre] No saved parcels to render');
    }

    // Fit to bounds with delay to ensure points are rendered
    setTimeout(() => {
      console.log('[MapLibre] Fitting to points...');
      fitToPoints();
    }, 500);

    isLoading.value = false;

  } catch (error) {
    console.error('[MapLibre] ❌ Error initializing map:', error);
    alert('Failed to initialize map. Check console for details.');
    isLoading.value = false;
  }
}

// Initialize inset map for trig beacons and control points (regional view)
async function initializeInsetMap() {
  if (!insetMapContainer.value) {
    console.log('[MapLibre Inset] ⚠️ Cannot initialize: no container');
    return;
  }
  
  // Combine trig beacons and control points for inset map
  const combinedPoints = [...trigBeacons.value];
  
  // Add control points to inset map
  if (controlPoints.value.length > 0) {
    const controlPointsForMap = controlPoints.value.map((cp: any) => ({
      id: `CP-${cp.monu_num || cp.name || cp.id}`,
      y: cp.y_gauss || cp.yGauss || cp.y_coordinate || cp.y || cp.Y || cp.northing,
      x: cp.x_gauss || cp.xGauss || cp.x_coordinate || cp.x || cp.X || cp.easting,
      status: 'CP',
      description: cp.monu_num || cp.name || `CP${cp.id}`
    }));
    combinedPoints.push(...controlPointsForMap);
  }
  
  if (combinedPoints.length === 0) {
    console.log('[MapLibre Inset] ⚠️ No trig beacons or control points to display');
    return;
  }

  console.log('[MapLibre Inset] 🗺️ Initializing control points & trig beacon inset map...');
  console.log(`[MapLibre Inset] 📍 ${trigBeacons.value.length} trig beacons`);
  console.log(`[MapLibre Inset] 🔺 ${controlPoints.value.length} control points`);
  console.log(`[MapLibre Inset] 📊 ${combinedPoints.length} total points`);

  try {
    // Transform all points to WGS84
    const loZone = workflowState?.projectInfo?.centralMeridian || 31;
    const allWgs84 = capeLoArrayToWGS84(combinedPoints as CapeLoPoint[], loZone);
    const bounds = calculateWGS84Bounds(allWgs84);

    console.log('[MapLibre Inset] Bounds:', bounds);

    // Create inset map with simplified style
    insetMap = new maplibregl.Map({
      container: insetMapContainer.value,
      style: {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© OSM'
          }
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#f0f0f0' }
          },
          {
            id: 'osm-layer',
            type: 'raster',
            source: 'osm-raster'
          }
        ]
      },
      center: bounds.center,
      zoom: 8,  // Much smaller scale for regional view
      interactive: true,
      attributionControl: false
    });

    // Wait for inset map to load
    await new Promise(resolve => insetMap!.on('load', resolve));

    console.log('[MapLibre Inset] ✅ Inset map loaded');

    // Create custom triangle icon for trig beacons (SGO cadastral standard symbol)
    const triangleSize = 48;
    const triangleCanvas = document.createElement('canvas');
    triangleCanvas.width = triangleSize;
    triangleCanvas.height = triangleSize;
    const ctx = triangleCanvas.getContext('2d')!;
    
    // Draw black triangle (cadastral symbol for trigonometrical beacon)
    ctx.fillStyle = '#000000'; // Black fill (SGO standard)
    ctx.strokeStyle = '#ffffff'; // White border for visibility
    ctx.lineWidth = 3;
    
    // Triangle path (equilateral triangle pointing up)
    ctx.beginPath();
    ctx.moveTo(triangleSize / 2, 8); // Top point
    ctx.lineTo(triangleSize - 8, triangleSize - 8); // Bottom right
    ctx.lineTo(8, triangleSize - 8); // Bottom left
    ctx.closePath();
    
    // Fill and stroke
    ctx.fill();
    ctx.stroke();
    
    // Draw white inscribed circle (SGO standard enhancement)
    // Calculate incircle for equilateral triangle
    const triangleHeight = triangleSize - 16; // Height of the triangle (32px)
    const side = (triangleHeight * 2) / Math.sqrt(3); // Side length from height
    const fullInRadius = (side * Math.sqrt(3)) / 6; // Full incircle radius
    const inRadius = fullInRadius * 0.25; // Reduce by 75% (keep 25%)
    
    // Position at centroid (center of mass) of the triangle
    // For equilateral triangle, centroid is at 1/3 of height from base
    const centerX = triangleSize / 2; // Horizontal center
    const centerY = triangleSize - 8 - (triangleHeight / 3); // Centroid Y position
    
    ctx.fillStyle = '#ffffff'; // White circle fill
    ctx.strokeStyle = '#000000'; // Black circle outline
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, inRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke(); // Add black circumference
    
    // Add the triangle icon to the map
    insetMap!.addImage('trig-triangle', ctx.getImageData(0, 0, triangleSize, triangleSize));

    // Create GeoJSON for all points (trig beacons and control points)
    console.log('[MapLibre Inset] 🏷️ Creating GeoJSON with point names:', allWgs84.map((p: any) => ({ id: p.id, description: p.description })));
    
    const allPointsGeojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: allWgs84.map((point: any) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [point.lng, point.lat]
        },
        properties: {
          id: point.id,
          description: point.description || (point.id.startsWith('CP-') ? 'Control Point' : 'Trig Beacon'),
          isControlPoint: point.id && point.id.toString().startsWith('CP-'),
          // Extract short ID (e.g., "2836B" from full description)
          shortId: point.id.length > 6 ? point.id.substring(0, 6) : point.id
        }
      }))
    };

    // Add source
    insetMap!.addSource('inset-trig-beacons', {
      type: 'geojson',
      data: allPointsGeojson
    });

    // Add symbol layer for trig beacons using cadastral triangle symbol
    insetMap!.addLayer({
      id: 'inset-trig-symbols',
      type: 'symbol',
      source: 'inset-trig-beacons',
      layout: {
        'icon-image': 'trig-triangle',
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          6, 0.3,   // Small at zoom 6
          10, 0.5,  // Medium at zoom 10
          14, 0.7   // Larger at zoom 14
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': false
      }
    });

    // Add adaptive labels with zoom-based text
    insetMap!.addLayer({
      id: 'inset-trig-labels',
      type: 'symbol',
      source: 'inset-trig-beacons',
      layout: {
        // Adaptive text field based on zoom level
        'text-field': [
          'step', ['zoom'],
          '',  // No labels below zoom 8
          8, ['get', 'shortId'],  // Short ID from zoom 8-11
          11, ['get', 'description'],  // Trig name (e.g., "Manyanga", "Munaka") from zoom 11-13
          13, [
            'concat',
            ['get', 'description'],  // Trig name
            '\n',
            ['get', 'id']  // ID below name at zoom 13+
          ]
        ],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          8, 9,    // Small text at zoom 8
          11, 11,  // Medium at zoom 11
          14, 13   // Larger at zoom 14
        ],
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-max-width': 12,
        'text-allow-overlap': false,
        'text-optional': true
      },
      paint: {
        'text-color': '#7f1d1d',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 0.5
      }
    });

    // Add click interaction for popups
    insetMap!.on('click', 'inset-trig-symbols', (e: any) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const coordinates = feature.geometry.coordinates.slice();
        const { id, description } = feature.properties;

        new maplibregl.Popup()
          .setLngLat(coordinates)
          .setHTML(`
            <div style="font-family: system-ui; padding: 4px;">
              <p style="font-weight: 600; margin: 0; font-size: 13px;">${id}</p>
              <p style="font-size: 11px; color: #666; margin: 4px 0 0 0;">${description}</p>
            </div>
          `)
          .addTo(insetMap!);
      }
    });

    // Change cursor on hover
    insetMap!.on('mouseenter', 'inset-trig-symbols', () => {
      insetMap!.getCanvas().style.cursor = 'pointer';
    });

    insetMap!.on('mouseleave', 'inset-trig-symbols', () => {
      insetMap!.getCanvas().style.cursor = '';
    });

    // Fit to all points bounds
    insetMap!.fitBounds([
      [bounds.minLng, bounds.minLat],
      [bounds.maxLng, bounds.maxLat]
    ], {
      padding: 30,
      maxZoom: 10
    });
    
    console.log(`[MapLibre Inset] ✅ Displayed ${trigBeacons.value.length} trig beacons and ${controlPoints.value.length} control points`);

  } catch (error) {
    console.error('[MapLibre Inset] ❌ Error initializing inset map:', error);
  }
}

// Destroy inset map
function destroyInsetMap() {
  if (insetMap) {
    console.log('[MapLibre Inset] 🗑️ Destroying inset map');
    insetMap.remove();
    insetMap = null;
  }
}

// Watch for inset visibility changes
watch(showTrigInset, async (newVal) => {
  if (newVal && trigBeacons.value.length > 0) {
    // Wait for next tick to ensure DOM is updated
    await new Promise(resolve => setTimeout(resolve, 100));
    initializeInsetMap();
  } else {
    destroyInsetMap();
  }
});

// Add survey points to map
function addSurveyPoints(wgs84Points: any[]) {
  if (!map) {
    console.error('[MapLibre] ❌ Cannot add points: map is null');
    return;
  }

  console.log(`[MapLibre] 🎨 Adding ${wgs84Points.length} survey points`);
  
  // Separate control points (status='TRIG') from regular survey pegs
  // Only points explicitly selected in Control Point Selection step have status='TRIG'
  const trigPoints = wgs84Points.filter((p: any) => p.status === 'TRIG');
  const pegPoints = wgs84Points.filter((p: any) => p.status !== 'TRIG');
  
  console.log(`[MapLibre] 🔺 ${trigPoints.length} control points (selected), 📍 ${pegPoints.length} survey pegs`);
  
  // Check for missing IDs
  const missingIds = wgs84Points.filter(p => !p.id || p.id === 'undefined');
  if (missingIds.length > 0) {
    console.warn('[MapLibre] ⚠️ Found', missingIds.length, 'points with missing IDs:', missingIds.slice(0, 3));
  }

  // Create GeoJSON for trig beacons
  const trigGeojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: trigPoints.map(point => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.lng, point.lat]
      },
      properties: {
        id: point.id,
        status: point.status,
        description: point.description
      }
    }))
  };
  
  // Create GeoJSON for survey pegs
  const pegGeojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: pegPoints.map(point => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.lng, point.lat]
      },
      properties: {
        id: point.id,
        status: point.status
      }
    }))
  };

  console.log('[MapLibre] GeoJSON created:', trigGeojson.features.length, 'trigs +', pegGeojson.features.length, 'pegs');

  // If sources already exist, just update the data (e.g. after a point rename)
  const trigSource = map.getSource('trig-beacons') as maplibregl.GeoJSONSource | undefined;
  const pegSource = map.getSource('survey-pegs') as maplibregl.GeoJSONSource | undefined;

  if (trigSource && pegSource) {
    trigSource.setData(trigGeojson);
    pegSource.setData(pegGeojson);
    console.log('[MapLibre] ✅ Survey point data updated (setData)');
    return;
  }

  // Add trig beacon source
  map.addSource('trig-beacons', {
    type: 'geojson',
    data: trigGeojson
  });
  console.log('[MapLibre] ✅ Source "trig-beacons" added');
  
  // Add survey pegs source
  map.addSource('survey-pegs', {
    type: 'geojson',
    data: pegGeojson
  });
  console.log('[MapLibre] ✅ Source "survey-pegs" added');

  // Add trig beacon layer using cadastral standard triangle symbol
  map.addLayer({
    id: 'trig-beacons-symbol',
    type: 'symbol',
    source: 'trig-beacons',
    layout: {
      'icon-image': 'trig-triangle',
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        12, 0.3,  // Small at zoom 12
        16, 0.5,  // Medium at zoom 16
        20, 0.7   // Larger at zoom 20
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': false
    }
  });
  console.log('[MapLibre] ✅ Trig beacon layer added (cadastral triangle symbol)');
  
  // Add survey pegs layer (circles)
  map.addLayer({
    id: 'survey-pegs-circle',
    type: 'circle',
    source: 'survey-pegs',
    paint: {
      'circle-radius': 10,        // Slightly smaller than before
      'circle-color': '#3b82f6',  // Blue fill
      'circle-stroke-color': '#ffffff',  // White stroke for contrast
      'circle-stroke-width': 2,
      'circle-opacity': 1.0       // Full opacity
    }
  });
  console.log('[MapLibre] ✅ Survey pegs layer added (circles)');

  // Add labels for trig beacons with adaptive collision detection
  map.addLayer({
    id: 'trig-beacons-labels',
    type: 'symbol',
    source: 'trig-beacons',
    layout: {
      'text-field': ['get', 'id'],
      'text-size': 14,
      'text-offset': [0, -2.2],     // Position above triangle
      'text-anchor': 'bottom',
      // ✅ ADAPTIVE LABELING: Enable collision detection to prevent overlaps
      'text-allow-overlap': false,  // Don't allow labels to overlap
      'text-ignore-placement': false,  // Respect other labels
      'text-optional': true,  // Hide label if it would overlap
      // Zoom-based visibility: show more labels when zoomed in
      'text-padding': [
        'interpolate', ['linear'], ['zoom'],
        12, 50,   // Wide spacing when zoomed out
        16, 20,   // Medium spacing at medium zoom
        20, 5     // Tight spacing when zoomed in
      ],
      visibility: showLabels.value ? 'visible' : 'none'
    },
    paint: {
      'text-color': '#7f1d1d',      // Dark red for trig labels
      'text-halo-color': '#ffffff',
      'text-halo-width': 3,
      'text-halo-blur': 0.5
    }
  });
  
  // Add labels for survey pegs with adaptive collision detection
  map.addLayer({
    id: 'survey-pegs-labels',
    type: 'symbol',
    source: 'survey-pegs',
    layout: {
      'text-field': ['get', 'id'],
      'text-size': 14,
      'text-offset': [0, -1.5],     // Position above circle
      'text-anchor': 'bottom',
      // ✅ ADAPTIVE LABELING: Enable collision detection to prevent overlaps
      'text-allow-overlap': false,  // Don't allow labels to overlap
      'text-ignore-placement': false,  // Respect other labels
      'text-optional': true,  // Hide label if it would overlap
      // Zoom-based visibility: show more labels when zoomed in
      'text-padding': [
        'interpolate', ['linear'], ['zoom'],
        12, 50,   // Wide spacing when zoomed out
        16, 20,   // Medium spacing at medium zoom
        20, 5     // Tight spacing when zoomed in
      ],
      visibility: showLabels.value ? 'visible' : 'none'
    },
    paint: {
      'text-color': '#000000',
      'text-halo-color': '#ffffff',
      'text-halo-width': 3,
      'text-halo-blur': 0.5
    }
  });
  console.log('[MapLibre] ✅ Labels layers added (visibility:', showLabels.value ? 'visible' : 'none', ')');

  // Add hover effect for trig beacons
  map.on('mouseenter', 'trig-beacons-symbol', () => {
    if (map) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'trig-beacons-symbol', () => {
    if (map) map.getCanvas().style.cursor = '';
  });
  
  // Add hover effect for survey pegs
  map.on('mouseenter', 'survey-pegs-circle', () => {
    if (map) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'survey-pegs-circle', () => {
    if (map) map.getCanvas().style.cursor = '';
  });

  // Add click handler for trig beacons
  map.on('click', 'trig-beacons-symbol', (e) => {
    if (!e.features || e.features.length === 0) return;
    const props = e.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div class="p-2">
          <h3 class="font-semibold text-red-800">🔺 ${props.id}</h3>
          <p class="text-sm text-gray-600">Trig Beacon</p>
          <p class="text-xs text-gray-500">${props.description || 'N/A'}</p>
          <p class="text-xs text-gray-500 mt-1">
            ${e.lngLat.lng.toFixed(6)}, ${e.lngLat.lat.toFixed(6)}
          </p>
        </div>
      `)
      .addTo(map!);
  });
  
  // Add click handler for survey pegs (with drawing mode support)
  map.on('click', 'survey-pegs-circle', (e) => {
    if (!e.features || e.features.length === 0) return;
    const props = e.features[0].properties;
    
    // If drawing mode is active, add point to polygon
    if (isDrawing.value) {
      // Find the full point data from coordinatePoints
      const point = coordinatePoints.value.find(p => p.id === props.id);
      if (point) {
        handlePointClick(point);
      }
      return; // Don't show popup in drawing mode
    }

    // Show a small popup with Rename + Edit Coords options
    const popup = new maplibregl.Popup({ closeButton: true, className: 'beacon-action-popup' })
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="padding:8px;min-width:140px">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#1e293b">${props.id}</div>
          <button id="beacon-rename-btn" style="display:block;width:100%;text-align:left;padding:5px 8px;border-radius:6px;background:#eff6ff;color:#1d4ed8;font-size:12px;border:none;cursor:pointer;margin-bottom:4px">✏️ Rename</button>
          <button id="beacon-editcoords-btn" style="display:block;width:100%;text-align:left;padding:5px 8px;border-radius:6px;background:#f0fdf4;color:#15803d;font-size:12px;border:none;cursor:pointer;margin-bottom:4px">📐 Edit Coordinates</button>
          <button id="beacon-delete-btn" style="display:block;width:100%;text-align:left;padding:5px 8px;border-radius:6px;background:#fef2f2;color:#dc2626;font-size:12px;border:none;cursor:pointer">🗑️ Delete Point</button>
        </div>
      `)
      .addTo(map!);

    // Wire buttons — use setTimeout(0) so MapLibre finishes injecting the popup DOM
    setTimeout(() => {
      const renameBtn = document.getElementById('beacon-rename-btn');
      const editBtn = document.getElementById('beacon-editcoords-btn');

      if (renameBtn) {
        renameBtn.addEventListener('click', () => {
          popup.remove();
          openMapRenameModal(props.id, props.status, `${e.lngLat.lng.toFixed(6)}, ${e.lngLat.lat.toFixed(6)}`);
        });
      }
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          popup.remove();
          const fullPt = coordinatePoints.value.find((p: any) => p.id === props.id);
          openEditBeaconModal({
            id: props.id,
            y: fullPt?.y ?? 0,
            x: fullPt?.x ?? 0,
            description: fullPt?.description ?? props.description ?? '',
            _dbId: dbPointIds.value.get(props.id)
          });
        });
      }

      const deleteBtn = document.getElementById('beacon-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          popup.remove();
          if (!confirm(`Delete beacon "${props.id}"?\n\nThis cannot be undone. The point will be removed from the database and all related data.`)) return;

          const pointName = props.id as string;
          const projectId = workflowState?.projectInfo?.projectId;
          if (!projectId) { alert('No project loaded — cannot delete point.'); return; }

          try {
            // Always delete by project_id + name — no numeric id required
            try {
              await deleteCoordinatePointByName(Number(projectId), pointName);
              console.log(`[BeaconDelete] 🗑️ DB row deleted for "${pointName}"`);
            } catch (dbErr: any) {
              // 404 = point only existed in memory (never persisted), that's fine
              if (dbErr?.response?.status !== 404) throw dbErr;
              console.warn(`[BeaconDelete] ⚠️ Point "${pointName}" not found in DB (memory-only) — continuing cleanup`);
            }

            // Remove from workflowState.adjustedCoordinates (all name field variants)
            if (Array.isArray(workflowState?.adjustedCoordinates)) {
              workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.filter((c: any) => {
                const cId = c.id || c.pointId || c.name || c.label;
                return cId !== pointName;
              });
            }

            // Remove from in-memory tracking maps
            dbPointNames.value.delete(pointName);
            dbPointIds.value.delete(pointName);

            // Persist updated adjusted coordinates to workflow step
            try {
              await api.patch(`/survey-projects/${projectId}/workflow`, {
                step: 'calculations-part1',
                action: 'update',
                metadata: {
                  adjusted_coordinates: workflowState.adjustedCoordinates,
                  beacon_delete: { name: pointName, at: new Date().toISOString() },
                  timestamp: new Date().toISOString()
                }
              });
            } catch (e) {
              console.warn('[BeaconDelete] ⚠️ Could not persist deletion to workflow state:', e);
            }

            // Refresh map survey peg layer
            handleRenameComplete([]);
            console.log(`[BeaconDelete] ✅ Deleted beacon "${pointName}"`);

          } catch (err: any) {
            alert(`Failed to delete beacon "${pointName}": ${err?.response?.data?.error || err?.message || 'Unknown error'}`);
          }
        });
      }
    }, 0);
  });

  console.log('[MapLibre] ✅ Survey points added successfully');
  
  // Verify layers were added
  setTimeout(() => {
    if (map) {
      const layers = map.getStyle().layers;
      console.log('[MapLibre] 🔍 Layer verification:');
      console.log('  - Trig beacon layer:', layers?.some((l: any) => l.id === 'trig-beacons-symbol') ? '✅ Found' : '❌ Not found');
      console.log('  - Survey peg layer:', layers?.some((l: any) => l.id === 'survey-pegs-circle') ? '✅ Found' : '❌ Not found');
      console.log('  - Trig labels:', layers?.some((l: any) => l.id === 'trig-beacons-labels') ? '✅ Found' : '❌ Not found');
      console.log('  - Peg labels:', layers?.some((l: any) => l.id === 'survey-pegs-labels') ? '✅ Found' : '❌ Not found');
      
      const trigSource = map.getSource('trig-beacons') as any;
      const pegSource = map.getSource('survey-pegs') as any;
      if (trigSource && trigSource._data) {
        console.log('  - Trig beacon features:', trigSource._data.features?.length || 0);
      }
      if (pegSource && pegSource._data) {
        console.log('  - Survey peg features:', pegSource._data.features?.length || 0);
      }
    }
  }, 100);
}

// Toggle labels
function toggleLabels() {
  showLabels.value = !showLabels.value;
  if (map) {
    // Toggle trig beacon labels
    map.setLayoutProperty(
      'trig-beacons-labels',
      'visibility',
      showLabels.value ? 'visible' : 'none'
    );
    // Toggle survey peg labels
    map.setLayoutProperty(
      'survey-pegs-labels',
      'visibility',
      showLabels.value ? 'visible' : 'none'
    );
  }
}

// Fit view to survey pegs (main work area)
function fitToPoints() {
  if (!map || coordinatePoints.value.length === 0) {
    console.warn('[MapLibre] Cannot fit to points: no map or no points');
    return;
  }

  // Fit to survey pegs only (exclude trig beacons for focused view)
  const pegsOnly = surveyPegs.value;
  const pointsToFit = pegsOnly.length > 0 ? pegsOnly : coordinatePoints.value;
  
  console.log(`[MapLibre] Fitting to ${pointsToFit.length} points (${pegsOnly.length > 0 ? 'survey pegs' : 'all points'})...`);
  
  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  const wgs84Points = capeLoArrayToWGS84(pointsToFit as CapeLoPoint[], loZone);
  const bounds = calculateWGS84Bounds(wgs84Points);

  console.log('[MapLibre] Target bounds:', {
    southwest: [bounds.minLng, bounds.minLat],
    northeast: [bounds.maxLng, bounds.maxLat],
    center: bounds.center
  });

  map.fitBounds(
    [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
    {
      padding: 80,      // More padding for better visibility
      minZoom: 14,      // Don't zoom out too far for survey areas
      maxZoom: 19,      // OSM tile server maximum zoom level
      duration: 1000
    }
  );
  
  console.log('[MapLibre] ✅ Fit bounds complete');
}

// Toggle satellite imagery
function toggleSatellite() {
  satelliteVisible.value = !satelliteVisible.value;
  if (map) {
    map.setLayoutProperty(
      'satellite-layer',
      'visibility',
      satelliteVisible.value ? 'visible' : 'none'
    );
    map.setLayoutProperty(
      'osm-layer',
      'visibility',
      satelliteVisible.value ? 'none' : 'visible'
    );
  }
}

// ============================================================================
// AI PARCEL DETECTION HANDLERS
// ============================================================================

/**
 * Handle AI parcels detected event
 */
function handleAIParcelsDetected(result: ParcelDetectionResult) {
  console.log('[MapLibre] 🤖 AI detected', result.summary.parcelsDetected, 'parcels');
  console.log('[MapLibre] 🤖 High confidence:', result.summary.highConfidence);
  console.log('[MapLibre] 🤖 Medium confidence:', result.summary.mediumConfidence);
  console.log('[MapLibre] 🤖 Low confidence:', result.summary.lowConfidence);
  
  aiDetectionResult.value = result;
  detectedParcels.value = result.parcels;
  
  // Display all detected parcels on map with confidence-based colors
  displayDetectedParcelsOnMap(result.parcels);
}

/**
 * Handle AI parcel selected event (user clicks "Add to Map" on a detected parcel)
 */
function handleAIParcelSelected(parcel: DetectedParcel) {
  console.log('[MapLibre] 🤖 User selected AI parcel:', parcel.designation);
  console.log('[MapLibre] 🤖 Confidence:', (parcel.confidence * 100).toFixed(0) + '%');
  console.log('[MapLibre] 🤖 Area:', parcel.areaFormatted);
  console.log('[MapLibre] 🤖 Points:', parcel.boundaryPoints.length);
  
  // Add to map and compute area
  addAIParcelToMap(parcel);
}

/**
 * Display all detected parcels on map with semi-transparent polygons
 */
function displayDetectedParcelsOnMap(detectedParcels: DetectedParcel[]) {
  if (!map) return;
  
  console.log('[MapLibre] 🤖 Displaying', detectedParcels.length, 'detected parcels on map');
  
  // TODO: Add semi-transparent polygons for all detected parcels
  // Color-coded by confidence: green (≥90%), amber (70-90%), red (<70%)
  
  detectedParcels.forEach(parcel => {
    const color = getConfidenceColor(parcel.confidence);
    console.log(`[MapLibre] 🤖 ${parcel.designation}: ${color} (${(parcel.confidence * 100).toFixed(0)}%)`);
    
    // Add polygon visualization (implementation pending)
    // addPolygonToMap(parcel, color, 0.3) // 30% opacity
  });
}

/**
 * Add AI-detected parcel to the parcels array and compute area
 */
async function addAIParcelToMap(parcel: DetectedParcel) {
  console.log('[MapLibre] 🤖 Adding AI parcel to map:', parcel.designation);
  console.log('[MapLibre] 🤖 Confidence:', (parcel.confidence * 100).toFixed(0) + '%');
  console.log('[MapLibre] 🤖 Predicted area:', parcel.areaFormatted);
  
  // Convert detected parcel coordinates to the format expected by existing system
  const points = parcel.coordinates.map(c => {
    // Find the full point data from coordinatePoints
    const fullPoint = coordinatePoints.value.find((p: any) => p.id === c.pointId);
    return {
      id: c.pointId,
      y: c.y,
      x: c.x,
      status: fullPoint?.status || 'F',
      description: fullPoint?.description || ''
    };
  });
  
  // Create new parcel in existing format (matching Parcel type)
  const newParcel: Parcel = {
    designation: parcel.designation,
    points: points
    // areaResult will be added after computation
  };
  
  // Add to parcels array
  parcels.value.push(newParcel);
  const parcelIndex = parcels.value.length - 1;
  
  console.log('[MapLibre] 🤖 Parcel added to array. Total parcels:', parcels.value.length);
  
  // Compute area using existing areaCompute service (same as manual drawing)
  try {
    isComputing.value = true;
    
    const response = await areaCompute({
      points: newParcel.points.map(p => ({ y: p.y, x: p.x })),
      includeResiduals: true,
      roundMetersDecimals: 2,
      roundHectaresDecimals: 4
    });
    
    // Update parcel with results
    parcels.value[parcelIndex].areaResult = response;
    
    const closureError = Math.sqrt(
      (response.residuals?.sumDy || 0) ** 2 + (response.residuals?.sumDx || 0) ** 2
    );
    
    console.log(`[MapLibre] 🤖 ✅ Area computed for ${parcel.designation}:`);
    console.log(`  - AI predicted: ${parcel.areaFormatted}`);
    console.log(`  - Actual computed: ${formatArea(response.area)}`);
    console.log(`  - Closure error: ${closureError.toFixed(3)}m`);
    console.log(`  - Closure ratio: 1:${Math.round(calculateClosureRatio(parcels.value[parcelIndex])).toLocaleString()}`);
    
    // Add completed polygon to map
    addCompletedParcelToMap(parcels.value[parcelIndex]);
    
    // Auto-save to database
    await autoSaveParcel(parcels.value[parcelIndex], closureError);
    
    console.log('[MapLibre] 🤖 ✅ AI parcel fully integrated:', parcel.designation);
    
  } catch (error) {
    console.error('[MapLibre] 🤖 ❌ Error computing AI parcel area:', error);
    alert(`Failed to compute area for AI-detected parcel "${parcel.designation}". Check console for details.`);
    
    // Remove failed parcel
    parcels.value.splice(parcelIndex, 1);
  } finally {
    isComputing.value = false;
  }
}

/**
 * Get color based on confidence level
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#10b981'; // green-500
  if (confidence >= 0.7) return '#f59e0b'; // amber-500
  return '#ef4444'; // red-500
}

// ============================================================================
// END AI PARCEL DETECTION HANDLERS
// ============================================================================

// Zoom to a specific trig beacon point
function zoomToPoint(point: any) {
  if (!map) return;
  
  // Transform the point to WGS84
  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  const wgs84Point = capeLoToWGS84({
    id: point.id,
    x: point.x,
    y: point.y,
    status: point.status
  }, loZone);
  
  if (!wgs84Point) return;
  
  console.log(`[MapLibre] 🎯 Zooming to trig beacon: ${point.id}`);
  
  // Fly to the point with animation
  map.flyTo({
    center: [wgs84Point.lng, wgs84Point.lat],
    zoom: 17,
    duration: 1500,
    essential: true
  });
  
  // Show popup after animation
  setTimeout(() => {
    new maplibregl.Popup({ closeOnClick: true })
      .setLngLat([wgs84Point.lng, wgs84Point.lat])
      .setHTML(`
        <div class="p-2">
          <h3 class="font-semibold text-red-800">🔺 ${point.id}</h3>
          <p class="text-sm text-gray-600">Trig Beacon</p>
          <p class="text-xs text-gray-500">${point.description || 'N/A'}</p>
          <p class="text-xs text-gray-500 mt-1">
            ${wgs84Point.lng.toFixed(6)}, ${wgs84Point.lat.toFixed(6)}
          </p>
        </div>
      `)
      .addTo(map!);
  }, 1600);
}

// ============================================================================
// DRAWING FUNCTIONS - SI 727/1979 Interactive Polygon Builder
// ============================================================================

/**
 * Start drawing mode
 */
function startDrawing() {
  // Check if we have coordinate points to digitize
  if (coordinatePoints.value.length === 0) {
    alert(
      '⚠️ No Coordinate Points Available\n\n' +
      'Cannot start digitizing - no survey points found.\n\n' +
      'Please ensure:\n' +
      '1. You have completed Calculations Part 1 (coordinate adjustments)\n' +
      '2. The workflow state contains adjusted coordinates\n' +
      '3. You are accessing this step through the normal workflow\n\n' +
      'If you just refreshed the page, the workflow data may have been lost.'
    );
    console.error('[MapLibre] ❌ Cannot start drawing - no coordinate points available');
    console.log('[MapLibre] Workflow state:', workflowState);
    console.log('[MapLibre] Adjusted coordinates:', workflowState?.adjustedCoordinates?.length || 0);
    return;
  }
  
  isDrawing.value = true;
  selectedPoints.value = [];
  overlapMessage.value = null;
  if (overlapSource) {
    overlapSource.setData({ type: 'FeatureCollection', features: [] });
  }
  if (map) map.getCanvas().style.cursor = 'crosshair';
  console.log('[MapLibre] 🎨 Drawing mode started');
  console.log('[MapLibre] Available points for digitizing:', coordinatePoints.value.length);
}

/**
 * Cancel drawing mode
 */
function cancelDrawing() {
  isDrawing.value = false;
  selectedPoints.value = [];
  if (map) map.getCanvas().style.cursor = '';
  updateTempPolygon([]);
  console.log('[MapLibre] ❌ Drawing cancelled');
}

function dismissOverlapWarning() {
  overlapMessage.value = null;
  if (overlapSource) {
    overlapSource.setData({ type: 'FeatureCollection', features: [] });
  }
}

/**
 * Check if adding a new point would create a self-intersecting polygon
 * Uses useParcelGeometry composable for consistent validation
 */
function wouldCreateIntersection(newPoint: any): boolean {
  if (selectedPoints.value.length < 2) return false;
  
  // Create temporary coordinates array including the new point
  const tempCoords = [
    ...selectedPoints.value.map(p => ({ y: p.y, x: p.x })),
    { y: newPoint.y, x: newPoint.x }
  ];
  
  // Close the polygon for validation
  tempCoords.push(tempCoords[0]);
  
  // Use composable's checkSelfIntersections function
  // Note: We need to check if the composable has this as an exported function
  // For now, use the generatePolygon which includes self-intersection check
  const { generatePolygon } = useParcelGeometry();
  
  const pointIds = [
    ...selectedPoints.value.map(p => p.id),
    newPoint.id
  ];
  
  const allPoints = coordinatePoints.value.map(p => ({
    pointId: p.id,
    y: p.y,
    x: p.x,
    status: 'PEG',
    description: '',
    surveyDate: new Date().toISOString().split('T')[0],
    fieldBookPage: '',
    calculationsPage: 0,
    adjustment: {
      isDuplicate: false,
      observationCount: 1,
      method: 'gps' as const
    }
  }));
  
  const result = generatePolygon(pointIds, allPoints);
  
  // If validation failed due to self-intersections, return true
  return result ? result.validation.selfIntersections > 0 : false;
}

/**
 * Handle survey peg click during drawing
 */
function handlePointClick(point: any) {
  if (!isDrawing.value) return;
  
  // Check if starting point clicked again (auto-complete)
  if (selectedPoints.value.length >= 3 && point.id === selectedPoints.value[0].id) {
    console.log('[MapLibre] 🎯 Starting point clicked again - auto-completing polygon');
    completePolygon();
    return;
  }
  
  // REFINEMENT 1: Prevent repeated vertices
  const isDuplicate = selectedPoints.value.some(p => p.id === point.id);
  if (isDuplicate) {
    console.warn('[MapLibre] ⚠️ Point already selected:', point.id);
    alert(`Point ${point.id} is already selected!\n\nCadastral survey regulation: Each vertex must be unique.`);
    return;
  }
  
  // REFINEMENT 2: Prevent self-intersecting polygons
  // Skip when in insert mode — wouldCreateIntersection tests an append, giving a
  // false positive for mid-sequence insertions between two adjacent vertices.
  const isInsertingMidSequence = isEditingVertices.value && insertAfterIndex.value !== null;
  if (!isInsertingMidSequence && wouldCreateIntersection(point)) {
    console.warn('[MapLibre] ⚠️ Would create crossing polygon');
    alert(`Cannot add point ${point.id} - it would create a self-intersecting polygon!\n\nCadastral survey regulation: Parcel boundaries must not cross themselves.`);
    return;
  }
  
  // Insert or append
  if (isEditingVertices.value && insertAfterIndex.value !== null) {
    const insertAt = insertAfterIndex.value + 1;
    selectedPoints.value.splice(insertAt, 0, point);
    console.log(`[MapLibre] ➕ Point ${point.id} inserted at position ${insertAt} (after vertex ${insertAfterIndex.value + 1})`);
    insertAfterIndex.value = null; // clear insert mode after one insertion
  } else {
    selectedPoints.value.push(point);
    console.log(`[MapLibre] 📍 Point selected: ${point.id} (${selectedPoints.value.length} total)`);
  }

  // Update temporary polygon preview
  updateTempPolygon(selectedPoints.value);
}

/**
 * Undo last selected point
 */
function undoLastPoint() {
  if (selectedPoints.value.length === 0) return;
  
  const removed = selectedPoints.value.pop();
  console.log(`[MapLibre] ↩️ Removed point: ${removed?.id}`);
  
  // Update temporary polygon preview
  updateTempPolygon(selectedPoints.value);
}

/**
 * Complete polygon and compute area
 */
async function completePolygon() {
  if (selectedPoints.value.length < 3) {
    alert('Minimum 3 points required to create a polygon.');
    return;
  }
  
  // Prompt for designation
  const designation = prompt('Enter parcel designation (e.g., LOT 1, STAND 2283):');
  if (!designation || designation.trim() === '') {
    console.log('[MapLibre] Polygon completion cancelled - no designation provided');
    return;
  }
  
  // === Check for duplicate designation ===
  const duplicateParcel = parcels.value.find(p => 
    p.designation.toLowerCase() === designation.trim().toLowerCase()
  );
  if (duplicateParcel) {
    overlapMessage.value = `Duplicate designation: Parcel "${designation.trim()}" already exists. Each parcel must have a unique designation.`;
    console.warn('[MapLibre] ❌ Duplicate designation detected - parcel rejected');
    return;
  }
  
  // === Overlap guard: prevent parcels from overlaying each other ===
  // Build new polygon in WGS84 (same coordinates used for map rendering)
  if (parcelsSource && selectedPoints.value.length >= 3) {
    const loZone = workflowState?.projectInfo?.centralMeridian || 31;
    const wgs84New = capeLoArrayToWGS84(selectedPoints.value.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y
    })), loZone);

    const newCoords: [number, number][] = wgs84New.map(p => [p.lng, p.lat]);
    // Close the polygon ring
    if (newCoords.length > 0) {
      newCoords.push(newCoords[0]);
    }

    const currentData = (parcelsSource as any)._data as any;
    const features = currentData?.features || [];

    const isNewOutsideFigure = designation.trim().toLowerCase().includes('outside figure');

    let conflictingFeature: any = null;
    for (const f of features) {
      if (!f.geometry) continue;

      // Extract exterior ring from Polygon or MultiPolygon
      let ring: [number, number][] = [];
      if (f.geometry.type === 'Polygon') {
        ring = (f.geometry.coordinates?.[0]) || [];
      } else if (f.geometry.type === 'MultiPolygon') {
        ring = (f.geometry.coordinates?.[0]?.[0]) || [];
      } else {
        continue;
      }
      if (!ring || ring.length < 4) continue;
      
      // Check if either parcel is an "Outside Figure" parcel
      const existingDesignation = (f.properties?.designation || f.properties?.stand || '').toLowerCase();
      const isExistingOutsideFigure = existingDesignation.includes('outside figure');
      
      if (polygonsOverlap(newCoords, ring)) {
        // Allow overlap when either parcel is Outside Figure (standard cadastral practice)
        if (isExistingOutsideFigure || isNewOutsideFigure) {
          console.log(`[MapLibre] ✅ Allowing Outside Figure overlap: new="${designation.trim()}", existing="${f.properties?.designation || 'unknown'}"`);
          continue;
        }
        
        conflictingFeature = f;
        break;
      }
    }

    if (conflictingFeature) {
      overlapMessage.value = `New parcel "${designation.trim()}" overlaps existing parcel "${conflictingFeature.properties?.designation || 'unknown'}".`;
      if (overlapSource) {
        overlapSource.setData({
          type: 'FeatureCollection',
          features: [conflictingFeature]
        });
      }
      console.warn('[MapLibre] ❌ Overlap detected - new parcel rejected to prevent spatial overlay');
      return;
    }
  }

  console.log(`[MapLibre] 📊 Computing area for parcel: ${designation}`);
  
  // Create parcel object
  const parcel: Parcel = {
    designation: designation.trim(),
    points: [...selectedPoints.value]
  };
  
  // Add to parcels list (computing)
  parcels.value.push(parcel);
  const parcelIndex = parcels.value.length - 1;
  
  // Reset drawing state
  isDrawing.value = false;
  selectedPoints.value = [];
  updateTempPolygon([]);
  
  if (map) {
    map.getCanvas().style.cursor = '';
  }
  
  // Compute area in background
  try {
    isComputing.value = true;
    
    // Call areaCompute service
    const response = await areaCompute({
      points: parcel.points.map(p => ({ y: p.y, x: p.x })),
      includeResiduals: true,
      roundMetersDecimals: 2,
      roundHectaresDecimals: 4
    });
    
    // Update parcel with results
    parcels.value[parcelIndex].areaResult = response;
    
    const closureError = Math.sqrt(
      (response.residuals?.sumDy || 0) ** 2 + (response.residuals?.sumDx || 0) ** 2
    );
    
    console.log(`[MapLibre] ✅ Area computed for ${designation}:`);
    console.log(`  - Area: ${formatArea(response.area)}`);
    console.log(`  - Closure error: ${closureError.toFixed(3)}m`);
    console.log(`  - Closure ratio: 1:${Math.round(calculateClosureRatio(parcels.value[parcelIndex])).toLocaleString()}`);
    
    // Add completed polygon to map
    addCompletedParcelToMap(parcels.value[parcelIndex]);
    
    // === AUTO-SAVE TO DATABASE ===
    await autoSaveParcel(parcels.value[parcelIndex], closureError);
    
  } catch (error) {
    console.error('[MapLibre] ❌ Error computing area:', error);
    alert('Failed to compute area. Check console for details.');
    
    // Remove failed parcel
    parcels.value.splice(parcelIndex, 1);
  } finally {
    isComputing.value = false;
  }
}

/**
 * Load existing parcels from database
 */
async function loadParcelsFromDatabase() {
  if (!workflowState?.projectInfo?.projectId) {
    console.log('[MapLibre] 📦 No project ID - skipping parcel load');
    return;
  }
  
  try {
    console.log('[MapLibre] 📦 Loading existing parcels from database...');
    console.log('[MapLibre] 📦 Project ID:', workflowState.projectInfo.projectId);
    
    const existingParcels = await listLandParcels(workflowState.projectInfo.projectId);
    
    console.log('[MapLibre] 📦 API Response:', existingParcels);
    console.log('[MapLibre] 📦 Response type:', typeof existingParcels);
    console.log('[MapLibre] 📦 Is array?', Array.isArray(existingParcels));
    
    if (!existingParcels || existingParcels.length === 0) {
      console.log('[MapLibre] 📝 No existing parcels found - starting fresh');
      return;
    }
    
    console.log(`[MapLibre] ✅ Found ${existingParcels.length} existing parcels in API response`);
    
    // DEBUG: Check each parcel's status and geometry
    existingParcels.forEach((p, i) => {
      console.log(`[MapLibre] 📦 Parcel ${i + 1}: ${p.designation || p.stand} | status: ${p.status} | has geom: ${!!p.geom} | has geometry: ${!!p.geometry}`);
    });
    
    // Build designation→ID lookup for ALL parcels (used by autoSaveParcel to detect existing parcels)
    for (const p of existingParcels) {
      const name = p.designation || p.stand;
      if (name && p.id) {
        existingParcelIds.value.set(name, p.id);
      }
    }
    console.log(`[MapLibre] 📇 Indexed ${existingParcelIds.value.size} parcel designations for duplicate detection`);
    
    // Check if coordinate points are available for vertex matching
    const hasCoordinatePoints = coordinatePoints.value && coordinatePoints.value.length > 0;
    if (!hasCoordinatePoints) {
      console.warn('[MapLibre] ⚠️ WARNING: No coordinate points available for vertex matching');
      console.warn('[MapLibre] 💡 Parcels will load with generic vertex names (P1, P2, etc.)');
      console.warn('[MapLibre] 💡 To get proper beacon names, complete Calculations Part 1 first');
      
      // Show user warning
      setTimeout(() => {
        alert('⚠️ Coordinate Points Not Available\n\n' +
              'Parcels will load with generic vertex names (P1, P2, etc.) instead of actual beacon names.\n\n' +
              'To get proper beacon names in PDF exports, please complete Calculations Part 1 first.');
      }, 1000);
    }
    
    const skippedParcelsNoPoints: string[] = [];

    const getExteriorRing = (rawGeometry: any): [number, number][] => {
      let geometry = rawGeometry;

      if (typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch {
          return [];
        }
      }

      if (!geometry?.coordinates) {
        return [];
      }

      if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
        return geometry.coordinates[0] as [number, number][];
      }

      if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates?.[0]?.[0])) {
        return geometry.coordinates[0][0] as [number, number][];
      }

      return [];
    };

    // Convert database parcels to UI parcels format
    for (const dbParcel of existingParcels) {
      // ALWAYS extract from geometry and re-match to get correct beacon names
      // (ignore old metadata which may have generic A, B, C names)
      let capeLoPoints = [];
      
      // Check both 'geom' (from backend) and 'geometry' (alternative field name)
      const geometry = dbParcel.geom || dbParcel.geometry;
      
      const coords = getExteriorRing(geometry);

      if (coords.length > 0) {
        // QGIS-digitized parcel: Extract points from geometry and match to beacon names
        console.log(`[MapLibre] 🔧 Extracting Cape Lo points from geometry for QGIS parcel ${dbParcel.stand}`);
        console.log(`[MapLibre] 🔍 Geometry type:`, geometry?.type);
        console.log(`[MapLibre] 🔍 Exterior ring points:`, coords.length);
        
        // Define tolerance for coordinate matching
        // INCREASED from 0.01m to 0.5m to handle minor coordinate differences after CSV reimport
        // This allows parcels to be restored even when beacon names change but coordinates are similar
        const tolerance = 0.5; // 0.5m (50cm) tolerance for coordinate matching
        
        {
          // Skip last point (duplicate of first in closed polygon)
          const numPoints = coords.length - 1; // Exclude closing duplicate
          console.log(`[MapLibre] 🔍 Will process ${numPoints} points (excluding duplicate closing point)`);
          
          for (let i = 0; i < numPoints; i++) {
            console.log(`[MapLibre] 🔍 Processing coordinate ${i}/${numPoints - 1}:`, coords[i]);
            
            try {
              // PERMANENT FIX: Use geoJsonToCapeLoPoint utility
              const capeLoPoint = geoJsonToCapeLoPoint(coords[i]);
              console.log(`[MapLibre] 🔍 geoJsonToCapeLoPoint result for coord ${i}:`, capeLoPoint);
              
              if (!capeLoPoint || typeof capeLoPoint.y !== 'number' || typeof capeLoPoint.x !== 'number') {
                console.error(`[MapLibre] ❌ geoJsonToCapeLoPoint returned invalid result:`, capeLoPoint);
                continue;
              }
              
              const vertexY = capeLoPoint.y; // Westing (~97k)
              const vertexX = capeLoPoint.x; // Southing (~2247k)
              
              console.log(`[MapLibre] 🔍 Vertex ${i}: Y=${vertexY.toFixed(2)}, X=${vertexX.toFixed(2)}`);
              
              if (hasCoordinatePoints) {
                console.log(`[MapLibre] 🔍 Looking for exact match within ${tolerance}m tolerance`);
                console.log(`[MapLibre] 🔍 Available coordinate points: ${coordinatePoints.value.length}`);
              }
              
              // Find matching coordinate point by Euclidean distance
              let matchedPoint = null;
              let minDistance = Infinity;
              
              if (hasCoordinatePoints) {
                for (const pt of coordinatePoints.value) {
                  const dist = Math.sqrt(Math.pow(pt.y - vertexY, 2) + Math.pow(pt.x - vertexX, 2));
                  if (dist < tolerance && dist < minDistance) {
                    matchedPoint = pt;
                    minDistance = dist;
                  }
                }
              }
              
              if (matchedPoint) {
                console.log(`[MapLibre] ✅ Exact match: ${matchedPoint.id} (Y=${matchedPoint.y.toFixed(2)}, X=${matchedPoint.x.toFixed(2)}) at ${minDistance.toFixed(4)}m`);
              } else {
                if (hasCoordinatePoints) {
                  // Debug: find nearest 3 points to help diagnose the issue
                  const allDistances = coordinatePoints.value.map(pt => ({
                    pt,
                    dist: Math.sqrt(Math.pow(pt.y - vertexY, 2) + Math.pow(pt.x - vertexX, 2))
                  })).sort((a, b) => a.dist - b.dist);
                  
                  console.debug(`[MapLibre] No match found within ${tolerance}m tolerance`);
                  console.debug(`[MapLibre] Nearest 3 beacons:`);
                  for (let j = 0; j < Math.min(3, allDistances.length); j++) {
                    const { pt, dist } = allDistances[j];
                    console.debug(`[MapLibre]   ${j + 1}. ${pt.id}: Y=${pt.y.toFixed(2)}, X=${pt.x.toFixed(2)}, distance=${dist.toFixed(3)}m`);
                  }
                }
              }
              
              if (matchedPoint) {
                // Use actual beacon name
                capeLoPoints.push({
                  id: matchedPoint.id,
                  y: matchedPoint.y,
                  x: matchedPoint.x,
                  status: matchedPoint.status || 'P',
                  description: matchedPoint.description || matchedPoint.id
                });
                console.log(`[MapLibre] ✅ Vertex ${i} matched to beacon ${matchedPoint.id}`);
              } else {
                // Fallback to generic name if no match found
                capeLoPoints.push({
                  id: `${dbParcel.stand}_P${i + 1}`,
                  y: vertexY,
                  x: vertexX,
                  status: 'P',
                  description: `Beacon ${i + 1}`
                });
                console.debug(`[MapLibre] Vertex ${i} not matched - using generic name`);
              }
            } catch (pointError) {
              console.error(`[MapLibre] ❌ Error processing point ${i}:`, pointError);
              continue;
            }
          }
        }
        
        console.log(`[MapLibre] ✅ Extracted ${capeLoPoints.length} points from geometry`);
      }
      
      if (capeLoPoints.length === 0) {
        skippedParcelsNoPoints.push(dbParcel.designation || dbParcel.stand);
        console.debug(`[MapLibre] No points available for parcel ${dbParcel.designation || dbParcel.stand} - skipping`);
        continue;
      }
      
      const parcel: Parcel = {
        designation: dbParcel.designation || dbParcel.stand,
        points: capeLoPoints, // Restored from metadata or extracted from geometry
        areaResult: {
          ok: true,
          area: (() => {
            const areaM2 = Number(dbParcel.area_m2) || 0;
            const absM2 = Math.abs(areaM2);
            return {
              signed_m2: areaM2,
              abs_m2: absM2,
              meters_rounded: Number(absM2.toFixed(2)),
              hectares_rounded: Number((absM2 / 10000).toFixed(4)),
              display: absM2 >= 10000
                ? { hectares: absM2 / 10000, unit: 'ha' as const }
                : { square_meters: absM2, unit: 'm2' as const }
            };
          })(),
          centroid: (() => {
            try {
              // Calculate centroid from geometry coordinates (simple average)
              const centroidCoords = getExteriorRing(geometry);
              if (centroidCoords.length > 0) {
                // GeoJSON: coords are [X, Y] order
                const sumX = centroidCoords.reduce((sum: number, c: number[]) => sum + c[0], 0);
                const sumY = centroidCoords.reduce((sum: number, c: number[]) => sum + c[1], 0);
                return { 
                  y: sumY / centroidCoords.length, 
                  x: sumX / centroidCoords.length 
                };
              }
              return { y: 0, x: 0 };
            } catch {
              return { y: 0, x: 0 };
            }
          })(),
          residuals: dbParcel.metadata?.residuals
        },
        status: dbParcel.status,
        id: dbParcel.id
      };
      
      parcels.value.push(parcel);
      savedParcels.value.set(dbParcel.designation || dbParcel.stand, dbParcel);
    }

    if (skippedParcelsNoPoints.length > 0) {
      console.warn(
        `[MapLibre] ⚠️ Skipped ${skippedParcelsNoPoints.length} parcels with no extractable ring points. Sample: ${skippedParcelsNoPoints.slice(0, 8).join(', ')}`
      );
    }
    
    console.log(`[MapLibre] ✅ Loaded ${existingParcels.length} parcels from database`);
    console.log(`[MapLibre] 📍 Parcels will be rendered on map after initialization`);
    
    // ⭐ Auto-update Outside Figure metadata with matched beacon names
    console.log('[MapLibre] 🔍 Checking for Outside Figure parcel to update metadata...');
    const outsideFigureParcel = existingParcels.find(p => 
      p.designation?.toLowerCase().includes('outside figure') ||
      p.stand?.toLowerCase().includes('outside figure')
    );
    
    if (outsideFigureParcel) {
      console.log('[MapLibre] 🔧 Found Outside Figure parcel - updating metadata with matched beacon names...');
      
      // Find the corresponding in-memory parcel with matched beacon names
      const inMemoryParcel = parcels.value.find(p => 
        p.designation?.toLowerCase().includes('outside figure')
      );
      
      if (inMemoryParcel && inMemoryParcel.points.length > 0) {
        console.log('[MapLibre] 📊 Recomputing Outside Figure with matched beacon names:', 
          inMemoryParcel.points.map(p => p.id).join(', '));
        
        try {
          // Recompute area with matched beacon names
          const response = await areaCompute({
            points: inMemoryParcel.points.map(p => ({ 
              y: p.y,  // CRITICAL FIX: No swap needed - both frontend and backend use Cape Lo (Y=Westing, X=Southing)
              x: p.x, 
              id: p.id, 
              name: p.id 
            })),
            includeResiduals: true,
            roundMetersDecimals: 2,
            roundHectaresDecimals: 4
          });
          
          console.log('[MapLibre] ✅ Outside Figure recomputed with actual beacon names');
          console.log('[MapLibre] 📊 Edges:', response.residuals?.edges?.map((e: any) => 
            `${e.from?.id || e.from?.name}-${e.to?.id || e.to?.name}`
          ).join(', '));
          
          // Update the in-memory parcel
          inMemoryParcel.areaResult = response;
          
          // Update the database metadata
          const updatedMetadata = {
            ...outsideFigureParcel.metadata,
            residuals: response.residuals,
            points: inMemoryParcel.points,
            updated_at: new Date().toISOString(),
            update_reason: 'Auto-updated with matched beacon names after load'
          };
          
          await updateLandParcel(outsideFigureParcel.id, {
            metadata: updatedMetadata
          });
          
          console.log('[MapLibre] ✅ Outside Figure metadata updated in database with actual beacon names');
          
          // Update savedParcels map
          savedParcels.value.set(outsideFigureParcel.designation || outsideFigureParcel.stand, {
            ...outsideFigureParcel,
            metadata: updatedMetadata
          });
          
        } catch (error) {
          console.error('[MapLibre] ❌ Failed to update Outside Figure metadata:', error);
        }
      } else {
        console.warn('[MapLibre] ⚠️ Outside Figure parcel found in DB but not in memory - skipping update');
      }
    } else {
      console.log('[MapLibre] ℹ️ No Outside Figure parcel found - skipping metadata update');
    }
    
  } catch (error) {
    console.error('[MapLibre] ❌ Failed to load parcels from database:', error);
  }
}

/**
 * Refresh parcels from database (reload with updated area values)
 */
async function refreshParcelsFromDatabase() {
  console.log('[MapLibre] 🔄 Refreshing parcels from database...');
  
  // Clear existing parcels
  parcels.value = [];
  savedParcels.value.clear();
  
  // Reload from database
  await loadParcelsFromDatabase();
  
  // Re-render parcels on map
  if (map && savedParcels.value.size > 0) {
    console.log('[MapLibre] 🗺️ Re-rendering parcels on map...');
    
    const features = Array.from(savedParcels.value.values()).map((dbParcel, index) => {
      const parcelName = dbParcel.designation || dbParcel.stand;
      console.log(`[MapLibre] Processing parcel ${index + 1}:`, parcelName);
      
      // Format area properly based on size
      const areaValue = Math.abs(Number(dbParcel.area_m2 ?? dbParcel.area_sqm ?? 0));
      const areaDisplay = areaValue >= 10000
        ? `${(areaValue / 10000).toFixed(4)} ha`
        : `${areaValue.toFixed(2)} m²`;
      
      // Parse geometry - handle both GeoJSON object and string
      let geometry = dbParcel.geom || dbParcel.geometry;
      if (typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch (e) {
          console.error(`[MapLibre] Failed to parse geometry for ${parcelName}:`, e);
          return null;
        }
      }
      
      // Remove CRS from geometry (MapLibre doesn't support it)
      if (geometry && geometry.crs) {
        delete geometry.crs;
      }
      
      // Transform Cape Lo coordinates to WGS84 for MapLibre
      // CRITICAL: Backend ST_Transform may not actually convert coordinate values
      // The coordinates appear to be in the project's native CRS (Lo 29), not Lo 31
      // Use the project's central meridian for correct transformation
      if (geometry?.coordinates) {
        const loZone = workflowState?.projectInfo?.centralMeridian || 31;
        geometry = transformGeometryToWGS84(geometry, loZone);
      }
      
      return {
        type: 'Feature' as const,
        geometry: geometry,
        properties: {
          designation: parcelName,
          area: areaDisplay,
          status: dbParcel.status || 'draft',
          closureRatio: dbParcel.metadata?.closure_ratio,
          closureError: typeof dbParcel.closure_error_m === 'number' ? dbParcel.closure_error_m.toFixed(3) : '0.000'
        }
      };
    }).filter(f => f !== null);
    
    // Update the parcels source
    const source = map.getSource('parcels') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: features
      });
      console.log(`[MapLibre] ✅ Rendered ${features.length} parcels on map with updated areas`);
    }
  }
  
  console.log('[MapLibre] ✅ Parcels refreshed successfully');
}

// ============================================================================
// VERTEX EDITING — add / remove vertices on an existing saved parcel
// ============================================================================

/**
 * Enter vertex-editing mode for a saved parcel.
 * Pre-loads the parcel's existing matched points into selectedPoints so the
 * user can add or remove vertices before committing the new geometry.
 */
function startEditingVertices(designation: string) {
  const dbParcel = savedParcels.value.get(designation);
  if (!dbParcel) {
    alert(`Cannot edit vertices: parcel "${designation}" not found.`);
    return;
  }

  // Resolve DB id
  const dbId = dbParcel.id ?? existingParcelIds.value.get(designation) ?? null;
  if (!dbId) {
    alert(`Cannot edit vertices: parcel "${designation}" has no database ID.`);
    return;
  }

  // Get the matched Cape Lo points stored in metadata (or from in-memory parcel)
  let startPoints: any[] = dbParcel.metadata?.cape_lo_points ?? [];
  if (startPoints.length === 0) {
    const memParcel = parcels.value.find(p => p.designation === designation);
    if (memParcel) startPoints = memParcel.points;
  }
  if (startPoints.length === 0) {
    alert(`Cannot edit vertices: no vertex data found for "${designation}". Try refreshing first.`);
    return;
  }

  // Map to the same shape handlePointClick uses
  selectedPoints.value = startPoints.map((p: any) => ({
    id: p.id,
    y: p.y,
    x: p.x,
    status: p.status || 'P',
    description: p.description || p.id
  }));

  editingParcelDesignation.value = designation;
  editingParcelDbId.value = dbId as number;
  insertAfterIndex.value = null; // always start in append mode
  isEditingVertices.value = true;
  isDrawing.value = true; // reuse drawing mode so handlePointClick + undo work

  // Show the temporary polygon preview with current vertices
  updateTempPolygon(selectedPoints.value);

  if (map) map.getCanvas().style.cursor = 'crosshair';
  console.log(`[VertexEdit] ✏️ Editing vertices of "${designation}" — ${selectedPoints.value.length} existing points pre-loaded`);
}

/**
 * Cancel vertex editing without saving.
 */
function cancelVertexEdit() {
  isEditingVertices.value = false;
  isDrawing.value = false;
  editingParcelDesignation.value = null;
  editingParcelDbId.value = null;
  insertAfterIndex.value = null;
  selectedPoints.value = [];
  updateTempPolygon([]);
  if (map) map.getCanvas().style.cursor = '';
  console.log('[VertexEdit] ❌ Vertex edit cancelled');
}

/**
 * Remove a specific point from the current selectedPoints list (vertex deletion).
 */
function removeVertexByIndex(idx: number) {
  selectedPoints.value.splice(idx, 1);
  updateTempPolygon(selectedPoints.value);
}

/**
 * Commit vertex edits: recompute area + persist new geometry to DB.
 */
async function commitVertexEdit() {
  if (selectedPoints.value.length < 3) {
    alert('A parcel needs at least 3 vertices.');
    return;
  }

  const designation = editingParcelDesignation.value!;
  const dbId = editingParcelDbId.value!;

  // Exit drawing/editing UI state immediately
  isEditingVertices.value = false;
  isDrawing.value = false;
  editingParcelDesignation.value = null;
  editingParcelDbId.value = null;
  updateTempPolygon([]);
  if (map) map.getCanvas().style.cursor = '';

  const newPoints = [...selectedPoints.value];
  selectedPoints.value = [];

  isComputing.value = true;
  try {
    // 1. Recompute area with new vertices
    const areaResult = await areaCompute({
      points: newPoints.map(p => ({ y: p.y, x: p.x, id: p.id, name: p.id })),
      includeResiduals: true,
      roundMetersDecimals: 2,
      roundHectaresDecimals: 4
    });

    const closureError = Math.sqrt(
      (areaResult.residuals?.sumDy || 0) ** 2 + (areaResult.residuals?.sumDx || 0) ** 2
    );

    // 2. Build Cape Lo GeoJSON geometry
    const coordinates = newPoints.map(p => [p.x, p.y]);
    coordinates.push(coordinates[0]); // close ring
    const geometry = {
      type: 'Polygon',
      coordinates: [coordinates],
      crs: { type: 'name', properties: { name: 'EPSG:22291' } }
    } as any;

    // 3. Build updated metadata
    const closureRatio = (() => {
      const perimeter = newPoints.reduce((sum, p, i) => {
        const next = newPoints[(i + 1) % newPoints.length];
        return sum + Math.sqrt((next.y - p.y) ** 2 + (next.x - p.x) ** 2);
      }, 0);
      const err = closureError || 0.001;
      return perimeter / err;
    })();

    const updatedMetadata = {
      points_count: newPoints.length,
      closure_ratio: `1:${Math.round(closureRatio).toLocaleString()}`,
      closure_error_m: closureError,
      residuals: areaResult.residuals,
      cape_lo_points: newPoints.map(p => ({ id: p.id, y: p.y, x: p.x, status: p.status, description: p.description })),
      vertex_edited_at: new Date().toISOString()
    };

    // 4. Persist to DB
    await updateLandParcel(dbId, {
      geom: geometry,
      metadata: updatedMetadata
    });

    console.log(`[VertexEdit] ✅ "${designation}" geometry updated in DB (${newPoints.length} vertices, area ${areaResult.area?.abs_m2?.toFixed(2)} m²)`);

    // 5. Refresh everything from DB so map labels + parcel cards are consistent
    await refreshParcelsFromDatabase();

  } catch (err: any) {
    console.error('[VertexEdit] ❌ Failed to commit vertex edit:', err);
    alert(`Failed to save vertex edit: ${err?.response?.data?.error || err?.message || 'Unknown error'}`);
  } finally {
    isComputing.value = false;
  }
}

/**
 * Auto-save parcel to database
 */
async function autoSaveParcel(parcel: Parcel, closureError: number) {
  if (!workflowState?.projectInfo?.projectId) {
    console.warn('[MapLibre] ⚠️ No project ID - skipping auto-save');
    console.warn('[MapLibre] ⚠️ workflowState:', workflowState);
    return;
  }
  
  try {
    isSaving.value = true;
    console.log(`[MapLibre] 💾 Auto-saving parcel ${parcel.designation} to database...`);
    console.log(`[MapLibre] 💾 Project ID: ${workflowState.projectInfo.projectId}`);
    
    // LOSSLESS DATA FLOW: Send Cape Lo coordinates directly (no transformation)
    // Backend will store directly in EPSG:22291 without WGS84 round-trip
    // This preserves original CSV precision and ensures perfect topological matching
    
    // Create GeoJSON Polygon in Cape Lo 31 (EPSG:22291)
    // GeoJSON standard: coordinates are [X, Y] order
    // Cape Lo: X=Southing (~2.2M), Y=Westing (~97k)
    
    // DEBUG: Log first point to verify coordinate values
    if (parcel.points.length > 0) {
      console.log('[MapLibre] 🔍 DEBUG First point values:', {
        'p.x': parcel.points[0].x,
        'p.y': parcel.points[0].y,
        'Expected X (Southing)': '~2247733',
        'Expected Y (Westing)': '~97581'
      });
    }
    
    const coordinates = parcel.points.map(p => [p.x, p.y]);
    coordinates.push(coordinates[0]); // Close the ring
    
    console.log('[MapLibre] 🔍 DEBUG First coordinate being saved:', coordinates[0]);
    
    const geometry = {
      type: 'Polygon',
      coordinates: [coordinates],
      // Explicitly specify CRS as Cape Lo 31 (EPSG:22291)
      crs: {
        type: 'name',
        properties: {
          name: 'EPSG:22291'
        }
      }
    } as any;
    
    console.log('[MapLibre] 📐 Sending Cape Lo coordinates directly (lossless):', {
      firstPoint: { y: parcel.points[0].y, x: parcel.points[0].x },
      pointCount: parcel.points.length,
      crs: 'EPSG:22291'
    });
    
    // ========== BACKEND VALIDATION (PostGIS) ==========
    // Check if a parcel with this designation already exists in the database
    const existingDbId = existingParcelIds.value.get(parcel.designation);
    if (existingDbId) {
      console.log(`[MapLibre] 📇 Found existing parcel "${parcel.designation}" (DB ID: ${existingDbId}) - will update instead of create`);
    }
    
    console.log('[MapLibre] 🔍 Running backend validation (PostGIS)...');
    
    try {
      const validation = await validateParcel(
        workflowState.projectInfo.projectId,
        parcel.designation,
        parcel.points,
        coordinatePoints.value,
        geometry,
        existingDbId // Exclude self from duplicate check when updating existing parcel
      );
      
      if (!validation.canSave) {
        console.warn('[MapLibre] ❌ Validation failed:', validation);
        
        // Format and show detailed error message
        const errorMessage = formatValidationMessage(validation);
        alert(errorMessage);
        
        // Don't save - validation failed
        isSaving.value = false;
        return;
      }
      
      // Show warnings but allow save
      if (validation.warnings.length > 0) {
        console.warn('[MapLibre] ⚠️ Validation warnings:', validation.warnings);
      }
      
      console.log('[MapLibre] ✅ Backend validation passed');
      
    } catch (validationError) {
      console.error('[MapLibre] ⚠️ Backend validation failed (network/server error):', validationError);
      // Continue with save - don't block on validation service failure
      console.warn('[MapLibre] Proceeding with save despite validation service failure');
    }
    
    // Calculate closure ratio
    const closureRatio = calculateClosureRatio(parcel);
    
    // Extract area value (handle both number and object formats)
    const areaValue = typeof parcel.areaResult?.area === 'number' 
      ? parcel.areaResult.area 
      : parcel.areaResult?.area?.abs_m2 || 0;
    
    // Calculate perimeter from points
    let perimeter = 0;
    for (let i = 0; i < parcel.points.length; i++) {
      const p1 = parcel.points[i];
      const p2 = parcel.points[(i + 1) % parcel.points.length];
      const dy = p2.y - p1.y;
      const dx = p2.x - p1.x;
      perimeter += Math.sqrt(dy * dy + dx * dx);
    }
    
    // Save to database
    // NOTE: area_m2, area_ha, perimeter_m are GENERATED ALWAYS columns - don't send them!
    // PostgreSQL will auto-calculate from geometry
    const parcelData = {
      project_id: workflowState.projectInfo.projectId,
      designation: parcel.designation,
      geometry: geometry,
      status: 'draft' as const,
      metadata: {
        points_count: parcel.points.length,
        area_type: areaType.value,
        calculated_area_sqm: areaValue,
        calculated_perimeter_m: perimeter,
        closure_ratio: `1:${Math.round(closureRatio).toLocaleString()}`,
        closure_error_m: closureError,
        residuals: parcel.areaResult?.residuals,
        cape_lo_points: parcel.points.map(p => ({
          id: p.id,
          y: p.y,
          x: p.x,
          status: p.status,
          description: p.description
        }))
      }
    };
    
    let savedParcel: LandParcel;
    if (existingDbId) {
      // Update existing parcel (e.g. geometry-less parcel from previous import)
      savedParcel = await updateLandParcel(existingDbId, {
        designation: parcelData.designation,
        geom: parcelData.geometry,
        status: 'draft' as const,
        metadata: parcelData.metadata
      });
      console.log(`[MapLibre] 🔄 Updated existing parcel ${parcel.designation} (DB ID: ${existingDbId})`);
    } else {
      // Create new parcel
      savedParcel = await createLandParcel(parcelData);
      // Track the new ID for future saves
      existingParcelIds.value.set(parcel.designation, savedParcel.id);
    }
    
    // Store saved parcel reference
    savedParcels.value.set(parcel.designation, savedParcel);
    lastSaved.value = new Date();
    
    console.log(`[MapLibre] ✅ Parcel ${parcel.designation} auto-saved (ID: ${savedParcel.id})`);
    
  } catch (error: any) {
    console.error('[MapLibre] ❌ Failed to auto-save parcel:', error);
    
    // Show user-friendly error
    if (error.response?.status === 409) {
      alert(`Failed to save: Parcel ${parcel.designation} already exists in database`);
    } else {
      alert(`Failed to auto-save parcel. Your work is still in memory but not persisted.`);
    }
  } finally {
    isSaving.value = false;
  }
}

/**
 * Recompute all parcels with latest backend code
 * This updates existing parcels with new fields like directionDMS
 */
async function recomputeAllParcels({ skipConfirm = false }: { skipConfirm?: boolean } = {}) {
  if (savedParcels.value.size === 0) {
    alert('No parcels to recompute. Please draw and save parcels first.');
    return;
  }

  if (!skipConfirm) {
    const confirmed = confirm(
      `Recompute ${savedParcels.value.size} parcel(s) with latest backend code?\n\n` +
      `This will update all parcels with banker's rounding for directions and other improvements.\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;
  }
  
  isRecomputing.value = true;
  let successCount = 0;
  let errorCount = 0;
  
  try {
    console.log('[MapLibre] 🔧 Recomputing all parcels...');
    
    for (const [designation, savedParcel] of savedParcels.value.entries()) {
      try {
        // Get the Cape Lo points from metadata
        const points = savedParcel.metadata?.cape_lo_points || [];
        
        if (points.length < 3) {
          console.warn(`[MapLibre] ⚠️ Skipping ${designation} - insufficient points`);
          errorCount++;
          continue;
        }
        
        console.log(`[MapLibre] 🔧 Recomputing ${designation}...`);
        
        // FIX: Detect and correct swapped coordinates
        // Cape Lo: Y=Westing (~96000), X=Southing (~2247000)
        // If Y > 1,000,000, coordinates are swapped
        const correctedPoints = points.map((p: any) => {
          let y = p.y;
          let x = p.x;
          
          if (y > 1000000) {
            // Coordinates are swapped - fix them
            const temp = y;
            y = x;
            x = temp;
            console.log(`[MapLibre] 🔄 Fixed swapped coordinates for ${p.id}: Y=${y.toFixed(2)}, X=${x.toFixed(2)}`);
          }
          
          return { y, x, id: p.id };
        });
        
        // Call backend compute API with updated code
        const areaResult = await areaCompute({
          points: correctedPoints,
          includeResiduals: true,
          roundMetersDecimals: 2,
          roundHectaresDecimals: 4
        });
        
        // Update the parcel's metadata with new computation results
        const updatedMetadata = {
          ...savedParcel.metadata,
          residuals: areaResult.residuals,
          recomputed_at: new Date().toISOString(),
          recomputed_reason: 'Added directionDMS field with banker\'s rounding'
        };
        
        // Update parcel in database
        await updateLandParcel(savedParcel.id, {
          metadata: updatedMetadata
        });
        
        console.log(`[MapLibre] ✅ Recomputed ${designation}`);
        successCount++;
        
      } catch (error) {
        console.error(`[MapLibre] ❌ Failed to recompute ${designation}:`, error);
        errorCount++;
      }
    }
    
    // Refresh parcels from database to show updated data
    await refreshParcelsFromDatabase();
    
    alert(
      `Recomputation complete!\n\n` +
      `✅ Success: ${successCount} parcel(s)\n` +
      `❌ Errors: ${errorCount} parcel(s)\n\n` +
      `Please regenerate your PDFs to see the updated directions with banker's rounding.`
    );
    
  } catch (error) {
    console.error('[MapLibre] ❌ Recomputation failed:', error);
    alert('Failed to recompute parcels. Check console for details.');
  } finally {
    isRecomputing.value = false;
  }
}

/**
 * Update temporary polygon preview
 */
function updateTempPolygon(points: any[]) {
  if (!map || !tempPolygonSource) return;
  
  if (points.length < 2) {
    tempPolygonSource.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  
  // Transform Cape Lo coordinates to WGS84
  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  const wgs84Points = capeLoArrayToWGS84(points.map(p => ({
    id: p.id,
    x: p.x,
    y: p.y
  })), loZone);
  
  // Create LineString for preview
  const coordinates = wgs84Points.map(p => [p.lng, p.lat]);
  
  tempPolygonSource.setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates
      },
      properties: {}
    }]
  });
}

/**
 * Basic geometry helpers for polygon overlap detection (WGS84 coordinates)
 */
type Coord = [number, number];

function orientation(a: Coord, b: Coord, c: Coord): number {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-12) return 0; // colinear
  return value > 0 ? 1 : 2; // 1: clockwise, 2: counterclockwise
}

function onSegment(a: Coord, b: Coord, c: Coord): boolean {
  return (
    Math.min(a[0], c[0]) - 1e-12 <= b[0] && b[0] <= Math.max(a[0], c[0]) + 1e-12 &&
    Math.min(a[1], c[1]) - 1e-12 <= b[1] && b[1] <= Math.max(a[1], c[1]) + 1e-12
  );
}

function segmentsIntersect(p1: Coord, p2: Coord, q1: Coord, q2: Coord): boolean {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);

  // GIS topology rule: parcels may share boundaries (edges/vertices) but
  // their interiors must be disjoint. We therefore:
  //   - Treat **proper crossings** (one edge cutting through another) as overlap.
  //   - Ignore colinear / shared-edge cases here; those are handled by the
  //     point-in-polygon tests and usually represent contiguous parcels.

  // Proper intersection occurs only when all orientations are non‑colinear
  // and the segments straddle each other.
  if (o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4) {
    return true;
  }

  // Colinear or endpoint-touching segments are treated as shared boundaries,
  // not as interior overlap.
  return false;
}

/**
 * Calculate the true area-weighted centroid of a polygon using the shoelace formula.
 * A simple vertex average is unreliable for concave or irregular polygons — it can
 * land outside the polygon or inside an adjacent one, causing false-positive overlaps.
 */
function calculateCentroid(polygon: Coord[]): Coord {
  const n = polygon.length - 1; // exclude closing duplicate
  if (n < 3) return [polygon[0][0], polygon[0][1]];

  let area = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1];
    area += cross;
    cx += (polygon[i][0] + polygon[j][0]) * cross;
    cy += (polygon[i][1] + polygon[j][1]) * cross;
  }

  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Degenerate polygon — fall back to vertex average
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += polygon[i][0]; sy += polygon[i][1]; }
    return [sx / n, sy / n];
  }

  cx /= (6 * area);
  cy /= (6 * area);
  return [cx, cy];
}

/**
 * Sample interior points from a polygon (excluding boundary)
 * Returns points at 25%, 50%, 75% along diagonals
 */
function sampleInteriorPoints(polygon: Coord[]): Coord[] {
  const centroid = calculateCentroid(polygon);
  const points: Coord[] = [centroid];
  
  // Sample points along lines from centroid to vertices
  const n = polygon.length - 1;
  for (let i = 0; i < Math.min(n, 4); i++) {
    const vertex = polygon[i];
    // Point at 50% between centroid and vertex
    points.push([
      (centroid[0] + vertex[0]) / 2,
      (centroid[1] + vertex[1]) / 2
    ]);
  }
  
  return points;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
function pointInPolygon(point: Coord, polygon: Coord[]): boolean {
  let inside = false;
  const n = polygon.length;
  if (n < 3) return false;

  // First, check if the point lies exactly on any polygon edge.
  // In cadastral topology, points on shared boundaries are not considered
  // "inside" for overlap purposes – they are allowed adjacency.
  for (let i = 0; i < n - 1; i++) {
    if (onSegment(polygon[i], point, polygon[i + 1])) {
      return false;
    }
  }

  // Standard ray-casting algorithm for strict interior test
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * FOOLPROOF spatial overlap detection using multi-layered validation
 * 
 * Cadastral topology rules:
 * - Parcels may share boundaries (edges/vertices) → ALLOWED
 * - Parcels may not have overlapping interiors → FORBIDDEN
 * 
 * Multi-layered strategy (if ANY layer detects overlap, reject):
 * 1. Containment check (booleanContains)
 * 2. Intersection + area calculation (intersect + area)
 * 3. Point-in-polygon check (sample interior points)
 * 4. Centroid check (is centroid of A inside B or vice versa)
 */
function polygonsOverlap(a: Coord[], b: Coord[]): boolean {
  // Ensure we have at least a triangle (closed ring with duplicate start/end)
  if (a.length < 4 || b.length < 4) {
    console.warn('[MapLibre] ⚠️ Invalid polygon - less than 4 vertices');
    return false;
  }

  console.log('[MapLibre] 🔍 FOOLPROOF overlap check - Multi-layered validation:');
  console.log('  Polygon A:', a.length - 1, 'vertices');
  console.log('  Polygon B:', b.length - 1, 'vertices');

  try {
    // Create Turf polygon features
    const polyA = turfPolygon([a]);
    const polyB = turfPolygon([b]);

    // === LAYER 1: Containment Check ===
    console.log('  [Layer 1] Containment check...');
    let aContainsB = false;
    let bContainsA = false;
    
    try {
      aContainsB = booleanContains(polyA, polyB);
      bContainsA = booleanContains(polyB, polyA);
      console.log('    A contains B:', aContainsB);
      console.log('    B contains A:', bContainsA);

      if (aContainsB || bContainsA) {
        console.error('[MapLibre] ❌ OVERLAP DETECTED [Layer 1]: Containment');
        return true;
      }
    } catch (e) {
      console.warn('    Containment check failed:', e);
    }

    // === LAYER 2: Intersection + Area ===
    console.log('  [Layer 2] Intersection + area check...');
    try {
      const intersection = intersect(featureCollection([polyA, polyB]));
      
      if (intersection) {
        const intersectionArea = area(intersection.geometry as any);
        console.log('    Intersection type:', intersection.geometry.type);
        console.log('    Intersection area:', intersectionArea.toFixed(6), 'm²');

        // Threshold: 1.0 m² — shared-edge floating-point slivers from Turf/WGS84
        // precision are typically 0.001–0.5 m²; genuine interior overlaps on
        // cadastral parcels (smallest ~130 m²) will always exceed this.
        const OVERLAP_THRESHOLD = 1.0;

        if (intersectionArea > OVERLAP_THRESHOLD) {
          console.error(`[MapLibre] ❌ OVERLAP DETECTED [Layer 2]: Intersection area ${intersectionArea.toFixed(6)} m² > ${OVERLAP_THRESHOLD} m²`);
          return true;
        }
        console.log('    Intersection area below threshold (shared boundary)');
      } else {
        console.log('    No intersection geometry');
      }
    } catch (e) {
      console.warn('    Intersection check failed:', e);
    }

    // === LAYER 3: Point-in-Polygon Check (Sample Interior Points) ===
    // Guard: only treat a sampled point as an overlap witness if it is strictly
    // inside its own polygon. Midpoints toward shared-boundary vertices can drift
    // across the shared edge into the adjacent parcel, giving false positives.
    console.log('  [Layer 3] Point-in-polygon check...');
    try {
      const interiorPointsA = sampleInteriorPoints(a);
      for (const point of interiorPointsA) {
        if (pointInPolygon(point, a) && pointInPolygon(point, b)) {
          console.error('[MapLibre] ❌ OVERLAP DETECTED [Layer 3]: Interior point of A is inside B');
          console.error('    Point:', point);
          return true;
        }
      }

      const interiorPointsB = sampleInteriorPoints(b);
      for (const point of interiorPointsB) {
        if (pointInPolygon(point, b) && pointInPolygon(point, a)) {
          console.error('[MapLibre] ❌ OVERLAP DETECTED [Layer 3]: Interior point of B is inside A');
          console.error('    Point:', point);
          return true;
        }
      }
      console.log('    No interior points overlap');
    } catch (e) {
      console.warn('    Point-in-polygon check failed:', e);
    }

    // === LAYER 4: Centroid Check ===
    // Guard: only use a centroid as a witness if it lies inside its own polygon.
    // Concave polygons can produce centroids outside the polygon boundary, which
    // would give a false positive when tested against an adjacent parcel.
    console.log('  [Layer 4] Centroid check...');
    try {
      const centroidA = calculateCentroid(a);
      const centroidB = calculateCentroid(b);

      const centroidAInOwnPolygon = pointInPolygon(centroidA, a);
      const centroidBInOwnPolygon = pointInPolygon(centroidB, b);

      if (centroidAInOwnPolygon && pointInPolygon(centroidA, b)) {
        console.error('[MapLibre] ❌ OVERLAP DETECTED [Layer 4]: Centroid of A is inside B');
        return true;
      }
      if (!centroidAInOwnPolygon) {
        console.warn('    Centroid of A is outside its own polygon (concave shape) — skipping cross-test');
      }

      if (centroidBInOwnPolygon && pointInPolygon(centroidB, a)) {
        console.error('[MapLibre] ❌ OVERLAP DETECTED [Layer 4]: Centroid of B is inside A');
        return true;
      }
      if (!centroidBInOwnPolygon) {
        console.warn('    Centroid of B is outside its own polygon (concave shape) — skipping cross-test');
      }

      console.log('    Centroids are not inside opposite polygons');
    } catch (e) {
      console.warn('    Centroid check failed:', e);
    }

    console.log('[MapLibre] ✅ NO OVERLAP - All 4 validation layers passed');
    return false;

  } catch (error) {
    console.error('[MapLibre] ❌ CRITICAL ERROR in overlap check:', error);
    console.error('  Polygon A:', a);
    console.error('  Polygon B:', b);
    // FAIL SAFE: On critical error, BLOCK to prevent data corruption
    console.error('[MapLibre] ⚠️ FAIL-SAFE: Blocking parcel due to validation error');
    return true; // Changed from false to true - block on error
  }
}

/**
 * Add completed parcel polygon to map
 */
function addCompletedParcelToMap(parcel: Parcel) {
  if (!map || !parcelsSource || !parcel.areaResult) return;
  
  // Transform points to WGS84
  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  const wgs84Points = capeLoArrayToWGS84(parcel.points.map(p => ({
    id: p.id,
    x: p.x,
    y: p.y
  })), loZone);
  
  // Create closed polygon coordinates
  const coordinates = wgs84Points.map(p => [p.lng, p.lat]);
  coordinates.push(coordinates[0]); // Close the polygon
  
  // Get existing features
  const currentData = parcelsSource._data as any;
  const features = currentData.features || [];
  
  // Get status from savedParcels or default to 'draft'
  const savedParcel = savedParcels.value.get(parcel.designation);
  const parcelStatus = savedParcel?.status || 'draft';
  
  // Add new parcel
  features.push({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates]
    },
    properties: {
      designation: parcel.designation,
      area: formatArea(parcel.areaResult.area),
      status: parcelStatus,  // Include status for color coding
      closureRatio: Math.round(calculateClosureRatio(parcel)),
      closureError: (Math.sqrt((parcel.areaResult.residuals?.sumDy || 0)**2 + (parcel.areaResult.residuals?.sumDx || 0)**2)).toFixed(3)
    }
  });
  
  parcelsSource.setData({
    type: 'FeatureCollection',
    features
  });
  
  // Clear any previous overlap highlight now that a parcel was successfully added
  overlapMessage.value = null;
  if (overlapSource) {
    overlapSource.setData({ type: 'FeatureCollection', features: [] });
  }

  console.log(`[MapLibre] ✅ Added parcel ${parcel.designation} to map`);
}

/**
 * Regenerate Calculations Part 1 PDF with area computation results appended
 */
async function regenerateCalculationsPart1WithAreas() {
  try {
    console.log('[MapLibre] 📄 Regenerating Calculations Part 1 with area computation results...');
    
    // Use coordinatePoints that are already loaded in this component
    if (coordinatePoints.value.length === 0) {
      alert('No coordinate points found. Please ensure coordinates are loaded from Calculations Part 1.');
      return;
    }
    
    console.log(`[MapLibre] Using ${coordinatePoints.value.length} coordinate points for PDF generation`);
    
    // Convert coordinate points to SurveyPoint format
    const surveyPoints: SurveyPoint[] = coordinatePoints.value.map((coord: any) => ({
      pointId: coord.id,
      y: coord.y,
      x: coord.x,
      status: coord.status || 'P',
      description: coord.description || '',
      surveyDate: coord.surveyDate || workflowState?.surveyorInfo?.surveyDate || ''
    }));
    
    // Get surveyor info
    const surveyorInfo = {
      name: workflowState.surveyorInfo?.landSurveyor || '',
      licenseNumber: workflowState.surveyorInfo?.licenseNumber || '',
      firm: workflowState.surveyorInfo?.firm || '',
      address: workflowState.surveyorInfo?.address || '',
      surveyDate: workflowState.surveyorInfo?.surveyDate || '',
      projectTitle: workflowState.surveyorInfo?.surveyOf || workflowState.projectInfo?.projectName || ''
    };
    
    // Generate Calculations Part 1 PDF
    const generator = new CalculationsPart1Generator();
    const result = await generator.generateCalculationsPart1PDF(surveyPoints, surveyorInfo);
    if (!('pdf' in result)) {
      throw new Error('Calculations Part 1 generation returned measurement mode output unexpectedly');
    }
    
    // TODO: Append area computation results to the PDF
    // For now, just download the base PDF
    const url = URL.createObjectURL(result.pdf);
    const link = document.createElement('a');
    link.href = url;
    const filename = `Calculations_Part1_with_Areas_${surveyorInfo.projectTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('[MapLibre] ✅ Calculations Part 1 PDF regenerated successfully');
    alert(`✅ Calculations Part 1 PDF regenerated!\n\nFilename: ${filename}\n\nNote: Area computation results will be added in a future update.`);
    
  } catch (error: any) {
    console.error('[MapLibre] ❌ Failed to regenerate Calculations Part 1:', error);
    console.error('[MapLibre] Error details:', error.message, error.stack);
    alert(`Failed to regenerate Calculations Part 1 PDF.\n\nError: ${error.message || 'Unknown error'}\n\nPlease check the console for details.`);
  }
}

/**
 * Save all parcels to database (finalize draft parcels) and regenerate Calculations Part 1 with areas
 */
async function saveAllParcels() {
  if (!workflowState?.projectInfo?.projectId) {
    alert('No project selected. Please select a project first.');
    return;
  }
  
  // Get all draft parcels that have been saved
  const draftParcelIds = Array.from(savedParcels.value.values())
    .filter(p => p.status === 'draft')
    .map(p => p.id);
  
  if (draftParcelIds.length === 0) {
    alert('No draft parcels to finalize. All parcels are already finalized.');
    return;
  }
  
  try {
    isSaving.value = true;
    console.log(`[MapLibre] 💾 Finalizing ${draftParcelIds.length} draft parcels...`);
    
    // Step 1: Finalize parcels in database
    const finalizedParcels = await finalizeLandParcels(draftParcelIds);
    
    // Update local state
    for (const finalizedParcel of finalizedParcels) {
      const saved = savedParcels.value.get(finalizedParcel.designation || finalizedParcel.stand);
      if (saved) {
        saved.status = 'finalized';
        saved.finalized_at = finalizedParcel.finalized_at || new Date().toISOString();
      }
    }
    
    console.log(`[MapLibre] ✅ Finalized ${finalizedParcels.length} parcels`);
    
    // Step 2: Regenerate Calculations Part 1 with area computation results
    const shouldRegeneratePDF = confirm(
      `✅ Successfully finalized ${finalizedParcels.length} parcel(s)!\n\n` +
      `Would you like to regenerate Calculations Part 1 PDF with area computation results?\n\n` +
      `✅ Click OK to regenerate PDF with areas section\n` +
      `❌ Click Cancel to skip PDF generation`
    );
    
    if (shouldRegeneratePDF) {
      await regenerateCalculationsPart1WithAreas();
    } else {
      alert(`✅ Parcels finalized successfully!\n\nYou can regenerate the PDF later from the workflow.`);
    }
    
  } catch (error) {
    console.error('[MapLibre] ❌ Failed to finalize parcels:', error);
    alert('Failed to finalize parcels. Please try again.');
  } finally {
    isSaving.value = false;
  }
}

/**
 * Delete a saved parcel from database
 */
async function deleteSavedParcel(dbParcel: any) {
  const designation = dbParcel.designation || dbParcel.stand;
  
  // Confirmation dialog
  const confirmed = confirm(
    `⚠️ Delete Parcel from Database?\n\n` +
    `Designation: ${designation}\n` +
    `Status: ${dbParcel.status}\n` +
    `Area: ${(dbParcel.area_m2 || 0).toFixed(2)} m²\n\n` +
    `This will permanently delete the parcel from the database.\n` +
    `This action cannot be undone.\n\n` +
    `Click OK to delete, or Cancel to keep the parcel.`
  );
  
  if (!confirmed) {
    console.log('[MapLibre] 🚫 Delete cancelled by user');
    return;
  }
  
  try {
    console.log(`[MapLibre] 🗑️ Deleting saved parcel: ${designation} (ID: ${dbParcel.id})`);
    
    // Delete from database
    await deleteLandParcel(dbParcel.id);
    savedParcels.value.delete(designation);
    console.log(`[MapLibre] ✅ Deleted parcel ${designation} from database`);
    
    // Refresh map display
    await refreshParcelsFromDatabase();
    
    alert(`✅ Parcel "${designation}" deleted successfully`);
    
  } catch (error: any) {
    console.error('[MapLibre] ❌ Failed to delete parcel:', error);
    alert(`Failed to delete parcel: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Delete a parcel with confirmation (in-memory parcels)
 */
async function deleteParcelConfirm(parcel: Parcel) {
  // Get the saved parcel from database (if it exists)
  const savedParcel = savedParcels.value.get(parcel.designation);
  
  // Confirmation dialog
  const confirmed = confirm(
    `⚠️ Delete Parcel?\n\n` +
    `Designation: ${parcel.designation}\n` +
    `Area: ${parcel.areaResult ? formatArea(parcel.areaResult.area) : 'N/A'}\n\n` +
    `This action cannot be undone.\n\n` +
    `Click OK to delete, or Cancel to keep the parcel.`
  );
  
  if (!confirmed) {
    console.log('[MapLibre] 🚫 Delete cancelled by user');
    return;
  }
  
  try {
    console.log(`[MapLibre] 🗑️ Deleting parcel: ${parcel.designation}`);
    
    // Delete from database if it was saved
    if (savedParcel) {
      await deleteLandParcel(savedParcel.id);
      savedParcels.value.delete(parcel.designation);
      console.log(`[MapLibre] ✅ Deleted parcel ${parcel.designation} from database (ID: ${savedParcel.id})`);
    }
    
    // Remove from local parcels array
    const index = parcels.value.findIndex(p => p.designation === parcel.designation);
    if (index !== -1) {
      parcels.value.splice(index, 1);
      console.log(`[MapLibre] ✅ Removed parcel ${parcel.designation} from local array`);
    }
    
    // Remove from map
    if (parcelsSource) {
      const currentData = (parcelsSource as any)._data as any;
      const features = (currentData?.features || []).filter(
        (f: any) => f.properties?.designation !== parcel.designation
      );
      
      parcelsSource.setData({
        type: 'FeatureCollection',
        features: features
      });
      
      console.log(`[MapLibre] ✅ Removed parcel ${parcel.designation} from map`);
    }
    
    console.log(`[MapLibre] ✅ Successfully deleted parcel: ${parcel.designation}`);
    
  } catch (error: any) {
    console.error('[MapLibre] ❌ Failed to delete parcel:', error);
    alert(`Failed to delete parcel ${parcel.designation}.\n\nError: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Compute residuals (traverse closure data) from Cape Lo points
 * Used for QGIS-digitized parcels that don't have residuals in metadata
 * 
 * IMPORTANT: This computes traverse data (bearing & distance between beacons)
 * NOT absolute coordinate differences. The dy/dx represent the vector components
 * of the traverse line, which are used for closure error calculations.
 */
function computeResidualsFromPoints(points: any[]): any {
  if (!points || points.length < 3) {
    return { edges: [] };
  }
  
  const edges: any[] = [];
  
  // First, compute the centroid for reference (optional, for consistency)
  let sumY = 0, sumX = 0;
  points.forEach(p => {
    sumY += p.y;
    sumX += p.x;
  });
  const centroidY = sumY / points.length;
  const centroidX = sumX / points.length;
  
  for (let i = 0; i < points.length; i++) {
    const fromPoint = points[i];
    const toPoint = points[(i + 1) % points.length];
    
    // Calculate the vector from fromPoint to toPoint
    // These are the actual traverse measurements (in meters)
    const dy = toPoint.y - fromPoint.y;  // Westing difference (Y in Cape Lo)
    const dx = toPoint.x - fromPoint.x;  // Southing difference (X in Cape Lo)
    const distance = Math.sqrt(dy * dy + dx * dx);
    
    // Calculate bearing (azimuth) in degrees
    // CRITICAL: Gauss Lo (Cape Lo) is SOUTH-ORIENTED
    // Bearing is measured clockwise from South: atan2(dY, dX)
    // This matches SurveyPlanMapView.vue for consistency
    let bearing = Math.atan2(dy, dx) * (180 / Math.PI);
    if (bearing < 0) bearing += 360;
    
    edges.push({
      from: fromPoint.id,
      to: toPoint.id,
      distance: distance,
      bearingRoundedDeg: bearing,
      // dy and dx are the vector components (not absolute coordinates)
      // These are used for closure error calculation: Σdy should ≈ 0, Σdx should ≈ 0
      dy: dy,
      dx: dx
    });
  }
  
  return { edges };
}

/**
 * Export Comprehensive Document (SGO Format)
 * Uses two-pass generation to create complete document with all cross-references:
 * 1. Cover Page (Letter + Project Info)
 * 2. Field Book (E1-E99) [placeholder for now]
 * 3. Coordinate List (100-XXX) with cross-references
 * 4. Calculation Sheets (XXX+1+) with cross-references
 * 5. Area & Consistency (continues from Calculations)
 */
async function exportAreaConsistencyPDF() {
  // ⭐ FIRST: Load all parcels from database to ensure we have complete data
  console.log('[MapLibre] 📥 Loading all parcels from database before PDF generation...');
  
  try {
    const projectId = workflowState?.projectInfo?.projectId;
    if (!projectId) {
      alert('No project selected. Please select a project first.');
      return;
    }
    
    // Load all parcels from database
    const response = await listLandParcels(projectId);
    console.log('[MapLibre] 📊 Loaded', response.length, 'parcels from database');
    
    // Update savedParcels map
    response.forEach((dbParcel: any) => {
      savedParcels.value.set(dbParcel.stand || dbParcel.designation, dbParcel);
    });
    
  } catch (error) {
    console.error('[MapLibre] ❌ Error loading parcels from database:', error);
    alert('Failed to load parcels from database. Please try again.');
    return;
  }
  
  // ⭐ Include ALL parcels: both in-memory (parcels.value) AND saved parcels from database
  // This ensures the PDF includes all parcels, not just the ones digitized in this session
  const allParcels: Parcel[] = [];
  
  // Add in-memory parcels (currently digitized)
  parcels.value.forEach(p => {
    if (p.areaResult) {
      allParcels.push(p);
    }
  });
  
  // Add saved parcels from database that aren't already in memory
  // Use for...of to support async operations
  for (const [designation, dbParcel] of savedParcels.value.entries()) {
    console.log(`[MapLibre] 🔍 Processing parcel ${dbParcel.stand} (designation: ${designation})`);
    
    // Check if this is a QGIS parcel (no metadata points)
    const isQGISParcel = !dbParcel.metadata?.cape_lo_points || dbParcel.metadata.cape_lo_points.length === 0;
    console.log(`[MapLibre] 🔍 Parcel ${dbParcel.stand} - is QGIS parcel:`, isQGISParcel);
    
    // Check if this parcel is already in the in-memory list
    const existsInMemory = allParcels.some(p => p.designation === designation);
    console.log(`[MapLibre] 🔍 Parcel ${dbParcel.stand} - exists in memory:`, existsInMemory);
    
    // For QGIS parcels, ALWAYS reconstruct from DB to ensure residuals are computed
    // For UI parcels, only add if not already in memory
    if (!existsInMemory || isQGISParcel) {
      if (existsInMemory && isQGISParcel) {
        console.log(`[MapLibre] 🔄 Replacing in-memory QGIS parcel ${dbParcel.stand} with DB version (to compute residuals)`);
        // Remove the incomplete in-memory version
        const index = allParcels.findIndex(p => p.designation === designation);
        if (index !== -1) {
          allParcels.splice(index, 1);
        }
      }
      // Reconstruct parcel object from database data
      // Use the auto-calculated area from database (area_m2, area_ha)
      // Convert to numbers in case they come as strings from the database
      const areaM2 = Number(dbParcel.area_m2) || 0;
      const areaHa = Number(dbParcel.area_ha) || 0;
      
      console.log(`[MapLibre] 🔍 Parcel ${dbParcel.stand} - area_m2: ${areaM2}, area_ha: ${areaHa}`);
      
      // Get Cape Lo points from metadata OR extract from geometry (for QGIS parcels)
      let points = dbParcel.metadata?.cape_lo_points || [];
      
      // Check both 'geom' (from backend) and 'geometry' (alternative field name)
      const geometry = dbParcel.geom || dbParcel.geometry;
      
      console.log(`[MapLibre] 🔍 Parcel ${dbParcel.stand} - points from metadata:`, points.length);
      console.log(`[MapLibre] 🔍 Parcel ${dbParcel.stand} - geometry object:`, geometry ? 'EXISTS' : 'NULL');
      
      if (points.length === 0 && geometry?.coordinates?.[0]) {
        // QGIS-digitized parcel: Extract points from geometry
        console.log(`[MapLibre] 🔧 Extracting Cape Lo points from geometry for PDF: ${dbParcel.stand}`);
        console.log(`[MapLibre] 🔧 Geometry type:`, geometry.type);
        console.log(`[MapLibre] 🔧 Coordinates array length:`, geometry.coordinates?.[0]?.length);
        const coords = geometry.coordinates[0];
        
        // Check if metadata contains vertex labels (shared beacons)
        const vertices = Array.isArray((dbParcel.metadata as any)?.vertices)
          ? (dbParcel.metadata as any).vertices
          : [];
        const hasVertexLabels = vertices.length > 0;
        
        if (hasVertexLabels) {
          // Use actual beacon IDs from metadata (e.g., 1463A, 1462A, 1463C, 1464C)
          console.log(`[MapLibre] 📍 Using vertex labels from metadata for parcel ${dbParcel.stand}`);
          vertices.forEach((vertex: any, i: number) => {
            // PERMANENT FIX: Use geoJsonToCapeLoPoint utility
            const capeLoPoint = geoJsonToCapeLoPoint(coords[i], vertex.id);
            points.push({
              id: capeLoPoint.id!,
              y: capeLoPoint.y, // Correctly mapped: Westing
              x: capeLoPoint.x, // Correctly mapped: Southing
              status: 'P',
              description: `Beacon ${vertex.id}`
            });
          });
        } else {
          const tolerance = 2.0; // Increased to 2.0 meter tolerance for matching
          // Match vertices to actual coordinate points (beacon names)
          // Use very tight tolerance since we're matching exact Gauss Lo 31 coordinates
          console.log(`[MapLibre] 📍 Parcel has ${coords.length - 1} vertices to match`);
          
          // Load coordinate points for this project
          try {
            const coordPoints = await listCoordinatePoints(Number(dbParcel.project_id));
            console.log(`[MapLibre] 📊 Found ${coordPoints.length} coordinate points in project`);
            
            // Log first few coordinate points to understand their format
            if (coordPoints.length > 0) {
              console.log(`[MapLibre] 🔍 First coordinate point: ${coordPoints[0].name}, y=${coordPoints[0].y?.toFixed(2)}, x=${coordPoints[0].x?.toFixed(2)}`);
            }
            
            // Log first few vertices for debugging
            console.log(`[MapLibre] 🔍 First vertex: X=${coords[0][0].toFixed(2)}, Y=${coords[0][1].toFixed(2)}`);
            
            // Match each vertex to nearest coordinate point
            const tolerance = 2.0; // Increased to 2.0 meter tolerance for matching
            const usedPoints = new Set(); // Track already matched points to avoid duplicates
            
            // Log all vertices for debugging
            console.log(`[MapLibre] 🔍 Vertex coordinates:`);
            for (let i = 0; i < Math.min(coords.length - 1, 10); i++) {
              console.log(`  Vertex ${i}: X=${coords[i][0].toFixed(2)}, Y=${coords[i][1].toFixed(2)}`);
            }
            
            for (let i = 0; i < coords.length - 1; i++) {
              // PERMANENT FIX: Use geoJsonToCapeLoPoint utility
              const capeLoPoint = geoJsonToCapeLoPoint(coords[i]);
              const vertexY = capeLoPoint.y; // Westing (~97k)
              const vertexX = capeLoPoint.x; // Southing (~2247k)
              
              // Find nearest coordinate point that hasn't been used yet
              let nearestPoint = null;
              let minDistance = Infinity;
              
              for (const cp of coordPoints) {
                // Skip if this point was already matched to another vertex
                if (usedPoints.has(cp.name)) {
                  continue;
                }
                
                // Calculate Euclidean distance in Cape Lo coordinates (meters)
                const dy = vertexY - cp.y;
                const dx = vertexX - cp.x;
                const distance = Math.sqrt(dy * dy + dx * dx);
                
                if (distance < minDistance) {
                  minDistance = distance;
                  nearestPoint = cp;
                }
              }
              
              if (nearestPoint && minDistance <= tolerance) {
                // Use actual coordinate point name and ACTUAL COORDINATES from coordinate point
                console.log(`[MapLibre] ✅ Vertex ${i} (Y=${vertexY.toFixed(2)}, X=${vertexX.toFixed(2)}) matched to ${nearestPoint.name} (distance: ${minDistance.toFixed(3)}m)`);
                usedPoints.add(nearestPoint.name); // Mark as used
                points.push({
                  id: nearestPoint.name,
                  y: nearestPoint.y, // Use coordinate point's Y, not vertex Y
                  x: nearestPoint.x, // Use coordinate point's X, not vertex X
                  status: 'P',
                  description: nearestPoint.description || `Beacon ${nearestPoint.name}`
                });
              } else {
                // No match found - use fallback naming
                const beaconLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                const fallbackName = `${dbParcel.stand}${beaconLetters[i]}`;
                console.warn(`[MapLibre] ⚠️ Vertex ${i} (Y=${vertexY.toFixed(2)}, X=${vertexX.toFixed(2)}) not matched (nearest: ${minDistance.toFixed(3)}m > ${tolerance}m) - using fallback: ${fallbackName}`);
                points.push({
                  id: fallbackName,
                  y: vertexY,
                  x: vertexX,
                  status: 'P',
                  description: `Beacon ${fallbackName}`
                });
              }
            }
            
            // Log final matched sequence
            console.log(`[MapLibre] 📋 Final beacon sequence: ${points.map((p: { id: string }) => p.id).join(' → ')} → ${points[0].id}`);
          } catch (error) {
            console.error(`[MapLibre] ❌ Failed to load coordinate points:`, error);
            // Fallback: Auto-generate sequential beacon names
            console.log(`[MapLibre] 🔤 Fallback: Auto-generating beacon names for parcel ${dbParcel.stand}`);
            const beaconLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            for (let i = 0; i < coords.length - 1; i++) {
              // PERMANENT FIX: Use geoJsonToCapeLoPoint utility even in fallback
              const capeLoPoint = geoJsonToCapeLoPoint(coords[i]);
              points.push({
                id: `${dbParcel.stand}${beaconLetters[i]}`,
                y: capeLoPoint.y,  // Correctly mapped: Westing
                x: capeLoPoint.x,  // Correctly mapped: Southing
                status: 'P',
                description: `Beacon ${beaconLetters[i]}`
              });
            }
          }
        }
        
        console.log(`[MapLibre] ✅ Extracted ${points.length} points from geometry for PDF`);
      } else if (points.length > 0) {
        // Map metadata points to ensure proper format
        points = points.map((pt: any) => ({
          id: pt.id,
          y: pt.y,
          x: pt.x,
          status: pt.status || 'P',
          description: pt.description || ''
        }));
      }
      
      if (points.length === 0) {
        console.warn(`[MapLibre] ⚠️ Skipping parcel ${dbParcel.stand} - no points available for PDF`);
        return;
      }
      
      let areaResult;
      console.log(`[MapLibre] 🔧 Computing area & residuals using standard API for parcel ${dbParcel.stand} (QGIS: ${isQGISParcel})...`);
      try {
        areaResult = await areaCompute({
          points: points.map((p: { y: number; x: number; id: string }) => ({ y: p.y, x: p.x, id: p.id, name: p.id })), // CRITICAL FIX: No swap needed - both use Cape Lo (Y=Westing, X=Southing)
          includeResiduals: true,
          roundMetersDecimals: 2,
          roundHectaresDecimals: 4
        });
        console.log(`[MapLibre] ✅ Area computed via API: ${areaResult.area.abs_m2.toFixed(2)} m² (edges: ${areaResult?.residuals?.edges?.length || 0})`)
      } catch (error) {
        console.error(`[MapLibre] ❌ Failed to compute area for ${dbParcel.stand}:`, error);
        areaResult = {
          ok: true,
          area: {
            signed_m2: areaM2,
            abs_m2: areaM2,
            meters_rounded: Number(areaM2.toFixed(2)),
            hectares_rounded: Number(areaHa.toFixed(4)),
            display: areaHa >= 1 
              ? { hectares: areaHa, unit: 'ha' as const }
              : { square_meters: areaM2, unit: 'm2' as const }
          },
          centroid: { y: 0, x: 0 },
          residuals: dbParcel.metadata?.residuals
        };
      }
      
      const reconstructedParcel: Parcel = {
        id: dbParcel.id?.toString() || '',
        designation: dbParcel.stand || designation,
        points: points,
        areaResult: areaResult
      };
      
      console.log(`[MapLibre] 📦 Loaded parcel ${dbParcel.stand} from DB: ${areaM2.toFixed(2)} m² (${areaHa.toFixed(4)} ha)`);
      console.log(`[MapLibre] 📦 Parcel ${dbParcel.stand} - points count:`, points.length);
      console.log(`[MapLibre] 📦 Parcel ${dbParcel.stand} - residuals edges:`, areaResult?.residuals?.edges?.length || 0);
      allParcels.push(reconstructedParcel);
      console.log(`[MapLibre] ✅ Added parcel ${dbParcel.stand} to allParcels array`);
    } else {
      console.log(`[MapLibre] ⏭️ Skipping parcel ${dbParcel.stand} - already exists in memory`);
    }
  }
  
  const computedParcels = allParcels;

  console.log('[MapLibre] 🔧 Recomputing residuals for all parcels before PDF generation...');
  for (const parcel of computedParcels) {
    const beforeArea = parcel.areaResult?.area?.abs_m2 || 0;
    console.log(`[MapLibre] 📊 BEFORE recompute - ${parcel.designation}: ${beforeArea.toFixed(2)} m²`);
    console.log(`[MapLibre] 📍 Points for ${parcel.designation}:`, parcel.points.length, 'points');
    console.log(`[MapLibre] 📍 First point:`, parcel.points[0]);
    console.log(`[MapLibre] 📍 Second point:`, parcel.points[1]);
    
    try {
      const resp = await areaCompute({
        points: parcel.points.map((p: any) => ({ y: p.y, x: p.x, id: p.id, name: p.id })), // CRITICAL FIX: No swap needed - both use Cape Lo (Y=Westing, X=Southing)
        includeResiduals: true,
        roundMetersDecimals: 2,
        roundHectaresDecimals: 4
      });
      const afterArea = resp?.area?.abs_m2 || 0;
      console.log(`[MapLibre] 📊 AFTER recompute - ${parcel.designation}: ${afterArea.toFixed(2)} m²`);
      console.log(`[MapLibre] 📊 Area change: ${beforeArea.toFixed(2)} → ${afterArea.toFixed(2)} m² (${afterArea === 0 ? '❌ ZERO!' : '✅'})`);
      parcel.areaResult = resp as any;
    } catch (err) {
      console.warn(`[MapLibre] ⚠️ Failed to recompute residuals for ${parcel.designation}:`, err);
    }
  }
  
  console.log('[MapLibre] 📊 Final parcels array:', computedParcels.map(p => p.designation).join(', '));
  
  if (computedParcels.length === 0) {
    alert('No computed parcels found. Please wait for area computation to complete or load parcels from database.');
    return;
  }
  
  // ========== BEACON LABEL GENERATION ==========
  // Generate intelligent beacon labels (suffix letters inside parcels, full names outside)
  // This matches the logic from SurveyPlanMapView.vue and backend surveyPlanPreview.js
  console.log('[MapLibre] 🏷️ Generating beacon labels...');
  
  beaconLabels.value = [];
  
  // Helper: Check if point is inside polygon
  function isPointInPolygon(point: { y: number; x: number }, vertices: Array<{ y: number; x: number }>): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const yi = vertices[i].y, xi = vertices[i].x;
      const yj = vertices[j].y, xj = vertices[j].x;
      
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    return inside;
  }
  
  // Helper: Calculate minimum distance from point to polygon edges
  function distanceToPolygonEdge(point: { y: number; x: number }, vertices: Array<{ y: number; x: number }>) {
    let minDistance = Infinity;
    
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      const x1 = vertices[i].x, y1 = vertices[i].y;
      const x2 = vertices[j].x, y2 = vertices[j].y;
      
      const A = point.x - x1;
      const B = point.y - y1;
      const C = x2 - x1;
      const D = y2 - y1;
      
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      
      if (lenSq !== 0) {
        param = dot / lenSq;
      }
      
      let xx, yy;
      
      if (param < 0) {
        xx = x1;
        yy = y1;
      } else if (param > 1) {
        xx = x2;
        yy = y2;
      } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
      }
      
      const dx = point.x - xx;
      const dy = point.y - yy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }
  
  // Helper: Calculate polygon centroid
  function calculateCentroid(vertices: Array<{ y: number; x: number }>) {
    let sumY = 0, sumX = 0;
    for (const v of vertices) {
      sumY += v.y;
      sumX += v.x;
    }
    return { y: sumY / vertices.length, x: sumX / vertices.length };
  }
  
  // Helper: Calculate adaptive font size based on parcel geometry
  // Ensures label doesn't exceed 50% of parcel white space
  function calculateAdaptiveFontSize(
    parcelVertices: Array<{ y: number; x: number }>,
    labelText: string,
    minFontSize = 1.5,
    maxFontSize = 4.0
  ) {
    // Calculate parcel area using shoelace formula
    let area = 0;
    for (let i = 0; i < parcelVertices.length; i++) {
      const j = (i + 1) % parcelVertices.length;
      area += parcelVertices[i].y * parcelVertices[j].x;
      area -= parcelVertices[j].y * parcelVertices[i].x;
    }
    area = Math.abs(area) / 2;
    
    // Calculate minimum width (narrowest dimension)
    let minWidth = Infinity;
    for (let i = 0; i < parcelVertices.length; i++) {
      const j = (i + 1) % parcelVertices.length;
      const dy = parcelVertices[j].y - parcelVertices[i].y;
      const dx = parcelVertices[j].x - parcelVertices[i].x;
      const edgeLength = Math.sqrt(dy * dy + dx * dx);
      
      for (let k = 0; k < parcelVertices.length; k++) {
        if (k === i || k === j) continue;
        const A = parcelVertices[k].y - parcelVertices[i].y;
        const B = parcelVertices[k].x - parcelVertices[i].x;
        const perpDist = Math.abs(A * dx - B * dy) / edgeLength;
        minWidth = Math.min(minWidth, perpDist);
      }
    }
    
    // Font size constraints based on geometry
    // 1. Label shouldn't exceed 50% of parcel area
    const maxLabelArea = area * 0.5;
    const textLength = labelText.length;
    const fontSizeFromArea = Math.sqrt(maxLabelArea / (0.7 * textLength * 1.5));
    
    // 2. Label width shouldn't exceed 70% of minimum parcel width
    const maxLabelWidth = minWidth * 0.7;
    const fontSizeFromWidth = maxLabelWidth / (0.7 * textLength);
    
    // Use the more restrictive constraint
    let fontSize = Math.min(fontSizeFromArea, fontSizeFromWidth);
    
    // Clamp to min/max bounds
    fontSize = Math.max(minFontSize, Math.min(maxFontSize, fontSize));
    
    return fontSize;
  }
  
  // Helper: Estimate label dimensions based on text length and font size
  function estimateLabelDimensions(text: string, fontSize: number) {
    // More accurate character width: 0.7 * fontSize
    const charWidth = 0.7 * fontSize;
    const width = text.length * charWidth;
    // Height: 1.5 * fontSize
    const height = 1.5 * fontSize;
    return { width, height };
  }
  
  // Helper: Check if label bounding box is wholly within polygon
  function isLabelBoundingBoxInPolygon(
    centerY: number,
    centerX: number,
    labelWidth: number,
    labelHeight: number,
    vertices: Array<{ y: number; x: number }>
  ) {
    const halfWidth = labelWidth / 2;
    const halfHeight = labelHeight / 2;
    
    const corners = [
      { y: centerY - halfHeight, x: centerX - halfWidth },
      { y: centerY - halfHeight, x: centerX + halfWidth },
      { y: centerY + halfHeight, x: centerX - halfWidth },
      { y: centerY + halfHeight, x: centerX + halfWidth }
    ];
    
    for (const corner of corners) {
      if (!isPointInPolygon(corner, vertices)) {
        return false;
      }
    }
    
    return true;
  }
  
  // Helper: Get minimum distance from label bounding box to polygon edges
  function getLabelBoundingBoxClearance(
    centerY: number,
    centerX: number,
    labelWidth: number,
    labelHeight: number,
    vertices: Array<{ y: number; x: number }>
  ) {
    const halfWidth = labelWidth / 2;
    const halfHeight = labelHeight / 2;
    
    const corners = [
      { y: centerY - halfHeight, x: centerX - halfWidth },
      { y: centerY - halfHeight, x: centerX + halfWidth },
      { y: centerY + halfHeight, x: centerX - halfWidth },
      { y: centerY + halfHeight, x: centerX + halfWidth }
    ];
    
    let minClearance = Infinity;
    for (const corner of corners) {
      const clearance = distanceToPolygonEdge(corner, vertices);
      minClearance = Math.min(minClearance, clearance);
    }
    
    return minClearance;
  }
  
  // Helper: Find optimal label position near beacon but inside polygon
  // Position label towards parcel centroid with clear offset from beacon circle
  // Ensures entire label bounding box is wholly within parcel boundaries
  // Uses adaptive font sizing based on parcel geometry
  function findLabelPositionInPolygon(
    beaconY: number, 
    beaconX: number, 
    vertices: Array<{ y: number; x: number }>,
    labelText = 'A',
    offsetDistance = 4.0, 
    minClearance = 2.0
  ) {
    // Calculate parcel centroid
    const centroid = calculateCentroid(vertices);
    
    // Calculate adaptive font size for this parcel
    const fontSize = calculateAdaptiveFontSize(vertices, labelText);
    
    // Estimate label dimensions with adaptive font size
    const labelDims = estimateLabelDimensions(labelText, fontSize);
    
    // Calculate direction from beacon to centroid
    const dy = centroid.y - beaconY;
    const dx = centroid.x - beaconX;
    const distToCentroid = Math.sqrt(dx * dx + dy * dy);
    
    // Primary direction: towards centroid
    const primaryAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    // Try angles: primary direction first, then nearby angles, then fallback to all directions
    const angles = [
      primaryAngle,
      primaryAngle + 30,
      primaryAngle - 30,
      primaryAngle + 45,
      primaryAngle - 45,
      primaryAngle + 60,
      primaryAngle - 60,
      primaryAngle + 90,
      primaryAngle - 90,
      45, 135, 225, 315, 0, 90, 180, 270 // Fallback to standard angles
    ];
    
    for (const angle of angles) {
      const radians = angle * Math.PI / 180;
      const labelY = beaconY + offsetDistance * Math.sin(radians);
      const labelX = beaconX + offsetDistance * Math.cos(radians);
      
      // Check if entire label bounding box is inside polygon
      if (isLabelBoundingBoxInPolygon(labelY, labelX, labelDims.width, labelDims.height, vertices)) {
        // Check if label bounding box has sufficient clearance from edges
        const clearance = getLabelBoundingBoxClearance(labelY, labelX, labelDims.width, labelDims.height, vertices);
        
        if (clearance >= minClearance) {
          return { y: labelY, x: labelX, offset: offsetDistance, clearance: clearance };
        }
      }
    }
    
    // If no position with full clearance found, try smaller offset
    if (offsetDistance > 2.0) {
      return findLabelPositionInPolygon(beaconY, beaconX, vertices, labelText, offsetDistance * 0.75, minClearance);
    }
    
    // If still no luck, reduce clearance requirement
    if (minClearance > 1.5) {
      return findLabelPositionInPolygon(beaconY, beaconX, vertices, labelText, 4.5, minClearance * 0.6);
    }
    
    // Last resort: find best position even with minimal clearance
    let bestPos = { y: beaconY, x: beaconX, offset: 0, clearance: 0 };
    let maxClearance = 0;
    
    for (const angle of angles) {
      const radians = angle * Math.PI / 180;
      const labelY = beaconY + 2.0 * Math.sin(radians);
      const labelX = beaconX + 2.0 * Math.cos(radians);
      
      if (isLabelBoundingBoxInPolygon(labelY, labelX, labelDims.width, labelDims.height, vertices)) {
        const clearance = getLabelBoundingBoxClearance(labelY, labelX, labelDims.width, labelDims.height, vertices);
        if (clearance > maxClearance) {
          maxClearance = clearance;
          bestPos = { y: labelY, x: labelX, offset: 2.0, clearance: clearance };
        }
      }
    }
    
    return bestPos;
  }
  
  // Build a set of all digitized parcel designations for quick lookup
  const digitizedStands = new Set(computedParcels.map(p => p.designation));
  
  // Track which beacons have already been labeled (topologically-aware labeling)
  const labeledBeacons = new Set<string>();
  
  // TOPOLOGICALLY-AWARE LABELING: Each beacon is labeled only once
  // Strategy:
  // 1. For standard beacons (e.g., "1464A", "1464An"): Label in parent parcel (matching prefix)
  // 2. For non-standard beacons: Label in first parcel encountered
  
  computedParcels.forEach(parcel => {
    parcel.points.forEach((point: any) => {
      const beaconName = point.id;
      
      // CRITICAL: Skip if this beacon has already been labeled
      if (labeledBeacons.has(beaconName)) {
        return; // Topologically-aware: no duplicate labels
      }
      
      // Parse beacon name to extract stand number and suffix (supports multi-character suffixes)
      // Examples: "1425A" -> stand: "1425", suffix: "A"
      //           "1464An" -> stand: "1464", suffix: "An"
      const match = beaconName.match(/^(\d+)([A-Z][a-z]*)$/);
      
      if (match) {
        // STANDARD BEACON NAMING (e.g., "1464A", "1464An")
        const beaconStand = match[1];
        const suffix = match[2];
        
        // TOPOLOGICAL RULE: Only label beacon in its parent parcel (matching prefix)
        if (beaconStand !== parcel.designation) {
          return; // This is not the parent parcel, skip
        }
        
        // This is the parent parcel - label with suffix only
        const labelPos = findLabelPositionInPolygon(point.y, point.x, parcel.points, suffix);
        
        beaconLabels.value.push({
          beaconName: beaconName,
          displayLabel: suffix, // Show only suffix in parent parcel
          stand: parcel.designation,
          beaconY: point.y,
          beaconX: point.x,
          y: labelPos.y,
          x: labelPos.x,
          offset: labelPos.offset,
          clearance: labelPos.clearance,
          parcelId: parcel.designation
        });
        
        labeledBeacons.add(beaconName);
      } else {
        // NON-STANDARD BEACON NAMING (e.g., "A", "B", "TRIG1")
        // Label in first parcel encountered (topologically-aware: label once)
        const labelPos = findLabelPositionInPolygon(point.y, point.x, parcel.points, beaconName);
        
        beaconLabels.value.push({
          beaconName: beaconName,
          displayLabel: beaconName, // Show full name for non-standard beacons
          stand: parcel.designation,
          beaconY: point.y,
          beaconX: point.x,
          y: labelPos.y,
          x: labelPos.x,
          offset: labelPos.offset,
          clearance: labelPos.clearance,
          parcelId: parcel.designation
        });
        
        labeledBeacons.add(beaconName);
      }
    });
  });
  
  console.log(`[MapLibre] ✅ Generated ${beaconLabels.value.length} beacon labels`);
  if (beaconLabels.value.length > 0) {
    console.log('[MapLibre] 📍 Sample beacon labels:');
    beaconLabels.value.slice(0, 3).forEach(bl => {
      console.log(`  ${bl.beaconName} → "${bl.displayLabel}" in stand ${bl.stand} (offset: ${bl.offset.toFixed(1)}m, clearance: ${bl.clearance.toFixed(1)}m)`);
    });
  }
  
  console.log('[MapLibre] 🚀 Generating comprehensive document with two-pass system...');
  console.log('[MapLibre] 📊 Processing', computedParcels.length, 'computed parcels (in-memory + database)');
  
  // Check if we have coordinate points
  if (coordinatePoints.value.length === 0) {
    alert('No coordinate points found. Please ensure Calculations Part 1 was completed first.');
    return;
  }
  
  try {
    // Prepare data for comprehensive document generator
    const surveyPoints: SurveyPoint[] = coordinatePoints.value.map((coord: any) => ({
      pointId: coord.id,
      y: coord.y,
      x: coord.x,
      status: coord.status || 'P',
      description: coord.description || '',
      surveyDate: coord.surveyDate || workflowState?.surveyorInfo?.surveyDate || ''
    }));
    
    const surveyorInfo = {
      name: workflowState?.surveyorInfo?.landSurveyor || '',
      licenseNumber: workflowState?.surveyorInfo?.licenseNumber || '',
      firm: workflowState?.surveyorInfo?.firm || '',
      address: workflowState?.surveyorInfo?.address || '',
      surveyDate: workflowState?.surveyorInfo?.surveyDate || '',
      projectTitle: workflowState?.surveyorInfo?.surveyOf || workflowState?.projectInfo?.projectName || '',
      district: workflowState?.projectInfo?.district || 'Unknown District',
      centralMeridian: workflowState?.projectInfo?.centralMeridian || 29
    };
    
    // Cover page information
    const coverPageInfo = {
      firmName: 'C PARADZAYI LAND SURVEYORS',
      firmSubtitle: 'Cadastral, Engineering, Topographic & Mining Surveyors',
      phone: '+263 774 003 137',
      whatsapp: '+263 717 845 599',
      email: 'cparadzayi@gmail.com',
      website: 'www.mataranyika.com',
      address: '6322 Hwari Matongo Street, Southview, Gweru, Zimbabwe',
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      projectTitle: surveyorInfo.projectTitle,
      surveyorName: surveyorInfo.name,
      licenseNumber: surveyorInfo.licenseNumber,
      surveyDate: surveyorInfo.surveyDate,
      district: surveyorInfo.district,
      surveyType: `SURVEY OF ${surveyorInfo.projectTitle.toUpperCase()}`,
      pointsAnalyzed: surveyPoints.length
    };
    
    // Use comprehensive document generator (two-pass system)
    console.log('[MapLibre] 📄 Initializing ComprehensiveDocumentGenerator...');
    
    // Fetch control points if project has them
    let controlPoints: any[] = [];
    const centralMeridian = workflowState?.projectInfo?.centralMeridian || 29;
    
    console.log('[MapLibre] 🔍 Checking for control points...');
    console.log('[MapLibre] - workflowState.projectInfo:', workflowState?.projectInfo);
    console.log('[MapLibre] - projectId:', workflowState?.projectInfo?.projectId);
    console.log('[MapLibre] - controlPointIds:', workflowState?.projectInfo?.controlPointIds);
    console.log('[MapLibre] - centralMeridian:', centralMeridian);
    
    if (workflowState?.projectInfo?.projectId && workflowState?.projectInfo?.controlPointIds?.length) {
      try {
        console.log('[MapLibre] 📍 Fetching control points...');
        console.log('[MapLibre] - Control Point IDs:', workflowState.projectInfo.controlPointIds);
        
        const API_BASE = '/api';
        const response = await axios.get(`${API_BASE}/control-points`, {
          params: { 
            gauss_lo: centralMeridian,  // ⭐ FIX: Use gauss_lo parameter
            limit: 5000  // Fetch all control points for this meridian
          }
        });
        
        if (response.data.data && Array.isArray(response.data.data)) {
          controlPoints = response.data.data.filter((cp: any) => 
            workflowState.projectInfo.controlPointIds!.includes(cp.id)
          );
          console.log('[MapLibre] ✅ Found', controlPoints.length, 'control points');
          if (controlPoints.length > 0) {
            console.log('[MapLibre] - Control points:', controlPoints.map((cp: any) => cp.monu_num).join(', '));
            console.log('[MapLibre] - First control point:', controlPoints[0]);
          }
        }
      } catch (error) {
        console.error('[MapLibre] ❌ Failed to fetch control points:', error);
      }
    } else {
      console.warn('[MapLibre] ⚠️ No control point IDs found in project');
      console.log('[MapLibre] - projectId:', workflowState?.projectInfo?.projectId);
      console.log('[MapLibre] - controlPointIds:', workflowState?.projectInfo?.controlPointIds);
    }
    
    const generator = new ComprehensiveDocumentGenerator();
    
    // Debug: Check what data we're passing
    console.log('[MapLibre] 🔍 Data being passed to generator:');
    console.log('[MapLibre] - surveyPoints:', surveyPoints.length);
    console.log('[MapLibre] - adjustedCoordinates:', workflowState?.adjustedCoordinates?.length || 0);
    console.log('[MapLibre] - controlPoints:', controlPoints.length);
    console.log('[MapLibre] - First surveyPoint:', surveyPoints[0]);
    if (workflowState?.adjustedCoordinates && workflowState.adjustedCoordinates.length > 0) {
      console.log('[MapLibre] - First adjustedCoordinate:', workflowState.adjustedCoordinates[0]);
    } else {
      console.warn('[MapLibre] ⚠️ WARNING: No adjustedCoordinates in workflowState!');
      console.log('[MapLibre] - Using surveyPoints as adjustedCoordinates instead');
    }
    
    // Use surveyPoints as adjustedCoordinates if adjustedCoordinates is empty
    const adjustedCoordinates = (workflowState?.adjustedCoordinates && workflowState.adjustedCoordinates.length > 0)
      ? workflowState.adjustedCoordinates
      : surveyPoints.map(pt => ({
          pointId: pt.pointId,
          y: pt.y,
          x: pt.x,
          status: pt.status,
          description: pt.description,
          surveyDate: pt.surveyDate,
          fieldBookPage: '',
          calculationsPage: 0,
          adjustment: {
            isDuplicate: false,
            observationCount: 1,
            method: 'gps' as const
          }
        }));
    
    console.log('[MapLibre] - Final adjustedCoordinates count:', adjustedCoordinates.length);
    
    // ⭐ NEW: Use TWO-PASS generation for 100% accurate cross-references
    // This will:
    // 1. PASS 1: Measure document structure (get actual page numbers)
    // 2. PASS 2: Render with accurate cross-references
    // 3. Merge everything together
    console.log('[MapLibre] 🎯 Using TWO-PASS generation for accurate cross-references...');
    
    const result = await generator.generateWithTwoPass({
      projectInfo: coverPageInfo,
      surveyorInfo: surveyorInfo,
      fieldBookObservations: workflowState?.observations || [],
      surveyPoints: surveyPoints,
      adjustedCoordinates: adjustedCoordinates,
      projectControlPoints: controlPoints,
      duplicateAnalyses: workflowState?.duplicateAnalyses || [],
      parcels: computedParcels.map(p => ({
        id: p.id?.toString(),
        name: p.designation,
        coordinates: p.points.map(pt => ({ x: pt.x, y: pt.y })),
        area: (p.areaResult?.area?.display as any)?.hectares || (p.areaResult?.area?.abs_m2 ? p.areaResult.area.abs_m2 / 10000 : 0)
      })),
      beaconLabels: beaconLabels.value
    });
    
    console.log('[MapLibre] ✅ Comprehensive document generated with TWO-PASS approach');
    console.log('[MapLibre] 📊 Total pages:', result.totalPages);
    
    // ⭐ NEW: Display ACTUAL measurements (100% accurate)
    if (result.measurements) {
      console.log('[MapLibre] 📊 ACTUAL page numbers (from measurements):');
      console.log('[MapLibre] - Field Book: E1-E' + result.measurements.fieldBook.pages);
      console.log('[MapLibre] - Coordinate List:', result.measurements.coordinateList.startPage, '-', result.measurements.coordinateList.endPage);
      console.log('[MapLibre] - Calculations Part 1:', result.measurements.calculations.startPage, '-', result.measurements.calculations.endPage);
      console.log('[MapLibre] - Areas:', result.measurements.areas.startPage, '-', result.measurements.areas.endPage);
      console.log('[MapLibre] ✅ All cross-references are 100% accurate!');
    } else {
      // Fallback to old format (shouldn't happen with new method)
      console.log('[MapLibre] 📊 ACTUAL page numbers:');
      console.log('[MapLibre] - Coordinate List: 100 -', result.actualCoordListLastPage);
      console.log('[MapLibre] - Calculations Part 1:', result.actualCalcStartPage, '-', result.actualCalcLastPage);
      console.log('[MapLibre] - Area & Consistency will start at:', result.actualCalcLastPage + 1);
    }
    
    // ⭐ Use ACTUAL last page number from Calculations Part 1
    const lastDisplayedPageNumber = result.measurements 
      ? result.measurements.calculations.endPage 
      : result.actualCalcLastPage;
    
    // Continue with Area & Consistency section
    await generateComprehensivePDF(computedParcels, result.pdf, surveyorInfo.projectTitle, lastDisplayedPageNumber);
    
  } catch (error: any) {
    console.error('[MapLibre] ❌ Error generating comprehensive document:', error);
    alert(`Failed to generate PDF.\n\nError: ${error.message || 'Unknown error'}\n\nPlease check the console for details.`);
  }
}

/**
 * Generate comprehensive PDF with Calculations Part 1 + Area & Consistency
 * Uses shared composable for consistent PDF generation across the application
 * CUMULATIVE: Includes ALL parcels (both new and existing) in every PDF
 */
async function generateComprehensivePDF(
  computedParcels: Parcel[],
  calcPart1Blob: Blob,
  projectName: string,
  lastDisplayedPageNumber: number
) {
  try {
    console.log('[MapLibre] 📄 Generating Cumulative Comprehensive PDF...');
    console.log('[MapLibre] 📊 Last displayed page number:', lastDisplayedPageNumber);
    console.log('[MapLibre] 📊 Total parcels in project:', computedParcels.length);
    
    // Track which parcels are NEW (for user notification only)
    const newParcels = computedParcels.filter(parcel => {
      const savedParcel = savedParcels.value.get(parcel.designation);
      const includedInPdf = savedParcel?.metadata?.included_in_pdf || false;
      return !includedInPdf;
    });
    
    const existingParcels = computedParcels.length - newParcels.length;
    
    console.log('[MapLibre] 📊 New parcels:', newParcels.length);
    console.log('[MapLibre] 📊 Existing parcels:', existingParcels);
    
    // Use shared composable to generate comprehensive PDF
    const { generateComprehensiveLatestPDF } = useComprehensivePDF();
    
    const workingDirectory = workflowState?.projectInfo?.workingDirectory;
    
    const result = await generateComprehensiveLatestPDF({
      computedParcels,
      calcPart1Blob,
      projectName,
      projectId: workflowState?.projectInfo?.projectId,  // Added for coordinate point fetching
      lastDisplayedPageNumber,
      beaconLabels: beaconLabels.value.map((bl) => ({
        parcelId: bl.parcelId,
        label: bl.displayLabel,
        position: [bl.x, bl.y] as [number, number]
      })),
      workingDirectory,
      onNewParcels: async (parcels) => {
        await markParcelsAsIncludedInPdf(newParcels);
      }
    });
    
    if (!result.success) {
      if (result.error?.includes('No parcels')) {
        alert('No parcels to include in PDF.\n\nPlease digitize at least one parcel first.');
        console.log('[MapLibre] ℹ️ No parcels available - skipping PDF generation');
        return;
      }
      throw new Error(result.error || 'PDF generation failed');
    }
    
    // Handle success
    if (result.filePath) {
      console.log('[MapLibre] ✅ Saved to:', result.filePath);
      alert(
        `✅ Comprehensive PDF Generated!\n\n` +
        `Total parcels in PDF: ${computedParcels.length}\n` +
        `  • New parcels: ${newParcels.length}\n` +
        `  • Existing parcels: ${existingParcels}\n\n` +
        `File: Comprehensive_Latest.pdf\n` +
        `Location: ${result.filePath}\n\n` +
        `Note: This PDF contains ALL parcels and overwrites the previous version.`
      );
    } else if (result.pdfBlob) {
      // Download fallback
      console.warn('[MapLibre] ⚠️ Downloading PDF instead');
      downloadPdfBlob(result.pdfBlob, 'Comprehensive_Latest.pdf');
      
      if (result.error) {
        alert(
          `⚠️ PDF generated but failed to save to project folder.\n\n` +
          `Error: ${result.error}\n\n` +
          `PDF has been downloaded instead.`
        );
      }
    }
    
    console.log('[MapLibre] ✅ Comprehensive PDF generated successfully');
    console.log('[MapLibre] 📄 Filename: Comprehensive_Latest.pdf');
    
  } catch (error: any) {
    console.error('[MapLibre] ❌ Error generating comprehensive PDF:', error);
    throw error;
  }
}

/**
 * Download PDF blob to user's downloads folder
 */
function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Mark parcels as included in PDF by updating their metadata
 */
async function markParcelsAsIncludedInPdf(parcels: Parcel[]) {
  try {
    console.log('[MapLibre] 📝 Marking', parcels.length, 'parcels as included in PDF...');
    
    for (const parcel of parcels) {
      const savedParcel = savedParcels.value.get(parcel.designation);
      if (savedParcel) {
        // Update metadata to mark as included in PDF
        const updatedMetadata = {
          ...savedParcel.metadata,
          included_in_pdf: true,
          pdf_inclusion_date: new Date().toISOString()
        };
        
        await updateLandParcel(savedParcel.id, {
          metadata: updatedMetadata
        });
        
        // Update local cache
        savedParcel.metadata = updatedMetadata;
        savedParcels.value.set(parcel.designation, savedParcel);
        
        console.log(`[MapLibre] ✅ Marked ${parcel.designation} as included in PDF`);
      }
    }
    
    console.log('[MapLibre] ✅ All parcels marked as included in PDF');
  } catch (error) {
    console.error('[MapLibre] ❌ Error marking parcels as included in PDF:', error);
    // Don't throw - this is not critical
  }
}

/**
 * Generate PDF with optional Calculations Part 1 appending
 */
async function generatePDF(computedParcels: Parcel[], calculationsPart1PDF?: File) {
  const projectName = workflowState?.value?.projectInfo?.projectName || 'Survey Project';
  
  if (calculationsPart1PDF) {
    console.log('[MapLibre] 📄 Merging with Calculations Part 1 PDF:', calculationsPart1PDF.name);
  } else {
    console.log('[MapLibre] 📄 Generating standalone Area & Consistency PDF');
  }
  console.log('[MapLibre] Processing', computedParcels.length, 'parcel(s)');
  
  try {
    const result = await generateAreaConsistencyPDF(
      computedParcels, 
      projectName, 
      calculationsPart1PDF,
      undefined,  // lastDisplayedPageNumber (not used in this call)
      beaconLabels.value  // ✅ Pass intelligent beacon labels for suffix display
    );
    
    // If merged PDF bytes returned, ask user what to do with it
    if (result && calculationsPart1PDF) {
      const action = confirm(
        '✅ Merged PDF generated successfully!\n\n' +
        'Choose how to proceed:\n\n' +
        '✅ Click OK to DOWNLOAD the merged PDF\n' +
        '❌ Click Cancel to SAVE to project folder'
      );
      
      if (action) {
        // Download to user's downloads folder
        downloadMergedPDF(result, projectName);
      } else {
        // Save to project's working directory
        await saveMergedPDFToProject(result, projectName);
      }
    } else if (calculationsPart1PDF) {
      console.log('[MapLibre] ✅ Merged PDF generated successfully');
    } else {
      console.log('[MapLibre] ✅ Standalone PDF generated successfully');
    }
  } catch (error) {
    console.error('[MapLibre] ❌ Error generating PDF:', error);
    alert('Failed to generate PDF. Check console for details.');
  }
}

/**
 * Download merged PDF to user's downloads folder
 */
function downloadMergedPDF(pdfBytes: Uint8Array, projectName: string) {
  console.log('[MapLibre] 💾 Downloading merged PDF...');
  
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `Complete_Report_${projectName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  link.click();
  
  URL.revokeObjectURL(url);
  
  console.log('[MapLibre] ✅ Downloaded:', link.download);
  alert(`✅ Downloaded to your Downloads folder:\n\n${link.download}`);
}

/**
 * Save merged PDF to project's working directory using auto-save service
 */
async function saveMergedPDFToProject(pdfBytes: Uint8Array, projectName: string) {
  const workingDirectory = workflowState?.value?.projectInfo?.workingDirectory;
  
  if (!workingDirectory) {
    alert('❌ No working directory set. Please download instead.');
    downloadMergedPDF(pdfBytes, projectName);
    return;
  }
  
  console.log('[MapLibre] 💾 Saving merged PDF to project:', workingDirectory);
  
  try {
    // Convert Uint8Array to Blob
    const pdfBlob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    
    // Use auto-save service for consistent handling
    const results = await autoSaveStepProducts({
      workingDirectory,
      projectName,
      stepId: 'calculations_part2',
      products: {
        mergedPDF: pdfBlob
      }
    });
    
    console.log('[MapLibre] ✅ Auto-save completed');
    alert(`✅ Merged PDF saved to project!\n\nCheck console for full path.`);
  } catch (error: any) {
    console.error('[MapLibre] ❌ Error saving PDF to project:', error);
    const fallback = confirm(
      '❌ Failed to save to project folder.\n\n' +
      'Would you like to download instead?'
    );
    if (fallback) {
      downloadMergedPDF(pdfBytes, projectName);
    }
  }
}

/**
 * Handle keyboard events
 */
function handleKeyPress(e: KeyboardEvent) {
  if (e.key === 'Escape' && isDrawing.value) {
    if (selectedPoints.value.length >= 3) {
      completePolygon();
    } else {
      cancelDrawing();
    }
  }
}

// Lifecycle
onMounted(async () => {
  console.log('='.repeat(80));
  console.log('[MapLibre] 🚀 Component mounted - starting initialization...');
  console.log('[MapLibre] Timestamp:', new Date().toISOString());
  console.log('[MapLibre] Coordinate points available:', coordinatePoints.value.length);
  console.log('[MapLibre] Adjusted coordinates from workflow:', workflowState?.adjustedCoordinates?.length || 0);
  console.log('[MapLibre] Workflow state:', workflowState);
  console.log('='.repeat(80));
  
  // If no coordinates available, show helpful message
  if (!coordinatePoints.value || coordinatePoints.value.length === 0) {
    console.warn('[MapLibre] ⚠️ No survey points available!');
    console.log('[MapLibre] 💡 Survey points should be loaded from Calculations Part 1');
    console.log('[MapLibre] 💡 If you just refreshed, the workflow state should load automatically');
    console.log('[MapLibre] 💡 If this persists, please complete Calculations Part 1 first');
  }
  
  try {
    // Reconcile adjustedCoordinates against live DB names BEFORE map renders,
    // so stale pointIds (from failed previous saves) are corrected before labels are drawn.
    await refreshDbPointNames().catch(() => {});

    // Fetch control points from API before initializing maps
    console.log('[MapLibre] 📡 Fetching control points...');
    await Promise.race([
      fetchControlPoints(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Control points fetch timeout')), 5000))
    ]).catch(error => {
      console.warn('[MapLibre] ⚠️ Control points fetch failed:', error);
      // Continue anyway - control points are optional
    });
    
    // Load existing parcels from database
    // Timeout raised to 60s — large projects (200+ parcels) with coordinate matching exceed 5s
    console.log('[MapLibre] 📦 Loading parcels from database...');
    await Promise.race([
      loadParcelsFromDatabase(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Parcel load timeout')), 60000))
    ]).catch(error => {
      console.warn('[MapLibre] ⚠️ Parcel load failed:', error);
      // Continue anyway - parcels are optional on first load
    });
    
    // Initialize map (critical - must succeed)
    console.log('[MapLibre] 🗺️ Initializing map...');
    await initializeMap();
    
    // Initialize inset map if visible and has trig beacons
    if (showTrigInset.value && trigBeacons.value.length > 0) {
      console.log('[MapLibre] 🗺️ Initializing inset map...');
      await new Promise(resolve => setTimeout(resolve, 100));
      await initializeInsetMap().catch(error => {
        console.warn('[MapLibre] ⚠️ Inset map initialization failed:', error);
        // Continue anyway - inset map is optional
      });
    }
    
    // Add keyboard event listener for ESC key
    window.addEventListener('keydown', handleKeyPress);
    console.log('[MapLibre] ⌨️ Keyboard listener attached (ESC to complete/cancel)');
    console.log('[MapLibre] ✅ Component initialization complete!');
    
  } catch (error: any) {
    console.error('[MapLibre] ❌ Critical initialization error:', error);
    console.error('[MapLibre] Error stack:', error.stack);
    console.error('[MapLibre] Error message:', error.message);
    isLoading.value = false;
    
    // Show detailed error to user
    const errorMsg = error.message || 'Unknown error';
    alert(`Failed to initialize Area Computation view.\n\nError: ${errorMsg}\n\nPlease check browser console (F12) for details.`);
  }
});

onBeforeUnmount(() => {
  // Remove keyboard event listener
  window.removeEventListener('keydown', handleKeyPress);
  
  // Clean up main map
  if (map) {
    map.remove();
    map = null;
  }
  
  // Clean up inset map
  destroyInsetMap();
});
</script>

<style scoped>
/* Ensure MapLibre canvas is visible */
:deep(.maplibregl-canvas) {
  position: absolute !important;
  width: 100% !important;
  height: 100% !important;
  top: 0 !important;
  left: 0 !important;
}

:deep(.maplibregl-canvas-container) {
  position: absolute !important;
  width: 100% !important;
  height: 100% !important;
  top: 0 !important;
  left: 0 !important;
}

:deep(.maplibregl-map) {
  position: absolute !important;
  width: 100% !important;
  height: 100% !important;
}

/* MapLibre overrides */
:deep(.maplibregl-popup-content) {
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}

:deep(.maplibregl-ctrl-group) {
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}
</style>
