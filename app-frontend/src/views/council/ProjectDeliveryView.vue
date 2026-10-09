<template>
  <div class="space-y-6 max-w-2xl">
    <header>
      <router-link to="/dashboard" class="text-xs text-indigo-600 hover:underline">← Your projects</router-link>
      <h2 class="text-2xl font-semibold tracking-tight mt-1">Deliver to the council</h2>
      <p v-if="project" class="text-sm text-gray-600">{{ project.name }}<span v-if="project.township"> · {{ project.township }}</span></p>
    </header>

    <p v-if="loadError" class="text-sm text-red-700" role="alert">{{ loadError }}</p>
    <div v-else-if="loading" class="text-sm text-gray-500">Loading…</div>

    <template v-else-if="status">
      <!-- where it stands -->
      <section class="bg-white border border-gray-200 rounded-lg p-5 space-y-2" aria-live="polite">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Status</h3>
          <span class="text-xs px-2.5 py-1 rounded-full font-medium" :class="BADGE[status.state]">{{ STATE_LABEL[status.state] }}</span>
        </div>
        <p v-if="status.state === 'awaiting_review'" class="text-sm text-gray-700">
          Delivered to {{ status.authority_code }} on {{ stamp(status.delivered_at) }}. It stays with the council until they decide.
        </p>
        <template v-else-if="status.state === 'accepted'">
          <p class="text-sm text-gray-700">Accepted by {{ status.authority_code }} on {{ stamp(status.decided_at) }}. It is final: a changed survey is a new project.</p>
          <p v-if="status.note" class="text-sm text-gray-600 border-l-2 border-green-500 pl-3">{{ status.note }}</p>
        </template>
        <template v-else-if="status.state === 'returned' || status.state === 'rejected'">
          <p class="text-sm text-gray-700">
            {{ status.state === 'returned' ? 'Returned' : 'Rejected' }} by {{ status.authority_code }} on {{ stamp(status.decided_at) }}. Correct the work, then deliver it again.
          </p>
          <p v-if="status.note" class="text-sm text-gray-800 bg-amber-50 border-l-2 border-amber-500 pl-3 py-2">{{ status.note }}</p>
        </template>
        <p v-else class="text-sm text-gray-600">Not delivered yet. Delivering hands this project to the council for review.</p>
      </section>

      <!-- what delivery needs -->
      <section v-if="canChange" class="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-700">Before you deliver</h3>

        <div>
          <p class="text-sm font-medium text-gray-900">1. The SI 727 survey class</p>
          <p class="text-xs text-gray-500 mb-2">
            The limits of error this survey was held to: class B for surveys in townships, class C for every other survey. You declare it; it is never guessed.
          </p>
          <div class="flex items-center gap-3">
            <select v-model="cls" class="border rounded px-2 py-1.5 text-sm" aria-label="SI 727 survey class" @change="saveClass">
              <option value="">Not declared</option>
              <option value="B">Class B: township</option>
              <option value="C">Class C: other</option>
            </select>
            <span v-if="savedClass" class="text-xs text-green-700" role="status">Saved</span>
          </div>
        </div>

        <div>
          <p class="text-sm font-medium text-gray-900">2. The council</p>
          <p v-if="status.authority_code && fixedAuthority" class="text-sm text-gray-700">{{ status.authority_code }}</p>
          <template v-else>
            <p v-if="!targets.length" class="text-sm text-red-700">
              You are not appointed to any council. Ask a council's head surveyor to appoint you; the appointment says whether you are employed or contracted.
            </p>
            <select v-else v-model="authority" class="border rounded px-2 py-1.5 text-sm" aria-label="Council">
              <option value="" disabled>Choose the council</option>
              <option v-for="t in targets" :key="t.code" :value="t.code">{{ t.name }} ({{ t.code }})</option>
            </select>
          </template>
        </div>

        <div>
          <p class="text-sm font-medium text-gray-900">3. The parcels</p>
          <p class="text-sm" :class="status.parcels_ready ? 'text-gray-700' : 'text-red-700'">
            {{ status.parcels_ready
              ? `${status.parcels_ready} finalized parcel${status.parcels_ready === 1 ? '' : 's'} will be delivered. They enter the council's register once it accepts the project.`
              : 'There is no finalized parcel yet. Finalize the parcels in the workflow first.' }}
          </p>
        </div>

        <div class="flex items-center gap-3 pt-2 border-t">
          <button type="button" :disabled="!ready || busy"
            class="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            @click="confirmAndDeliver">
            {{ status.state === 'not_delivered' ? 'Deliver to the council' : 'Deliver again' }}
          </button>
          <p v-if="!ready" class="text-xs text-gray-500">{{ whyNot }}</p>
        </div>
        <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../services/api'
import { deliver, deliveryStatus, deliverableTo, errorMessage, myAppointments, setSurveyClass, STATE_LABEL, type DeliveryState, type DeliveryStatus, type MyAppointment, type SurveyClass } from '../../services/council'
import { formatDateDDMMYYYY } from '../../utils/dateFormat'

const BADGE: Record<DeliveryState, string> = {
  not_delivered: 'bg-gray-100 text-gray-700',
  awaiting_review: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  returned: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-800',
}
const stamp = (d: string | null | undefined) => (d ? `${formatDateDDMMYYYY(new Date(d))} ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '')

const route = useRoute()
const id = Number(route.params.id)
const project = ref<{ name: string; township?: string } | null>(null)
const status = ref<DeliveryStatus | null>(null)
const mine = ref<MyAppointment[]>([])
const loading = ref(true)
const loadError = ref('')
const error = ref('')
const busy = ref(false)
const cls = ref<SurveyClass | ''>('')
const savedClass = ref(false)
const authority = ref('')

// delivery is open until the council has it or has accepted it
const canChange = computed(() => !!status.value && (status.value.state === 'not_delivered' || status.value.state === 'returned' || status.value.state === 'rejected'))
const targets = computed(() => {
  const seen = new Set<string>()
  return deliverableTo(mine.value).filter((a) => (seen.has(a.code) ? false : (seen.add(a.code), true)))
})
// a project opened from a council's job is already that council's
const fixedAuthority = computed(() => !!status.value?.authority_code)
const chosen = computed(() => (fixedAuthority.value ? status.value?.authority_code || '' : authority.value))
const ready = computed(() => !!cls.value && !!chosen.value && !!status.value?.parcels_ready)
const whyNot = computed(() => (!cls.value ? 'Declare the survey class.' : !chosen.value ? 'Choose the council.' : !status.value?.parcels_ready ? 'No finalized parcel yet.' : ''))

onMounted(async () => {
  if (!Number.isInteger(id) || id < 1) { loadError.value = 'That project does not exist.'; loading.value = false; return }
  try {
    const [p, s, m] = await Promise.all([api.get(`/survey-projects/${id}`), deliveryStatus(id), myAppointments()])
    project.value = p.data.project
    status.value = s
    mine.value = m
    cls.value = (s.survey_class as SurveyClass | null) || ''
    if (!s.authority_code && targets.value.length === 1) authority.value = targets.value[0].code
  } catch (e: any) {
    loadError.value = e?.response?.status === 404 ? 'That project does not exist, or it is not yours.' : errorMessage(e, 'The project could not be loaded.')
  } finally {
    loading.value = false
  }
})

async function saveClass() {
  error.value = ''; savedClass.value = false
  try {
    await setSurveyClass(id, cls.value || null)
    savedClass.value = true
    setTimeout(() => (savedClass.value = false), 2500)
  } catch (e) {
    error.value = errorMessage(e)
    cls.value = (status.value?.survey_class as SurveyClass | null) || ''
  }
}

async function confirmAndDeliver() {
  if (!window.confirm(`Deliver "${project.value?.name}" to ${chosen.value}? You will not be able to change it until the council decides.`)) return
  busy.value = true; error.value = ''
  try {
    await deliver(id, fixedAuthority.value ? undefined : authority.value)
    status.value = await deliveryStatus(id)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>
