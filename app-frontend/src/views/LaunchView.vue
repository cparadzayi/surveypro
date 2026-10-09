<template>
  <div class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-rose-50 flex items-center justify-center px-4 py-8">
    <div class="w-full max-w-md bg-white shadow-xl rounded-2xl border border-gray-100 p-8 text-center" role="status" aria-live="polite">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">SurveyPro</h1>

      <template v-if="state === 'working'">
        <p class="text-gray-600">Opening your job from the council…</p>
      </template>

      <template v-else-if="state === 'done'">
        <p class="text-gray-900 font-medium mb-1">{{ job?.projectName }}</p>
        <p class="text-gray-600 text-sm">Opening the project…</p>
      </template>

      <template v-else>
        <p class="text-red-700 font-medium mb-2">{{ title }}</p>
        <p class="text-gray-600 text-sm mb-6">{{ message }}</p>
        <router-link to="/landing" class="inline-block px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          Go to sign in
        </router-link>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// The landing page for a job opened from VunGIS: /launch?token=...
//
// The token (signed by VunGIS, single use, ten minutes) is exchanged for a SurveyPro session and a project. Every way this can fail is
// one a surveyor can do something about, so each says what to do next (backend: routes/launch.js). The token is removed from the
// address bar straight away so it is not left in history.
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'
import { useAuthStore } from '../stores/auth'
import { useProjectSelectionStore } from '../stores/projectSelection'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const selection = useProjectSelectionStore()

const state = ref<'working' | 'done' | 'failed'>('working')
const title = ref('')
const message = ref('')
const job = ref<{ projectName: string } | null>(null)

const TITLES: Record<string, string> = {
  invalid_launch_token: 'This link cannot be used',
  launch_token_used: 'This link has already been used',
  no_surveypro_account: 'You need a SurveyPro account',
  no_surveyor_profile: 'Finish setting up your profile',
  not_appointed: 'You are not appointed to this council',
  unknown_authority: 'This council is not set up in SurveyPro',
  launch_not_configured: 'SurveyPro is not connected to the council system yet',
  tenancy_not_installed: 'SurveyPro is not ready for councils yet',
}

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  // out of the address bar and the history before anything else
  router.replace({ path: '/launch' }).catch(() => {})
  if (!token) {
    state.value = 'failed'; title.value = 'This link cannot be used'; message.value = 'Open the job again from the council system.'
    return
  }
  try {
    const { data } = await api.post('/auth/launch', { token })
    auth.token = data.token
    localStorage.setItem('token', data.token)
    await auth.fetchProfile()
    // load the project the way the rest of the application sees it, then select it
    let project: any = { id: data.project.id, name: data.project.name }
    try {
      const res = await api.get(`/survey-projects/${data.project.id}`)
      project = res.data?.data || res.data?.project || res.data || project
    } catch { /* the id and name are enough to select it */ }
    if (project.surveyor_profile_id == null && auth.surveyorId != null) project.surveyor_profile_id = auth.surveyorId
    selection.selectProject(project)
    job.value = { projectName: data.project.name }
    state.value = 'done'
    await router.replace('/modules/cadastral-standard/workflow')
  } catch (e: any) {
    const body = e?.response?.data || {}
    state.value = 'failed'
    title.value = TITLES[body.error] || 'Could not open the job'
    message.value = body.message || e?.message || 'Open the job again from the council system.'
  }
})
</script>
