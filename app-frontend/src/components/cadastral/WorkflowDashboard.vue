<template>
  <div class="workflow-dashboard">
    <!-- Workflow Steps Grid -->
    <div class="steps-grid">
      <div
        v-for="step in steps"
        :key="step.id"
        class="step-card"
        :class="getStepCardClasses(step)"
        @click="handleStepClick(step)"
      >
        <!-- Status Badge -->
        <div class="step-status-badge" :class="getStatusBadgeClass(step)">
          <span v-if="getStatus(step) === 'completed'" class="text-xl">✓</span>
          <span v-else-if="getStatus(step) === 'active'" class="text-xl">⚡</span>
          <span v-else-if="getStatus(step) === 'locked'" class="text-xl">🔒</span>
          <span v-else class="text-lg font-semibold">{{ step.order }}</span>
        </div>

        <!-- Step Content -->
        <div class="step-content">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-2xl">{{ step.icon }}</span>
                <h4 class="font-semibold text-gray-900">{{ step.label }}</h4>
              </div>
              <p class="text-sm text-gray-600 mt-1">{{ step.description }}</p>
            </div>
          </div>

          <!-- Step Metadata (for completed steps) -->
          <div v-if="getStatus(step) === 'completed' && getStepMetadata(step)" class="step-metadata">
            <div class="text-xs text-gray-500">
              ✅ Completed {{ formatDate(getStepMetadata(step)?.completed_at) }}
            </div>
            
            <!-- Point/Coordinate counts -->
            <div v-if="getStepMetadata(step)?.point_count" class="text-xs text-gray-600 font-medium">
              📍 {{ getStepMetadata(step).point_count }} points
            </div>
            <div v-else-if="getStepMetadata(step)?.coordinate_count" class="text-xs text-gray-600 font-medium">
              📍 {{ getStepMetadata(step).coordinate_count }} coordinates
            </div>
            
            <!-- Document type indicator with clickable link -->
            <div v-if="getStepMetadata(step)?.document_type" class="text-xs">
              <button
                @click.stop="openDocumentFolder(step)"
                class="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 transition-colors"
                :title="`Click to open folder: ${getDocumentFolderPath(step)}`"
              >
                <span>📄</span>
                <span>{{ formatDocumentType(getStepMetadata(step).document_type) }}</span>
              </button>
            </div>
            
            <!-- Additional metadata based on step type -->
            <div v-if="getStepMetadata(step)?.precision" class="text-xs text-gray-500">
              🎯 {{ getStepMetadata(step).precision }}
            </div>
            <div v-if="getStepMetadata(step)?.control_points_used" class="text-xs text-gray-500">
              🔘 {{ getStepMetadata(step).control_points_used }} control points
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="step-actions">
            <button
              v-for="action in getActions(step)"
              :key="action.label"
              :class="getActionButtonClass(action)"
              @click.stop="handleAction(step, action)"
            >
              <span v-if="action.icon">{{ action.icon }}</span>
              {{ action.label }}
            </button>
          </div>

          <!-- Warning for locked steps -->
          <div v-if="getStatus(step) === 'locked'" class="locked-message">
            <span class="text-xs text-amber-600">
              {{ getAccessReason(step) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import {
  getWorkflowSteps,
  getStepStatus,
  getStepActions,
  canAccessStep,
  getWorkflowProgress,
  dbKeyToStepId,
  stepIdToDbKey,
  type WorkflowStep,
  type StepAction
} from '../../config/cadastralWorkflow'
import { makeAbsolutePath, isAbsolutePath, getSystemHomeDirectory } from '../../utils/project-directory'

interface Props {
  completedSteps: string[]
  currentStep: string
  stepData?: Record<string, any>
  workingDirectory?: string // Project's working directory for opening folders
}

const props = withDefaults(defineProps<Props>(), {
  completedSteps: () => [],
  currentStep: 'csv-import',
  stepData: () => ({}),
  workingDirectory: undefined
})

const emit = defineEmits<{
  stepClick: [step: WorkflowStep]
  action: [step: WorkflowStep, action: StepAction]
}>()

const steps = computed(() => getWorkflowSteps())
const completedCount = computed(() => props.completedSteps.length)
const totalSteps = computed(() => steps.value.length)
const progressPercentage = computed(() => getWorkflowProgress(props.completedSteps))

function getStatus(step: WorkflowStep) {
  const currentStepId = dbKeyToStepId(props.currentStep)
  return getStepStatus(step.id, props.completedSteps, props.currentStep)
}

function getStepCardClasses(step: WorkflowStep) {
  const status = getStatus(step)
  return {
    'step-completed': status === 'completed',
    'step-active': status === 'active',
    'step-available': status === 'available',
    'step-locked': status === 'locked'
  }
}

function getStatusBadgeClass(step: WorkflowStep) {
  const status = getStatus(step)
  return {
    'badge-completed': status === 'completed',
    'badge-active': status === 'active',
    'badge-available': status === 'available',
    'badge-locked': status === 'locked'
  }
}

function getActions(step: WorkflowStep): StepAction[] {
  const hasDoc = !!(props.stepData?.[step.id]?.document_url)
  return getStepActions(step.id, props.completedSteps, hasDoc)
}

function getActionButtonClass(action: StepAction) {
  const baseClasses = 'action-button'
  const typeClasses = action.type === 'primary' ? 'action-primary' : 'action-secondary'
  const variantClasses = action.variant === 'success' ? 'btn-success' : 'btn-default'
  
  return `${baseClasses} ${typeClasses} ${variantClasses}`
}

function getStepMetadata(step: WorkflowStep) {
  return props.stepData?.[step.id]
}

function getAccessReason(step: WorkflowStep): string {
  const access = canAccessStep(step.id, props.completedSteps)
  return access.reason || ''
}

function formatDate(dateString?: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDocumentType(docType?: string): string {
  if (!docType) return ''
  const typeMap: Record<string, string> = {
    'field_book': 'Field Book PDF',
    'calculations_part1': 'Calculations Part 1 PDF',
    'coordinate_list': 'Coordinate List PDF',
    'area_computation': 'Area Computation PDF',
    'report_on_survey': 'Report on Survey PDF',
    'dsg_certificate': 'DSG Certificate PDF'
  }
  return typeMap[docType] || docType
}

/**
 * Get the folder path for a step's documents
 */
function getDocumentFolderPath(step: WorkflowStep): string {
  if (!props.workingDirectory) return 'No working directory set'
  
  const folderMap: Record<string, string> = {
    'field_book': 'output/field-book',
    'calculations_part1': 'output/calculations',
    'coordinate_list': 'output/coordinate-list',
    'calculations_part2': 'output/complete-reports',
    'report_on_survey': 'output/reports',
    'dsg_certificate': 'output/certificates'
  }
  
  const metadata = getStepMetadata(step)
  const docType = metadata?.document_type
  const folder = folderMap[docType] || 'output'
  
  // Convert relative path to absolute if needed
  const absoluteWorkingDir = makeAbsolutePath(props.workingDirectory)
  
  return `${absoluteWorkingDir}/${folder}`
}

/**
 * Open the document folder in file explorer
 * Uses browser-based approach to show path and allow copying
 */
function openDocumentFolder(step: WorkflowStep) {
  if (!props.workingDirectory) {
    alert('Working directory not set. Please select a working directory first.')
    return
  }
  
  const folderPath = getDocumentFolderPath(step)
  const fullPath = folderPath.replace(/\//g, '\\') // Windows path format
  
  // Show the path in an alert with instructions
  const message = `📁 Document Location:\n\n${fullPath}\n\n` +
    `ℹ️ Copy this path and paste it into File Explorer's address bar to open the folder.\n\n` +
    `💡 Tip: Press Ctrl+C to copy, then press Windows+E to open File Explorer.`
  
  // Copy to clipboard if available
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fullPath).then(() => {
      alert(message + '\n\n✅ Path copied to clipboard!')
    }).catch(() => {
      alert(message)
    })
  } else {
    alert(message)
  }
  
  console.log(`📂 Document folder: ${fullPath}`)
}

function handleStepClick(step: WorkflowStep) {
  emit('stepClick', step)
}

function handleAction(step: WorkflowStep, action: StepAction) {
  emit('action', step, action)
}

// Fetch system home directory on mount for accurate path resolution
onMounted(async () => {
  await getSystemHomeDirectory()
  console.log('📂 System home directory fetched for path resolution')
})
</script>

<style scoped>
.workflow-dashboard {
  @apply space-y-6;
}

.progress-section {
  @apply bg-white rounded-lg shadow-sm p-6 border border-gray-200;
}

.progress-header {
  @apply flex items-center justify-between mb-3;
}

.progress-bar-container {
  @apply w-full bg-gray-200 rounded-full h-3 overflow-hidden mb-2;
}

.progress-bar-fill {
  @apply h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500 ease-out rounded-full;
}

.steps-grid {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4;
}

.step-card {
  @apply bg-white rounded-lg shadow-sm border-2 p-5 cursor-pointer transition-all duration-200;
  @apply hover:shadow-md;
}

.step-card.step-completed {
  @apply border-green-300 bg-green-50/30;
}

.step-card.step-active {
  @apply border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200;
}

.step-card.step-available {
  @apply border-gray-300 hover:border-indigo-300;
}

.step-card.step-locked {
  @apply border-gray-200 bg-gray-50 cursor-not-allowed opacity-60;
}

.step-status-badge {
  @apply w-12 h-12 rounded-full flex items-center justify-center mb-3 font-semibold;
}

.badge-completed {
  @apply bg-green-500 text-white;
}

.badge-active {
  @apply bg-indigo-600 text-white animate-pulse;
}

.badge-available {
  @apply bg-gray-200 text-gray-700;
}

.badge-locked {
  @apply bg-gray-300 text-gray-500;
}

.step-content {
  @apply space-y-3;
}

.step-metadata {
  @apply pt-2 border-t border-gray-200 space-y-1;
}

.step-actions {
  @apply flex flex-wrap gap-2 pt-2;
}

.action-button {
  @apply px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150;
  @apply flex items-center gap-1;
}

.action-primary {
  @apply flex-1;
}

.action-secondary {
  @apply flex-initial;
}

.btn-success {
  @apply bg-indigo-600 text-white hover:bg-indigo-700;
}

.btn-default {
  @apply bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300;
}

.locked-message {
  @apply pt-2 border-t border-amber-200 bg-amber-50 -mx-5 -mb-5 px-5 py-2 rounded-b-lg;
}
</style>
