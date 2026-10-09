<template>
  <div class="space-y-8 max-w-4xl">
    <header>
      <h2 class="text-2xl font-semibold tracking-tight">Council appointments</h2>
      <p class="text-sm text-gray-600">
        The councils you work for, and, where you are a head surveyor, the people appointed to them.
      </p>
    </header>

    <p v-if="loadError" class="text-sm text-red-700" role="alert">{{ loadError }}</p>

    <!-- My appointments -->
    <section class="space-y-3" aria-labelledby="mine-heading">
      <h3 id="mine-heading" class="text-sm font-semibold uppercase tracking-wide text-gray-700">Your appointments</h3>
      <div v-if="loading" class="text-sm text-gray-500">Loading…</div>
      <div v-else-if="!mine.length" class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <p class="text-gray-700 font-medium">You are not appointed to any council.</p>
        <p class="text-sm text-gray-500 mt-1">
          A council's head surveyor appoints surveyors, employed or contracted. Until then your projects are your own private practice.
        </p>
      </div>
      <ul v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <li v-for="a in mine" :key="a.id" class="bg-white border rounded-lg p-4" :class="a.active ? 'border-gray-200' : 'border-gray-200 opacity-60'">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-semibold text-gray-900">{{ a.name }}</p>
              <p class="text-xs text-gray-500">{{ a.code }}</p>
            </div>
            <span class="text-[11px] px-2 py-0.5 rounded-full" :class="a.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'">
              {{ a.active ? 'Active' : 'Ended' }}
            </span>
          </div>
          <p class="mt-2 text-sm text-gray-700">
            {{ ROLE_LABEL[a.role] }}<span v-if="a.engagement"> · {{ a.engagement === 'employed' ? 'Employed' : 'Contracted' }}</span>
          </p>
          <p class="text-xs text-gray-500">
            From {{ date(a.valid_from) }}<span v-if="a.valid_to"> · until {{ date(a.valid_to) }}</span>
          </p>
        </li>
      </ul>
    </section>

    <!-- The panel, for each council I head -->
    <section v-for="c in heads" :key="c.code" class="space-y-4" :aria-labelledby="`panel-${c.code}`">
      <div class="flex items-center justify-between">
        <h3 :id="`panel-${c.code}`" class="text-lg font-semibold text-gray-900">{{ c.name }} <span class="text-sm font-normal text-gray-500">panel</span></h3>
        <button type="button" class="text-sm text-indigo-600 hover:underline" @click="loadPanel(c.code)">Refresh</button>
      </div>

      <div class="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr><th class="px-3 py-2">Person</th><th class="px-3 py-2">Role</th><th class="px-3 py-2">Engagement</th><th class="px-3 py-2">Period</th><th class="px-3 py-2"></th></tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="m in panels[c.code] || []" :key="m.id" :class="m.active ? '' : 'text-gray-400'">
              <td class="px-3 py-2">{{ m.email }}<p v-if="m.note" class="text-xs text-gray-500">{{ m.note }}</p></td>
              <td class="px-3 py-2">{{ ROLE_LABEL[m.role] }}</td>
              <td class="px-3 py-2">{{ m.engagement ? (m.engagement === 'employed' ? 'Employed' : 'Contracted') : '—' }}</td>
              <td class="px-3 py-2 whitespace-nowrap">{{ date(m.valid_from) }}<span v-if="m.valid_to"> – {{ date(m.valid_to) }}</span></td>
              <td class="px-3 py-2 text-right">
                <button
                  v-if="m.active && m.role !== 'head_surveyor'"
                  type="button"
                  class="text-xs text-red-700 hover:underline disabled:opacity-50"
                  :disabled="busy"
                  @click="end(c.code, m)"
                >End today</button>
              </td>
            </tr>
            <tr v-if="!(panels[c.code] || []).length"><td colspan="5" class="px-3 py-4 text-center text-gray-500">No one is appointed yet.</td></tr>
          </tbody>
        </table>
      </div>

      <form class="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-6 gap-3" @submit.prevent="submit(c.code)">
        <h4 class="sm:col-span-6 text-sm font-semibold text-gray-800">Appoint someone to {{ c.code }}</h4>
        <label class="sm:col-span-3 text-xs text-gray-600">Their SurveyPro email
          <input v-model.trim="form[c.code].email" type="email" required autocomplete="off" class="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
        </label>
        <label class="sm:col-span-3 text-xs text-gray-600">Role
          <select v-model="form[c.code].role" class="mt-1 w-full border rounded px-2 py-1.5 text-sm">
            <option value="surveyor">Surveyor</option>
            <option value="reviewer">Reviewer</option>
          </select>
        </label>
        <label v-if="form[c.code].role === 'surveyor'" class="sm:col-span-2 text-xs text-gray-600">Engagement
          <select v-model="form[c.code].engagement" class="mt-1 w-full border rounded px-2 py-1.5 text-sm">
            <option value="employed">Employed by the council</option>
            <option value="contracted">Contracted</option>
          </select>
        </label>
        <label class="sm:col-span-2 text-xs text-gray-600">From <span class="text-gray-400">(optional)</span>
          <input v-model="form[c.code].valid_from" type="date" class="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
        </label>
        <label class="sm:col-span-2 text-xs text-gray-600">Until <span class="text-gray-400">(optional, first day it no longer applies)</span>
          <input v-model="form[c.code].valid_to" type="date" class="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
        </label>
        <label class="sm:col-span-6 text-xs text-gray-600">Note <span class="text-gray-400">(optional, e.g. the contract)</span>
          <input v-model.trim="form[c.code].note" type="text" maxlength="500" class="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
        </label>
        <div class="sm:col-span-6 flex items-center gap-3">
          <button type="submit" :disabled="busy" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            Appoint
          </button>
          <p v-if="notice[c.code]" class="text-sm" :class="notice[c.code].ok ? 'text-green-700' : 'text-red-700'" role="status">{{ notice[c.code].text }}</p>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { appoint, endAppointment, errorMessage, headOf, listMembers, myAppointments, type Member, type MemberRole, type MyAppointment, type NewMember } from '../../services/council'
import { formatDateDDMMYYYY } from '../../utils/dateFormat'

const ROLE_LABEL: Record<MemberRole, string> = { surveyor: 'Surveyor', head_surveyor: 'Head surveyor', reviewer: 'Reviewer' }
const date = (d: string) => formatDateDDMMYYYY(new Date(d))

const mine = ref<MyAppointment[]>([])
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const panels = reactive<Record<string, Member[]>>({})
const notice = reactive<Record<string, { ok: boolean; text: string }>>({})
const form = reactive<Record<string, { email: string; role: 'surveyor' | 'reviewer'; engagement: 'employed' | 'contracted'; valid_from: string; valid_to: string; note: string }>>({})

// each council once, even if the person holds several appointments there
const heads = computed(() => {
  const seen = new Set<string>()
  return headOf(mine.value).filter((a) => (seen.has(a.code) ? false : (seen.add(a.code), true)))
})

async function loadPanel(code: string) {
  try { panels[code] = await listMembers(code) }
  catch (e) { notice[code] = { ok: false, text: errorMessage(e) } }
}

onMounted(async () => {
  try {
    mine.value = await myAppointments()
    for (const c of heads.value) {
      form[c.code] = { email: '', role: 'surveyor', engagement: 'contracted', valid_from: '', valid_to: '', note: '' }
      await loadPanel(c.code)
    }
  } catch (e) {
    loadError.value = errorMessage(e, 'Your appointments could not be loaded.')
  } finally {
    loading.value = false
  }
})

async function submit(code: string) {
  const f = form[code]
  const body: NewMember = { email: f.email, role: f.role }
  if (f.role === 'surveyor') body.engagement = f.engagement
  if (f.valid_from) body.valid_from = f.valid_from
  if (f.valid_to) body.valid_to = f.valid_to
  if (f.note) body.note = f.note
  busy.value = true
  try {
    await appoint(code, body)
    notice[code] = { ok: true, text: `${f.email} is appointed.` }
    form[code] = { ...f, email: '', note: '', valid_from: '', valid_to: '' }
    await loadPanel(code)
  } catch (e) {
    notice[code] = { ok: false, text: errorMessage(e) }
  } finally {
    busy.value = false
  }
}

async function end(code: string, m: Member) {
  if (!window.confirm(`End ${m.email}'s appointment today? They lose access to ${code} work from today.`)) return
  busy.value = true
  try {
    await endAppointment(code, m.id)
    notice[code] = { ok: true, text: `${m.email}'s appointment has ended.` }
    await loadPanel(code)
  } catch (e) {
    notice[code] = { ok: false, text: errorMessage(e) }
  } finally {
    busy.value = false
  }
}
</script>
