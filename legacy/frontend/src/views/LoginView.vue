<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 px-4">
    <div class="w-full max-w-md">
      <div class="card">
        <div class="text-center mb-6">
          <h1 class="text-3xl font-bold text-primary-700 mb-2">SurveyPro</h1>
          <p class="text-gray-600">Professional Surveying & CAD</p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              id="email"
              v-model="credentials.email"
              type="email"
              required
              class="input"
              :class="{ 'input-error': authStore.error }"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              v-model="credentials.password"
              type="password"
              required
              class="input"
              :class="{ 'input-error': authStore.error }"
              placeholder="••••••••"
            />
          </div>

          <div v-if="authStore.error" class="p-3 bg-error/10 border border-error rounded-lg">
            <p class="text-error text-sm">{{ authStore.error }}</p>
          </div>

          <button
            type="submit"
            class="btn btn-primary w-full"
            :disabled="authStore.loading"
          >
            <span v-if="!authStore.loading">Sign In</span>
            <span v-else>Signing in...</span>
          </button>
        </form>

        <div class="mt-6 text-center">
          <p class="text-gray-600">
            Don't have an account?
            <RouterLink to="/register" class="text-primary-600 hover:text-primary-700 font-medium">
              Sign up
            </RouterLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { LoginCredentials } from '@/types'

const router = useRouter()
const authStore = useAuthStore()

const credentials = ref<LoginCredentials>({
  email: '',
  password: ''
})

async function handleLogin() {
  const success = await authStore.login(credentials.value)
  if (success) {
    router.push('/')
  }
}
</script>
