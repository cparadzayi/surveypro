<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
      <h1 class="text-2xl font-bold text-gray-900">Set a new password</h1>

      <!-- Done -->
      <div v-if="done" class="mt-6 space-y-4" role="status">
        <p class="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
          Your password has been changed. You can now sign in with it.
        </p>
        <RouterLink to="/landing" class="block w-full text-center bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
          Go to sign in
        </RouterLink>
      </div>

      <!-- No link -->
      <div v-else-if="!token" class="mt-6 space-y-4" role="alert">
        <p class="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          This page needs a reset link from your SurveyPro administrator. Open the link they sent you, or ask for a new one.
        </p>
        <RouterLink to="/landing" class="text-sm text-indigo-600 hover:underline">Back to sign in</RouterLink>
      </div>

      <!-- The form -->
      <form v-else class="mt-6 space-y-4" @submit.prevent="submit" novalidate>
        <div>
          <label for="new-password" class="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
          <input
            id="new-password" v-model="password" type="password" autocomplete="new-password" required
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label for="confirm-new-password" class="block text-sm font-medium text-gray-700 mb-1.5">Type it again</label>
          <input
            id="confirm-new-password" v-model="confirm" type="password" autocomplete="new-password" required
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <p v-if="error" class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">{{ error }}</p>
        <button
          type="submit" :disabled="busy"
          class="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >{{ busy ? 'Saving…' : 'Change password' }}</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { describeError } from '@/utils/errorMessage'
import { passwordProblem } from '@/utils/passwordResetLink'

const route = useRoute()
const router = useRouter()

// The link carries the secret in its query string. Keep it in memory and take it out of the address
// bar at once, so it does not sit in the browser history, a screenshot or a shared tab.
const token = ref(typeof route.query.token === 'string' ? route.query.token : '')
if (route.query.token !== undefined) void router.replace({ path: route.path })

const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)
const done = ref(false)

async function submit() {
  error.value = passwordProblem(password.value, confirm.value) ?? ''
  if (error.value) return
  busy.value = true
  try {
    await api.post('/auth/password-reset', { token: token.value, password: password.value })
    done.value = true
    token.value = ''
    password.value = ''
    confirm.value = ''
  } catch (e: any) {
    // The server's sentence ("invalid or has expired ...") is already the right one to show.
    error.value = e?.response?.data?.message || describeError(e, 'The password could not be changed.').message
  } finally {
    busy.value = false
  }
}
</script>
