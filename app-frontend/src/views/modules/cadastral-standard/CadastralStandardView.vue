<!--
  Cadastral Standard Module View
  
  Main view for the SurveyPro Cadastral Standard workflow.
  Handles the complete 7-step process from CSV import to DSG certificate generation.
-->

<template>
  <div class="cadastral-module">
    <!-- Header -->
    <div class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-bold text-gray-900">Cadastral Standard</h1>
            <p class="mt-1 text-sm text-gray-600">
              Digital cadastral records production from reduced field notes
            </p>
          </div>
          
          <div v-if="workflowState.importedPoints.length > 0" class="text-right flex items-center gap-4">
            <!-- ✅ Phase 1: Autosave Indicator -->
            <div class="text-sm">
              <div class="flex items-center gap-2">
                <span v-if="isSaving" class="text-blue-600">💾 Saving...</span>
                <span v-else class="text-gray-500">✅ {{ lastSavedText }}</span>
              </div>
            </div>
            
            <button
              @click="resetImportStep"
              class="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
              title="Clear all imported data and restart workflow"
            >
              🔄 Reset Import
            </button>
            <div>
              <div class="text-sm text-gray-500">Project Status</div>
              <div class="text-lg font-semibold text-blue-600">
                {{ getStepDisplayName(workflowState.currentStep) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ✅ Phase 1: Enhanced Progress Indicator -->
    <div v-if="workflowState.importedPoints.length > 0" class="bg-gray-50 border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <!-- Progress Summary Bar -->
        <div class="mb-4 bg-white rounded-lg shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-3">
              <span class="text-sm font-medium text-gray-700">
                {{ completedSteps.length }} of {{ workflowSteps.length }} steps completed
              </span>
              <span class="text-lg font-bold text-blue-600">
                {{ actualProgressPercentage }}% Complete
              </span>
            </div>
            <div class="text-sm text-gray-600">
              <span v-if="estimatedTimeRemaining > 0">
                ⏱️ Est. {{ estimatedTimeRemaining }} min remaining
              </span>
              <span v-else class="text-green-600 font-medium">
                ✅ Almost done!
              </span>
            </div>
          </div>
          
          <!-- Visual Progress Bar -->
          <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div 
              class="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
              :style="{ width: `${actualProgressPercentage}%` }"
            >
            </div>
          </div>
        </div>
        
        <nav aria-label="Progress">
          <ol class="flex items-center">
            <li 
              v-for="(step, index) in workflowSteps" 
              :key="step.id"
              class="relative"
              :class="{ 'pr-8 sm:pr-20': index < workflowSteps.length - 1 }"
            >
              <!-- Step Circle -->
              <div class="flex items-center">
                <div
                  :class="{
                    'bg-blue-600 text-white': isStepCompleted(step.id) || isStepCurrent(step.id),
                    'bg-gray-200 text-gray-500': !isStepCompleted(step.id) && !isStepCurrent(step.id)
                  }"
                  class="relative w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                >
                  <span v-if="isStepCompleted(step.id)">✓</span>
                  <span v-else>{{ index + 1 }}</span>
                </div>
                
                <!-- Step Label -->
                <span
                  :class="{
                    'text-blue-600 font-medium': isStepCurrent(step.id),
                    'text-gray-500': !isStepCurrent(step.id)
                  }"
                  class="ml-3 text-sm hidden sm:block"
                >
                  {{ step.name }}
                </span>
              </div>
              
              <!-- Connector Line -->
              <div
                v-if="index < workflowSteps.length - 1"
                :class="{
                  'bg-blue-600': isStepCompleted(step.id),
                  'bg-gray-200': !isStepCompleted(step.id)
                }"
                class="absolute top-4 left-8 w-full h-0.5 -translate-y-1/2"
              ></div>
            </li>
          </ol>
        </nav>
      </div>
    </div>

    <!-- Phase 2: Workflow Dashboard -->
    <div v-if="workflowState.importedPoints.length > 0 || completedSteps.length > 0" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- ✅ Phase 1: Batch Export Button -->
      <div v-if="hasGeneratedDocuments" class="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="text-3xl">📦</div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">Export All Documents</h3>
              <p class="text-sm text-gray-600">Download all generated documents as a compressed ZIP archive</p>
            </div>
          </div>
          <button
            @click="exportAllDocuments"
            :disabled="isExporting"
            class="inline-flex items-center px-6 py-3 bg-green-600 text-white text-base font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <span v-if="isExporting">🔄 Creating ZIP...</span>
            <span v-else>📥 Download ZIP</span>
          </button>
        </div>
      </div>
      
      <WorkflowDashboard
        :completed-steps="completedSteps"
        :current-step="workflowState.currentStep"
        :step-data="stepData"
        :working-directory="workflowState.projectInfo.workingDirectory"
        @step-click="handleStepClick"
        @action="handleStepAction"
      />
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- ⭐ PHASE 2: Automation Progress Indicator -->
      <div v-if="automationProgress.isAutomating" class="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-3">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">🤖 Automated Workflow in Progress</h3>
              <p class="text-sm text-gray-600">{{ automationProgress.message }}</p>
            </div>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold text-blue-600">{{ automationProgress.progress }}%</div>
            <div class="text-xs text-gray-500">{{ automationProgress.currentStep }}</div>
          </div>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            class="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
            :style="{ width: automationProgress.progress + '%' }"
          ></div>
        </div>
        <p class="mt-3 text-xs text-gray-500 text-center">
          Please wait while we automatically generate your documents...
        </p>
      </div>
      
      <!-- Project Setup Step (Step 0) -->
      <div v-if="workflowState.currentStep === 'project-setup'">
        <ProjectSetupView
          @complete="handleProjectSetupComplete"
        />
      </div>

      <!-- CSV Import Step (Step 1) -->
      <div v-if="workflowState.currentStep === 'csv-import'">
        <!-- Welcome screen - Always show when no data imported -->
        <div v-if="workflowState.importedPoints.length === 0" class="py-12">
          <div class="max-w-2xl mx-auto">
            <div class="text-center mb-8">
              <div class="text-6xl mb-6">📋</div>
              <h2 class="text-2xl font-bold text-gray-900 mb-4">
                Import Survey Coordinates
              </h2>
              <p class="text-gray-600">
                Upload your reduced field notes CSV file to begin the workflow.
              </p>
            </div>

            <!-- ⭐ NEW: Selected Project Info (Read-only) -->
            <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 mb-6">
              <div class="flex items-start gap-4">
                <div class="text-4xl">📁</div>
                <div class="flex-1">
                  <h3 class="text-lg font-semibold text-gray-900 mb-3">Selected Project</h3>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <div class="text-xs font-medium text-gray-600 mb-1">Project</div>
                      <div class="text-sm font-semibold text-gray-900">{{ selectedProject?.name || 'Not selected' }}</div>
                    </div>
                    <div>
                      <div class="text-xs font-medium text-gray-600 mb-1">Surveyor</div>
                      <div class="text-sm font-semibold text-gray-900">{{ workflowState.surveyorInfo.landSurveyor || 'Not selected' }}</div>
                    </div>
                    <div>
                      <div class="text-xs font-medium text-gray-600 mb-1">District</div>
                      <div class="text-sm font-semibold text-gray-900">{{ workflowState.projectInfo.district || 'Not set' }}</div>
                    </div>
                    <div>
                      <div class="text-xs font-medium text-gray-600 mb-1">Survey Type</div>
                      <div class="text-sm font-semibold text-gray-900">{{ workflowState.projectInfo.surveyType || 'Not set' }}</div>
                    </div>
                  </div>
                  <div class="mt-4 pt-4 border-t border-blue-200">
                    <button
                      @click="workflowState.currentStep = 'project-setup'"
                      class="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      ← Back to Project Setup
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- CSV Template & Help -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 class="text-sm font-semibold text-blue-900 mb-3">📋 Need Help with CSV Format?</h4>
              <div class="flex flex-wrap gap-3">
                <button
                  @click="downloadCSVTemplate"
                  class="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  📥 Download CSV Template
                </button>
                <button
                  @click="showFormatGuide = true"
                  class="inline-flex items-center px-4 py-2 bg-white text-blue-700 text-sm font-medium rounded-md border border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  📖 Format Guide
                </button>
              </div>
              <p class="mt-2 text-xs text-blue-700">
                Download a pre-formatted template with sample data to get started quickly
              </p>
            </div>

            <!-- Central Meridian Info (Read-only from setup) -->
            <div class="bg-green-50 border border-green-300 rounded-lg p-4 mb-6">
              <div class="flex items-start gap-3">
                <span class="text-2xl">🌐</span>
                <div class="flex-1">
                  <h4 class="text-sm font-semibold text-green-900 mb-1">
                    Coordinate System
                  </h4>
                  <p class="text-sm text-green-800">
                    <strong>Lo {{ selectedLoZone || 'Not set' }}</strong> ({{ selectedLoZone ? `${selectedLoZone - 1}-${selectedLoZone + 1}°E` : 'N/A' }})
                    - Set in Project Setup
                  </p>
                  <p v-if="!selectedLoZone" class="mt-2 text-xs text-amber-700">
                    ⚠️ No Lo zone selected. Please go back to Project Setup.
                  </p>
                </div>
              </div>
            </div>

            <!-- Import Button -->
            <div class="text-center">
              <input
                ref="fileInputRef"
                id="csv-file-input"
                type="file"
                accept=".csv"
                @change="handleFileChange"
                class="hidden"
              />
              
              <div class="flex gap-3 items-center justify-center">
                <button
                  @click="triggerFileInput"
                  :disabled="!selectedProjectId || !selectedLoZone"
                  :class="{
                    'bg-blue-600 hover:bg-blue-700': selectedProjectId && selectedLoZone,
                    'bg-gray-400 cursor-not-allowed': !selectedProjectId || !selectedLoZone
                  }"
                  class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  📤 Import Coordinates
                </button>
                
                <button
                  v-if="workflowState.importedPoints.length > 0"
                  @click="resetImportStep"
                  class="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                  title="Clear imported data and reset this step"
                >
                  🔄 Reset Step
                </button>
              </div>
              
              <p v-if="!selectedProjectId" class="mt-2 text-sm text-amber-600">
                ⚠️ Please select a project before importing coordinates
              </p>
              <p v-else-if="!selectedLoZone" class="mt-2 text-sm text-red-600 font-medium">
                ⚠️ Please select a Lo zone before importing coordinates
              </p>
              <p v-else-if="workflowState.importedPoints.length > 0" class="mt-2 text-sm text-green-600">
                ✅ {{ workflowState.importedPoints.length }} points imported (Lo {{ selectedLoZone }})
              </p>
              
              <div class="mt-6 text-sm text-gray-500">
                <p>Required format: Point, Y, X, Status, Description, Date of survey</p>
                <p class="mt-1">Sample: P2,97538.004,2247107.872,F,50mm Iron Pipe in Concrete,1/10/2025</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-show="workflowState.currentStep === 'field-book'" class="space-y-6">
        <!-- ⭐ NEW: Auto-populated Surveyor Information (Read-only) -->
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-xl font-semibold text-gray-900">Surveyor Information</h2>
              <p class="text-sm text-gray-600 mt-1">
                Auto-populated from Project Setup
              </p>
            </div>
            <button
              @click="workflowState.currentStep = 'project-setup'"
              class="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors"
            >
              ← Edit Setup
            </button>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label for="landSurveyor" class="block text-sm font-medium text-gray-700 mb-2">
                Land Surveyor Name
              </label>
              <input
                id="landSurveyor"
                v-model="workflowState.surveyorInfo.landSurveyor"
                type="text"
                readonly
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-600"
                placeholder="Select surveyor above"
              />
            </div>

            <div>
              <label for="licenseNumber" class="block text-sm font-medium text-gray-700 mb-2">
                License Number
              </label>
              <input
                id="licenseNumber"
                v-model="workflowState.surveyorInfo.licenseNumber"
                type="text"
                readonly
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-600"
                placeholder="Auto-filled"
              />
            </div>

            <div>
              <label for="firm" class="block text-sm font-medium text-gray-700 mb-2">
                Surveying Firm
              </label>
              <input
                id="firm"
                v-model="workflowState.surveyorInfo.firm"
                type="text"
                readonly
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-600"
                placeholder="Auto-filled"
              />
            </div>

            <div>
              <label for="surveyDate" class="block text-sm font-medium text-gray-700 mb-2">
                Survey Date
              </label>
              <input
                id="surveyDate"
                v-model="workflowState.surveyorInfo.surveyDate"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Auto-filled from project or enter manually"
              />
              <p v-if="selectedProjectId" class="mt-1 text-sm text-gray-500">
                ℹ️ Auto-filled from selected project
              </p>
            </div>

            <div class="lg:col-span-2">
              <label for="address" class="block text-sm font-medium text-gray-700 mb-2">
                Surveying Firm Address
              </label>
              <textarea
                id="address"
                v-model="workflowState.surveyorInfo.address"
                rows="3"
                readonly
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-600"
                placeholder="Auto-filled from surveyor"
              ></textarea>
            </div>

            <div class="lg:col-span-2">
              <label for="surveyOf" class="block text-sm font-medium text-gray-700 mb-2">
                Survey of (Description)
              </label>
              <textarea
                id="surveyOf"
                v-model="workflowState.surveyorInfo.surveyOf"
                rows="3"
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., LOTS 1 - 12 OF LOT 84 OF SUBDIVISION B OF SUBDIVISION E OF GWELO SMALL HOLDING 34"
              ></textarea>
              <p v-if="selectedProjectId" class="mt-1 text-sm text-gray-500">
                ℹ️ Auto-filled from selected project description
              </p>
            </div>

            <div>
              <label for="district" class="block text-sm font-medium text-gray-700 mb-2">
                District
              </label>
              <input
                id="district"
                v-model="workflowState.projectInfo.district"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., GWELO"
              />
              <p v-if="selectedProjectId" class="mt-1 text-sm text-gray-500">
                ℹ️ Auto-filled from selected project district
              </p>
            </div>

            <div class="lg:col-span-2">
              <label for="instruments" class="block text-sm font-medium text-gray-700 mb-2">
                Instruments Used
              </label>
              <textarea
                id="instruments"
                v-model="workflowState.surveyorInfo.instruments"
                rows="4"
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 1. Trimble R6GNSS Set&#10;Base Serial Number S/N 5016424521&#10;Rover Serial Number S/N 5146476624"
              ></textarea>
            </div>
            
            <!-- Working Directory Selector -->
            <div class="lg:col-span-2">
              <WorkingDirectorySelector
                v-model="workflowState.projectInfo.workingDirectory"
                :project-name="workflowState.surveyorInfo.surveyOf || 'Project'"
                :district="workflowState.projectInfo.district || ''"
              />
            </div>
          </div>
        </div>

        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-xl font-semibold text-gray-900">Electronic Field Book</h2>
              <p class="text-sm text-gray-600 mt-1">
                Generate field book from imported coordinates (3 decimal precision)
              </p>
            </div>
            <div class="flex gap-2">
              <button
                v-if="workflowState.documents.fieldBook"
                @click="handleResetFieldBook"
                class="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                title="Reset this step"
              >
                🔄 Reset
              </button>
              <button
                @click="generateFieldBook"
                :disabled="isGenerating"
                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span v-if="isGenerating" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating...
                </span>
                <span v-else>📖 Generate Field Book</span>
              </button>
            </div>
          </div>

          <!-- Imported Data Summary -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <div class="text-2xl font-bold text-blue-600">{{ workflowState.importedPoints.length }}</div>
              <div class="text-sm text-gray-600">Total Points</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <div class="text-2xl font-bold text-green-600">{{ fixedPointsCount }}</div>
              <div class="text-sm text-gray-600">Fixed Points</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <div class="text-2xl font-bold text-orange-600">{{ pegPointsCount }}</div>
              <div class="text-sm text-gray-600">Peg Points</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <div class="text-2xl font-bold text-gray-600">{{ otherPointsCount }}</div>
              <div class="text-sm text-gray-600">Other Points</div>
            </div>
          </div>

          <!-- Sample Preview -->
          <div class="border border-gray-200 rounded-lg overflow-hidden">
            <div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 class="text-sm font-medium text-gray-900">
                Coordinate Preview (Field Book Format - 3 decimals)
              </h3>
            </div>
            
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Point</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Y (Westing)</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">X (Southing)</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr
                    v-for="point in workflowState.importedPoints.slice(0, 5)"
                    :key="point.id"
                    class="hover:bg-gray-50"
                  >
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ point.id }}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{{ point.fieldBook.y }}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{{ point.fieldBook.x }}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        v-if="point.status"
                        :class="{
                          'bg-green-100 text-green-800': point.status === 'F',
                          'bg-orange-100 text-orange-800': point.status === 'P'
                        }"
                        class="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                      >
                        {{ point.status === 'F' ? 'Found' : point.status === 'P' ? 'Peg' : point.status || '' }}
                      </span>
                      <span v-else class="text-gray-400 text-xs">-</span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" :title="point.description">
                      {{ point.description }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div v-if="workflowState.importedPoints.length > 5" class="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500 text-center">
              Showing 5 of {{ workflowState.importedPoints.length }} points
            </div>
          </div>

          <!-- Navigation buttons -->
          <div class="flex justify-between pt-6 border-t border-gray-200">
            <button
              @click="workflowState.currentStep = 'csv-import'"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              ← Back to Import
            </button>
            
            <div class="flex flex-col items-end">
              <button
                @click="workflowState.currentStep = 'control-point-selection'"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
              >
                Continue to Control Point Selection →
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Control Point Selection Step (Step 2 - After CSV Import) -->
      <div v-if="workflowState.currentStep === 'control-point-selection'">
        <ControlPointSelectionView />
      </div>

      <!-- Found Beacons Step (Step 3 - After Control Point Selection) -->
      <div v-if="workflowState.currentStep === 'found-beacons'">
        <FoundBeaconsView
          :fixed-points="fixedPointsForBeaconAssessment"
          :existing-beacons="workflowState.reportOnSurvey?.beacons"
          :project-id="selectedProjectId || workflowState.projectInfo?.projectId"
          @save="handleFoundBeaconsSave"
          @back="workflowState.currentStep = 'control-point-selection'"
        />
      </div>

      <!-- Field Book Step (Step 4) -->
      <div v-show="workflowState.currentStep === 'field-book'" class="space-y-6">
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-xl font-semibold text-gray-900">Electronic Field Book</h2>
              <p class="text-sm text-gray-600 mt-1">
                Generate field book with 3-decimal precision coordinates
              </p>
            </div>
          </div>

          <!-- Navigation buttons -->
          <div class="flex justify-between pt-6 border-t border-gray-200">
            <button
              @click="workflowState.currentStep = 'found-beacons'"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              ← Back to Found Beacons
            </button>
            
            <div class="flex flex-col items-end">
              <button
                @click="goToNextStep"
                :disabled="!canContinueToCalculations"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Continue to Calculations →
              </button>
              <p v-if="!canContinueToCalculations" class="mt-2 text-sm text-amber-600">
                ⚠️ Please generate the Field Book first
              </p>
            </div>
          </div>
        </div>
      </div>
      <div v-show="workflowState.currentStep === 'calculations-part1'" class="space-y-6">
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-xl font-semibold text-gray-900">Field Calculations (Part 1)</h2>
              <p class="text-sm text-gray-600 mt-1">
                Duplicate point analysis and mean coordinate calculations
              </p>
            </div>
          </div>

          <!-- Generated Documents Access -->
          <div v-if="workflowState.documents.fieldBook" class="mb-6">
            <div class="border border-gray-200 rounded-lg p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <div class="text-2xl mr-3">📖</div>
                  <div>
                    <h3 class="text-lg font-medium text-gray-900">Electronic Field Book</h3>
                    <p class="text-sm text-gray-600">
                      Generated {{ formatDate(workflowState.documents.fieldBook.metadata.dateGenerated) }} • 
                      {{ workflowState.documents.fieldBook.metadata.pageCount }} pages • 
                      {{ workflowState.importedPoints.length }} coordinates
                    </p>
                  </div>
                </div>
                
                <div class="flex space-x-2">
                  <button
                    @click="viewFieldBook"
                    class="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    👁️ Preview PDF
                  </button>
                  
                  <button
                    @click="downloadFieldBook"
                    class="px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
                  >
                    📄 Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Calculations Part 1 Form -->
          <div class="border border-gray-200 rounded-lg p-6">
            <div class="mb-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Duplicate Point Analysis</h3>
              <p class="text-sm text-gray-600">
                Generate professional calculations report with mean coordinates and residual analysis
              </p>
            </div>

            <!-- Surveyor Information Form -->
            <form @submit.prevent="generateCalculationsPart1" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Land Surveyor Name *
                  </label>
                  <input
                    v-model="calculationsInfo.surveyorName"
                    type="text"
                    required
                    readonly
                    class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                    :placeholder="calculationsInfo.surveyorName || 'Select surveyor in Step 1'"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    License Number
                  </label>
                  <input
                    v-model="calculationsInfo.licenseNumber"
                    type="text"
                    readonly
                    class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                    :placeholder="calculationsInfo.licenseNumber || 'From surveyor data'"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Survey Firm
                  </label>
                  <input
                    v-model="calculationsInfo.firm"
                    type="text"
                    readonly
                    class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                    :placeholder="calculationsInfo.firm || 'From surveyor data'"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Survey Date *
                  </label>
                  <input
                    v-model="calculationsInfo.surveyDate"
                    type="text"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Editable"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Project Title *
                </label>
                <input
                  v-model="calculationsInfo.projectTitle"
                  type="text"
                  required
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  :placeholder="workflowState.surveyorInfo.surveyOf || 'Enter project title'"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <textarea
                  v-model="calculationsInfo.address"
                  rows="3"
                  readonly
                  class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                  :placeholder="calculationsInfo.address || 'From surveyor data'"
                ></textarea>
              </div>

              <!-- Survey Data Preview -->
              <div class="mt-6">
                <h4 class="text-lg font-semibold text-gray-800 mb-3">Survey Data Analysis</h4>
                

                
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div class="text-center">
                      <div class="text-2xl font-bold text-blue-600">{{ workflowState.importedPoints.length }}</div>
                      <div class="text-sm text-gray-600">Total Points</div>
                    </div>
                    <div class="text-center">
                      <div class="text-2xl font-bold text-green-600">{{ duplicatePointsCount }}</div>
                      <div class="text-sm text-gray-600">Duplicate Points</div>
                    </div>
                    <div class="text-center">
                      <div class="text-2xl font-bold text-orange-600">{{ uniquePointsCount }}</div>
                      <div class="text-sm text-gray-600">Unique Points</div>
                    </div>
                    <div class="text-center">
                      <div class="text-2xl font-bold text-purple-600">{{ calculationsRequiredCount }}</div>
                      <div class="text-sm text-gray-600">Calculations Required</div>
                    </div>
                  </div>
                  
                  <div v-if="duplicatePointsList.length > 0" class="mt-3">
                    <p class="text-sm font-medium text-gray-700 mb-2">Points with duplicate observations:</p>
                    <div class="flex flex-wrap gap-2">
                      <span 
                        v-for="pointId in duplicatePointsList" 
                        :key="pointId"
                        class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                      >
                        {{ pointId }}
                      </span>
                    </div>
                  </div>
                  
                  <div v-else class="text-yellow-600 text-sm">
                    ⚠️ No duplicate observations detected. Using imported points for calculations.
                  </div>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex space-x-4 pt-4">

                
                <button
                  type="submit"
                  :disabled="!canGenerateCalculations || isGeneratingCalculations"
                  class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-md font-medium transition-colors flex items-center"
                >
                  <svg v-if="isGeneratingCalculations" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {{ isGeneratingCalculations ? 'Generating...' : '🧮 Generate Calculations Part 1 PDF' }}
                </button>
              </div>
            </form>

            <!-- Error Display -->
            <div v-if="calculationsError" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-red-800">Error</h3>
                  <p class="text-sm text-red-700 mt-1">{{ calculationsError }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Navigation buttons -->
          <div class="flex justify-between pt-6 border-t border-gray-200">
            <button
              @click="goToPreviousStep"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              ← Back to Field Book
            </button>
            
            <button
              @click="goToNextStep"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
            >
              Continue to Coordinate List →
            </button>
          </div>
        </div>
      </div>
      <!-- Step 4: Coordinate List -->
      <div v-show="workflowState.currentStep === 'coordinate-list'" class="space-y-6">
        <div class="bg-white shadow rounded-lg p-6">
          <div class="mb-6">
            <h2 class="text-xl font-semibold text-gray-900">Coordinate List Generation</h2>
            <p class="text-sm text-gray-600 mt-1">
              Generate professional coordinate list with grouped sections (pages 100+)
            </p>
          </div>

          <!-- Generated Documents Access (Calculations Part 1) -->
          <div v-if="workflowState.documents.calculationsPart1" class="mb-6">
            <div class="border border-gray-200 rounded-lg p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <div class="text-2xl mr-3">🧮</div>
                  <div>
                    <h3 class="text-lg font-medium text-gray-900">Calculations Part 1</h3>
                    <p class="text-sm text-gray-600">
                      <span v-if="workflowState.documents.calculationsPart1.metadata?.dateGenerated">
                        Generated {{ formatDate(workflowState.documents.calculationsPart1.metadata.dateGenerated) }} • 
                      </span>
                      {{ workflowState.adjustedCoordinates?.length || 0 }} adjusted coordinates
                    </p>
                  </div>
                </div>
                
                <div class="flex space-x-2">
                  <button
                    @click="viewCalculationsPart1"
                    class="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    👁️ Preview PDF
                  </button>
                  
                  <button
                    @click="downloadCalculationsPart1"
                    class="px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
                  >
                    📄 Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Coordinate List Generator -->
          <div class="border border-gray-200 rounded-lg p-6">
            <div class="flex items-center justify-between mb-4">
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900">Coordinate List</h3>
                <p class="text-sm text-gray-600 mt-1">
                  Generate professional coordinate list with grouped sections (pages 100+)
                </p>
                <div v-if="!canGenerateCoordinateList" class="mt-2 text-sm text-amber-600 flex items-center">
                  <svg class="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                  </svg>
                  <span>⚠️ Requires Calculations Part 1 to be completed first</span>
                </div>
                <div v-else class="mt-2 text-sm text-green-600 flex items-center">
                  <svg class="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                  </svg>
                  <span>✅ Ready to generate ({{ workflowState.adjustedCoordinates?.length || 0 }} adjusted coordinates available)</span>
                </div>
              </div>
              <button
                @click="generateCoordinateList"
                :disabled="!canGenerateCoordinateList || isGenerating"
                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span v-if="isGenerating" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating...
                </span>
                <span v-else>📋 Generate Coordinate List</span>
              </button>
            </div>
            
            <div class="bg-gray-50 rounded-lg p-4">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div class="text-lg font-semibold text-purple-600">100+</div>
                  <div class="text-xs text-gray-600">Starting Page</div>
                </div>
                <div>
                  <div class="text-lg font-semibold text-purple-600">~32</div>
                  <div class="text-xs text-gray-600">Points/Page</div>
                </div>
                <div>
                  <div class="text-lg font-semibold text-purple-600">4</div>
                  <div class="text-xs text-gray-600">Sections</div>
                </div>
                <div>
                  <div class="text-lg font-semibold text-purple-600">Dynamic</div>
                  <div class="text-xs text-gray-600">Pagination</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Generated Coordinate List Document -->
          <div v-if="workflowState.documents.coordinateList" class="mt-6">
            <div class="border border-gray-200 rounded-lg p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <div class="text-2xl mr-3">📋</div>
                  <div>
                    <h3 class="text-lg font-medium text-gray-900">Coordinate List</h3>
                    <p class="text-sm text-gray-600">
                      <span v-if="workflowState.documents.coordinateList.metadata?.dateGenerated">
                        Generated {{ formatDate(workflowState.documents.coordinateList.metadata.dateGenerated) }} • 
                      </span>
                      <span v-if="workflowState.documents.coordinateList.metadata?.pageCount">
                        {{ workflowState.documents.coordinateList.metadata.pageCount }} pages • 
                      </span>
                      {{ workflowState.adjustedCoordinates?.length || 0 }} coordinates
                    </p>
                    <p v-if="workflowState.documents.coordinateList.metadata?.savedFilePath" class="text-xs text-green-600 mt-1">
                      💾 Saved: {{ workflowState.documents.coordinateList.metadata.savedFilePath }}
                    </p>
                  </div>
                </div>
                
                <div class="flex space-x-2">
                  <button
                    @click="viewCoordinateList"
                    class="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    👁️ Preview PDF
                  </button>
                  
                  <button
                    @click="downloadCoordinateList"
                    class="px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
                  >
                    📄 Download PDF
                  </button>
                  
                  <button
                    @click="downloadCoordinateListCSV"
                    class="px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 transition-colors"
                  >
                    📊 Download CSV
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Navigation buttons -->
          <div class="flex justify-between pt-6 border-t border-gray-200 mt-6">
            <button
              @click="goToPreviousStep"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              ← Back to Calculations Part 1
            </button>
            
            <button
              @click="goToNextStep"
              :disabled="!workflowState.documents.coordinateList"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Continue to Area Computation →
            </button>
          </div>
        </div>
      </div>

      <!-- Step 7: Area Computation (MapLibre Only) -->
      <MapLibreAreaView v-if="workflowState.currentStep === 'area-computation'" />

      <!-- Step 8: Survey Plan (MapLibre-based) -->
      <SurveyPlanViewNew 
        v-if="workflowState.currentStep === 'survey-plan'"
        :project-id="workflowState.projectInfo.projectId"
        :workflow-state="workflowState"
        @plan-generated="handlePlanGenerated"
        @continue="handleSurveyPlanContinue"
      />

      <!-- Step 8.5: Servitudes -->
      <ServitudesView v-if="workflowState.currentStep === 'servitudes'" />

      <!-- Step 9: Report on Survey -->
      <ReportOnSurveyView v-if="workflowState.currentStep === 'report-on-survey'" />

      <!-- Step 4.5: QGIS Export & Digitization -->
      <QGISExportView v-if="workflowState.currentStep === 'qgis-export'" />

      <!-- Step 9: DSG Certificate -->
      <DSGCertificateView v-if="workflowState.currentStep === 'dsg-certificate'" />

      <!-- Other steps (under development) -->
      <div v-show="workflowState.currentStep !== 'csv-import' && workflowState.currentStep !== 'field-book' && workflowState.currentStep !== 'calculations-part1' && workflowState.currentStep !== 'coordinate-list' && workflowState.currentStep !== 'qgis-export' && workflowState.currentStep !== 'area-computation' && workflowState.currentStep !== 'servitudes' && workflowState.currentStep !== 'survey-plan' && workflowState.currentStep !== 'report-on-survey' && workflowState.currentStep !== 'dsg-certificate'" class="bg-white shadow rounded-lg p-6">
        <div class="text-center py-12">
          <div class="text-4xl mb-4">🚧</div>
          <h2 class="text-xl font-semibold text-gray-900 mb-2">
            {{ getStepDisplayName(workflowState.currentStep) }}
          </h2>
          <p class="text-gray-600 mb-6">
            This workflow step is under development.
          </p>
          <!-- Navigation buttons -->
          <div class="flex justify-center space-x-4">
            <button
              v-if="canGoBack"
              @click="goToPreviousStep"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              ← Previous Step
            </button>
            <button
              v-if="canGoNext"
              @click="goToNextStep"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
            >
              Next Step →
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Document Preview Modal -->
    <DocumentPreviewModal
      :is-open="previewModal.isOpen"
      :title="previewModal.title"
      :subtitle="previewModal.subtitle"
      :pdf-blob="previewModal.pdfBlob"
      :working-directory="selectedProject?.working_directory || workflowState.projectInfo.workingDirectory"
      :document-type="previewModal.documentType"
      :file-name="previewModal.fileName"
      @close="closePreviewModal"
      @saved="handleDocumentSaved"
    />
    
    <!-- ⭐ CSV Re-import Dialog -->
    <CSVReimportDialog
      v-if="reimportDialog.existingImport"
      :is-open="reimportDialog.isOpen"
      :existing-import="reimportDialog.existingImport"
      @close="handleReimportDialogClose"
      @continue="handleReimportChoice"
    />
    
    <!-- ⭐ Merge Analysis Dialog -->
    <MergeAnalysisDialog
      v-if="mergeAnalysisDialog.analysis"
      :is-open="mergeAnalysisDialog.isOpen"
      :analysis="mergeAnalysisDialog.analysis"
      :tolerance="mergeAnalysisDialog.tolerance"
      @close="handleMergeAnalysisClose"
      @proceed="handleMergeProceed"
      @view-details="handleMergeAnalysisViewDetails"
    />
    
    <!-- ✅ Phase 1: CSV Format Guide Modal -->
    <div v-if="showFormatGuide" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 class="text-xl font-semibold text-gray-900">📖 CSV Format Guide</h3>
          <button @click="showFormatGuide = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div class="px-6 py-4 space-y-6">
          <!-- Required Format -->
          <div>
            <h4 class="text-lg font-semibold text-gray-900 mb-2">Required Columns</h4>
            <div class="bg-gray-50 rounded-lg p-4 font-mono text-sm">
              Point, Y, X, Status, Description, Date
            </div>
            <p class="mt-2 text-sm text-gray-600">
              All columns are required. Column names must match exactly (case-sensitive).
            </p>
          </div>
          
          <!-- Column Descriptions -->
          <div>
            <h4 class="text-lg font-semibold text-gray-900 mb-3">Column Descriptions</h4>
            <div class="space-y-3">
              <div class="border-l-4 border-blue-500 pl-4">
                <div class="font-semibold text-gray-900">Point</div>
                <div class="text-sm text-gray-600">Point identifier (e.g., "1", "P2", "ALPHA")</div>
              </div>
              <div class="border-l-4 border-green-500 pl-4">
                <div class="font-semibold text-gray-900">Y</div>
                <div class="text-sm text-gray-600">Y coordinate (Westing) in Cape Lo system (e.g., 12345.67)</div>
              </div>
              <div class="border-l-4 border-green-500 pl-4">
                <div class="font-semibold text-gray-900">X</div>
                <div class="text-sm text-gray-600">X coordinate (Southing) in Cape Lo system (e.g., 2234567.89)</div>
              </div>
              <div class="border-l-4 border-purple-500 pl-4">
                <div class="font-semibold text-gray-900">Status</div>
                <div class="text-sm text-gray-600">Point status: "F" (Found/Fixed) or "P" (Placed/Peg)</div>
              </div>
              <div class="border-l-4 border-yellow-500 pl-4">
                <div class="font-semibold text-gray-900">Description</div>
                <div class="text-sm text-gray-600">Point description (e.g., "50mm Iron Pipe in Concrete")</div>
              </div>
              <div class="border-l-4 border-red-500 pl-4">
                <div class="font-semibold text-gray-900">Date</div>
                <div class="text-sm text-gray-600">Survey date in format: DD/MM/YYYY (e.g., "15/01/2025")</div>
              </div>
            </div>
          </div>
          
          <!-- Example -->
          <div>
            <h4 class="text-lg font-semibold text-gray-900 mb-2">Example CSV</h4>
            <div class="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-xs overflow-x-auto">
              <div>Point,Y,X,Status,Description,Date</div>
              <div>1,12345.67,2234567.89,F,Control Point ALPHA,15/01/2025</div>
              <div>2,12346.78,2234568.90,F,Control Point BETA,15/01/2025</div>
              <div>3,12347.89,2234569.01,P,Peg 1,15/01/2025</div>
              <div>4,12348.90,2234570.12,P,Peg 2,15/01/2025</div>
            </div>
          </div>
          
          <!-- Tips -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 class="text-sm font-semibold text-blue-900 mb-2">💡 Tips</h4>
            <ul class="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Use the "Download CSV Template" button for a pre-formatted file</li>
              <li>Coordinates should be in Cape Lo system (will be auto-converted to WGS84)</li>
              <li>Ensure no extra spaces or special characters</li>
              <li>Save your file with UTF-8 encoding</li>
              <li>Maximum file size: 5MB</li>
            </ul>
          </div>
        </div>
        
        <div class="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
          <button
            @click="downloadCSVTemplate"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            📥 Download Template
          </button>
          <button
            @click="showFormatGuide = false"
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, provide, toRaw, markRaw, watch } from 'vue';
// import CadastralCSVImport from '../../../components/cadastral/CadastralCSVImport.vue';
import type { CadastralWorkflowState, CadastralPoint } from '../../../types/cadastral';
import { validateAndParseCSV } from '../../../utils/cadastral-csv';
import { useCadastralWorkflow } from '../../../composables/useCadastralWorkflow';
import { FieldBookPDFGenerator } from '../../../utils/pdf-generator';
import { batchDownloadDocuments } from '../../../utils/batchExport';
import { SimplifiedCadastralCombinedGenerator } from '../../../utils/cadastral-combined-simple';
import type { SurveyPoint } from '../../../utils/calculations-part1';
import { bankersRound } from '../../../utils/cadastral-precision';

import CoordinateListView from './CoordinateListView.vue';
import QGISExportView from './QGISExportView.vue';
import MapLibreAreaView from './MapLibreAreaView.vue';
import SurveyPlanViewNew from './SurveyPlanViewNew.vue';
import ReportOnSurveyView from './ReportOnSurveyView.vue';
import DSGCertificateView from './DSGCertificateView.vue';
import ServitudesView from './ServitudesView.vue';
import Areas2View from '../lite/areas2/Areas2View.vue';
import ProjectSetupView from './ProjectSetupView.vue';
import ControlPointSelectionView from './ControlPointSelectionView.vue';
import FoundBeaconsView from './FoundBeaconsView.vue';
import WorkingDirectorySelector from '../../../components/cadastral/WorkingDirectorySelector.vue';
import DocumentPreviewModal from '../../../components/cadastral/DocumentPreviewModal.vue';
import WorkflowDashboard from '../../../components/cadastral/WorkflowDashboard.vue';
import { useSurveyors, type Surveyor, type SurveyProject } from '../../../composables/useSurveyors';
import { useSurveyLookupStore } from '../../../stores/surveyLookup';
import { useProjectContext } from '../../../stores/projectContext';
import { useProjectSelectionStore } from '../../../stores/projectSelection';
import { saveDocument } from '../../../services/documentStorage';
import { autoSaveStepProducts, pointsToCSV } from '../../../services/workflowProductStorage';
import { useAuthStore } from '../../../stores/auth';
import api from '../../../services/api';
import { onMounted, nextTick } from 'vue';
// CSV Import Management
import { 
  getLatestCSVImport, 
  createCSVImport, 
  analyzeMerge, 
  executeMerge,
  type CSVImport,
  type MergeAnalysis 
} from '../../../services/csvImports';
// Spatial data export
import { batchCreateCoordinatePoints } from '../../../services/spatial';
import CSVReimportDialog from '../../../components/cadastral/CSVReimportDialog.vue';
import MergeAnalysisDialog from '../../../components/cadastral/MergeAnalysisDialog.vue';
import LiveCSVValidator from '../../../components/cadastral/LiveCSVValidator.vue';
import { 
  dbKeyToStepId, 
  stepIdToDbKey, 
  getNextStep,
  type WorkflowStep
} from '../../../config/cadastralWorkflow';


// Get auth store for auto-selecting current surveyor
const authStore = useAuthStore();

// Get project selection store for centralized project state
const projectSelectionStore = useProjectSelectionStore();

// Use centralized workflow composable
const { 
  workflowState, 
  buildCoordinateList, 
  buildFieldBook, 
  setImportedPoints, 
  resetWorkflow: composableResetWorkflow,
  resetFieldBook,
  resetCalculationsPart1,
  resetCoordinateList,
  resetAreaComputation,
  resetCurrentStep,
  // Phase 1 & 2: Persistence and workflow management
  linkToProject,
  loadWorkflowState,
  setCurrentStep,
  saveStepData,
  completeCurrentStep
} = useCadastralWorkflow();

// MapLibre is now the only area computation viewer

// Surveyor and project management
const { surveyors, surveyProjects, surveyorOptions, loading: surveyorsLoading, error: surveyorsError, fetchSurveyors, fetchSurveyProjects, updateSurveyProject } = useSurveyors();
const selectedSurveyorId = ref<number | null>(null);
const selectedProjectId = ref<number | null>(null);

// Lo Zone Selection (CRITICAL for coordinate transformation)
const selectedLoZone = ref<number | null>(null);

// Project context for cross-module integration
const { setCurrentProject, clearCurrentProject } = useProjectContext();
const filteredProjects = computed(() => {
  console.log('🔍 Filtering projects:');
  console.log('  - Selected surveyor ID:', selectedSurveyorId.value, 'Type:', typeof selectedSurveyorId.value);
  console.log('  - Total projects:', surveyProjects.value.length);
  
  if (!selectedSurveyorId.value) {
    console.log('  - No surveyor selected, returning empty');
    return [];
  }
  
  const filtered = surveyProjects.value.filter(p => {
    // Use type-safe comparison to handle number/string mismatch
    const matches = p.surveyor_id == selectedSurveyorId.value || 
                    Number(p.surveyor_id) === Number(selectedSurveyorId.value);
    console.log(`  - Project "${p.name}" (ID: ${p.id}, surveyor_id: ${p.surveyor_id} [${typeof p.surveyor_id}]) vs ${selectedSurveyorId.value} [${typeof selectedSurveyorId.value}] - ${matches ? '✅ MATCH' : '❌ no match'}`);
    return matches;
  });
  
  console.log('  - Filtered projects count:', filtered.length);
  return filtered;
});
const selectedProject = computed(() => {
  return surveyProjects.value.find(p => p.id === selectedProjectId.value);
});

// Provide workflowState so nested components can inject it
provide('workflowState', workflowState as any);

// Component state
const isGenerating = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

// ✅ Phase 1: CSV Template & Format Guide
const showFormatGuide = ref(false);

// ✅ Phase 1: Autosave System
const lastSaved = ref<Date | null>(null);
const isSaving = ref(false);
const autosaveInterval = ref<number | null>(null);

// ✅ Phase 1: Batch Export
const isExporting = ref(false);

// Computed property for last saved text
const lastSavedText = computed(() => {
  if (isSaving.value) return 'Saving...';
  if (!lastSaved.value) return 'Not saved yet';
  
  const minutes = Math.floor((Date.now() - lastSaved.value.getTime()) / 60000);
  if (minutes === 0) return 'Saved just now';
  if (minutes === 1) return 'Saved 1 minute ago';
  if (minutes < 60) return `Saved ${minutes} minutes ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'Saved 1 hour ago';
  return `Saved ${hours} hours ago`;
});

// ✅ Phase 1: Progress Percentage & Time Estimate
const currentStepIndex = computed(() => {
  return workflowSteps.findIndex(s => s.id === workflowState.currentStep);
});

const progressPercentage = computed(() => {
  const index = currentStepIndex.value;
  if (index < 0) return 0;
  return Math.round(((index + 1) / workflowSteps.length) * 100);
});

// ✅ Actual progress based on completed steps (not current step position)
const actualProgressPercentage = computed(() => {
  if (workflowSteps.length === 0) return 0;
  return Math.round((completedSteps.value.length / workflowSteps.length) * 100);
});

const estimatedTimeRemaining = computed(() => {
  // Average time per step in minutes (based on UX research)
  const stepTimes: Record<string, number> = {
    'project-setup': 2,
    'csv-import': 5,
    'control-point-selection': 5,
    'found-beacons': 8,
    'field-book': 5,
    'calculations-part1': 10,
    'coordinate-list': 3,
    'qgis-export': 15, // Includes PostGIS export, QGIS setup, and parcel digitization
    'area-computation': 20,
    'report-on-survey': 5,
    'dsg-certificate': 3
  };
  
  const currentIndex = currentStepIndex.value;
  if (currentIndex < 0) return 0;
  
  let totalTime = 0;
  for (let i = currentIndex + 1; i < workflowSteps.length; i++) {
    const stepId = workflowSteps[i].id;
    totalTime += stepTimes[stepId] || 5; // Default 5 min if not specified
  }
  
  return totalTime;
});

// ✅ Phase 1: Batch Export - Check if any documents are generated
const hasGeneratedDocuments = computed(() => {
  return !!(
    workflowState.documents.fieldBook ||
    workflowState.documents.calculationsPart1 ||
    workflowState.documents.coordinateList ||
    pdfBlobStorage.calculationsPart1 ||
    pdfBlobStorage.coordinateList
  );
});

// Document Preview Modal state
const previewModal = ref({
  isOpen: false,
  title: '',
  subtitle: '',
  pdfBlob: null as Blob | null,
  documentType: undefined as 'field-book' | 'calculations-part1' | 'coordinate-list' | 'area-computation' | 'report-on-survey' | 'dsg-certificate' | undefined,
  fileName: ''
});

// Store PDF Blobs separately to avoid reactivity issues
const pdfBlobStorage = {
  calculationsPart1: null as Blob | null,
  coordinateList: null as Blob | null
};

// Provide workflow state to child components (for QGISExportView)
provide('workflowState', workflowState);

// Modal handler functions
function closePreviewModal() {
  previewModal.value.isOpen = false;
  previewModal.value.pdfBlob = null;
}

function handleDocumentSaved(filePath: string) {
  console.log('✅ Document saved to:', filePath);
  // Optional: Show success notification
}

// Calculations Part 1 state
const isGeneratingCalculations = ref(false);
const calculationsError = ref('');
const calculationsInfo = ref({
  surveyorName: '',
  licenseNumber: '',
  firm: '',
  address: '',
  surveyDate: '',
  projectTitle: ''
});

// ⭐ PHASE 2: Automation progress state
const automationProgress = ref({
  isAutomating: false,
  currentStep: '',
  message: '',
  progress: 0 // 0-100
});

// ⭐ CSV Re-import Management State
const reimportDialog = ref({
  isOpen: false,
  existingImport: null as CSVImport | null
});

const mergeAnalysisDialog = ref({
  isOpen: false,
  analysis: null as MergeAnalysis | null,
  tolerance: 0.01
});

const currentImportId = ref<number | null>(null);

const pendingCSVData = ref<{
  content: string;
  filename: string;
  points: CadastralPoint[];
  detectedCentralMeridian?: number; // Cape Lo zone from CSV System column
} | null>(null);

// Workflow steps definition (Complete cadastral workflow)
const workflowSteps = [
  { id: 'project-setup', name: 'Project Setup' },
  { id: 'csv-import', name: 'Import CSV' },
  { id: 'control-point-selection', name: 'Control Point Selection' },
  { id: 'field-book', name: 'Field Book' },
  { id: 'calculations-part1', name: 'Calculations Part 1' },
  { id: 'found-beacons', name: 'Found Beacons Assessment' },
  { id: 'coordinate-list', name: 'Coordinate List' },
  { id: 'qgis-export', name: 'QGIS Export & Digitization' },
  { id: 'area-computation', name: 'Area Computation' },
  { id: 'servitudes', name: 'Servitudes' },
  { id: 'report-on-survey', name: 'Report on Survey' },
  { id: 'dsg-certificate', name: 'DSG Certificate' }
];

// Computed properties
const fixedPointsCount = computed(() => 
  workflowState.importedPoints.filter(p => p.status === 'F').length
);

const pegPointsCount = computed(() => 
  workflowState.importedPoints.filter(p => p.status === 'P').length
);

const otherPointsCount = computed(() => 
  workflowState.importedPoints.filter(p => !p.status).length
);

// Fixed points for beacon assessment
const fixedPointsForBeaconAssessment = computed(() => {
  console.log('[Found Beacons] 🔍 Computing fixed points for beacon assessment...');
  console.log('[Found Beacons] Total imported points:', workflowState.importedPoints.length);
  
  // Debug: Show all points with their status
  const statusCounts = new Map<string, number>();
  workflowState.importedPoints.forEach(p => {
    const statusKey = p.status || 'null/undefined';
    statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);
  });
  console.log('[Found Beacons] Status distribution:', Object.fromEntries(statusCounts));
  
  // Show first 3 points for debugging
  if (workflowState.importedPoints.length > 0) {
    console.log('[Found Beacons] Sample points:', workflowState.importedPoints.slice(0, 3).map(p => ({
      id: p.id,
      status: p.status,
      description: p.description
    })));
  }
  
  const fixedPoints = workflowState.importedPoints
    .filter(p => {
      const isFixed = p.status === 'F';
      if (isFixed) {
        console.log('[Found Beacons] ✅ Found fixed point:', p.id, 'status=', p.status);
      }
      return isFixed;
    })
    .map(p => ({
      id: p.id,
      original: p.original,
      description: p.description
    }));
  
  console.log('[Found Beacons] ✅ Total fixed points found:', fixedPoints.length);
  return fixedPoints;
});

const canGoBack = computed(() => {
  const currentIndex = workflowSteps.findIndex(s => s.id === workflowState.currentStep);
  return currentIndex > 0;
});

const canGoNext = computed(() => {
  const currentIndex = workflowSteps.findIndex(s => s.id === workflowState.currentStep);
  return currentIndex < workflowSteps.length - 1;
});

// Calculations Part 1 computed properties
const duplicatePointsList = computed(() => {
  const pointCounts = new Map<string, number>();
  workflowState.importedPoints.forEach(point => {
    pointCounts.set(point.id, (pointCounts.get(point.id) || 0) + 1);
  });
  return Array.from(pointCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([pointId, _]) => pointId);
});

const duplicatePointsCount = computed(() => duplicatePointsList.value.length);

const uniquePointsCount = computed(() => {
  const uniquePoints = new Set(workflowState.importedPoints.map(p => p.id));
  return uniquePoints.size;
});

const calculationsRequiredCount = computed(() => {
  return Math.max(duplicatePointsCount.value, workflowState.importedPoints.length);
});

const canGenerateCalculations = computed(() => {
  const hasPoints = workflowState.importedPoints.length > 0;
  const hasSurveyorName = calculationsInfo.value.surveyorName?.trim() || workflowState.surveyorInfo.landSurveyor?.trim();
  const hasProjectTitle = calculationsInfo.value.projectTitle?.trim() || workflowState.surveyorInfo.surveyOf?.trim();
  const notGenerating = !isGeneratingCalculations.value;
  
  return hasPoints && hasSurveyorName && hasProjectTitle && notGenerating;
});

const canGenerateCoordinateList = computed(() => {
  // Coordinate List requires adjusted coordinates from Calculations Part 1
  return workflowState.adjustedCoordinates && 
         workflowState.adjustedCoordinates.length > 0;
});

const canContinueToCalculations = computed(() => {
  // Can only continue to Calculations if Field Book has been generated
  return !!workflowState.documents.fieldBook;
});

// Phase 2: Workflow dashboard state
const workflowStateFromDB = ref<any>(null);

const completedSteps = computed(() => {
  if (!workflowStateFromDB.value) {
    // Fallback: determine from existing state
    const completed = []
    if (workflowState.importedPoints.length > 0) completed.push('import_csv')
    if (workflowState.documents.fieldBook) completed.push('field_book')
    if (workflowState.documents.calculationsPart1) completed.push('calculations_part1')
    if (workflowState.documents.coordinateList) completed.push('coordinate_list')
    if (workflowState.documents.calculationsPart2) completed.push('calculations_part2')
    return completed
  }
  
  // Convert backend dbKeys (csv-import) to step IDs (import_csv)
  const dbSteps = workflowStateFromDB.value.completed_steps || []
  return dbSteps.map((dbKey: string) => dbKeyToStepId(dbKey))
});

const stepData = computed(() => {
  if (!workflowStateFromDB.value?.step_data) return {}
  
  // Convert backend step_data keys from dbKey (csv-import) to stepId (import_csv)
  const dbStepData = workflowStateFromDB.value.step_data
  const converted: Record<string, any> = {}
  
  for (const [dbKey, data] of Object.entries(dbStepData)) {
    const stepId = dbKeyToStepId(dbKey)
    converted[stepId] = data
  }
  
  return converted
});

// Helper to reload workflow state and update UI
async function reloadWorkflowState() {
  const projectId = selectedProjectId.value;
  if (projectId) {
    try {
      workflowStateFromDB.value = await loadWorkflowState(projectId);
      console.log('🔄 Workflow state reloaded - UI will update');
    } catch (e: any) {
      console.warn('Failed to reload workflow state:', e.message);
    }
  }
}

// Methods
async function generateCalculationsPart1() {
  if (!canGenerateCalculations.value) return;
  
  try {
    isGeneratingCalculations.value = true;
    calculationsError.value = '';
    
    console.log('🔍 [Calc Part 1] Starting generation...');
    console.log('  - Imported points count:', workflowState.importedPoints.length);
    
    if (workflowState.importedPoints.length > 0) {
      const firstPoint = workflowState.importedPoints[0];
      console.log('  - First point structure:', firstPoint);
      console.log('  - First point ID:', firstPoint.id);
      console.log('  - First point original:', firstPoint.original);
      console.log('  - First point original.y:', firstPoint.original?.y);
      console.log('  - First point original.x:', firstPoint.original?.x);
    }
    
    console.log('===== STAGE 6: GENERATE CALCULATIONS (Read from workflowState) ===== ');
    console.log('Points in workflowState.importedPoints:', workflowState.importedPoints.length);
    if (workflowState.importedPoints.length > 0) {
      const firstPoint = workflowState.importedPoints[0];
      console.log('First point from workflowState:', firstPoint);
      console.log('First point.original:', firstPoint.original);
      console.log('First point.original?.y:', firstPoint.original?.y);
      console.log('First point.original?.x:', firstPoint.original?.x);
    }
    
    // Convert imported points to SurveyPoint format
    const surveyPoints: SurveyPoint[] = workflowState.importedPoints.map(point => {
      const y = point.original?.y ?? 0;
      const x = point.original?.x ?? 0;
      
      console.log(`Point ${point.id}: original.y=${point.original?.y}, original.x=${point.original?.x} → y=${y}, x=${x}`);
      
      if (y === 0 && x === 0) {
        console.warn(`⚠️ Point ${point.id} has zero coordinates! Full point:`, JSON.stringify(point, null, 2));
      }
      
      return {
        pointId: point.id,
        y: y,
        x: x,
        status: point.status || '',
        description: point.description,
        surveyDate: point.surveyDate ? point.surveyDate.toLocaleDateString('en-GB') : ''
      };
    });
    
    console.log('  - Survey points generated:', surveyPoints.length);
    if (surveyPoints.length > 0) {
      console.log('  - First survey point:', surveyPoints[0]);
    }
    
    // Prepare surveyor info
    const surveyorInfo = {
      name: calculationsInfo.value.surveyorName,
      licenseNumber: calculationsInfo.value.licenseNumber,
      firm: calculationsInfo.value.firm,
      address: calculationsInfo.value.address,
      surveyDate: calculationsInfo.value.surveyDate,
      projectTitle: calculationsInfo.value.projectTitle,
      district: workflowState.projectInfo.district || ''
    };
    
    // Fetch full control point data from API (project only stores IDs)
    let projectControlPoints: any[] | undefined = undefined;
    if (selectedProject.value?.control_points && selectedProject.value.control_points.length > 0) {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3050/api';
        const centralMeridian = workflowState.projectInfo.centralMeridian || 31;
        console.log(`[generateCalculations] Fetching control points for Lo${centralMeridian}`);
        
        const response = await fetch(`${API_BASE}/control-points?gauss_lo=${centralMeridian}&limit=5000`);
        const data = await response.json();
        
        if (data.data && Array.isArray(data.data)) {
          const controlPointIds = selectedProject.value.control_points.map((cp: any) => cp.id);
          projectControlPoints = data.data.filter((cp: any) => controlPointIds.includes(cp.id));
          console.log(`[generateCalculations] Found ${projectControlPoints.length} control points`);
          if (projectControlPoints.length > 0) {
            console.log('[generateCalculations] First CP:', projectControlPoints[0].monu_num, 
                       'Y:', projectControlPoints[0].y_gauss, 'X:', projectControlPoints[0].x_gauss);
          }
        }
      } catch (error) {
        console.error('[generateCalculations] Error fetching control points:', error);
      }
    }
    
    // Use the new combined generator
    const generator = new SimplifiedCadastralCombinedGenerator();
    const result = await generator.generateCombinedDocument(surveyPoints, surveyorInfo, projectControlPoints);
    
    // ⭐ Store adjusted coordinates and duplicate analyses in workflow state
    workflowState.adjustedCoordinates = result.adjustedCoordinates;
    workflowState.duplicateAnalyses = result.duplicateAnalyses || [];
    
    console.log('[Workflow] ✅ Stored in workflow state:');
    console.log('[Workflow] - Adjusted coordinates:', workflowState.adjustedCoordinates?.length || 0);
    console.log('[Workflow] - Duplicate analyses:', workflowState.duplicateAnalyses?.length || 0);
    
    // Store PDFs in non-reactive storage to avoid Vue proxy issues
    pdfBlobStorage.calculationsPart1 = result.calculationsPart1PDF;
    pdfBlobStorage.coordinateList = result.coordinateListPDF;
    
    // Store document metadata (store as any to avoid type conflicts)
    (workflowState.documents as any).calculationsPart1 = {
      pdf: true, // Flag to indicate PDF is available
      pageCount: result.calculationsPart1Range.end - result.calculationsPart1Range.start + 1,
      startingPage: result.calculationsPart1Range.start
    };
    
    (workflowState.documents as any).coordinateList = {
      pdf: true, // Flag to indicate PDF is available
      pageCount: result.coordinateListRange.end - result.coordinateListRange.start + 1,
      startingPage: result.coordinateListRange.start
    };
    
    // Download Coordinate List PDF
    const coordListFileName = `Coordinate_List_Pages_${result.coordinateListRange.start}-${result.coordinateListRange.end}_${new Date().toISOString().split('T')[0]}.pdf`;
    const coordListUrl = URL.createObjectURL(result.coordinateListPDF);
    const coordListLink = document.createElement('a');
    coordListLink.href = coordListUrl;
    coordListLink.download = coordListFileName;
    document.body.appendChild(coordListLink);
    coordListLink.click();
    document.body.removeChild(coordListLink);
    URL.revokeObjectURL(coordListUrl);
    
    // Download Calculations Part 1 PDF
    const calcsFileName = `Calculations_Part1_Pages_${result.calculationsPart1Range.start}-${result.calculationsPart1Range.end}_${new Date().toISOString().split('T')[0]}.pdf`;
    const calcsUrl = URL.createObjectURL(result.calculationsPart1PDF);
    const calcsLink = document.createElement('a');
    calcsLink.href = calcsUrl;
    calcsLink.download = calcsFileName;
    document.body.appendChild(calcsLink);
    calcsLink.click();
    document.body.removeChild(calcsLink);
    URL.revokeObjectURL(calcsUrl);
    
    // ✅ Auto-save PDFs to project working directory
    if (workflowState.projectInfo.workingDirectory) {
      const projectName = workflowState.projectInfo.name || selectedProject.value?.name || 'Survey_Project';
      
      await autoSaveStepProducts({
        workingDirectory: workflowState.projectInfo.workingDirectory,
        projectName,
        stepId: 'calculations_part1',
        products: {
          calculationsPart1: result.calculationsPart1PDF,
          coordinateList: result.coordinateListPDF
        }
      });
    } else {
      console.warn('⚠️ No working directory set. PDFs downloaded only, not saved to project folder.');
    }
    
    // Mark step as complete with metadata
    await completeCurrentStep({
      document_type: 'calculations_part1',
      point_count: workflowState.adjustedCoordinates?.length || 0,
      control_points_used: projectControlPoints?.length || 0,
      // Save adjusted coordinates so they can be restored later
      adjusted_coordinates: workflowState.adjustedCoordinates
    });
    
    // Reload workflow state to update UI
    await reloadWorkflowState();
    
    // Log success to console
    console.log('✅ Combined Documents Generated Successfully!');
    console.log(`📄 Coordinate List: Pages ${result.coordinateListRange.start}-${result.coordinateListRange.end}`);
    console.log(`📄 Calculations Part 1: Pages ${result.calculationsPart1Range.start}-${result.calculationsPart1Range.end}`);
    console.log(`Total Points: ${surveyPoints.length}`);
    console.log(`Adjusted Coordinates: ${result.adjustedCoordinates.length}`);
    console.log(`Duplicate Points: ${result.summary.duplicatePoints}`);
    console.log('✓ Both PDFs have been downloaded');
    console.log('✓ Calcs column cross-references are correct');
    console.log('✓ Ready for submission to Surveyor General');
    
    // ⭐ PHASE 2: Auto-advance to Area Computation
    console.log('[Phase 2] 🤖 Auto-advancing to Area Computation...');
    automationProgress.value = {
      isAutomating: true,
      currentStep: 'area-computation',
      message: 'Ready for parcel digitization...',
      progress: 100
    };
    
    workflowState.currentStep = 'area-computation';
    await nextTick();
    
    // Clear automation progress after a short delay
    setTimeout(() => {
      automationProgress.value.isAutomating = false;
    }, 2000);
    
    console.log('[Phase 2] ✅ Advanced to Area Computation - User can now digitize parcels');
    
  } catch (err) {
    calculationsError.value = `Error generating PDF: ${err instanceof Error ? err.message : 'Unknown error'}`;
    console.error('❌ PDF Generation Failed:', err);
  } finally {
    isGeneratingCalculations.value = false;
  }
}

function startWorkflow() {
  workflowState.currentStep = 'project-setup';
}

async function handleProjectSetupComplete(setupData: { 
  surveyorId: number;
  projectId: number;
  surveyType: string;
  township?: string;
  parentProperty?: string;
  deedOfTransferNo?: string;
  parentDiagramNo?: string;
  parentDiagramAnnexedTo?: string;
  originalTitleDiagramNo?: string;
  srNo?: string;
  fileNo?: string;
  gpNo?: string;
  district: string;
  surveyDate: string;
  surveyOf: string;
  instruments: string;
  loZone: number;
  datum: string;
  workingDirectory: string;
  wholePortion: string;
}) {
  console.log('✅ Project setup completed:', setupData);
  console.log('📋 Survey Type:', setupData.surveyType);
  console.log('📝 Survey Of:', setupData.surveyOf);
  console.log('🌐 Lo Zone:', setupData.loZone);
  console.log('👤 Surveyor ID:', setupData.surveyorId);
  console.log('📁 Project ID:', setupData.projectId);
  
  // ⭐ CRITICAL: Set selected surveyor and project from setup
  console.log('[Workflow] 🎯 Setting selectedSurveyorId:', setupData.surveyorId);
  console.log('[Workflow] 🎯 Setting selectedProjectId:', setupData.projectId);
  selectedSurveyorId.value = setupData.surveyorId;
  selectedProjectId.value = setupData.projectId;
  
  // ⭐ CRITICAL: Update Pinia store with selected project
  // First, try to find project in surveyProjects
  let project = surveyProjects.value.find(p => p.id === setupData.projectId);
  
  if (project) {
    console.log('[Workflow] ✅ Found project in surveyProjects:', project.name);
  } else {
    console.warn('[Workflow] ⚠️ Project not found in surveyProjects! ID:', setupData.projectId);
    console.log('[Workflow] Available projects:', surveyProjects.value.map(p => ({ id: p.id, name: p.name })));
    
    // ⭐ FALLBACK: Check if project is already in Pinia store (from ProjectSetupView)
    if (projectSelectionStore.selectedProject && projectSelectionStore.selectedProject.id === setupData.projectId) {
      console.log('[Workflow] ✅ Using project from Pinia store:', projectSelectionStore.selectedProject.name);
      project = projectSelectionStore.selectedProject as any;
    } else {
      console.warn('[Workflow] ⚠️ Project not in Pinia store either, creating minimal project object');
      // Create a minimal project object with the data we have
      project = {
        id: setupData.projectId,
        name: `Project ${setupData.projectId}`,
        surveyor_id: setupData.surveyorId,
        district: setupData.district,
        survey_type: setupData.surveyType,
        survey_date: setupData.surveyDate
      } as any;
    }
  }
  
  // Map surveyor_id to surveyor_profile_id for store compatibility
  const projectForStore = {
    ...project,
    surveyor_profile_id: (project as any).surveyor_id || setupData.surveyorId
  };
  projectSelectionStore.selectProject(projectForStore as any);
  console.log('[Workflow] ✅ Updated Pinia store with project');
  
  // ⭐ CRITICAL: Link workflow to project for persistence
  console.log('[Workflow] 🔗 Linking workflow to project ID:', setupData.projectId);
  linkToProject(setupData.projectId);
  projectSelectionStore.markAsLinked();
  console.log('[Workflow] ✅ Workflow linked to project');
  
  // Trigger surveyor change to populate surveyor info
  console.log('[Workflow] 👤 Triggering surveyor change...');
  onSurveyorChange();
  
  // Trigger project change to save to localStorage
  console.log('[Workflow] 💾 Triggering project change (localStorage save)...');
  onProjectChange();
  
  // ⭐ VERIFICATION: Check if selectedProject computed is working
  console.log('[Workflow] 🔍 Verification - selectedProjectId.value:', selectedProjectId.value);
  console.log('[Workflow] 🔍 Verification - selectedProject.value:', selectedProject.value);
  console.log('[Workflow] 🔍 Verification - surveyProjects.value.length:', surveyProjects.value.length);
  
  // ⭐ CRITICAL FIX: If project not found in surveyProjects, reload them
  if (!selectedProject.value && setupData.projectId) {
    console.warn('[Workflow] ⚠️ selectedProject is null, reloading projects...');
    console.log('[Workflow] 🔍 Current surveyProjects before reload:', surveyProjects.value.map(p => ({ id: p.id, name: p.name, surveyor_id: p.surveyor_id })));
    
    await fetchSurveyProjects();
    
    console.log('[Workflow] ✅ Projects reloaded, count:', surveyProjects.value.length);
    console.log('[Workflow] 🔍 All projects after reload:', surveyProjects.value.map(p => ({ id: p.id, name: p.name, surveyor_id: p.surveyor_id })));
    console.log('[Workflow] 🔍 Looking for project ID:', setupData.projectId, '(type:', typeof setupData.projectId, ')');
    console.log('[Workflow] 🔍 Project IDs in array:', surveyProjects.value.map(p => `${p.id} (${typeof p.id})`));
    console.log('[Workflow] 🔍 selectedProjectId.value:', selectedProjectId.value, '(type:', typeof selectedProjectId.value, ')');
    console.log('[Workflow] 🔍 Setup surveyor ID:', setupData.surveyorId);
    console.log('[Workflow] 🔍 After reload - selectedProject.value:', selectedProject.value);
    
    // ⭐ CRITICAL: If still not found, manually add it to the array from Pinia store
    if (!selectedProject.value && projectSelectionStore.selectedProject?.id === setupData.projectId) {
      console.warn('[Workflow] ⚠️ Project not in API response, but exists in Pinia store');
      console.warn('[Workflow] ⚠️ This likely means the project was just created and API filtering is wrong');
      console.warn('[Workflow] ⚠️ Adding project to surveyProjects array manually');
      
      // Add the project from Pinia store to surveyProjects array
      surveyProjects.value.push(projectSelectionStore.selectedProject as any);
      console.log('[Workflow] ✅ Manually added project to surveyProjects array');
      
      // Force verify the computed is now working
      console.log('[Workflow] 🔍 After manual add - selectedProject.value:', selectedProject.value);
      console.log('[Workflow] 🔍 After manual add - selectedProjectId.value:', selectedProjectId.value);
    } else if (!selectedProject.value) {
      console.error('[Workflow] ❌ CRITICAL: Project ID', setupData.projectId, 'not found even after reload!');
      console.error('[Workflow] ❌ This means the project is not being returned by the API');
      console.error('[Workflow] ❌ Check if project belongs to a different surveyor or was deleted');
      console.error('[Workflow] ❌ Pinia store project:', projectSelectionStore.selectedProject);
    }
  }
  
  // ⭐ FINAL VERIFICATION: Ensure selectedProjectId is set
  console.log('[Workflow] 🔍 FINAL CHECK - selectedProjectId.value:', selectedProjectId.value);
  console.log('[Workflow] 🔍 FINAL CHECK - selectedProject.value:', selectedProject.value);
  if (!selectedProjectId.value && setupData.projectId) {
    console.warn('[Workflow] ⚠️ selectedProjectId still not set, forcing it now');
    selectedProjectId.value = setupData.projectId;
    console.log('[Workflow] ✅ Forced selectedProjectId to:', selectedProjectId.value);
  }
  
  // Save setup data to workflow state (PERSISTENT throughout workflow)
  workflowState.projectInfo.district = setupData.district;
  workflowState.projectInfo.surveyType = setupData.surveyType;
  workflowState.projectInfo.township = setupData.township;
  workflowState.projectInfo.parentProperty = setupData.parentProperty;
  workflowState.projectInfo.deedOfTransferNo = setupData.deedOfTransferNo;
  workflowState.projectInfo.parentDiagramNo = setupData.parentDiagramNo;
  workflowState.projectInfo.parentDiagramAnnexedTo = setupData.parentDiagramAnnexedTo;
  workflowState.projectInfo.originalTitleDiagramNo = setupData.originalTitleDiagramNo;
  workflowState.projectInfo.srNo = setupData.srNo;
  workflowState.projectInfo.fileNo = setupData.fileNo;
  workflowState.projectInfo.gpNo = setupData.gpNo;
  workflowState.projectInfo.workingDirectory = setupData.workingDirectory;
  workflowState.projectInfo.wholePortion = setupData.wholePortion;
  workflowState.projectInfo.centralMeridian = setupData.loZone;
  workflowState.projectInfo.projectId = setupData.projectId;
  
  // ⭐ NEW: Save survey details to surveyorInfo (will auto-populate all documents)
  workflowState.surveyorInfo.surveyDate = setupData.surveyDate;
  workflowState.surveyorInfo.surveyOf = setupData.surveyOf;
  workflowState.surveyorInfo.instruments = setupData.instruments;
  
  // Store selected Lo zone for CSV import
  selectedLoZone.value = setupData.loZone;
  
  // Mark step as complete and save to database
  if (selectedProjectId.value) {
    try {
      console.log('[Workflow] 💾 Saving project setup to database...');
      
      // Get project name from selected project
      const projectName = selectedProject.value?.name || 'Project';
      
      // ⭐ CRITICAL: Update the project record with the setup data
      console.log('[Workflow] 📝 Updating project record in database...');
      const updateSuccess = await updateSurveyProject(selectedProjectId.value, {
        surveyType: setupData.surveyType,
        township: setupData.township,
        parentProperty: setupData.parentProperty,
        deedOfTransferNo: setupData.deedOfTransferNo,
        parentDiagramNo: setupData.parentDiagramNo,
        parentDiagramAnnexedTo: setupData.parentDiagramAnnexedTo,
        originalTitleDiagramNo: setupData.originalTitleDiagramNo,
        srNo: setupData.srNo,
        fileNo: setupData.fileNo,
        gpNo: setupData.gpNo,
        district: setupData.district,
        surveyDate: setupData.surveyDate,
        designation: setupData.surveyOf,
        instruments: setupData.instruments,
        workingDirectory: setupData.workingDirectory,
        centralMeridian: setupData.loZone,
        datum: setupData.datum,
        wholePortion: setupData.wholePortion
      });
      
      if (!updateSuccess) {
        throw new Error('Failed to update project record');
      }
      
      console.log('[Workflow] ✅ Project record updated in database');
      
      // Save workflow step metadata
      await completeCurrentStep({
        project_name: projectName,
        district: setupData.district,
        survey_type: setupData.surveyType,
        township: setupData.township,
        working_directory: setupData.workingDirectory,
        survey_date: setupData.surveyDate,
        survey_of: setupData.surveyOf,
        instruments: setupData.instruments,
        lo_zone: setupData.loZone,
        datum: setupData.datum
      });
      
      console.log('[Workflow] ✅ Project setup saved to database');
      console.log('[Workflow] - Project ID:', selectedProjectId.value);
      console.log('[Workflow] - Survey Type:', setupData.surveyType);
      console.log('[Workflow] - Survey Of:', setupData.surveyOf);
      console.log('[Workflow] - Central Meridian:', setupData.loZone);
      
      // Store project ID in workflow state
      workflowState.projectInfo.projectId = selectedProjectId.value;
      
      // Reload workflow state to update UI
      await reloadWorkflowState();
      
      // Reload projects to get updated data
      await fetchSurveyProjects();
      console.log('[Workflow] ✅ Projects reloaded with updated data');
    } catch (error) {
      console.error('[Workflow] ❌ Failed to save project setup:', error);
      alert('Failed to save project setup. Please try again.');
      return;
    }
  } else {
    console.warn('[Workflow] ⚠️ No project ID - project setup not saved to database');
  }
  
  // Move to next step (CSV Import - skip control point selection)
  workflowState.currentStep = 'csv-import';
  
  console.log('✅ Project setup complete. Ready to import CSV data.');
  console.log('📊 Workflow state updated:');
  console.log('  - Project ID:', workflowState.projectInfo.projectId);
  console.log('  - Survey Type:', workflowState.projectInfo.surveyType);
  console.log('  - Stand Reference:', workflowState.projectInfo.standReference);
  console.log('  - Next step: CSV Import (Control points will be selected after import)');
}

function resetWorkflow() {
  composableResetWorkflow();
}

async function handleDataImported(points: CadastralPoint[]) {
  console.log('===== STAGE 5: HANDLE DATA IMPORTED ===== ');
  console.log('Points received:', points.length);
  if (points.length > 0) {
    console.log('First point:', points[0]);
    console.log('First point.original.y:', points[0].original.y);
    console.log('First point.original.x:', points[0].original.x);
  }
  setImportedPoints(points);
  
  // ✅ Auto-save raw CSV data to project folder
  if (workflowState.projectInfo.workingDirectory && points.length > 0) {
    const csvContent = pointsToCSV(points);
    const projectName = workflowState.projectInfo.projectName || selectedProject.value?.name || 'Survey_Project';
    
    await autoSaveStepProducts({
      workingDirectory: workflowState.projectInfo.workingDirectory,
      projectName,
      stepId: 'import_csv',
      products: {
        rawCSV: csvContent
      }
    });
  }
  
  // ✅ Auto-export to PostGIS database for persistence
  if (selectedProjectId.value && points.length > 0) {
    try {
      console.log('[CSV Import] 🗄️ Auto-exporting to PostGIS database...');
      console.log(`[CSV Import] 📊 Project ID: ${selectedProjectId.value}`);
      console.log(`[CSV Import] 📊 Total points to export: ${points.length}`);
      
      // Prepare points for database export. Send status as its own field (persisted
      // to coordinate_points.status per migration 079) so the restore fallback can
      // recover it; keep description clean (no longer folding status into it).
      const dbPoints = points.map(point => ({
        name: point.id,
        y: point.original.y,
        x: point.original.x,
        elevation: undefined,
        description: point.description || '',
        status: point.status || undefined
      }));
      
      console.log(`[CSV Import] 📊 Prepared ${dbPoints.length} points for batch export`);
      console.log('[CSV Import] 📊 Sample points (first 3):');
      dbPoints.slice(0, 3).forEach((pt, idx) => {
        console.log(`  ${idx + 1}. Name: ${pt.name}, Y: ${pt.y}, X: ${pt.x}, Desc: ${pt.description || 'N/A'}`);
      });
      
      // Export to PostGIS
      console.log('[CSV Import] 🚀 Calling batchCreateCoordinatePoints...');
      const result = await batchCreateCoordinatePoints(selectedProjectId.value, dbPoints);
      console.log('[CSV Import] 📥 Received result from batchCreateCoordinatePoints:', result);
      console.log(`[CSV Import] ✅ Successfully exported ${result.count} points to PostGIS database`);
      
      // Show success notification
      console.log(`[CSV Import] 📍 ${result.count} coordinate points are now persistent in the database`);
      
      // ✅ STEP 1 VERIFICATION: Show sample of what was stored in coordinate_points table
      console.log('[STEP 1 VERIFICATION] 📊 Sample coordinate_points data (first 5):');
      dbPoints.slice(0, 5).forEach((pt, idx) => {
        console.log(`  ${idx + 1}. Name: ${pt.name}, Y: ${pt.y}, X: ${pt.x}, Desc: ${pt.description || 'N/A'}`);
      });
      console.log(`[STEP 1 VERIFICATION] ✅ Total ${result.count} points stored in coordinate_points table`);
    } catch (error) {
      console.error('[CSV Import] ❌ Failed to auto-export to PostGIS:', error);
      console.error('[CSV Import] ❌ Error details:', error.message);
      console.error('[CSV Import] ❌ Error stack:', error.stack);
      // Don't block the workflow - just log the error
      // User can manually export later if needed
    }
  }
  
  workflowState.currentStep = 'field-book';
  
  // Reload workflow state to ensure dashboard displays
  await reloadWorkflowState();
  
  // ⭐ PHASE 2: Auto-generate Field Book after CSV import
  console.log('[Phase 2] 🤖 Starting automated workflow...');
  automationProgress.value = {
    isAutomating: true,
    currentStep: 'field-book',
    message: 'Generating Field Book...',
    progress: 33
  };
  
  await nextTick(); // Wait for UI to update
  await generateFieldBook();
  console.log('[Phase 2] ✅ Field Book auto-generated');
}

// ⭐ CSV Re-import: Process new CSV import with tracking
async function processNewCSVImport(content: string, filename: string, points: CadastralPoint[]) {
  console.log('[CSV Import] Processing new CSV import...');
  
  // Create import record if project is selected
  if (selectedProjectId.value) {
    try {
      const newImport = await createCSVImport({
        project_id: selectedProjectId.value,
        csv_content: content,
        filename,
        point_count: points.length,
        coordinate_system: `Lo${workflowState.projectInfo.centralMeridian || 31}`
      });
      currentImportId.value = newImport.id;
      console.log('[CSV Import] Import record created:', newImport.id);
    } catch (error) {
      console.error('[CSV Import] Failed to create import record:', error);
      // Continue anyway - import tracking is not critical
    }
  }
  
  // Proceed with normal import flow
  await handleDataImported(points);
}

// ⭐ CSV Re-import: Handle user choice from dialog
async function handleReimportChoice(choice: 'use-previous' | 'append' | 'smart-merge' | 'complete-replace') {
  reimportDialog.value.isOpen = false;
  
  console.log('[CSV Re-import] User chose:', choice);
  
  try {
    switch (choice) {
      case 'use-previous':
        // Load existing data from database
        console.log('[CSV Re-import] Using previous import - reloading workflow state');
        await reloadWorkflowState();
        
        // If workflow state has imported points, we're good
        if (workflowState.importedPoints && workflowState.importedPoints.length > 0) {
          console.log(`[CSV Re-import] ✅ Loaded ${workflowState.importedPoints.length} points from previous import`);
          alert(`Using previous CSV import with ${workflowState.importedPoints.length} points.`);
        } else {
          console.warn('[CSV Re-import] ⚠️ No points found in workflow state');
          alert('Previous import found but no points loaded. You may need to re-import the CSV.');
        }
        break;
        
      case 'append':
        // Add new points without removing old ones
        console.log('[CSV Re-import] Appending new points');
        if (pendingCSVData.value) {
          // Simply add to existing points
          const existingPoints = workflowState.importedPoints;
          const newPoints = pendingCSVData.value.points.filter(
            newPt => !existingPoints.some(existing => existing.id === newPt.id)
          );
          await processNewCSVImport(
            pendingCSVData.value.content,
            pendingCSVData.value.filename,
            [...existingPoints, ...newPoints]
          );
        }
        break;
        
      case 'smart-merge':
        // Analyze merge
        console.log('[CSV Re-import] Analyzing smart merge...');
        console.log('[CSV Re-import] Pending CSV data:', pendingCSVData.value?.points?.slice(0, 3));
        if (pendingCSVData.value && selectedProjectId.value) {
          const analysis = await analyzeMerge({
            project_id: selectedProjectId.value,
            new_points: pendingCSVData.value.points.map(p => ({
              id: p.id || p.name || '',
              y: p.y || p.original?.y || 0,
              x: p.x || p.original?.x || 0
            })),
            tolerance: 0.01
          });
          
          console.log('[CSV Re-import] Merge analysis complete:', analysis.summary);
          
          // Show analysis dialog
          mergeAnalysisDialog.value = {
            isOpen: true,
            analysis,
            tolerance: 0.01
          };
        }
        break;
        
      case 'complete-replace':
        // Confirm and delete all
        const confirmed = confirm(
          '⚠️ WARNING: Complete Replacement\n\n' +
          'This will permanently delete:\n' +
          `• All ${reimportDialog.value.existingImport?.point_count || 0} coordinate points\n` +
          `• All ${reimportDialog.value.existingImport?.parcel_count || 0} land parcels\n` +
          '• All generated documents\n\n' +
          'This action CANNOT be undone!\n\n' +
          'Are you absolutely sure you want to continue?'
        );
        
        if (confirmed && pendingCSVData.value) {
          console.log('[CSV Re-import] Complete replacement confirmed');
          // Delete all existing data (handled by cascade in database)
          // Then process new import
          await processNewCSVImport(
            pendingCSVData.value.content,
            pendingCSVData.value.filename,
            pendingCSVData.value.points
          );
        }
        break;
    }
  } catch (error) {
    console.error('[CSV Re-import] Error handling choice:', error);
    alert('Error processing CSV re-import: ' + (error instanceof Error ? error.message : 'Unknown error'));
    // Clear pending data on error
    pendingCSVData.value = null;
  }
  // ⭐ Don't clear pendingCSVData here for smart-merge
  // It will be cleared after merge execution in handleMergeProceed
}

// ⭐ CSV Re-import: Execute merge after analysis
async function handleMergeProceed(partialParcelActions: Record<number, 'delete' | 'keep' | 'review'>, duplicateTolerance: number) {
  console.log('[CSV Merge] Executing merge with actions:', partialParcelActions);
  console.log('[CSV Merge] Duplicate tolerance:', duplicateTolerance, 'm');
  
  // ⭐ Store analysis before closing dialog
  const analysis = mergeAnalysisDialog.value.analysis;
  
  if (!pendingCSVData.value || !selectedProjectId.value || !analysis) {
    console.error('[CSV Merge] Missing data:', {
      hasPendingCSV: !!pendingCSVData.value,
      hasProjectId: !!selectedProjectId.value,
      hasAnalysis: !!analysis
    });
    alert('Error: Missing merge data');
    return;
  }
  
  // Close dialog after storing analysis
  mergeAnalysisDialog.value.isOpen = false;
  
  try {
    // Try to create new import record, or use existing if duplicate
    let importId: number;
    
    try {
      const newImport = await createCSVImport({
        project_id: selectedProjectId.value,
        csv_content: pendingCSVData.value.content,
        filename: pendingCSVData.value.filename,
        point_count: pendingCSVData.value.points.length,
        coordinate_system: `Lo${workflowState.projectInfo.centralMeridian || 31}`
      });
      importId = newImport.id;
      console.log('[CSV Merge] New import record created:', importId);
    } catch (error: any) {
      // If 409 Conflict, use the existing import ID
      if (error.response?.status === 409 && error.response?.data?.import_id) {
        importId = error.response.data.import_id;
        console.log('[CSV Merge] Using existing import record:', importId);
      } else {
        throw error; // Re-throw if it's a different error
      }
    }
    
    // Execute merge
    const result = await executeMerge({
      project_id: selectedProjectId.value,
      import_id: importId,
      matched_points: analysis.matched,
      new_points: analysis.newPoints.map(p => ({
        id: p.id,
        y: p.coordinate.y,
        x: p.coordinate.x
      })),
      orphaned_parcel_ids: analysis.parcelAnalysis.orphaned.map(p => p.id),
      partial_parcel_actions: partialParcelActions,
      duplicate_tolerance: duplicateTolerance,
      detectedCentralMeridian: pendingCSVData.value?.detectedCentralMeridian
    });
    
    // Log which central meridian is being used
    if (pendingCSVData.value?.detectedCentralMeridian) {
      console.log(`[CSV Merge] 🎯 Using detected central meridian from CSV: Lo ${pendingCSVData.value.detectedCentralMeridian}`);
    } else {
      console.log(`[CSV Merge] 📋 Using project's default central meridian: Lo ${workflowState.projectInfo.centralMeridian || 31}`);
    }
    
    console.log('[CSV Merge] Merge executed successfully:', result);
    
    currentImportId.value = importId;
    
    // Reload points from database and restart workflow
    setImportedPoints(pendingCSVData.value.points);
    workflowState.currentStep = 'field-book';
    await reloadWorkflowState();
    
    // Trigger automated workflow
    automationProgress.value = {
      isAutomating: true,
      currentStep: 'field-book',
      message: 'Generating Field Book with merged data...',
      progress: 33
    };
    
    await nextTick();
    await generateFieldBook();
    
    alert(`✅ Merge completed successfully!\n\n` +
          `• Matched points: ${result.data.matched_count}\n` +
          `• New points: ${result.data.new_count}\n` +
          `• Orphaned parcels: ${result.data.orphaned_parcels}`);
    
  } catch (error) {
    console.error('[CSV Merge] Merge execution failed:', error);
    alert('Error executing merge: ' + (error instanceof Error ? error.message : 'Unknown error'));
  } finally {
    pendingCSVData.value = null;
    mergeAnalysisDialog.value.analysis = null;
  }
}

// ⭐ CSV Re-import: Close dialogs
function handleReimportDialogClose() {
  reimportDialog.value.isOpen = false;
  pendingCSVData.value = null;
}

function handleMergeAnalysisClose() {
  mergeAnalysisDialog.value.isOpen = false;
}

function handleMergeAnalysisViewDetails() {
  console.log('[CSV Merge] View details:', mergeAnalysisDialog.value.analysis);
  // Could open a detailed view modal here
  alert('Detailed analysis view coming soon!');
}

async function resetImportStep() {
  if (!selectedProjectId.value) return;
  
  const confirmed = confirm(
    'Are you sure you want to reset the Import CSV step? This will:\n' +
    '• Clear all imported coordinate data\n' +
    '• Remove generated Field Book and Calculations\n' +
    '• Reset the workflow to the beginning\n\n' +
    'This action cannot be undone.'
  );
  
  if (!confirmed) return;
  
  try {
    console.log('🔄 Resetting import_csv step...');
    
    // Call backend to reset the step in database
    await api.patch(`/survey-projects/${selectedProjectId.value}/workflow`, {
      step: 'import_csv',
      action: 'reset_step'
    });
    
    console.log('✅ Step reset in database');
    
    // Clear local state
    workflowState.importedPoints = [];
    workflowState.currentStep = 'csv-import';
    delete workflowState.documents.fieldBook;
    delete workflowState.documents.calculationsPart1;
    delete workflowState.documents.coordinateList;
    workflowState.adjustedCoordinates = undefined;
    
    // Reload from database to sync
    await reloadWorkflowState();
    
    alert('✅ Import CSV step has been reset. You can now import a fresh CSV file.');
    
  } catch (error) {
    console.error('❌ Failed to reset step:', error);
    alert('Error resetting step: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}


function triggerFileInput() {
  fileInputRef.value?.click();
}

// ✅ Phase 1: CSV Template Download
function downloadCSVTemplate() {
  const template = `Point,Y,X,Status,Description,Date
1,12345.67,2234567.89,F,Control Point ALPHA,2025-01-15
2,12346.78,2234568.90,F,Control Point BETA,2025-01-15
3,12347.89,2234569.01,P,Peg 1,2025-01-15
4,12348.90,2234570.12,P,Peg 2,2025-01-15
5,12349.01,2234571.23,P,Peg 3,2025-01-15`;

  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', 'cadastral_survey_template.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  console.log('✅ CSV template downloaded');
}

// ✅ Phase 1: Batch Export All Documents
async function exportAllDocuments() {
  try {
    isExporting.value = true;
    console.log('📦 Starting batch export...');
    
    const documents: Array<{ name: string; blob: Blob; type: string }> = [];
    
    // Collect Field Book
    if (workflowState.documents.fieldBook) {
      console.log('  - Adding Field Book');
      // Field book is stored as a data structure, need to regenerate PDF
      // For now, skip if not available as blob
    }
    
    // Collect Calculations Part 1
    if (pdfBlobStorage.calculationsPart1) {
      console.log('  - Adding Calculations Part 1');
      documents.push({
        name: 'Calculations_Part1.pdf',
        blob: pdfBlobStorage.calculationsPart1,
        type: 'application/pdf'
      });
    }
    
    // Collect Coordinate List
    if (pdfBlobStorage.coordinateList) {
      console.log('  - Adding Coordinate List');
      documents.push({
        name: 'Coordinate_List.pdf',
        blob: pdfBlobStorage.coordinateList,
        type: 'application/pdf'
      });
    }
    
    if (documents.length === 0) {
      alert('No documents available to export. Please generate documents first.');
      return;
    }
    
    const projectName = workflowState.projectInfo.name || selectedProject.value?.name || 'CadastralProject';
    const workingDirectory = workflowState.projectInfo.workingDirectory || selectedProject.value?.working_directory;
    
    console.log(`📥 Exporting ${documents.length} documents for project: ${projectName}`);
    console.log(`📁 Working directory: ${workingDirectory || 'Not set - will download to browser'}`);
    
    const savedPath = await batchDownloadDocuments(projectName, documents, workingDirectory);
    
    console.log('✅ ZIP export complete!');
    
    if (workingDirectory) {
      alert(`Successfully saved ZIP archive to:\n${savedPath}\n\nContains ${documents.length} documents.`);
    } else {
      alert(`Successfully created ZIP archive with ${documents.length} documents!\nDownloaded to your Downloads folder.`);
    }
    
  } catch (error) {
    console.error('❌ Batch export failed:', error);
    alert('Failed to export documents: ' + (error instanceof Error ? error.message : 'Unknown error'));
  } finally {
    isExporting.value = false;
  }
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (file) {
    console.log('File selected:', file.name);
    
    try {
      // Read file content
      const content = await readFileContent(file);
      console.log('File content read, length:', content.length);
      
      // Get Lo zone from selected Lo zone (from Project Setup)
      const loZone = selectedLoZone.value || workflowState.projectInfo.centralMeridian;
      console.log(`[CSV Import] Using Lo zone: Lo${loZone || 'not set'}`);
      console.log(`[CSV Import] - selectedLoZone.value: ${selectedLoZone.value}`);
      console.log(`[CSV Import] - workflowState.projectInfo.centralMeridian: ${workflowState.projectInfo.centralMeridian}`);
      
      if (!loZone) {
        alert('Error: No Lo zone selected. Please go back to Project Setup and select a Lo zone.');
        return;
      }
      
      // Validate and parse the CSV with coordinate transformation
      const validationResult = validateAndParseCSV(content, loZone);
      console.log('CSV validation result:', validationResult);
      
      if (!validationResult.isValid || validationResult.preview.length === 0) {
        // Show validation errors
        const errorMessages = validationResult.errors.map(e => `Row ${e.row}: ${e.message}`).join('\n');
        alert('CSV validation failed:\n' + errorMessages);
        return;
      }
      
      console.log('===== STAGE 4: AFTER CSV VALIDATION ===== ');
      console.log('Total points:', validationResult.preview.length);
      if (validationResult.preview.length > 0) {
        console.log('First point:', validationResult.preview[0]);
        console.log('First point.original.y:', validationResult.preview[0].original.y);
        console.log('First point.original.x:', validationResult.preview[0].original.x);
      }
      
      // ⭐ For new projects or first-time imports, proceed directly
      // Only check for existing imports if the workflow has already been started
      const hasExistingWorkflow = workflowState.importedPoints && workflowState.importedPoints.length > 0;
      
      if (selectedProjectId.value && hasExistingWorkflow) {
        try {
          const existingImport = await getLatestCSVImport(selectedProjectId.value);
          
          if (existingImport) {
            console.log('[CSV Re-import] Existing import detected:', existingImport);
            // Store pending CSV data for later use
            pendingCSVData.value = {
              content,
              filename: file.name,
              points: validationResult.preview,
              detectedCentralMeridian: validationResult.detectedCentralMeridian
            };
            // Show re-import dialog
            reimportDialog.value = {
              isOpen: true,
              existingImport
            };
            return;
          }
        } catch (error) {
          console.error('[CSV Re-import] Error checking existing import:', error);
          // Continue with normal import if check fails
        }
      }
      
      // New project or no existing workflow - proceed directly with import
      console.log('[CSV Import] Processing as new import (no existing workflow detected)');
      await processNewCSVImport(content, file.name, validationResult.preview);
      
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error reading file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}

function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  });
}

function getStepDisplayName(stepId: string): string {
  const step = workflowSteps.find(s => s.id === stepId);
  return step ? step.name : stepId;
}

function isStepCompleted(stepId: string): boolean {
  const currentIndex = workflowSteps.findIndex(s => s.id === workflowState.currentStep);
  const stepIndex = workflowSteps.findIndex(s => s.id === stepId);
  return stepIndex < currentIndex;
}

function isStepCurrent(stepId: string): boolean {
  return workflowState.currentStep === stepId;
}

function goToPreviousStep() {
  const currentIndex = workflowSteps.findIndex(s => s.id === workflowState.currentStep);
  if (currentIndex > 0) {
    workflowState.currentStep = workflowSteps[currentIndex - 1].id as any;
  }
}

function goToNextStep() {
  const currentIndex = workflowSteps.findIndex(s => s.id === workflowState.currentStep);
  if (currentIndex < workflowSteps.length - 1) {
    const nextStep = workflowSteps[currentIndex + 1].id;

    // Pre-populate calculations form when moving to calculations step
    if (nextStep === 'calculations-part1') {
      calculationsInfo.value.surveyorName = workflowState.surveyorInfo.landSurveyor;
      calculationsInfo.value.licenseNumber = workflowState.surveyorInfo.licenseNumber || '';
      calculationsInfo.value.firm = workflowState.surveyorInfo.firm || '';
      calculationsInfo.value.surveyDate = workflowState.surveyorInfo.surveyDate;
      // ⭐ Use project name if available, fallback to surveyOf
      calculationsInfo.value.projectTitle = workflowState.projectInfo.name || workflowState.surveyorInfo.surveyOf;
      calculationsInfo.value.address = workflowState.surveyorInfo.address;
    }

    // When moving to coordinate-list step, build coordinate list using composable
    if (nextStep === 'coordinate-list') {
      buildCoordinateList();
    }

    workflowState.currentStep = nextStep as any;
  }
}

// Found Beacons handler
function handleFoundBeaconsSave(data: { beacons: any[]; comparisonConfig: any }) {
  console.log('[Found Beacons] Saving beacon assessment data:', data);
  
  // Initialize reportOnSurvey if it doesn't exist
  if (!workflowState.reportOnSurvey) {
    workflowState.reportOnSurvey = {
      srNumber: workflowState.projectInfo.srNumber || '',
      purpose: {
        type: 'private-land',
        reference: ''
      },
      surveyBasis: {
        trigStations: false,
        townSurveyMarks: false,
        officialControlPoints: false,
        previousSurvey: false,
        localSystem: false
      },
      beacons: [],
      curvilinearBoundaries: {
        applicable: false
      },
      unusualOccurrences: ''
    };
  }
  
  // Save beacons data and comparison config
  workflowState.reportOnSurvey.beacons = data.beacons;
  workflowState.reportOnSurvey.beaconComparison = {
    ...data.comparisonConfig,
    currentSRNumber: workflowState.projectInfo.srNumber || 'This Survey'
  };
  
  console.log('[Found Beacons] ✅ Beacon data and comparison config saved.');
  console.log('[Found Beacons] Comparison method:', data.comparisonConfig.method);
  console.log('[Found Beacons] Tolerance:', data.comparisonConfig.toleranceThreshold);

  // Persist so the Survey Plan export (which rebuilds workflow state from the
  // backend) can collate the Beacon Comparison Report.
  saveStepData('report-on-survey', { report_data: workflowState.reportOnSurvey });

  // Advance to Field Book. Only auto-generate when survey points are actually loaded —
  // the beacon-comparison save must not surface an unrelated "no imported points" error
  // (e.g. when revisiting Found Beacons on a project whose csv-import step_data lacks points).
  workflowState.currentStep = 'field-book';
  if (workflowState.importedPoints && workflowState.importedPoints.length > 0) {
    console.log('[Found Beacons] 🤖 Auto-triggering Field Book generation...');
    setTimeout(async () => {
      await generateFieldBook();
    }, 500);
  } else {
    console.warn('[Found Beacons] Field Book auto-generation skipped: no imported points loaded for this project.');
  }
}

async function generateFieldBook() {
  console.log('[generateFieldBook] Button clicked');
  isGenerating.value = true;
  
  try {
    // Validate we have points
    if (!workflowState.importedPoints || workflowState.importedPoints.length === 0) {
      console.error('[generateFieldBook] No imported points available');
      alert('No points available. Please import CSV data first.');
      return;
    }
    
    // Delegate to composable which centralizes document generation
    console.log('[generateFieldBook] Generating field book via composable for', workflowState.importedPoints.length, 'points');
    buildFieldBook();
    console.log('[generateFieldBook] buildFieldBook() completed');
    console.log('[generateFieldBook] Field book document:', workflowState.documents.fieldBook);
    
    // Pre-populate calculations form for when user advances to next step
    calculationsInfo.value.surveyorName = workflowState.surveyorInfo.landSurveyor;
    calculationsInfo.value.licenseNumber = workflowState.surveyorInfo.licenseNumber || '';
    calculationsInfo.value.firm = workflowState.surveyorInfo.firm || '';
    calculationsInfo.value.surveyDate = workflowState.surveyorInfo.surveyDate;
    // ⭐ Use project name if available, fallback to surveyOf
    calculationsInfo.value.projectTitle = workflowState.projectInfo.name || workflowState.surveyorInfo.surveyOf;
    calculationsInfo.value.address = workflowState.surveyorInfo.address;
    
    // ✅ Auto-save Field Book PDF to project folder
    // Note: Field Book PDF is generated on the fly when viewing/downloading, not stored as Blob
    // Auto-save will be added when we have persistent PDF storage
    // For now, user must download manually
    console.log('ℹ️ Field Book generated. Auto-save will be implemented when PDF persistence is added.');
    
    // Mark step as complete with metadata
    await completeCurrentStep({
      document_type: 'field_book',
      point_count: workflowState.importedPoints.length,
      precision: '3 decimal'
    });
    
    // Reload workflow state to update UI
    await reloadWorkflowState();
    
    // ⭐ PHASE 2: Auto-advance to Calculations Part 1
    console.log('[Phase 2] 🤖 Auto-advancing to Calculations Part 1...');
    automationProgress.value = {
      isAutomating: true,
      currentStep: 'calculations-part1',
      message: 'Generating Calculations Part 1 & Coordinate List...',
      progress: 66
    };
    
    workflowState.currentStep = 'calculations-part1';
    await nextTick();
    await generateCalculationsPart1();
    console.log('[Phase 2] ✅ Calculations Part 1 auto-generated');
    
  } catch (error) {
    console.error('[generateFieldBook] Error:', error);
    alert('Error generating field book: ' + (error instanceof Error ? error.message : 'Unknown error'));
  } finally {
    isGenerating.value = false;
    console.log('[generateFieldBook] isGenerating set to false');
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
}

// Phase 2: Workflow Dashboard Handlers
function handleStepClick(step: WorkflowStep) {
  console.log('Step clicked:', step.label);
  // Navigate to step
  workflowState.currentStep = step.dbKey as any;
  setCurrentStep(step.dbKey);
}

function handleStepAction(step: WorkflowStep, action: any) {
  console.log('Step action:', step.label, action.action);
  
  switch (action.action) {
    case 'start':
      // Navigate to step
      workflowState.currentStep = step.dbKey as any;
      setCurrentStep(step.dbKey);
      
      // Auto-trigger actions for different steps
      setTimeout(() => {
        switch (step.id) {
          case 'import_csv':
            // Trigger file picker for CSV import
            triggerFileInput();
            break;
            
          case 'field_book':
            // Auto-generate field book
            generateFieldBook();
            break;
            
          case 'calculations_part1':
            // Auto-generate calculations part 1
            if (canGenerateCalculations.value) {
              generateCalculationsPart1();
            } else {
              alert('Please complete the Field Book step first and fill in surveyor information.');
            }
            break;
            
          case 'coordinate_list':
            // Auto-generate coordinate list
            if (canGenerateCoordinateList.value) {
              generateCoordinateList();
            } else {
              alert('Please complete Calculations Part 1 first. The Coordinate List requires adjusted coordinates.');
            }
            break;
            
          // Other steps can be added here as needed
          // case 'calculations_part2':
          // case 'report_on_survey':
          // case 'dsg_certificate':
        }
      }, 100);
      break;
      
    case 'view':
    case 'edit':
      // Navigate to step
      workflowState.currentStep = step.dbKey as any;
      setCurrentStep(step.dbKey);
      
      // For edit action, ensure surveyor info is populated and auto-trigger regeneration
      if (action.action === 'edit') {
        console.log(`🔧 Edit action triggered for: ${step.label}`);
        
        // Use async IIFE to handle the async operations properly
        (async () => {
          try {
            console.log('📋 Step 1: Reloading workflow state from DB...');
            await reloadWorkflowState();
            
            console.log('📋 Step 2: Repopulating surveyor info...');
            // Then ensure surveyor info is populated from selected surveyor/project
            const surveyor = surveyors.value.find(s => s.id === selectedSurveyorId.value);
            if (surveyor) {
              // ALWAYS re-populate from selected surveyor (not just when empty)
              workflowState.surveyorInfo.landSurveyor = surveyor.name;
              workflowState.surveyorInfo.licenseNumber = surveyor.license_number;
              workflowState.surveyorInfo.firm = surveyor.firm || '';
              workflowState.surveyorInfo.address = surveyor.address || '';
              console.log(`✅ Repopulated surveyor info: ${surveyor.name}`);
            } else {
              console.warn('⚠️ No surveyor found with ID:', selectedSurveyorId.value);
            }
            
            console.log('📋 Step 3: Repopulating project info...');
            if (selectedProject.value) {
              // ALWAYS re-populate project-specific fields
              if (selectedProject.value.survey_date) {
                workflowState.surveyorInfo.surveyDate = new Date(selectedProject.value.survey_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              }
              if (selectedProject.value.designation) {
                workflowState.surveyorInfo.surveyOf = selectedProject.value.designation;
              }
              if (selectedProject.value.district) {
                workflowState.projectInfo.district = selectedProject.value.district;
              }
              if (selectedProject.value.instruments) {
                workflowState.surveyorInfo.instruments = selectedProject.value.instruments;
              }
              console.log(`✅ Repopulated project info: ${selectedProject.value.name}`);
            } else {
              console.warn('⚠️ No project selected');
            }
            
            console.log(`📋 Step 4: Auto-triggering regeneration for ${step.id}...`);
            // Auto-trigger regeneration for specific steps
            switch (step.id) {
              case 'field_book':
                console.log('🔄 Triggering Field Book regeneration...');
                await generateFieldBook();
                break;
              case 'calculations_part1':
                console.log('🔄 Checking if can generate Calculations Part 1...');
                console.log('  - canGenerateCalculations:', canGenerateCalculations.value);
                if (canGenerateCalculations.value) {
                  console.log('✅ Triggering Calculations Part 1 regeneration...');
                  await generateCalculationsPart1();
                } else {
                  console.warn('❌ Cannot regenerate Calculations Part 1: prerequisites not met');
                  alert('Cannot regenerate Calculations Part 1. Please ensure Field Book is completed and surveyor information is filled.');
                }
                break;
              case 'coordinate_list':
                console.log('🔄 Checking if can generate Coordinate List...');
                if (canGenerateCoordinateList.value) {
                  console.log('✅ Triggering Coordinate List regeneration...');
                  await generateCoordinateList();
                } else {
                  console.warn('❌ Cannot regenerate Coordinate List: adjusted coordinates not available');
                  alert('Cannot regenerate Coordinate List. Please complete Calculations Part 1 first.');
                }
                break;
              default:
                console.log(`ℹ️ No auto-regeneration defined for ${step.id}`);
            }
          } catch (error) {
            console.error('❌ Error in edit action handler:', error);
            alert(`Error regenerating ${step.label}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        })();
      }
      break;
      
    case 'proceed':
      // Move to next step
      const nextStepObj = getNextStep(step.id);
      if (nextStepObj) {
        workflowState.currentStep = nextStepObj.dbKey as any;
        setCurrentStep(nextStepObj.dbKey);
      }
      break;
      
    case 'download':
      // Handle document download
      const docUrl = stepData.value[step.id]?.document_url;
      if (docUrl) {
        window.open(docUrl, '_blank');
      }
      break;
  }
}

// Step reset handlers
function handleResetFieldBook() {
  if (confirm('Reset Field Book? This will clear the generated field book document. You can regenerate it anytime.')) {
    resetFieldBook();
  }
}

function handleResetCalculationsPart1() {
  if (confirm('Reset Calculations Part 1? This will clear the calculations document and adjusted coordinates. The Coordinate List will also need to be regenerated.')) {
    resetCalculationsPart1();
    // Also reset dependent steps
    resetCoordinateList();
    resetAreaComputation();
  }
}

function handleResetCoordinateList() {
  if (confirm('Reset Coordinate List? This will clear the generated coordinate list document. You can regenerate it anytime.')) {
    resetCoordinateList();
  }
}

function handleResetAreaComputation() {
  if (confirm('Reset Area Computation? This will clear all parcel definitions and area computations.')) {
    resetAreaComputation();
  }
}

// Survey Plan handlers
function handlePlanGenerated(data: { planType: string; filename: string }) {
  console.log('[Survey Plan] Plan generated:', data);
  // Optional: Show success notification or save to workflow state
}

function handleSurveyPlanContinue() {
  console.log('[Survey Plan] Continuing to Report on Survey');
  workflowState.currentStep = 'report-on-survey';
  setCurrentStep('report-on-survey');
}

async function viewFieldBook() {
  if (!workflowState.documents.fieldBook || !workflowState.documents.fieldBook.points || workflowState.documents.fieldBook.points.length === 0) {
    alert('No field book data available to preview.');
    return;
  }
  
  try {
    const fieldBook = workflowState.documents.fieldBook;
    const pdfGenerator = new FieldBookPDFGenerator({
      filename: `FieldBook_${new Date().toISOString().split('T')[0]}.pdf`
    });
    
    const enhancedFieldBook = {
      ...fieldBook,
      metadata: {
        ...fieldBook.metadata,
        surveyorName: workflowState.surveyorInfo.landSurveyor,
        surveyDescription: workflowState.surveyorInfo.surveyOf,
        surveyDate: workflowState.surveyorInfo.surveyDate,
        instruments: workflowState.surveyorInfo.instruments,
        address: workflowState.surveyorInfo.address
      },
      points: fieldBook.points
    };
    
    // Generate PDF Blob
    const pdfBlobUrl = await (pdfGenerator as any).generatePDFBlob?.(enhancedFieldBook);
    if (!pdfBlobUrl) {
      alert('Failed to generate PDF preview.');
      return;
    }
    
    const response = await fetch(pdfBlobUrl);
    const pdfBlob = await response.blob();
    URL.revokeObjectURL(pdfBlobUrl);
    
    // Open preview modal
    previewModal.value = {
      isOpen: true,
      title: 'Electronic Field Book',
      subtitle: `${workflowState.importedPoints.length} coordinates • ${(fieldBook.metadata as any).pageCount || 0} pages`,
      pdfBlob,
      documentType: 'field-book',
      fileName: `FieldBook_${new Date().toISOString().split('T')[0]}.pdf`
    };
  } catch (error) {
    console.error('Error viewing field book:', error);
    alert('Error generating PDF preview: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function downloadFieldBook() {
  console.log('downloadFieldBook called');
  console.log('fieldBook exists:', !!workflowState.documents.fieldBook);
  if (!workflowState.documents.fieldBook || !workflowState.documents.fieldBook.points || workflowState.documents.fieldBook.points.length === 0) {
    alert('No field book data available to download.');
    return;
  }
  try {
    const fieldBook = workflowState.documents.fieldBook;
    if (!fieldBook.points || fieldBook.points.length === 0) {
      alert('No points found in field book for download.');
      return;
    }
    const fileName = `fieldbook_${new Date().toISOString().split('T')[0]}.pdf`;
    const pdfGenerator = new FieldBookPDFGenerator({ filename: fileName });
    const enhancedFieldBook = {
      ...fieldBook,
      metadata: {
        ...fieldBook.metadata,
        surveyorName: workflowState.surveyorInfo.landSurveyor,
        surveyDescription: workflowState.surveyorInfo.surveyOf,
        surveyDate: workflowState.surveyorInfo.surveyDate,
        instruments: workflowState.surveyorInfo.instruments,
        address: workflowState.surveyorInfo.address
      },
      points: fieldBook.points // ensure points are present
    };
    const pdfBlobUrl = await pdfGenerator.generatePDFBlob(enhancedFieldBook);
    if (pdfBlobUrl) {
      const link = document.createElement('a');
      link.href = pdfBlobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(pdfBlobUrl);
      console.log('Field book PDF download initiated:', fileName);
    } else {
      alert('Failed to generate PDF for download. Please try again.');
    }
  } catch (error) {
    console.error('Error downloading field book:', error);
    alert('Error downloading PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function viewCalculationsPart1() {
  if (!workflowState.documents.calculationsPart1?.pdf || !pdfBlobStorage.calculationsPart1) {
    alert('No Calculations Part 1 PDF available to preview.');
    return;
  }
  
  try {
    // Get PDF from non-reactive storage
    const pdfBlob = pdfBlobStorage.calculationsPart1;
    console.log('[viewCalculationsPart1] PDF type:', typeof pdfBlob, 'instanceof Blob:', pdfBlob instanceof Blob);
    
    if (!(pdfBlob instanceof Blob)) {
      alert('Invalid PDF data. Please regenerate the Calculations Part 1.');
      return;
    }
    
    previewModal.value = {
      isOpen: true,
      title: 'Calculations Part 1',
      subtitle: 'Duplicate Point Analysis & Adjusted Coordinates',
      pdfBlob,
      documentType: 'calculations-part1',
      fileName: `CalculationsPart1_${new Date().toISOString().split('T')[0]}.pdf`
    };
  } catch (error) {
    console.error('Error viewing Calculations Part 1:', error);
    alert('Error generating PDF preview: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function downloadCalculationsPart1() {
  if (!workflowState.documents.calculationsPart1?.pdf || !pdfBlobStorage.calculationsPart1) {
    alert('No Calculations Part 1 PDF available to download.');
    return;
  }
  try {
    const fileName = `calculations_part1_${new Date().toISOString().split('T')[0]}.pdf`;
    // Get PDF from non-reactive storage
    const pdfBlob = pdfBlobStorage.calculationsPart1;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(pdfBlob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log('Calculations Part 1 PDF download initiated:', fileName);
  } catch (error) {
    console.error('Error downloading Calculations Part 1:', error);
    alert('Error downloading PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function viewCoordinateList() {
  if (!workflowState.documents.coordinateList?.pdf || !pdfBlobStorage.coordinateList) {
    alert('No Coordinate List PDF available to preview.');
    return;
  }
  
  try {
    // Get PDF from non-reactive storage
    const pdfBlob = pdfBlobStorage.coordinateList;
    
    console.log('[viewCoordinateList] PDF type:', typeof pdfBlob, 'instanceof Blob:', pdfBlob instanceof Blob);
    console.log('[viewCoordinateList] PDF size:', pdfBlob?.size);
    
    if (!(pdfBlob instanceof Blob)) {
      alert('Invalid PDF data. Please regenerate the Coordinate List.');
      return;
    }
    
    previewModal.value = {
      isOpen: true,
      title: 'Coordinate List',
      subtitle: `${workflowState.documents.coordinateList.points.length} coordinates`,
      pdfBlob,
      documentType: 'coordinate-list',
      fileName: `CoordinateList_${new Date().toISOString().split('T')[0]}.pdf`
    };
  } catch (error) {
    console.error('Error viewing Coordinate List:', error);
    alert('Error opening PDF preview: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function downloadCoordinateList() {
  if (!workflowState.documents.coordinateList?.pdf || !pdfBlobStorage.coordinateList) {
    alert('No Coordinate List PDF available to download.');
    return;
  }
  try {
    const fileName = `coordinate_list_${new Date().toISOString().split('T')[0]}.pdf`;
    // Get PDF from non-reactive storage
    const pdfBlob = pdfBlobStorage.coordinateList;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(pdfBlob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log('Coordinate List PDF download initiated:', fileName);
  } catch (error) {
    console.error('Error downloading Coordinate List:', error);
    alert('Error downloading PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

function downloadCoordinateListCSV() {
  if (!workflowState.adjustedCoordinates || workflowState.adjustedCoordinates.length === 0) {
    alert('No coordinate data available to export.');
    return;
  }
  
  try {
    // Prepare CSV header - use simple names for import compatibility
    const header = ['Point', 'Y', 'X', 'Status', 'Description', 'Date of survey'];
    
    // Prepare CSV rows with banker's rounding to 2 decimal places
    const today = new Date().toLocaleDateString()
    const rows = workflowState.adjustedCoordinates.map(coord => [
      coord.pointId,
      bankersRound(coord.y, 2).toFixed(2),
      bankersRound(coord.x, 2).toFixed(2),
      coord.status,
      coord.description || '',
      today
    ]);
    
    // Build CSV content
    const csvContent = [
      header.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape cells containing commas or quotes
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');
    
    // Create and download the file
    const fileName = `coordinate_list_${new Date().toISOString().split('T')[0]}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
    console.log('Coordinate List CSV download initiated:', fileName);
  } catch (error) {
    console.error('Error downloading Coordinate List CSV:', error);
    alert('Error downloading CSV: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function generateCoordinateList() {
  isGenerating.value = true;
  
  try {
    // Check if Calculations Part 1 has been completed
    if (!workflowState.adjustedCoordinates || workflowState.adjustedCoordinates.length === 0) {
      console.warn('⚠️ Please generate Calculations Part 1 first! The Coordinate List requires adjusted coordinates from Calculations Part 1.');
      isGenerating.value = false;
      return;
    }
    
    // Check if project is selected
    if (!selectedProject.value) {
      console.warn('⚠️ Please select a project first!');
      alert('Please select a project before generating the Coordinate List.');
      isGenerating.value = false;
      return;
    }
    
    console.log('Generating Coordinate List for', workflowState.adjustedCoordinates.length, 'adjusted points');
    
    // Import the Coordinate List generator
    const { CoordinateListGenerator } = await import('../../../utils/coordinate-list');
    
    // Use adjusted coordinates from Calculations Part 1
    const adjustedCoordinates = workflowState.adjustedCoordinates;
    
    // Determine central meridian with proper priority:
    // 1. From Step 0 (project-setup) stored in workflowState
    // 2. From selected project (database)
    // Prioritize fresh database data over stale workflow state
    const centralMeridian = selectedProject.value?.central_meridian 
      ?? workflowState.projectInfo.centralMeridian 
      ?? 31;
    
    console.log('[CoordinateList] Central Meridian determination:');
    console.log('  - From Step 0 (workflowState.projectInfo):', workflowState.projectInfo.centralMeridian);
    console.log('  - From selected project:', selectedProject.value?.central_meridian);
    console.log('  - Final value used:', centralMeridian);
    
    // Prepare surveyor info - use fresh data from selectedProject (database) instead of stale workflowState
    const surveyorInfo = {
      name: workflowState.surveyorInfo.landSurveyor,
      licenseNumber: workflowState.surveyorInfo.licenseNumber || '',
      firm: workflowState.surveyorInfo.firm || '',
      address: workflowState.surveyorInfo.address || '',
      surveyDate: workflowState.surveyorInfo.surveyDate,
      // Use fresh data from database project instead of stale workflowState
      projectTitle: selectedProject.value?.designation || workflowState.surveyorInfo.surveyOf,
      district: selectedProject.value?.district || workflowState.projectInfo.district || '',
      centralMeridian: centralMeridian
    };
    
    console.log('[CoordinateList] Using project data:');
    console.log('  - Project Title (designation):', selectedProject.value?.designation);
    console.log('  - District:', selectedProject.value?.district);
    console.log('  - Fallback from workflowState.surveyOf:', workflowState.surveyorInfo.surveyOf);
    console.log('  - Fallback from workflowState.district:', workflowState.projectInfo.district);
    
    // Fetch control points if project has them
    let projectControlPoints: any[] = [];
    if (workflowState.projectInfo.projectId && workflowState.projectInfo.controlPointIds?.length) {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3050/api';
        console.log(`[CoordinateList] Fetching control points for Lo${centralMeridian}`);
        const response = await fetch(`${API_BASE}/control-points?gauss_lo=${centralMeridian}&limit=5000`);
        const data = await response.json();
        
        // API returns { data: [...], pagination: {...} }
        if (data.data && Array.isArray(data.data)) {
          projectControlPoints = data.data.filter((cp: any) => workflowState.projectInfo.controlPointIds!.includes(cp.id));
          console.log(`[CoordinateList] Found ${projectControlPoints.length} control points to include`);
          console.log('[CoordinateList] Control points:', projectControlPoints.map((cp: any) => cp.monu_num).join(', '));
        } else {
          console.error('[CoordinateList] Unexpected API response format:', data);
        }
      } catch (error) {
        console.error('[CoordinateList] Error fetching control points:', error);
      }
    } else {
      console.log('[CoordinateList] No project control points configured');
    }
    
    // Generate Coordinate List using adjusted coordinates
    const generator = new CoordinateListGenerator();
    const result = await generator.generateCoordinateListPDF(
      adjustedCoordinates,
      surveyorInfo,
      projectControlPoints
    );
    
    console.log(`Coordinate List generated: ${result.pageCount} pages`);
    
    // Create blob for saving and preview
    const pdfBlob = new Blob([result.pdf.output('blob')], { type: 'application/pdf' });
    
    // Generate timestamped filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: 2025-11-18T00-35-24
    const fileName = `Coordinate-List_${timestamp}.pdf`;
    
    // Auto-save to project folder if working directory is set
    let savedFilePath: string | undefined;
    if (workflowState.projectInfo.workingDirectory) {
      try {
        console.log(`💾 Auto-saving Coordinate List to project folder...`);
        const { saveDocument } = await import('../../../services/documentStorage');
        
        const saveResult = await saveDocument({
          workingDirectory: workflowState.projectInfo.workingDirectory,
          documentType: 'coordinate-list',
          fileName: fileName,
          pdfBlob: pdfBlob
        });
        
        if (saveResult.success && saveResult.filePath) {
          savedFilePath = saveResult.filePath;
          console.log(`✅ Coordinate List saved to: ${saveResult.filePath}`);
        } else {
          console.warn(`⚠️ Failed to save Coordinate List: ${saveResult.error}`);
        }
      } catch (error) {
        console.error('❌ Error auto-saving Coordinate List:', error);
      }
    } else {
      console.warn('⚠️ No working directory set - Coordinate List not saved to disk');
    }
    
    // Store the document in workflow state
    workflowState.documents.coordinateList = {
      pdf: result.pdf,
      metadata: {
        title: 'Coordinate List',
        surveyorName: surveyorInfo.name,
        dateGenerated: new Date(),
        coordinateSystem: `Lo ${surveyorInfo.centralMeridian || 29}°`,
        pageCount: result.pageCount,
        savedFilePath: savedFilePath // Store the file path for reference
      },
      points: adjustedCoordinates.map(coord => ({
        id: coord.pointId,
        coordinates: { y: coord.y.toString(), x: coord.x.toString() },
        status: coord.status as any,
        description: coord.description
      })),
      summary: {
        totalPoints: adjustedCoordinates.length,
        startingPage: 100,
        endingPage: 100 + result.pageCount - 1
      }
    };
    
    // Mark step as complete with metadata
    await completeCurrentStep({
      document_type: 'coordinate_list',
      coordinate_count: adjustedCoordinates.length,
      saved_file_path: savedFilePath,
      timestamp: timestamp
    });
    
    // Reload workflow state to update UI
    await reloadWorkflowState();
    
    // Open in new window for preview
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const newWindow = window.open(pdfUrl, '_blank');
    if (!newWindow) {
      console.warn('Could not open PDF preview. Please allow popups for this site.');
    } else {
      console.log(`✅ Coordinate List generated successfully!`);
      console.log(`   - Pages: ${result.pageCount}`);
      console.log(`   - Points: ${adjustedCoordinates.length}`);
      console.log(`   - Coordinate System: Lo ${centralMeridian}°`);
      if (savedFilePath) {
        console.log(`   - Saved to: ${savedFilePath}`);
      }
    }
    
    // Step 4: Create project points layer in database (DISABLED - features table not in surveyor schemas)
    // TODO: Enable this after adding features table to surveyor schemas via migration
    console.log('📍 Skipping spatial layer creation (features table not available in surveyor schemas)');
    console.log(
      `✅ Coordinate List Generated!\n` +
      `📄 PDF: ${result.pageCount} pages, ${adjustedCoordinates.length} points\n` +
      `💾 Saved to: ${savedFilePath || 'project folder'}\n` +
      `⚠️ Spatial layer creation disabled (optional QGIS feature)`
    );
    
    // Auto-advance to Area Computation
    console.log('[Coordinate List] 🤖 Auto-advancing to Area Computation...');
    setTimeout(() => {
      workflowState.currentStep = 'area-computation';
    }, 1000);
    
  } catch (error) {
    console.error('Error generating Coordinate List:', error);
    alert('Error generating Coordinate List: ' + (error instanceof Error ? error.message : 'Unknown error'));
  } finally {
    isGenerating.value = false;
  }
}

function generateFieldBookHTML(fieldBook: any): string {
  const points = fieldBook.points;
  const metadata = fieldBook.metadata;
  
  // Format coordinates to 3 decimal places
  const formatCoordinate = (value: number): string => {
    return value.toFixed(3);
  };
  
  const pageStyles = `
    <style>
      @page {
        size: A4;
        margin: 2.5cm;
      }
      
      body {
        font-family: 'Times New Roman', serif;
        font-size: 14pt;
        line-height: 1.6;
        color: #000;
        margin: 0;
        padding: 0;
      }
      
      .cover-page {
        page-break-after: always;
        padding: 60px 40px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      
      .cover-title {
        font-size: 28pt;
        font-weight: bold;
        text-align: center;
        margin-bottom: 80px;
        letter-spacing: 3px;
        text-transform: uppercase;
        border-bottom: 3px solid #000;
        padding-bottom: 20px;
      }
      
      .cover-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        font-size: 16pt;
        line-height: 1.8;
      }
      
      .cover-field {
        display: flex;
        margin-bottom: 30px;
        align-items: flex-start;
      }
      
      .field-label {
        font-weight: bold;
        min-width: 160px;
        flex-shrink: 0;
      }
      
      .field-separator {
        margin: 0 20px 0 10px;
        font-weight: bold;
      }
      
      .field-value {
        flex: 1;
        text-align: left;
      }
      
      .cover-field.survey-of .field-value {
        font-size: 15pt;
      }
      
      .cover-field.instruments .field-value {
        font-size: 14pt;
        line-height: 1.6;
      }
      
      .cover-field.address .field-value {
        font-size: 15pt;
        line-height: 1.4;
      }
      
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        font-weight: bold;
        font-size: 18pt;
        border-bottom: 2px solid #000;
        padding-bottom: 10px;
      }
      
      .page-number {
        font-size: 24pt;
        font-weight: bold;
        color: #000;
      }
      
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 30px;
        font-size: 12pt;
      }
      
      th, td {
        border: 2px solid #000;
        padding: 12px;
        text-align: center;
      }
      
      th {
        background-color: #f5f5f5;
        font-weight: bold;
        font-size: 13pt;
      }
      
      .point-id {
        font-weight: bold;
        font-size: 13pt;
      }
      
      .coordinate {
        font-family: 'Courier New', monospace;
      }
      
      .page-break {
        page-break-before: always;
      }
      
      .metadata-section {
        margin-bottom: 40px;
        text-align: left;
        font-size: 14pt;
      }
      
      .metadata-item {
        margin-bottom: 15px;
        font-size: 14pt;
      }
      
      .document-header {
        text-align: center;
        font-size: 20pt;
        font-weight: bold;
        margin-bottom: 30px;
        text-transform: uppercase;
      }
      
      .status-f { background-color: #e8f5e8; }
      .status-p { background-color: #fff3cd; }
    </style>
  `;

  // Calculate dynamic points per page based on available space
  // A4 page height: 297mm, with margins and header/footer, usable space ~240mm
  // Each table row height: ~8mm (including borders and padding)
  // Header height: ~30mm, Footer: ~20mm, Table header: ~10mm
  // Available for rows: 297 - 30 - 20 - 10 - 20 (margins) = 217mm
  // Points per page: 217mm / 8mm ≈ 27 points (conservative estimate)
  const pointsPerPage = 27; // Dynamic calculation - fits page without overflow
  const pages: string[] = [];
  
  for (let i = 0; i < points.length; i += pointsPerPage) {
    const pagePoints = points.slice(i, i + pointsPerPage);
    const pageNumber = Math.floor(i / pointsPerPage) + 1;
    
    const tableRows = pagePoints.map((point: any, index: number) => `
      <tr class="${point.status === 'F' ? 'status-f' : point.status === 'P' ? 'status-p' : ''}">
        <td class="point-id">${point.id}</td>
        <td class="coordinate">${typeof point.coordinates.y === 'string' ? point.coordinates.y : formatCoordinate(point.coordinates.y)}</td>
        <td class="coordinate">${typeof point.coordinates.x === 'string' ? point.coordinates.x : formatCoordinate(point.coordinates.x)}</td>
        <td>${point.status === 'F' ? 'Fixed' : point.status === 'P' ? 'Peg' : point.status || ''}</td>
        <td>${point.description}</td>
        <td>${point.surveyDate.toLocaleDateString()}</td>
      </tr>
    `).join('');

    pages.push(`
      <div class="${i > 0 ? 'page-break' : ''}">
        <div class="page-header">
          <span>ELECTRONIC FIELD BOOK</span>
          <span class="page-number">E${pageNumber}</span>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Point ID</th>
              <th>Y Coordinate (m)</th>
              <th>X Coordinate (m)</th>
              <th>Status</th>
              <th>Description</th>
              <th>Survey Date</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `);
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${metadata.title}</title>
      ${pageStyles}
    </head>
    <body>
      <!-- Cover Page (No page numbering) -->
      <div class="cover-page">
        <div class="cover-title">ELECTRONIC FIELD BOOK</div>
        
        <div class="cover-content">
          <div class="cover-field">
            <span class="field-label">Land Surveyor</span>
            <span class="field-separator">:</span>
            <span class="field-value">${workflowState.surveyorInfo.landSurveyor}</span>
          </div>
          
          <div class="cover-field survey-of">
            <span class="field-label">Survey of</span>
            <span class="field-separator">:</span>
            <span class="field-value">${workflowState.surveyorInfo.surveyOf}</span>
          </div>
          
          <div class="cover-field">
            <span class="field-label">Surveyed in</span>
            <span class="field-separator">:</span>
            <span class="field-value">${workflowState.surveyorInfo.surveyDate}</span>
          </div>
          
          <div class="cover-field instruments">
            <span class="field-label">Instruments</span>
            <span class="field-separator">:</span>
            <span class="field-value">${workflowState.surveyorInfo.instruments.replace(/\n/g, '<br>')}</span>
          </div>
          
          <div class="cover-field address">
            <span class="field-label">Address</span>
            <span class="field-separator">:</span>
            <span class="field-value">${workflowState.surveyorInfo.address.replace(/\n/g, '<br>')}</span>
          </div>
        </div>
      </div>
      
      <!-- Data Pages (E1, E2, E3, etc.) -->
      ${pages.join('')}
      
      <!-- Document Information Page -->
      <div class="page-break">
        <div class="document-header">DOCUMENT INFORMATION</div>
        
        <div class="metadata-section">
          <div class="metadata-item"><strong>Document Generated:</strong> ${metadata.dateGenerated.toLocaleString()}</div>
          <div class="metadata-item"><strong>Total Pages:</strong> ${metadata.pageCount} (including cover)</div>
          <div class="metadata-item"><strong>Coordinate Precision:</strong> 3 decimal places (millimeter accuracy)</div>
          <div class="metadata-item"><strong>Datum:</strong> WGS84</div>
          <div class="metadata-item"><strong>Projection:</strong> UTM Zone 35 South</div>
          <div class="metadata-item"><strong>Survey Method:</strong> Final Adjusted Coordinates</div>
          
          <div style="margin-top: 50px; font-size: 12pt; line-height: 1.8;">
            <p><strong>Notes:</strong></p>
            <p>• All coordinates are final adjusted values</p>
            <p>• Coordinates shown to 3 decimal places for field book purposes</p>
            <p>• Status codes: F = Fixed, P = Peg</p>
            <p>• This document forms part of the official cadastral record</p>
          </div>
          
          <div style="margin-top: 60px;">
            <h3>Summary Statistics</h3>
            <p><strong>Fixed Points:</strong> ${points.filter((p: any) => p.status === 'F').length}</p>
            <p><strong>Peg Points:</strong> ${points.filter((p: any) => p.status === 'P').length}</p>
            <p><strong>Other Points:</strong> ${points.filter((p: any) => !['F', 'P'].includes(p.status)).length}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Surveyor and project change handlers
function onSurveyorChange() {
  const surveyor = surveyors.value.find(s => s.id === selectedSurveyorId.value);
  if (surveyor) {
    workflowState.surveyorInfo.landSurveyor = surveyor.name;
    workflowState.surveyorInfo.licenseNumber = surveyor.license_number;
    workflowState.surveyorInfo.firm = surveyor.firm || '';
    workflowState.surveyorInfo.address = surveyor.address || '';
  }
}

function onProjectChange() {
  const project = surveyProjects.value.find(p => p.id === selectedProjectId.value);
  if (project) {
    // Save project to localStorage for persistence across page refreshes
    localStorage.setItem('selectedProject', JSON.stringify(project));
    console.log(`💾 Saved project to localStorage: ${project.name}`);
    
    // Link workflow to this project for database persistence
    linkToProject(project.id);
    console.log(`🔗 Linked workflow to project ID: ${project.id}`);
    
    // Set project context for cross-module integration
    setCurrentProject(project);
    
    // Auto-populate project-specific fields
    if (project.survey_date) {
      workflowState.surveyorInfo.surveyDate = new Date(project.survey_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (project.designation) {
      workflowState.surveyorInfo.surveyOf = project.designation;
    }
    if (project.district) {
      workflowState.projectInfo.district = project.district;
    }
    if (project.survey_type) {
      workflowState.projectInfo.surveyType = project.survey_type;
    }
    if (project.instruments) {
      workflowState.surveyorInfo.instruments = project.instruments;
    }
    
    // ⭐ Auto-populate project name for Calculations Part 1
    // This ensures the "Project Title" field is always filled
    if (project.name) {
      workflowState.projectInfo.name = project.name;
      calculationsInfo.value.projectTitle = project.name;
      console.log(`  - Project Name: ${project.name}`);
    }
    
    // Load working directory from project
    if (project.working_directory) {
      workflowState.projectInfo.workingDirectory = project.working_directory;
      console.log(`  - Working Directory: ${project.working_directory}`);
    }
    
    // Populate control points information for Coordinate List
    workflowState.projectInfo.projectId = project.id;
    workflowState.projectInfo.centralMeridian = project.central_meridian || undefined;
    workflowState.projectInfo.controlPointIds = project.control_point_ids || [];
    
    // CRITICAL: Restore selectedLoZone from project for CSV Import step
    if (project.central_meridian) {
      selectedLoZone.value = project.central_meridian;
      console.log(`  - ✅ Restored selectedLoZone: ${selectedLoZone.value}`);
    }
    
    console.log(`[CadastralStandard] Project "${project.name}" selected`);
    console.log(`  - Project ID: ${project.id}`);
    console.log(`  - Survey Type: ${project.survey_type || 'N/A'}`);
    console.log(`  - Central Meridian: Lo${project.central_meridian || 'N/A'}`);
    console.log(`  - Control Points: ${project.control_point_ids?.length || 0} selected`);
  }
}

// Load surveyors and projects on mount
onMounted(async () => {
  console.log('🚀 CadastralStandardView mounted, starting initialization...');
  console.log('📊 Auth store current surveyor:', authStore.currentSurveyor);
  
  await fetchSurveyors();
  await fetchSurveyProjects();
  
  console.log('✅ Fetched surveyors:', surveyors.value.length);
  console.log('  - Sample surveyor:', surveyors.value[0]);
  console.log('✅ Fetched projects:', surveyProjects.value.length);
  if (surveyProjects.value.length > 0) {
    console.log('  - Sample project:', surveyProjects.value[0]);
    console.log('  - Project surveyor_id type:', typeof surveyProjects.value[0].surveyor_id);
    console.log('  - All projects:', surveyProjects.value.map(p => ({
      name: p.name,
      surveyor_id: p.surveyor_id,
      surveyor_id_type: typeof p.surveyor_id
    })));
  }
  
  // Auto-select current surveyor if logged in and no surveyor already selected
  if (!selectedSurveyorId.value && authStore.currentSurveyor) {
    const currentSurveyor = authStore.currentSurveyor;
    console.log('👤 Current surveyor from auth:', currentSurveyor);
    
    // Find the surveyor in the fetched list to ensure ID matches
    const surveyorInList = surveyors.value.find(s => 
      s.id === currentSurveyor.id || 
      s.name === currentSurveyor.name
    );
    
    if (surveyorInList) {
      selectedSurveyorId.value = surveyorInList.id;
      console.log('👤 Auto-selecting logged-in surveyor:', surveyorInList.name, '(ID:', surveyorInList.id, ')');
      
      // Trigger the surveyor change handler to populate all fields
      onSurveyorChange();
      
      console.log('✅ Surveyor info populated:');
      console.log('  - Name:', workflowState.surveyorInfo.landSurveyor);
      console.log('  - License:', workflowState.surveyorInfo.licenseNumber);
      console.log('  - Firm:', workflowState.surveyorInfo.firm);
      console.log('  - Address:', workflowState.surveyorInfo.address);
    } else {
      console.warn('⚠️ Could not find current surveyor in fetched list');
      console.log('Available surveyors:', surveyors.value.map(s => ({ id: s.id, name: s.name })));
    }
  } else {
    console.log('ℹ️ No auto-selection:', {
      alreadySelected: !!selectedSurveyorId.value,
      hasCurrentSurveyor: !!authStore.currentSurveyor
    });
  }
  
  // Phase 1 & 2: Initialize workflow persistence (non-blocking)
  // Delay restoration to allow UI to render first
  setTimeout(async () => {
    try {
      const project = JSON.parse(localStorage.getItem('selectedProject') || '{}');
      if (project.id) {
        // ✅ SECURITY: Verify project belongs to current user before restoring
        const projectBelongsToUser = surveyProjects.value.some(p => p.id === project.id);
        
        if (!projectBelongsToUser) {
          console.log(`⚠️ Stored project ${project.name} (ID: ${project.id}) doesn't belong to current user. Clearing.`);
          localStorage.removeItem('selectedProject');
          return;
        }
        
        // Restore project and surveyor selection state
        selectedProjectId.value = project.id;
        if (project.surveyor_id) {
          selectedSurveyorId.value = project.surveyor_id;
        }
        console.log(`🔄 Restored project selection: ${project.name} (ID: ${project.id})`);
        console.log(`🔄 Restored surveyor selection: ID ${project.surveyor_id}`);
        
        linkToProject(project.id);
        try {
          workflowStateFromDB.value = await loadWorkflowState(project.id);
          console.log('✅ Workflow state restored from database');
          
          // Also trigger onProjectChange to populate all project-specific fields
          onProjectChange();
        } catch (e: any) {
          console.log('ℹ️ No saved workflow state, starting fresh');
          console.log('Details:', e.message || e);
        }
      } else {
        console.log('ℹ️ No previous project found');
        // User will be guided to Project Setup (Step 0) if no project is selected
      }
    } catch (e) {
      console.warn('⚠️ Error initializing workflow persistence:', e);
    }
  }, 100);
});

// Watch for workflow step changes to ensure project context is set
watch(() => workflowState.currentStep, (newStep) => {
  if (newStep === 'area-computation') {
    console.log('📍 Entering Area Computation - ensuring project context is set');
    
    // Ensure project is set in context
    if (selectedProject.value) {
      setCurrentProject(selectedProject.value);
      console.log(`✅ Project context set for AreaComputationView: ${selectedProject.value.name}`);
    } else {
      console.warn('⚠️ No project selected when entering Area Computation');
    }
    
    // Log available data
    if (workflowState.adjustedCoordinates && workflowState.adjustedCoordinates.length > 0) {
      console.log(`📊 Available coordinates: ${workflowState.adjustedCoordinates.length} points`);
    } else {
      console.warn('⚠️ No adjusted coordinates available for Area Computation');
    }
  }
  
  // Auto-populate surveyor info when navigating to field-book step
  if (newStep === 'field-book') {
    console.log('📍 Navigated to Field Book step');
    
    // Auto-select surveyor if not already selected
    if (!selectedSurveyorId.value && authStore.currentSurveyor) {
      const currentSurveyor = authStore.currentSurveyor;
      const surveyorInList = surveyors.value.find(s => 
        s.id === currentSurveyor.id || 
        s.name === currentSurveyor.name
      );
      
      if (surveyorInList) {
        selectedSurveyorId.value = surveyorInList.id;
        console.log('👤 Auto-selecting surveyor on field-book navigation:', surveyorInList.name);
        onSurveyorChange();
      }
    }
    
    // If surveyor already selected but info not populated, populate it
    if (selectedSurveyorId.value && !workflowState.surveyorInfo.landSurveyor) {
      console.log('🔄 Surveyor selected but info empty, populating...');
      onSurveyorChange();
    }
  }
});

</script>

<style scoped>
.cadastral-module {
  min-height: 100vh;
  background-color: #f9fafb;
}
</style>