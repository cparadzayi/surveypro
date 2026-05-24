<template>
  <div class="control-point-search-filter">
    <!-- Search Header -->
    <div class="mb-4">
      <h3 class="text-lg font-semibold text-gray-900 mb-2">Search Control Points</h3>
      <p class="text-sm text-gray-600">
        {{ filteredPoints.length }} of {{ totalPoints }} points shown
        <span v-if="selectedCount > 0" class="text-blue-600 font-medium">
          • {{ selectedCount }} selected
        </span>
      </p>
    </div>

    <!-- Search Input -->
    <div class="mb-4">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name, code, or coordinates..."
          class="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          @input="onSearchChange"
        />
        <div class="absolute left-3 top-3.5 text-gray-400">
          🔍
        </div>
        <button
          v-if="searchQuery"
          @click="clearSearch"
          class="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Filters Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      <!-- Meridian Filter -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Central Meridian
        </label>
        <select
          v-model="filterMeridian"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Meridians</option>
          <option value="25">Lo 25 (25°E)</option>
          <option value="27">Lo 27 (27°E)</option>
          <option value="29">Lo 29 (29°E)</option>
          <option value="31">Lo 31 (31°E)</option>
          <option value="33">Lo 33 (33°E)</option>
        </select>
      </div>

      <!-- Sort By -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Sort By
        </label>
        <select
          v-model="sortBy"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="name">Name (A-Z)</option>
          <option value="distance">Distance (Near to Far)</option>
          <option value="recent">Recently Used</option>
          <option value="code">Code</option>
        </select>
      </div>

      <!-- Distance Filter -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Max Distance
        </label>
        <select
          v-model="maxDistance"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          :disabled="!projectCenter"
        >
          <option value="">All Distances</option>
          <option value="5000">Within 5 km</option>
          <option value="10000">Within 10 km</option>
          <option value="25000">Within 25 km</option>
          <option value="50000">Within 50 km</option>
        </select>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="flex flex-wrap gap-2 mb-4">
      <button
        @click="selectNearby"
        :disabled="!projectCenter || filteredPoints.length === 0"
        class="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        📍 Select 5 Nearest
      </button>
      <button
        @click="clearFilters"
        :disabled="!hasActiveFilters"
        class="px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        🔄 Clear Filters
      </button>
      <button
        @click="selectAll"
        :disabled="filteredPoints.length === 0"
        class="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-md hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ✓ Select All ({{ filteredPoints.length }})
      </button>
      <button
        @click="deselectAll"
        :disabled="selectedCount === 0"
        class="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-md hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ✕ Deselect All
      </button>
    </div>

    <!-- Results List -->
    <div class="border border-gray-200 rounded-lg overflow-hidden">
      <!-- Results Header -->
      <div class="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <div class="flex items-center justify-between text-sm font-medium text-gray-700">
          <span>Control Points</span>
          <span v-if="isLoading" class="text-blue-600">Loading...</span>
        </div>
      </div>

      <!-- Results Body -->
      <div class="max-h-96 overflow-y-auto">
        <!-- Empty State -->
        <div v-if="filteredPoints.length === 0 && !isLoading" class="p-8 text-center">
          <div class="text-4xl mb-2">🔍</div>
          <p class="text-gray-600 mb-1">No control points found</p>
          <p class="text-sm text-gray-500">Try adjusting your search or filters</p>
        </div>

        <!-- Point Cards -->
        <div
          v-for="point in paginatedPoints"
          :key="point.id"
          @click="togglePoint(point.id)"
          class="border-b border-gray-100 last:border-b-0 hover:bg-blue-50 cursor-pointer transition-colors"
          :class="{ 'bg-blue-50': isSelected(point.id) }"
        >
          <div class="px-4 py-3">
            <div class="flex items-start justify-between">
              <!-- Point Info -->
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    :checked="isSelected(point.id)"
                    @click.stop="togglePoint(point.id)"
                    class="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <h4 class="font-semibold text-gray-900">{{ point.name }}</h4>
                  <span v-if="point.code" class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {{ point.code }}
                  </span>
                </div>
                
                <div class="ml-6 space-y-1 text-sm text-gray-600">
                  <div class="flex items-center gap-4">
                    <span>📍 Y: {{ formatCoordinate(point.y) }}</span>
                    <span>X: {{ formatCoordinate(point.x) }}</span>
                  </div>
                  
                  <div class="flex items-center gap-3">
                    <span v-if="point.central_meridian" class="text-blue-600">
                      Lo {{ point.central_meridian }}
                    </span>
                    <span v-if="point.order" class="text-purple-600">
                      {{ point.order }} Order
                    </span>
                    <span v-if="getDistance(point)" class="text-gray-500">
                      📏 {{ formatDistance(getDistance(point)) }}
                    </span>
                  </div>
                  
                  <div v-if="point.description" class="text-gray-500 italic">
                    {{ point.description }}
                  </div>
                </div>
              </div>

              <!-- Recently Used Badge -->
              <div v-if="isRecentlyUsed(point.id)" class="ml-2">
                <span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  ⭐ Recent
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="bg-gray-50 px-4 py-3 border-t border-gray-200">
        <div class="flex items-center justify-between">
          <button
            @click="prevPage"
            :disabled="currentPage === 1"
            class="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          
          <span class="text-sm text-gray-600">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          
          <button
            @click="nextPage"
            :disabled="currentPage === totalPages"
            class="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface ControlPoint {
  id: number;
  name: string;
  code?: string;
  y: number;
  x: number;
  central_meridian?: number;
  order?: string;
  description?: string;
}

interface ProjectCenter {
  y: number;
  x: number;
}

const props = defineProps<{
  points: ControlPoint[];
  selectedIds: number[];
  projectCenter?: ProjectCenter;
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  'update:selectedIds': [ids: number[]];
  'selectionChange': [ids: number[]];
}>();

// Search and filter state
const searchQuery = ref('');
const filterMeridian = ref('');
const sortBy = ref('name');
const maxDistance = ref('');

// Pagination
const currentPage = ref(1);
const itemsPerPage = 20;

// Recently used points (stored in localStorage)
const recentlyUsedIds = ref<number[]>([]);

// Load recently used from localStorage
try {
  const stored = localStorage.getItem('recentControlPoints');
  if (stored) {
    recentlyUsedIds.value = JSON.parse(stored);
  }
} catch (e) {
  console.error('Failed to load recent control points:', e);
}

// Computed properties
const totalPoints = computed(() => props.points.length);
const selectedCount = computed(() => props.selectedIds.length);

const hasActiveFilters = computed(() => 
  searchQuery.value !== '' || 
  filterMeridian.value !== '' || 
  maxDistance.value !== ''
);

// Filter and sort points
const filteredPoints = computed(() => {
  let points = [...props.points];

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    points = points.filter(p => 
      p.name.toLowerCase().includes(query) ||
      (p.code && p.code.toLowerCase().includes(query)) ||
      p.y.toString().includes(query) ||
      p.x.toString().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query))
    );
  }

  // Meridian filter
  if (filterMeridian.value) {
    const meridian = parseInt(filterMeridian.value);
    points = points.filter(p => p.central_meridian === meridian);
  }

  // Distance filter
  if (maxDistance.value && props.projectCenter) {
    const maxDist = parseFloat(maxDistance.value);
    points = points.filter(p => {
      const dist = calculateDistance(p, props.projectCenter!);
      return dist <= maxDist;
    });
  }

  // Sort
  if (sortBy.value === 'name') {
    points.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy.value === 'code') {
    points.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  } else if (sortBy.value === 'distance' && props.projectCenter) {
    points.sort((a, b) => {
      const distA = calculateDistance(a, props.projectCenter!);
      const distB = calculateDistance(b, props.projectCenter!);
      return distA - distB;
    });
  } else if (sortBy.value === 'recent') {
    points.sort((a, b) => {
      const aIndex = recentlyUsedIds.value.indexOf(a.id);
      const bIndex = recentlyUsedIds.value.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  return points;
});

// Pagination
const totalPages = computed(() => Math.ceil(filteredPoints.value.length / itemsPerPage));

const paginatedPoints = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return filteredPoints.value.slice(start, end);
});

// Helper functions
function calculateDistance(point: ControlPoint, center: ProjectCenter): number {
  const dy = point.y - center.y;
  const dx = point.x - center.x;
  return Math.sqrt(dy * dy + dx * dx);
}

function getDistance(point: ControlPoint): number | null {
  if (!props.projectCenter) return null;
  return calculateDistance(point, props.projectCenter);
}

function formatCoordinate(value: number): string {
  return value.toFixed(2);
}

function formatDistance(distance: number | null): string {
  if (distance === null) return 'N/A';
  if (distance < 1000) {
    return `${distance.toFixed(0)}m`;
  }
  return `${(distance / 1000).toFixed(1)}km`;
}

function isSelected(id: number): boolean {
  return props.selectedIds.includes(id);
}

function isRecentlyUsed(id: number): boolean {
  return recentlyUsedIds.value.includes(id);
}

function togglePoint(id: number) {
  const newIds = isSelected(id)
    ? props.selectedIds.filter(i => i !== id)
    : [...props.selectedIds, id];
  
  // Update recently used
  if (!isSelected(id)) {
    addToRecentlyUsed(id);
  }
  
  emit('update:selectedIds', newIds);
  emit('selectionChange', newIds);
}

function selectAll() {
  const allIds = filteredPoints.value.map(p => p.id);
  emit('update:selectedIds', allIds);
  emit('selectionChange', allIds);
}

function deselectAll() {
  emit('update:selectedIds', []);
  emit('selectionChange', []);
}

function selectNearby() {
  if (!props.projectCenter) return;
  
  const sorted = [...filteredPoints.value].sort((a, b) => {
    const distA = calculateDistance(a, props.projectCenter!);
    const distB = calculateDistance(b, props.projectCenter!);
    return distA - distB;
  });
  
  const nearbyIds = sorted.slice(0, 5).map(p => p.id);
  emit('update:selectedIds', nearbyIds);
  emit('selectionChange', nearbyIds);
}

function clearSearch() {
  searchQuery.value = '';
}

function clearFilters() {
  searchQuery.value = '';
  filterMeridian.value = '';
  maxDistance.value = '';
  currentPage.value = 1;
}

function onSearchChange() {
  currentPage.value = 1; // Reset to first page on search
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
  }
}

function addToRecentlyUsed(id: number) {
  // Add to front, remove duplicates, keep max 20
  const updated = [id, ...recentlyUsedIds.value.filter(i => i !== id)].slice(0, 20);
  recentlyUsedIds.value = updated;
  
  try {
    localStorage.setItem('recentControlPoints', JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save recent control points:', e);
  }
}

// Watch for filter changes to reset pagination
watch([filterMeridian, sortBy, maxDistance], () => {
  currentPage.value = 1;
});
</script>

<style scoped>
.control-point-search-filter {
  @apply w-full;
}
</style>
