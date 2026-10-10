<template>
  <div class="space-y-6">
    <header>
      <h2 class="text-2xl font-semibold tracking-tight">Reviews</h2>
      <p class="text-sm text-gray-600">Projects delivered to your council, waiting for a decision. Accepted work is what the council's register receives.</p>
    </header>

    <p v-if="loadError" class="text-sm text-red-700" role="alert">{{ loadError }}</p>

    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <!-- the queue -->
      <section class="lg:col-span-2 space-y-3" aria-labelledby="queue-heading">
        <div class="flex items-center justify-between gap-2">
          <h3 id="queue-heading" class="text-sm font-semibold uppercase tracking-wide text-gray-700">Waiting ({{ visibleQueue.length }})</h3>
          <select v-if="councils.length > 1" v-model="council" class="border rounded px-2 py-1 text-xs" aria-label="Council">
            <option value="">All my councils</option>
            <option v-for="c in councils" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div v-if="loading" class="text-sm text-gray-500">Loading…</div>
        <div v-else-if="!visibleQueue.length" class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-sm text-gray-600">
          Nothing is waiting for a decision.
        </div>
        <ul v-else class="space-y-2">
          <li v-for="q in visibleQueue" :key="q.id">
            <button
              type="button"
              class="w-full text-left bg-white border rounded-lg p-3 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              :class="selected === q.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200'"
              :aria-current="selected === q.id ? 'true' : undefined"
              @click="open(q.id)"
            >
              <p class="font-medium text-gray-900">{{ q.name }}</p>
              <p class="text-xs text-gray-600">{{ q.authority_code }}<span v-if="q.township"> · {{ q.township }}</span> · {{ q.parcels }} parcel{{ q.parcels === 1 ? '' : 's' }}</p>
              <p class="text-xs text-gray-500">
                {{ q.surveyor_name || 'Unknown surveyor' }}<span v-if="q.engagement"> ({{ q.engagement }})</span> · delivered {{ stamp(q.delivered_at) }}
              </p>
            </button>
          </li>
        </ul>
      </section>

      <!-- the project -->
      <section class="lg:col-span-3" aria-live="polite">
        <div v-if="detailLoading" class="text-sm text-gray-500">Loading the project…</div>
        <p v-else-if="detailError" class="text-sm text-red-700" role="alert">{{ detailError }}</p>
        <div v-else-if="detail" class="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">{{ detail.project.name }}</h3>
            <p class="text-sm text-gray-600">
              {{ detail.project.authority_code }}<span v-if="detail.project.township"> · {{ detail.project.township }}</span><span v-if="detail.project.survey_type"> · {{ detail.project.survey_type }}</span>
            </p>
          </div>

          <dl class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><dt class="text-xs text-gray-500">Surveyor</dt><dd>{{ detail.project.surveyor_name || '—' }}<span v-if="detail.project.surveyor_licence" class="text-gray-500"> · {{ detail.project.surveyor_licence }}</span></dd></div>
            <div><dt class="text-xs text-gray-500">Engagement</dt><dd>{{ detail.project.engagement || '—' }}</dd></div>
            <div>
              <dt class="text-xs text-gray-500">SI 727 survey class</dt>
              <dd>
                <span v-if="detail.project.survey_class">Class {{ detail.project.survey_class }}</span>
                <span v-else class="text-red-700">Not declared</span>
              </dd>
            </div>
            <div><dt class="text-xs text-gray-500">Delivered</dt><dd>{{ stamp(detail.project.delivered_at) }}</dd></div>
            <div><dt class="text-xs text-gray-500">Points · beacons</dt><dd>{{ detail.points }} · {{ detail.beacons }}</dd></div>
            <div><dt class="text-xs text-gray-500">Status</dt><dd>{{ STATE_LABEL[detail.state] }}</dd></div>
          </dl>

          <div>
            <h4 class="text-sm font-semibold text-gray-800 mb-1">Parcels ({{ detail.parcels.length }})</h4>
            <div class="border border-gray-200 rounded overflow-x-auto max-h-64">
              <table class="min-w-full text-xs">
                <thead class="bg-gray-50 text-left text-gray-500 sticky top-0">
                  <tr><th class="px-2 py-1.5">Stand</th><th class="px-2 py-1.5 text-right">Area (m²)</th><th class="px-2 py-1.5">Status</th><th class="px-2 py-1.5 text-right">Closure</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="p in detail.parcels" :key="p.id" :class="isReady(p) ? '' : 'text-gray-400'">
                    <td class="px-2 py-1.5">{{ p.stand || p.designation || '—' }}</td>
                    <td class="px-2 py-1.5 text-right">{{ p.area_m2 != null ? Number(p.area_m2).toLocaleString('en', { maximumFractionDigits: 2 }) : '—' }}</td>
                    <td class="px-2 py-1.5">{{ p.status }}<span v-if="!isReady(p)"> (not imported)</span></td>
                    <td class="px-2 py-1.5 text-right">{{ p.closure_ratio != null ? `1 : ${Math.round(Number(p.closure_ratio)).toLocaleString('en')}` : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-xs text-gray-500 mt-1">Only finalized or approved parcels enter the council's register once accepted.</p>
          </div>

          <div v-if="selected !== null">
            <h4 class="text-sm font-semibold text-gray-800 mb-1">The register</h4>
            <RegisterCheck :key="selected" :check="() => checkRegisterAsReviewer(selected as number)" />
          </div>

          <div v-if="detail.reviews.length">
            <h4 class="text-sm font-semibold text-gray-800 mb-1">Earlier decisions</h4>
            <ul class="space-y-1 text-sm">
              <li v-for="(r, i) in detail.reviews" :key="i" class="border-l-2 pl-3" :class="r.decision === 'accepted' ? 'border-green-500' : 'border-amber-500'">
                <span class="font-medium">{{ DECISION_LABEL[r.decision] }}</span>
                <span class="text-gray-500"> · {{ stamp(r.decided_at) }}<span v-if="r.reviewer_email"> · {{ r.reviewer_email }}</span></span>
                <p v-if="r.note" class="text-gray-700">{{ r.note }}</p>
              </li>
            </ul>
          </div>

          <!-- the decision -->
          <form v-if="detail.can_decide" class="border-t pt-4 space-y-3" @submit.prevent="submit">
            <h4 class="text-sm font-semibold text-gray-800">Your decision</h4>
            <div class="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Decision">
              <label class="flex items-center gap-1.5"><input v-model="decision" type="radio" value="accepted" /> Accept</label>
              <label class="flex items-center gap-1.5"><input v-model="decision" type="radio" value="returned" /> Return for correction</label>
              <label class="flex items-center gap-1.5"><input v-model="decision" type="radio" value="rejected" /> Reject</label>
            </div>
            <label class="block text-xs text-gray-600">
              Note <span v-if="needsNote" class="text-red-700">(required: say what is wrong)</span><span v-else class="text-gray-400">(optional)</span>
              <textarea v-model="note" rows="3" maxlength="4000" class="mt-1 w-full border rounded px-2 py-1.5 text-sm"></textarea>
            </label>
            <div class="flex items-center gap-3">
              <button type="submit" :disabled="!decision || (needsNote && !note.trim()) || busy"
                class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                Record decision
              </button>
              <p v-if="submitError" class="text-sm text-red-700" role="alert">{{ submitError }}</p>
            </div>
          </form>
          <p v-else-if="detail.state === 'awaiting_review'" class="border-t pt-4 text-sm text-gray-600">
            You cannot decide on this project: reviewers cannot review their own work.
          </p>
          <p v-else class="border-t pt-4 text-sm text-gray-600">This delivery has been decided.</p>
        </div>
        <div v-else class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-10 text-center text-sm text-gray-600">
          Select a project to review it.
        </div>
        <p v-if="done" class="mt-3 text-sm text-green-700" role="status">{{ done }}</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { checkRegisterAsReviewer, decide, errorMessage, reviewDetail, reviewQueue, STATE_LABEL, type Decision, type QueueItem, type ReviewDetail } from '../../services/council'
import { formatDateDDMMYYYY } from '../../utils/dateFormat'
import RegisterCheck from '../../components/council/RegisterCheck.vue'

const DECISION_LABEL: Record<Decision, string> = { accepted: 'Accepted', rejected: 'Rejected', returned: 'Returned for correction' }
const stamp = (d: string | null | undefined) => (d ? `${formatDateDDMMYYYY(new Date(d))} ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '—')
const isReady = (p: { status: string | null; parcel_status: string | null }) => ['finalized', 'approved'].includes(String(p.status)) && (p.parcel_status || 'active') === 'active'

const queue = ref<QueueItem[]>([])
const loading = ref(true)
const loadError = ref('')
const council = ref('')
const selected = ref<number | null>(null)
const detail = ref<ReviewDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const decision = ref<Decision | ''>('')
const note = ref('')
const busy = ref(false)
const submitError = ref('')
const done = ref('')

const councils = computed(() => [...new Set(queue.value.map((q) => q.authority_code))].sort())
const visibleQueue = computed(() => (council.value ? queue.value.filter((q) => q.authority_code === council.value) : queue.value))
const needsNote = computed(() => decision.value === 'returned' || decision.value === 'rejected')

async function loadQueue() {
  try { queue.value = await reviewQueue() }
  catch (e) { loadError.value = errorMessage(e, 'The review queue could not be loaded.') }
  finally { loading.value = false }
}

async function open(id: number) {
  selected.value = id; detail.value = null; detailError.value = ''; submitError.value = ''; done.value = ''
  decision.value = ''; note.value = ''; detailLoading.value = true
  try { detail.value = await reviewDetail(id) }
  catch (e) { detailError.value = errorMessage(e, 'That project could not be loaded.') }
  finally { detailLoading.value = false }
}

async function submit() {
  if (!selected.value || !decision.value) return
  busy.value = true; submitError.value = ''
  const id = selected.value; const d = decision.value
  try {
    await decide(id, d, note.value.trim() || undefined)
    done.value = `${DECISION_LABEL[d]}: ${detail.value?.project.name ?? 'the project'}.`
    selected.value = null; detail.value = null
    await loadQueue()
  } catch (e) {
    submitError.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

onMounted(loadQueue)
</script>
