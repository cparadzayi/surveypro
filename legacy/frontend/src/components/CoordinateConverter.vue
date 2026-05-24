<template>
  <div class="coordinate-converter">
    <h2 class="text-2xl font-bold mb-6">Zimbabwe Cadastral Coordinate System</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Geodetic to Grid Conversion -->
      <div class="bg-white p-6 rounded-lg shadow-md">
        <h3 class="text-xl font-semibold mb-4">Geodetic to Grid</h3>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Latitude (°S)
            </label>
            <input
              v-model.number="geodetic.lat"
              type="number"
              step="0.0001"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="-17.8252"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Longitude (°E)
            </label>
            <input
              v-model.number="geodetic.lon"
              type="number"
              step="0.0001"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="31.0335"
            />
          </div>
          
          <button
            @click="convertToGrid"
            :disabled="loading"
            class="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {{ loading ? 'Converting...' : 'Convert to Grid' }}
          </button>
          
          <div v-if="gridResult" class="mt-4 p-4 bg-gray-50 rounded-md">
            <p class="font-semibold mb-2">Grid Coordinates:</p>
            <p><strong>Y (Westing):</strong> {{ gridResult.y.toFixed(3) }} m</p>
            <p><strong>X (Southing):</strong> {{ gridResult.x.toFixed(3) }} m</p>
            <p><strong>Central Meridian:</strong> {{ gridResult.centralMeridian }}°E</p>
          </div>
          
          <div v-if="!isValidZimbabwe && geodetic.lat && geodetic.lon" class="mt-2 p-3 bg-yellow-50 border border-yellow-300 rounded-md">
            <p class="text-sm text-yellow-800">⚠️ Coordinates are outside Zimbabwe's bounds</p>
          </div>
        </div>
      </div>
      
      <!-- Grid to Geodetic Conversion -->
      <div class="bg-white p-6 rounded-lg shadow-md">
        <h3 class="text-xl font-semibold mb-4">Grid to Geodetic - P(Y,X) Format</h3>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Y-Coordinate (Westing, m) - negative=east, positive=west
            </label>
            <input
              v-model.number="grid.y"
              type="number"
              step="0.001"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              X-Coordinate (Southing, m) - positive, increases southwards
            </label>
            <input
              v-model.number="grid.x"
              type="number"
              step="0.001"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Central Meridian
            </label>
            <select
              v-model.number="grid.centralMeridian"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option v-for="meridian in CENTRAL_MERIDIANS" :key="meridian" :value="meridian">
                {{ meridian }}°E
              </option>
            </select>
          </div>
          
          <button
            @click="convertToGeodetic"
            :disabled="loading"
            class="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          >
            {{ loading ? 'Converting...' : 'Convert to Geodetic' }}
          </button>
          
          <div v-if="geodeticResult" class="mt-4 p-4 bg-gray-50 rounded-md">
            <p class="font-semibold mb-2">Geodetic Coordinates:</p>
            <p><strong>Latitude:</strong> {{ geodeticResult.lat.toFixed(6) }}°</p>
            <p><strong>Longitude:</strong> {{ geodeticResult.lon.toFixed(6) }}°</p>
            <p class="text-sm text-gray-600 mt-2">
              {{ decimalToDMS(geodeticResult.lat, false) }}, 
              {{ decimalToDMS(geodeticResult.lon, true) }}
            </p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Error Display -->
    <div v-if="error" class="mt-4 p-4 bg-red-50 border border-red-300 rounded-md">
      <p class="text-red-800">{{ error }}</p>
    </div>
    
    <!-- Information Panel -->
    <div class="mt-8 p-6 bg-blue-50 rounded-lg">
      <h3 class="text-lg font-semibold mb-3">About Zimbabwe Cadastral System</h3>
      <ul class="space-y-2 text-sm">
        <li><strong>Beacon Format:</strong> P(Y, X) where P is the beacon name</li>
        <li><strong>Ellipsoid:</strong> Clarke 1880 (Modified)</li>
        <li><strong>Central Meridians:</strong> 25°, 27°, 29°, 31°, 33° East</li>
        <li><strong>Y-Coordinate (Westing):</strong> Increases westwards from central meridian (negative=east, positive=west)</li>
        <li><strong>X-Coordinate (Southing):</strong> Positive from Equator, increases southwards toward South Pole</li>
        <li><strong>Direction precision:</strong> 
          <ul class="ml-4 mt-1">
            <li>• Distance &lt; 6000m: Rounded to nearest 10 seconds</li>
            <li>• Distance ≥ 6000m: Rounded to nearest second</li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCoordinateSystem } from '../composables/useCoordinateSystem';

const {
  geodeticToGrid,
  gridToGeodetic,
  decimalToDMS,
  validateZimbabweCoordinates,
  CENTRAL_MERIDIANS
} = useCoordinateSystem();

const loading = ref(false);
const error = ref<string | null>(null);

// Geodetic input (Harare example)
const geodetic = ref({
  lat: -17.8252,
  lon: 31.0335
});

// Grid input
const grid = ref({
  y: 0,
  x: 0,
  centralMeridian: 31
});

// Results
const gridResult = ref<any>(null);
const geodeticResult = ref<any>(null);

// Validation
const isValidZimbabwe = computed(() => 
  validateZimbabweCoordinates(geodetic.value.lat, geodetic.value.lon)
);

async function convertToGrid() {
  loading.value = true;
  error.value = null;
  
  try {
    const result = await geodeticToGrid(geodetic.value.lat, geodetic.value.lon);
    gridResult.value = result;
    
    // Auto-populate grid fields for reverse conversion
    grid.value = {
      y: result.y,
      x: result.x,
      centralMeridian: result.centralMeridian
    };
  } catch (err: any) {
    error.value = err.message || 'Failed to convert coordinates';
  } finally {
    loading.value = false;
  }
}

async function convertToGeodetic() {
  loading.value = true;
  error.value = null;
  
  try {
    const result = await gridToGeodetic(
      grid.value.y,
      grid.value.x,
      grid.value.centralMeridian
    );
    geodeticResult.value = result;
    
    // Auto-populate geodetic fields
    geodetic.value = {
      lat: result.lat,
      lon: result.lon
    };
  } catch (err: any) {
    error.value = err.message || 'Failed to convert coordinates';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.coordinate-converter {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}
</style>
