<template>
  <div class="survey-plan-view">
    <div class="view-header">
      <h2 class="text-2xl font-bold text-gray-900">Survey Plan Generation</h2>
      <p class="text-gray-600 mt-1">Interactive map-based survey plan generation with intelligent paper sizing</p>
    </div>

    <!-- Plan Type Selection -->
    <div class="plan-type-section card">
      <h3>Select Plan Type</h3>
      <div class="plan-type-grid">
        <div 
          v-for="type in planTypes" 
          :key="type.id"
          class="plan-type-card"
          :class="{ 
            'selected': selectedPlanType === type.id,
            'disabled': type.disabled
          }"
          @click="!type.disabled && selectPlanType(type.id)"
        >
          <div class="plan-icon">{{ type.icon }}</div>
          <div class="plan-label">{{ type.label }}</div>
          <div class="plan-description">{{ type.description }}</div>
          <div v-if="type.disabled" class="coming-soon">Coming Soon</div>
        </div>
      </div>
    </div>

    <!-- Preview Data -->
    <div v-if="previewData" class="preview-section card">
      <h3>📊 Project Summary</h3>
      <div class="preview-grid">
        <div class="preview-item">
          <div class="preview-label">Project</div>
          <div class="preview-value">{{ previewData.project.name }}</div>
        </div>
        <div class="preview-item">
          <div class="preview-label">Parcels</div>
          <div class="preview-value">{{ previewData.parcel_count }}</div>
        </div>
        <div class="preview-item">
          <div class="preview-label">Coordinate Points</div>
          <div class="preview-value">{{ previewData.coordinate_point_count }}</div>
        </div>
        <div class="preview-item">
          <div class="preview-label">Total Area</div>
          <div class="preview-value">{{ previewData.total_area_ha }} ha ({{ previewData.total_area_m2 }} m²)</div>
        </div>
      </div>

      <!-- Parcel List -->
      <div v-if="previewData.parcels.length > 0" class="parcel-list">
        <h4>Parcels</h4>
        <table class="parcel-table">
          <thead>
            <tr>
              <th>Stand</th>
              <th>Area (ha)</th>
              <th>Area (m²)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="parcel in previewData.parcels" :key="parcel.id">
              <td>{{ parcel.stand }}</td>
              <td>{{ parcel.area_ha.toFixed(4) }}</td>
              <td>{{ parcel.area_m2.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Configuration Form (only for General Plans) -->
    <div v-if="selectedPlanType && selectedPlanType.startsWith('general')" class="config-section card">
      <h3>⚙️ Plan Configuration</h3>
      <form @submit.prevent="generatePlan" class="config-form">
        <div class="form-row">
          <div class="form-group">
            <label for="scale">Scale</label>
            <select id="scale" v-model="formData.scale" required>
              <option value="1:500">1:500</option>
              <option value="1:1000">1:1000</option>
              <option value="1:2000">1:2000</option>
              <option value="1:5000">1:5000</option>
            </select>
          </div>

          <div class="form-group">
            <label for="sheetNumber">Sheet Number</label>
            <input 
              id="sheetNumber" 
              v-model="formData.sheet_number" 
              type="text" 
              placeholder="1 of 1"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="surveyorName">Surveyor Name</label>
            <input 
              id="surveyorName" 
              v-model="formData.surveyor_name" 
              type="text" 
              required
              placeholder="Enter surveyor name"
            />
          </div>

          <div class="form-group">
            <label for="licenseNumber">License Number</label>
            <input 
              id="licenseNumber" 
              v-model="formData.license_number" 
              type="text" 
              required
              placeholder="LS-XXXXX"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="surveyDate">Survey Date</label>
            <input 
              id="surveyDate" 
              v-model="formData.survey_date" 
              type="date" 
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label for="notes">Notes (one per line)</label>
          <textarea 
            id="notes" 
            v-model="notesText" 
            rows="4"
            placeholder="Enter notes (optional)&#10;One note per line&#10;e.g., All coordinates in Cape Lo 31 (EPSG:22291)"
          ></textarea>
          <small>Each line will be a separate note on the plan</small>
        </div>

        <div class="form-actions">
          <button 
            type="button" 
            class="btn btn-secondary"
            @click="loadPreview"
            :disabled="loading"
          >
            🔄 Refresh Preview
          </button>
          <button 
            type="submit" 
            class="btn btn-primary"
            :disabled="loading || !previewData || previewData.parcel_count === 0"
          >
            <span v-if="loading">⏳ Generating...</span>
            <span v-else>📄 Generate Plan</span>
          </button>
        </div>
      </form>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="error-message">
      <strong>❌ Error:</strong> {{ error }}
    </div>

    <!-- Success Message -->
    <div v-if="successMessage" class="success-message">
      <strong>✅ Success:</strong> {{ successMessage }}
    </div>

    <!-- Navigation -->
    <div class="navigation-section">
      <button 
        class="btn btn-success btn-lg"
        @click="continueToNextStep"
        :disabled="!canContinue"
      >
        Continue to Report on Survey →
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { generateGeneralPlan, getPreviewData, type PlanPreviewData } from '../../../services/surveyPlans'
import { useAuthStore } from '../../../stores/auth'

interface Props {
  projectId?: number
  workflowState?: any
}

const props = defineProps<Props>()
const emit = defineEmits(['plan-generated', 'continue'])

const authStore = useAuthStore()

// Plan types
const planTypes = [
  {
    id: 'general-undeveloped',
    label: 'General Plan',
    description: 'Undeveloped Portion',
    icon: '📋',
    disabled: false
  },
  {
    id: 'general-developed',
    label: 'General Plan',
    description: 'Developed Portion',
    icon: '📋',
    disabled: false
  },
  {
    id: 'diagram',
    label: 'Diagram',
    description: 'Detailed survey diagram',
    icon: '📊',
    disabled: true
  },
  {
    id: 'working-plan',
    label: 'Working Plan',
    description: 'Field reference plan',
    icon: '🗺️',
    disabled: true
  }
]

// State
const selectedPlanType = ref<string | null>(null)
const previewData = ref<PlanPreviewData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const notesText = ref('')

// Form data
const formData = ref({
  scale: '1:1000',
  surveyor_name: authStore.profile?.profile?.name || '',
  license_number: authStore.profile?.profile?.license_number || '',
  survey_date: new Date().toISOString().split('T')[0],
  sheet_number: '1 of 1'
})

// Computed
const canContinue = computed(() => {
  return previewData.value && previewData.value.parcel_count > 0
})

// Methods
function selectPlanType(typeId: string) {
  selectedPlanType.value = typeId
  error.value = null
}

async function loadPreview() {
  if (!props.projectId) {
    error.value = 'No project selected'
    return
  }

  loading.value = true
  error.value = null

  try {
    previewData.value = await getPreviewData(props.projectId)
    console.log('Preview data loaded:', previewData.value)
  } catch (err: any) {
    console.error('Error loading preview:', err)
    error.value = err.response?.data?.error || err.message || 'Failed to load preview data'
  } finally {
    loading.value = false
  }
}

async function generatePlan() {
  if (!props.projectId || !selectedPlanType.value) {
    error.value = 'Please select a plan type'
    return
  }

  if (!previewData.value || previewData.value.parcel_count === 0) {
    error.value = 'No parcels found. Please digitize parcels in QGIS first.'
    return
  }

  loading.value = true
  error.value = null
  successMessage.value = null

  try {
    // Parse notes from textarea
    const notes = notesText.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    // Determine plan type
    const planType = selectedPlanType.value === 'general-developed' ? 'developed' : 'undeveloped'

    // Generate plan
    const pdfBlob = await generateGeneralPlan({
      project_id: props.projectId,
      plan_type: planType,
      scale: formData.value.scale,
      surveyor_name: formData.value.surveyor_name,
      license_number: formData.value.license_number,
      survey_date: formData.value.survey_date,
      notes: notes.length > 0 ? notes : undefined,
      sheet_number: formData.value.sheet_number
    })

    // Download the PDF
    const url = window.URL.createObjectURL(pdfBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `general-plan-${planType}-${previewData.value.project.name.replace(/\s+/g, '_')}-${formData.value.survey_date}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    successMessage.value = 'Survey plan generated successfully!'
    emit('plan-generated', { planType, filename: link.download })

    // Auto-clear success message after 5 seconds
    setTimeout(() => {
      successMessage.value = null
    }, 5000)

  } catch (err: any) {
    console.error('Error generating plan:', err)
    error.value = err.response?.data?.error || err.message || 'Failed to generate survey plan'
  } finally {
    loading.value = false
  }
}

function continueToNextStep() {
  emit('continue')
}

// Lifecycle
onMounted(() => {
  loadPreview()
  
  // Pre-select first available plan type
  const firstAvailable = planTypes.find(t => !t.disabled)
  if (firstAvailable) {
    selectedPlanType.value = firstAvailable.id
  }
})
</script>

<style scoped>
.survey-plan-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.view-header {
  margin-bottom: 2rem;
}

.view-header h2 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

.subtitle {
  color: #7f8c8d;
  font-size: 1.1rem;
}

.card {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.card h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #2c3e50;
}

/* Plan Type Selection */
.plan-type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.plan-type-card {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.plan-type-card:hover:not(.disabled) {
  border-color: #3498db;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(52, 152, 219, 0.2);
}

.plan-type-card.selected {
  border-color: #3498db;
  background-color: #ebf5fb;
}

.plan-type-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plan-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.plan-label {
  font-weight: bold;
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

.plan-description {
  color: #7f8c8d;
  font-size: 0.9rem;
}

.coming-soon {
  position: absolute;
  top: 10px;
  right: 10px;
  background: #f39c12;
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
}

/* Preview Section */
.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.preview-item {
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 4px;
}

.preview-label {
  font-size: 0.85rem;
  color: #7f8c8d;
  margin-bottom: 0.25rem;
}

.preview-value {
  font-size: 1.1rem;
  font-weight: bold;
  color: #2c3e50;
}

/* Parcel List */
.parcel-list {
  margin-top: 1.5rem;
}

.parcel-list h4 {
  margin-bottom: 0.75rem;
}

.parcel-table {
  width: 100%;
  border-collapse: collapse;
}

.parcel-table th,
.parcel-table td {
  padding: 0.5rem;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
}

.parcel-table th {
  background: #f8f9fa;
  font-weight: bold;
}

.parcel-table tbody tr:hover {
  background: #f8f9fa;
}

/* Configuration Form */
.config-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

.form-group input,
.form-group select,
.form-group textarea {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #3498db;
}

.form-group small {
  margin-top: 0.25rem;
  color: #7f8c8d;
  font-size: 0.85rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

/* Buttons */
.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
}

.btn-secondary {
  background: #95a5a6;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #7f8c8d;
}

.btn-success {
  background: #27ae60;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #229954;
}

.btn-lg {
  padding: 1rem 2rem;
  font-size: 1.1rem;
}

/* Messages */
.error-message,
.success-message {
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.error-message {
  background: #fee;
  border: 1px solid #fcc;
  color: #c33;
}

.success-message {
  background: #efe;
  border: 1px solid #cfc;
  color: #3c3;
}

/* Navigation */
.navigation-section {
  margin-top: 2rem;
  text-align: center;
}
</style>
