<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 px-4">
    <div class="w-full max-w-md">
      <div class="card">
        <div class="text-center mb-6">
          <h1 class="text-3xl font-bold text-primary-700 mb-2">Create Account</h1>
          <p class="text-gray-600">Join SurveyPro today</p>
        </div>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="first_name" class="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                id="first_name"
                v-model="formData.first_name"
                type="text"
                required
                class="input"
                placeholder="John"
              />
            </div>

            <div>
              <label for="last_name" class="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                id="last_name"
                v-model="formData.last_name"
                type="text"
                required
                class="input"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              id="email"
              v-model="formData.email"
              type="email"
              required
              class="input"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              v-model="formData.password"
              type="password"
              required
              minlength="8"
              class="input"
              placeholder="Minimum 8 characters"
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
            <span v-if="!authStore.loading">Create Account</span>
            <span v-else>Creating account...</span>
          </button>
        </form>

        <div class="mt-6 text-center">
          <p class="text-gray-600">
            Already have an account?
            <RouterLink to="/login" class="text-primary-600 hover:text-primary-700 font-medium">
              Sign in
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
import type { RegisterData } from '@/types'

const router = useRouter()
const authStore = useAuthStore()

const formData = ref<RegisterData>({
  email: '',
  password: '',
  first_name: '',
  last_name: ''
})

async function handleRegister() {
  const success = await authStore.register(formData.value)
  if (success) {
    router.push('/')
  }
}
</script>
