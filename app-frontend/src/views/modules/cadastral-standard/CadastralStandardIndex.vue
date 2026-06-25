<template>
  <div class="space-y-6">
    <header class="space-y-1">
      <h2 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
        <span aria-hidden="true">📋</span> Cadastral (Standard)
      </h2>
      <p class="text-sm text-gray-600 max-w-prose">
        Digital cadastral records production from reduced field notes.
      </p>
    </header>

    <!-- Featured Workflow -->
    <section class="space-y-2">
      <div class="flex items-baseline justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Getting Started</h3>
      </div>
      <div class="bg-gradient-to-r from-rose-50 to-rose-100 border border-rose-200 rounded-lg p-6">
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0">
            <div class="w-12 h-12 bg-rose-500 rounded-lg flex items-center justify-center text-white text-xl">
              📋
            </div>
          </div>
          <div class="flex-1">
            <h4 class="text-lg font-semibold text-rose-900 mb-2">Cadastral Workflow</h4>
            <p class="text-sm text-rose-700 mb-4">
              Complete 9-step process for generating professional digital cadastral records from your reduced field notes. 
              Set up project, select control points, import CSV coordinates, generate field books, coordinate lists, calculations, and final certificates.
            </p>
            <RouterLink 
              to="/modules/cadastral-standard/workflow"
              class="inline-flex items-center px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              🚀 Start Workflow
            </RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- Process Overview -->
    <section class="space-y-2">
      <div class="flex items-baseline justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Workflow Steps</h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="(step, index) in workflowSteps" :key="step.id" class="bg-white border border-gray-200 rounded-lg p-4">
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-8 h-8 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-sm font-medium">
              {{ index + 1 }}
            </div>
            <div>
              <h4 class="font-medium text-gray-900 text-sm">{{ step.name }}</h4>
              <p class="text-xs text-gray-500 mt-1">{{ step.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Other Tools -->
    <section class="space-y-2">
      <div class="flex items-baseline justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Individual Tools</h3>
        <p class="text-[11px] text-gray-500">Coming soon</p>
      </div>
      <ul class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <li v-for="item in otherTools" :key="item.slug">
          <div class="block p-3 rounded border bg-white shadow-sm text-xs opacity-60 cursor-not-allowed">
            <div class="flex items-center gap-2 font-medium">
              <span class="text-base" aria-hidden="true">{{ item.icon || '•' }}</span>
              {{ item.title }}
            </div>
            <div class="mt-0.5 text-[10px] text-gray-500 line-clamp-2" v-if="item.description">
              {{ item.description }}
            </div>
            <span class="inline-block mt-1 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[10px]">
              Planned
            </span>
          </div>
        </li>
      </ul>
    </section>

    <!-- Requirements -->
    <section class="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h3 class="text-sm font-medium text-blue-900 mb-2">📋 Requirements</h3>
      <ul class="text-xs text-blue-700 space-y-1">
        <li>• <strong>Input:</strong> CSV file with final adjusted coordinates</li>
        <li>• <strong>Format:</strong> Point, Y, X, Status, Calcs Page, Description, Date of survey</li>
        <li>• <strong>Precision:</strong> Supports both traverse and GNSS data</li>
        <li>• <strong>Output:</strong> Professional PDFs with letterhead and cross-references</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useModulesStore } from '../../../stores/modules'

const store = useModulesStore()
const module = computed(() => store.getBySlug('cadastral-standard'))

// Workflow steps for overview
const workflowSteps = [
  { id: 'project-setup', name: 'Project Setup', description: 'Configure project details and working directory' },
  { id: 'csv-import', name: 'Import CSV', description: 'Upload and validate coordinate data' },
  { id: 'control-point-selection', name: 'Control Point Selection', description: 'Select trig beacons and control points (after knowing survey location)' },
  { id: 'field-book', name: 'Field Book', description: 'Generate electronic field book (3 decimals)' },
  { id: 'calculations-part1', name: 'Calculations Part 1', description: 'Field computations and adjustments' },
  { id: 'coordinate-list', name: 'Coordinate List', description: 'Final coordinate list (2 decimals)' },
  { id: 'area-computation', name: 'Area Computation', description: 'Areas and consistencies' },
  { id: 'report-on-survey', name: 'Report on Survey', description: 'Standalone survey report' },
  { id: 'dsg-certificate', name: 'DSG Certificate', description: 'Final certificate generation' }
]

// Other individual tools (currently disabled)
const otherTools = computed(() => 
  module.value?.submenus?.filter(item => item.slug !== 'workflow') || []
)
</script>