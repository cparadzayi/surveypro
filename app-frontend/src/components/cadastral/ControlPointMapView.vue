<template>
  <div class="control-point-map-selector">
    <!-- Map Container -->
    <div :class="['map-container', { 'full-width': viewMode === 'map' }]">
      <div ref="mapContainer" class="map-view"></div>
      
      <!-- Map Controls Overlay -->
      <div class="map-controls">
        <!-- View Toggle -->
        <div class="control-group">
          <button
            @click="viewMode = 'map'"
            :class="['control-btn', { active: viewMode === 'map' }]"
            title="Map View"
          >
            🗺️
          </button>
          <button
            @click="viewMode = 'list'"
            :class="['control-btn', { active: viewMode === 'list' }]"
            title="List View"
          >
            📋
          </button>
          <button
            @click="viewMode = 'split'"
            :class="['control-btn', { active: viewMode === 'split' }]"
            title="Split View"
          >
            ⚡
          </button>
        </div>

        <!-- Zoom Controls -->
        <div class="control-group">
          <button @click="zoomIn" class="control-btn" title="Zoom In">➕</button>
          <button @click="zoomOut" class="control-btn" title="Zoom Out">➖</button>
          <button @click="fitBounds" class="control-btn" title="Fit All Points">🎯</button>
        </div>
      </div>

      <!-- Selection Stats -->
      <div class="selection-stats">
        <div class="stat-item">
          <span class="stat-label">Selected:</span>
          <span class="stat-value">{{ selectedIds.length }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Visible:</span>
          <span class="stat-value">{{ filteredAndSortedPoints.length }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total:</span>
          <span class="stat-value">{{ points.length }}</span>
        </div>
      </div>
    </div>

    <!-- List Panel -->
    <div v-if="viewMode === 'split' || viewMode === 'list'" class="list-panel">
      <!-- Simplified Controls -->
      <div class="search-section">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="🔍 Search by name, code, or coordinates..."
          class="search-input"
        />
        
        <!-- Quick Actions -->
        <div class="quick-actions">
          <select v-model="sortBy" class="filter-select">
            <option value="distance">Distance (Near → Far)</option>
            <option value="name">Name (A → Z)</option>
            <option value="code">Code</option>
          </select>
          
          <button @click="selectNearest(5)" class="action-btn" title="Select 5 nearest points">
            ⚡ Select 5 Nearest
          </button>
          <button @click="clearSelection" class="action-btn" title="Clear all selections">
            ❌ Clear All
          </button>
          <button 
            @click="showFavoritesOnly = !showFavoritesOnly" 
            :class="['action-btn', { active: showFavoritesOnly }]"
            title="Show favorites only"
          >
            ⭐ Favorites
          </button>
        </div>
      </div>

      <!-- Smart Recommendations -->
      <div v-if="recommendations.length > 0" class="recommendations">
        <h4 class="recommendations-title">🎯 Recommended Control Points</h4>
        <div class="recommendation-list">
          <div
            v-for="rec in recommendations"
            :key="rec.point.id"
            class="recommendation-item"
            @click="togglePoint(rec.point)"
          >
            <div class="rec-checkbox">
              <input
                type="checkbox"
                :checked="isSelected(rec.point.id)"
                @click.stop="togglePoint(rec.point)"
              />
            </div>
            <div class="rec-info">
              <div class="rec-name">{{ rec.point.monu_num }}</div>
              <div class="rec-details">
                <span class="rec-distance">{{ rec.distance.toFixed(1) }} km</span>
                <span class="rec-reason">{{ rec.reason }}</span>
              </div>
            </div>
            <button
              @click.stop="toggleFavorite(rec.point.id)"
              :class="['favorite-btn', { active: isFavorite(rec.point.id) }]"
              title="Toggle favorite"
            >
              {{ isFavorite(rec.point.id) ? '⭐' : '☆' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Control Points List -->
      <div class="points-list">
        <div
          v-for="point in filteredAndSortedPoints"
          :key="point.id"
          :class="['point-item', { selected: isSelected(point.id) }]"
          @click="togglePoint(point)"
          @mouseenter="highlightPoint(point.id)"
          @mouseleave="unhighlightPoint(point.id)"
        >
          <div class="point-checkbox">
            <input
              type="checkbox"
              :checked="isSelected(point.id)"
              @click.stop="togglePoint(point)"
            />
          </div>
          <div class="point-info">
            <div class="point-header">
              <span class="point-name">{{ point.monu_num }}</span>
              <span class="point-type">{{ point.type }}</span>
            </div>
            <div class="point-details">
              <span class="point-coords" title="Gauss Y (Westing), X (Southing)">
                Y: {{ point.y?.toFixed(2) }}, X: {{ point.x?.toFixed(2) }}
              </span>
              <span v-if="point.distance" class="point-distance">
                📍 {{ point.distance.toFixed(1) }} km
              </span>
            </div>
            <div v-if="point.description" class="point-description">
              {{ point.description }}
            </div>
          </div>
          <div class="point-actions">
            <button
              @click.stop="zoomToPoint(point)"
              class="action-icon-btn"
              title="Zoom to point"
            >
              🔍
            </button>
            <button
              @click.stop="toggleFavorite(point.id)"
              :class="['action-icon-btn', { active: isFavorite(point.id) }]"
              title="Toggle favorite"
            >
              {{ isFavorite(point.id) ? '⭐' : '☆' }}
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredAndSortedPoints.length === 0" class="empty-state">
          <p>No control points found matching your filters.</p>
          <button @click="clearFilters" class="action-btn">Clear Filters</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, nextTick } from 'vue'
import { useControlPointMap } from '@/composables/useControlPointMap'

interface ControlPoint {
  id: number
  monu_num: string
  type: string
  y: number // Y coordinate (Gauss-Conformal: Westing)
  x: number // X coordinate (Gauss-Conformal: Southing)
  lat_wgs84?: number // Latitude (WGS84, for map display)
  lng_wgs84?: number // Longitude (WGS84, for map display)
  description?: string
  central_meridian?: number
  distance?: number
}

interface Props {
  points: ControlPoint[]
  selectedIds: number[]
  surveyCenter: { lat: number; lng: number } | null
  projectId?: number
}

const props = withDefaults(defineProps<Props>(), {
  points: () => [],
  selectedIds: () => [],
  surveyCenter: null,
  projectId: undefined
})

const emit = defineEmits<{
  'update:selectedIds': [ids: number[]]
  'meridianSuggested': [meridian: number]
}>()

// Debug: Log props when component receives them
watch(() => props.points, (newPoints) => {
  console.log('[ControlPointMapView] 🔍 Points prop changed:', newPoints.length)
  if (newPoints.length > 0) {
    console.log('[ControlPointMapView] 🔍 Sample point:', {
      id: newPoints[0].id,
      y: newPoints[0].y,
      x: newPoints[0].x,
      y_type: typeof newPoints[0].y,
      x_type: typeof newPoints[0].x,
      distance: newPoints[0].distance
    })
  }
}, { immediate: true })

// Use the composable
const {
  mapContainer,
  viewMode,
  searchQuery,
  sortBy,
  showFavoritesOnly,
  filteredAndSortedPoints,
  recommendations,
  suggestedMeridian,
  initMap,
  zoomIn,
  zoomOut,
  fitBounds,
  zoomToPoint,
  highlightPoint,
  unhighlightPoint,
  toggleFavorite,
  isFavorite,
  clearFilters,
  updateMarkers
} = useControlPointMap(
  () => props.points,
  () => props.selectedIds,
  () => props.surveyCenter,
  props.projectId
)

// Watch for points changes and log filtered results
watch(filteredAndSortedPoints, (newFiltered) => {
  console.log('[ControlPointMapView] 🗺️ Filtered points changed:', newFiltered.length)
}, { immediate: true })

// Point selection
function togglePoint(point: ControlPoint) {
  const newSelection = [...props.selectedIds]
  const index = newSelection.indexOf(point.id)

  if (index > -1) {
    newSelection.splice(index, 1)
  } else {
    newSelection.push(point.id)
  }

  emit('update:selectedIds', newSelection)
}

function isSelected(id: number): boolean {
  return props.selectedIds.includes(id)
}

function selectNearest(count: number) {
  const nearest = filteredAndSortedPoints.value
    .filter(p => p.distance !== undefined)
    .slice(0, count)
    .map(p => p.id)

  const newSelection = [...new Set([...props.selectedIds, ...nearest])]
  emit('update:selectedIds', newSelection)
}

function clearSelection() {
  emit('update:selectedIds', [])
}

function applySuggestedMeridian() {
  if (suggestedMeridian.value) {
    emit('meridianSuggested', suggestedMeridian.value)
  }
}

// Lifecycle
onMounted(() => {
  nextTick(() => {
    initMap()
  })
})

// Watch for selection changes to update markers
import { watch } from 'vue'
watch(() => props.selectedIds, () => {
  updateMarkers()
}, { deep: true })
</script>

<style scoped>
.control-point-map-selector {
  display: flex;
  height: 600px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.map-container {
  position: relative;
  flex: 1;
  min-width: 0;
  transition: all 0.3s ease;
}

.map-container.full-width {
  flex: 1 1 100%;
}

.map-view {
  width: 100%;
  height: 100%;
}

.map-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: white;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 4px;
}

.control-btn {
  padding: 8px 12px;
  border: none;
  background: white;
  cursor: pointer;
  border-radius: 4px;
  font-size: 16px;
  transition: all 0.2s;
  min-width: 40px;
}

.control-btn:hover {
  background: #f3f4f6;
}

.control-btn.active {
  background: #3b82f6;
  color: white;
}

.selection-stats {
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: flex;
  gap: 12px;
  background: white;
  padding: 8px 16px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.stat-item {
  display: flex;
  gap: 6px;
  font-size: 13px;
}

.stat-label {
  color: #6b7280;
  font-weight: 500;
}

.stat-value {
  font-weight: 700;
  color: #1f2937;
}

.list-panel {
  width: 420px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #e5e7eb;
  overflow: hidden;
  background: #f9fafb;
}

.search-section {
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
  background: white;
}

.search-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.filter-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-select,
.filter-input {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: white;
  transition: all 0.2s;
}

.filter-select:focus,
.filter-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.action-btn {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.action-btn.active {
  background: #fef3c7;
  border-color: #fbbf24;
  color: #92400e;
}

.suggestion-banner {
  margin: 12px 16px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 2px solid #fbbf24;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 4px rgba(251, 191, 36, 0.2);
}

.suggestion-content {
  display: flex;
  align-items: start;
  gap: 10px;
}

.suggestion-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.suggestion-text {
  flex: 1;
}

.suggestion-text strong {
  display: block;
  color: #92400e;
  font-size: 13px;
  margin-bottom: 4px;
}

.suggestion-reason {
  font-size: 12px;
  color: #78350f;
  margin: 0;
}

.suggestion-btn {
  padding: 6px 16px;
  background: #f59e0b;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.suggestion-btn:hover {
  background: #d97706;
}

.recommendations {
  margin: 0 16px 12px;
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border: 2px solid #3b82f6;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
}

.recommendations-title {
  font-size: 13px;
  font-weight: 700;
  color: #1e40af;
  margin: 0 0 10px 0;
}

.recommendation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.recommendation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.recommendation-item:hover {
  background: #f0f9ff;
  transform: translateX(2px);
}

.rec-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.rec-info {
  flex: 1;
  min-width: 0;
}

.rec-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 2px;
}

.rec-details {
  display: flex;
  gap: 8px;
  font-size: 11px;
}

.rec-distance {
  color: #3b82f6;
  font-weight: 600;
}

.rec-reason {
  color: #6b7280;
}

.favorite-btn {
  padding: 4px 8px;
  background: transparent;
  border: none;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0.5;
}

.favorite-btn:hover,
.favorite-btn.active {
  opacity: 1;
  transform: scale(1.2);
}

.points-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.point-item {
  display: flex;
  align-items: start;
  gap: 10px;
  padding: 12px;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.point-item:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
  transform: translateY(-1px);
}

.point-item.selected {
  background: #eff6ff;
  border-color: #3b82f6;
}

.point-checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  margin-top: 2px;
}

.point-info {
  flex: 1;
  min-width: 0;
}

.point-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.point-name {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
}

.point-type {
  padding: 2px 8px;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
}

.point-details {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  margin-bottom: 4px;
}

.point-coords {
  color: #6b7280;
  font-family: 'Courier New', monospace;
}

.point-distance {
  color: #3b82f6;
  font-weight: 600;
}

.point-description {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
  line-height: 1.4;
}

.point-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-icon-btn {
  padding: 6px;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-icon-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.action-icon-btn.active {
  background: #fef3c7;
  border-color: #fbbf24;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;
}

.empty-state p {
  margin-bottom: 16px;
  font-size: 14px;
}

/* Scrollbar styling */
.points-list::-webkit-scrollbar {
  width: 8px;
}

.points-list::-webkit-scrollbar-track {
  background: #f3f4f6;
  border-radius: 4px;
}

.points-list::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

.points-list::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* Responsive adjustments */
@media (max-width: 1024px) {
  .list-panel {
    width: 350px;
  }
}

@media (max-width: 768px) {
  .control-point-map-selector {
    flex-direction: column;
    height: auto;
  }
  
  .map-container {
    height: 400px;
  }
  
  .list-panel {
    width: 100%;
    max-height: 500px;
  }
}
</style>
