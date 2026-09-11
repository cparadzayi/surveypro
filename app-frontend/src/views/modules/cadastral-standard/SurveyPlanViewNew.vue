<template>
  <div class="survey-plan-view-new">
    <div class="header-section">
      <h2 class="text-2xl font-bold text-gray-900">Survey Plan Generation</h2>
      <p class="text-gray-600 mt-1">Select the type of survey plan to generate</p>
    </div>

    <!-- Record Composition: what this record encloses. Drives the letter and the cards below. -->
    <div v-if="projectId" class="composition-banner" :class="{ 'is-confirmed': isConfirmed }">
      <template v-if="isConfirmed">
        <span class="composition-summary">
          📋 Record composition: <strong>{{ compositionLabel }}</strong>
        </span>
        <button class="composition-change" @click="reopenComposition">Change</button>
      </template>
      <template v-else>
        <div class="composition-prompt">
          <strong>What does this survey record enclose?</strong>
          <span v-if="parcelCountForHint !== null" class="composition-hint">
            Suggested from {{ parcelCountForHint }} parcel(s).
          </span>
        </div>
        <label class="composition-option">
          <input type="checkbox" v-model="draftDiagrams" />
          Diagrams
        </label>
        <label class="composition-option">
          <input type="checkbox" v-model="draftGeneralPlans" />
          General Plans
        </label>
        <button
          class="composition-confirm"
          :disabled="(!draftDiagrams && !draftGeneralPlans) || confirming"
          @click="saveComposition"
        >
          {{ confirming ? 'Saving…' : 'Confirm' }}
        </button>
      </template>
    </div>

    <!-- Plan Type Selection -->
    <div v-if="!selectedPlanType" class="plan-type-selection">
      <div class="plan-types-grid">
        <!-- Survey Diagram -->
        <div
          class="plan-type-card"
          :class="{ 'plan-type-card--blocked': !familyAllowed('diagram') }"
          :title="familyAllowed('diagram') ? '' : blockedReason"
          @click="selectPlanType('diagram')"
        >
          <div class="plan-type-icon">📐</div>
          <h3 class="plan-type-title">Survey Diagram</h3>
          <p class="plan-type-description">
            Detailed technical diagram showing survey measurements, beacons, and traverse lines.
            Used for field reference and technical documentation.
          </p>
          <div class="plan-type-features">
            <span class="feature-tag">Technical</span>
            <span class="feature-tag">Field Work</span>
          </div>
          <p v-if="!familyAllowed('diagram')" class="plan-type-blocked-reason">{{ blockedReason }}</p>
        </div>

        <!-- Working Plan -->
        <div class="plan-type-card" @click="selectPlanType('working-plan')">
          <div class="plan-type-icon">🗺️</div>
          <h3 class="plan-type-title">Working Plan</h3>
          <p class="plan-type-description">
            Preliminary plan for field work and office calculations.
            Shows coordinate points, parcels, and measurement data.
          </p>
          <div class="plan-type-features">
            <span class="feature-tag">Preliminary</span>
            <span class="feature-tag">Calculations</span>
          </div>
        </div>

        <!-- Township General Plan -->
        <div
          class="plan-type-card"
          :class="{ 'plan-type-card--blocked': !familyAllowed('general') }"
          :title="familyAllowed('general') ? '' : blockedReason"
          @click="selectPlanType('township-general-plan')"
        >
          <div class="plan-type-icon">🏘️</div>
          <h3 class="plan-type-title">Township General Plan</h3>
          <p class="plan-type-description">
            SI 727 compliant general plan for township portions — developed or undeveloped.
            Vector GeoPDF with selectable features for QGIS integration.
          </p>
          <div class="plan-type-features">
            <span class="feature-tag">SI 727</span>
            <span class="feature-tag">Vector PDF</span>
            <span class="feature-tag">QGIS</span>
          </div>
          <p v-if="!familyAllowed('general')" class="plan-type-blocked-reason">{{ blockedReason }}</p>
        </div>
      </div>
    </div>

    <!-- Selected Plan Type Component -->
    <div v-else class="plan-type-content">
      <!-- Back Button -->
      <div class="back-button-section">
        <button class="btn btn-secondary" @click="selectedPlanType = null">
          ← Back to Plan Type Selection
        </button>
      </div>

      <!-- Survey Diagram -->
      <SurveyDiagramView
        v-if="selectedPlanType === 'diagram'"
        :project-id="projectId"
        :project-info="projectInfo"
        :workflow-state="props.workflowState"
        @export-complete="handleExportComplete"
      />

      <!-- Working Plan -->
      <WorkingPlanView
        v-if="selectedPlanType === 'working-plan'"
        :project-id="projectId"
        :project-info="projectInfo"
        :workflow-state="props.workflowState"
        @export-complete="handleExportComplete"
      />

      <!-- Township General Plan -->
      <SurveyPlanMapView
        v-if="selectedPlanType === 'township-general-plan'"
        :project-id="projectId"
        :project-info="projectInfo"
        :workflow-state="props.workflowState"
        @export-complete="handleExportComplete"
      />

      <!-- Navigation -->
      <div class="navigation-section">
        <button 
          class="btn btn-success btn-lg"
          @click="continueToNextStep"
        >
          Continue to Report on Survey →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import SurveyDiagramView from './SurveyDiagramView.vue'
import WorkingPlanView from './WorkingPlanView.vue'
import SurveyPlanMapView from './SurveyPlanMapView.vue'
import { useAuthStore } from '../../../stores/auth'
import { useSurveyors } from '../../../composables/useSurveyors'
import { useRecordComposition } from '@/composables/useRecordComposition'
import { describeComposition, allowsFamily, type PlanFamily } from '@/utils/recordComposition'

interface Props {
  projectId?: number
  workflowState?: any
}

const props = defineProps<Props>()
const emit = defineEmits(['plan-generated', 'continue'])

// Plan type selection
const selectedPlanType = ref<string | null>(null)

// Get logged-in surveyor from auth store
const authStore = useAuthStore()

// Get project data from useSurveyors composable
const { surveyProjects } = useSurveyors()

const { compositionFor, parcelCountFor, loadComposition, confirmComposition } = useRecordComposition()

const composition = ref(props.projectId ? compositionFor(props.projectId) : null)
const parcelCountForHint = ref<number | null>(null)
const draftDiagrams = ref(false)
const draftGeneralPlans = ref(false)
const confirming = ref(false)

const isConfirmed = computed(() => composition.value?.source === 'confirmed')

// describeComposition owns BOTH the banner label and the blocked-plan reason, so the
// wording has exactly one source. Do not re-derive the reason string here.
const description = computed(() => describeComposition(composition.value))
const compositionLabel = computed(() => description.value.label)
const blockedReason = computed(() => description.value.reason ?? '')

function familyAllowed(family: PlanFamily): boolean {
  return allowsFamily(composition.value, family)
}

function selectPlanType(type: string) {
  const family: PlanFamily =
    type === 'diagram' ? 'diagram' : type === 'working-plan' ? 'working' : 'general'
  if (!familyAllowed(family)) return
  selectedPlanType.value = type
  console.log('📋 Selected plan type:', type)
}

async function initComposition() {
  if (!props.projectId) return
  const loaded = await loadComposition(props.projectId, props.workflowState)
  composition.value = loaded
  parcelCountForHint.value = parcelCountFor(props.projectId)
  draftDiagrams.value = loaded?.includesDiagrams ?? false
  draftGeneralPlans.value = loaded?.includesGeneralPlans ?? false
}

async function saveComposition() {
  if (!props.projectId) return
  if (!draftDiagrams.value && !draftGeneralPlans.value) return
  confirming.value = true
  try {
    composition.value = await confirmComposition(
      props.projectId,
      draftDiagrams.value,
      draftGeneralPlans.value
    )
  } catch (error) {
    console.error('[RecordComposition] Failed to save:', error)
    alert('Could not save the record composition. Please try again.')
  } finally {
    confirming.value = false
  }
}

/**
 * Reopen the banner for editing. This demotes only the LOCAL copy to 'inferred' —
 * the cache and the database keep the confirmed value until the surveyor presses
 * Confirm again. So pressing Change and then navigating away changes nothing, which
 * is the behaviour you want from a Change link that was never followed through.
 */
function reopenComposition() {
  draftDiagrams.value = composition.value?.includesDiagrams ?? false
  draftGeneralPlans.value = composition.value?.includesGeneralPlans ?? false
  composition.value = composition.value ? { ...composition.value, source: 'inferred' } : null
}

// Find the current project from the projects list
const currentProject = computed(() => {
  return surveyProjects.value.find(p => p.id === props.projectId)
})

// Project info from actual project data + logged-in surveyor
const projectInfo = computed(() => {
  const currentSurveyor = authStore.currentSurveyor
  const project = currentProject.value as any // Type assertion to handle dynamic properties
  
  return {
    // Use actual project data as primary source (fresh from database)
    designation: project?.designation || props.workflowState?.projectInfo?.designation || props.workflowState?.projectInfo?.standReference || '',
    township: project?.township || props.workflowState?.projectInfo?.township || '',
    district: project?.district || props.workflowState?.projectInfo?.district || '',
    surveyType: project?.survey_type || props.workflowState?.projectInfo?.surveyType || '',
    surveyDate: project?.survey_date || props.workflowState?.projectInfo?.surveyDate || '',
    // Use fresh project designation instead of stale workflowState.surveyorInfo.surveyOf
    surveyOf: project?.designation || props.workflowState?.surveyorInfo?.surveyOf || '',
    centralMeridian: project?.central_meridian || props.workflowState?.projectInfo?.centralMeridian || 31,
    // SI 727 Seventh Schedule (b): whole/remainder/portion
    wholePortion: project?.whole_portion || props.workflowState?.projectInfo?.wholePortion || 'the whole',
    // Immediate parent property (e.g. "Shabani Mine Surface Rights A")
    parentProperty: project?.parent_property || props.workflowState?.projectInfo?.parentProperty || '',
    // Diagram reference fields (sub-project 2a)
    deedOfTransferNo: project?.deed_of_transfer_no || props.workflowState?.projectInfo?.deedOfTransferNo || '',
    parentDiagramNo: project?.parent_diagram_no || props.workflowState?.projectInfo?.parentDiagramNo || '',
    parentDiagramAnnexedTo: project?.parent_diagram_annexed_to || props.workflowState?.projectInfo?.parentDiagramAnnexedTo || '',
    originalTitleDiagramNo: project?.original_title_diagram_no || props.workflowState?.projectInfo?.originalTitleDiagramNo || '',
    originalTitleAnnexedTo: project?.original_title_annexed_to || props.workflowState?.projectInfo?.originalTitleAnnexedTo || '',
    originalTitleDeedNo: project?.original_title_deed_no || props.workflowState?.projectInfo?.originalTitleDeedNo || '',
    srNo: project?.sr_no || props.workflowState?.projectInfo?.srNo || '',
    fileNo: project?.file_no || props.workflowState?.projectInfo?.fileNo || '',
    gpNo: project?.gp_no || props.workflowState?.projectInfo?.gpNo || '',
    compilation: project?.compilation || props.workflowState?.projectInfo?.compilation || '',
    // Working directory for auto-saving files to project folder
    workingDirectory: project?.working_directory || props.workflowState?.projectInfo?.workingDirectory || '',
    // Project name for file naming
    name: project?.name || props.workflowState?.projectInfo?.name || '',
    // Use logged-in surveyor's information
    surveyorName: currentSurveyor?.name || '',
    licenseNumber: currentSurveyor?.license_number || currentSurveyor?.registration_number || '',
    firm: currentSurveyor?.firm || '',
    address: currentSurveyor?.address || ''
  }
})

function handleExportComplete(data: { format: string; filename: string }) {
  console.log('✅ Export complete:', data)
  emit('plan-generated', data)
}

function continueToNextStep() {
  emit('continue')
}

onMounted(async () => {
  console.log('📍 Survey Plan View mounted')
  console.log('  Project ID:', props.projectId)
  console.log('  👤 Logged-in Surveyor:', authStore.currentSurveyor)
  console.log('  📋 Project Info:', projectInfo.value)
  await initComposition()
})
</script>

<style scoped>
.survey-plan-view-new {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
}

.header-section {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.navigation-section {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  justify-content: flex-end;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-success:hover {
  background: #059669;
}

.btn-lg {
  font-size: 1.125rem;
  padding: 1rem 2rem;
}

.btn-secondary {
  background: #6b7280;
  color: white;
}

.btn-secondary:hover {
  background: #4b5563;
}

/* Plan Type Selection */
.plan-type-selection {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.plan-types-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 1rem;
}

.plan-type-card {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.plan-type-card:hover {
  border-color: #6366f1;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
  transform: translateY(-2px);
}

.plan-type-icon {
  font-size: 3rem;
  text-align: center;
}

.plan-type-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  text-align: center;
  margin: 0;
}

.plan-type-description {
  font-size: 0.875rem;
  color: #6b7280;
  line-height: 1.5;
  text-align: center;
  margin: 0;
  flex-grow: 1;
}

.plan-type-features {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}

.feature-tag {
  background: #eef2ff;
  color: #6366f1;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.plan-type-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.back-button-section {
  background: white;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.composition-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 1rem 0 1.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid #f59e0b;
  border-radius: 0.5rem;
  background: #fffbeb;
}
.composition-banner.is-confirmed {
  border-color: #d1d5db;
  background: #f9fafb;
}
.composition-prompt { display: flex; flex-direction: column; }
.composition-hint { font-size: 0.8rem; color: #6b7280; }
.composition-option { display: inline-flex; align-items: center; gap: 0.35rem; }
.composition-confirm {
  padding: 0.35rem 0.9rem;
  border-radius: 0.375rem;
  background: #2563eb;
  color: #fff;
}
.composition-confirm:disabled { background: #9ca3af; cursor: not-allowed; }
.composition-change {
  margin-left: auto;
  color: #2563eb;
  text-decoration: underline;
  background: none;
}
.plan-type-card--blocked {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
.plan-type-blocked-reason {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #b45309;
  pointer-events: auto;
}
</style>
