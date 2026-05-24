<template>
  <div class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-rose-50 flex items-center justify-center px-4 py-8">
    <div class="w-full max-w-md">
      <!-- Logo & Welcome -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-600 to-rose-500 rounded-2xl mb-4 shadow-lg">
          <span class="text-3xl">📋</span>
        </div>
        <h1 class="text-3xl font-bold text-gray-900 mb-2">SurveyPro</h1>
        <p class="text-gray-600">Professional Land Survey Software</p>
      </div>

      <!-- Auth Card -->
      <div class="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
        <!-- Tabs -->
        <div class="flex border-b border-gray-200">
          <button
            @click="activeTab = 'login'"
            :class="[
              'flex-1 py-4 px-6 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500',
              activeTab === 'login' 
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            ]"
          >
            Login
          </button>
          <button
            @click="activeTab = 'register'"
            :class="[
              'flex-1 py-4 px-6 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500',
              activeTab === 'register' 
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            ]"
          >
            Register
          </button>
        </div>

        <!-- Tab Content -->
        <div class="p-8">
          <!-- Login Form -->
          <form v-if="activeTab === 'login'" @submit.prevent="handleLogin" class="space-y-5">
            <div>
              <label for="login-email" class="block text-sm font-medium text-gray-700 mb-1.5">
                Email Address
              </label>
              <input
                id="login-email"
                v-model="loginForm.email"
                type="email"
                required
                autocomplete="email"
                placeholder="surveyor@example.com"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              />
            </div>
            
            <div>
              <label for="login-password" class="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <input
                id="login-password"
                v-model="loginForm.password"
                type="password"
                required
                autocomplete="current-password"
                placeholder="••••••••"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div v-if="auth.error" class="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm text-red-700 flex items-center gap-2">
                <span>⚠️</span>
                <span>{{ auth.error }}</span>
              </p>
            </div>

            <button
              type="submit"
              :disabled="auth.loading"
              class="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-3 px-4 rounded-lg font-medium hover:from-indigo-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              <span v-if="auth.loading" class="flex items-center justify-center gap-2">
                <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Logging in...
              </span>
              <span v-else>Login</span>
            </button>

            <div class="text-center text-sm text-gray-600">
              <a href="#" class="text-indigo-600 hover:text-indigo-700 hover:underline">Forgot password?</a>
            </div>
          </form>

          <!-- Register Form -->
          <form v-if="activeTab === 'register'" @submit.prevent="handleRegister" class="space-y-5">
            <div>
              <label for="register-name" class="block text-sm font-medium text-gray-700 mb-1.5">
                Full Name
              </label>
              <input
                id="register-name"
                v-model="registerForm.name"
                type="text"
                required
                autocomplete="name"
                placeholder="John Surveyor"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              />
            </div>
            
            <div>
              <label for="register-email" class="block text-sm font-medium text-gray-700 mb-1.5">
                Email Address
              </label>
              <input
                id="register-email"
                v-model="registerForm.email"
                type="email"
                required
                autocomplete="email"
                placeholder="surveyor@example.com"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              />
            </div>
            
            <div>
              <label for="register-password" class="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <input
                id="register-password"
                v-model="registerForm.password"
                type="password"
                required
                autocomplete="new-password"
                minlength="6"
                placeholder="Min. 6 characters"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <label for="confirm-password" class="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                v-model="registerForm.confirmPassword"
                type="password"
                required
                autocomplete="new-password"
                minlength="6"
                placeholder="Re-enter password"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div v-if="passwordMismatch" class="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p class="text-sm text-amber-700 flex items-center gap-2">
                <span>⚠️</span>
                <span>Passwords do not match</span>
              </p>
            </div>

            <div v-if="auth.error" class="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm text-red-700 flex items-center gap-2">
                <span>⚠️</span>
                <span>{{ auth.error }}</span>
              </p>
            </div>

            <button
              type="submit"
              :disabled="auth.loading || passwordMismatch"
              class="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-3 px-4 rounded-lg font-medium hover:from-green-700 hover:to-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              <span v-if="auth.loading" class="flex items-center justify-center gap-2">
                <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating account...
              </span>
              <span v-else>Create Account</span>
            </button>

            <div class="text-xs text-gray-500 text-center">
              By registering, you agree to our Terms of Service and Privacy Policy
            </div>
          </form>
        </div>
      </div>

      <!-- Footer Info -->
      <div class="mt-8 text-center text-sm text-gray-600">
        <p class="mb-2">🌍 Supporting Professional Surveyors in Zimbabwe</p>
        <p class="text-xs text-gray-500">
          Registered • In-Training • Technicians • Students
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const activeTab = ref<'login' | 'register'>('login')

const loginForm = ref({
  email: '',
  password: ''
})

const registerForm = ref({
  name: '',
  email: '',
  password: '',
  confirmPassword: ''
})

const passwordMismatch = computed(() => 
  registerForm.value.password !== registerForm.value.confirmPassword && 
  registerForm.value.confirmPassword.length > 0
)

async function handleLogin() {
  await auth.login(loginForm.value.email, loginForm.value.password)
  
  if (auth.isAuthed) {
    // Small delay to ensure auth state is fully synchronized
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check if user has surveyor profile
    if (auth.isSurveyor) {
      console.log('🔐 Login successful, navigating to dashboard...')
      router.push('/dashboard')
    } else {
      // Redirect to profile completion
      router.push('/complete-profile')
    }
  }
}

async function handleRegister() {
  if (passwordMismatch.value) return
  
  await auth.register(
    registerForm.value.email, 
    registerForm.value.password,
    registerForm.value.name
  )
  
  if (auth.isAuthed) {
    // Registration successful with profile created
    console.log('✅ Registration successful, navigating to dashboard...')
    router.push('/dashboard')
  }
}
</script>

<script lang="ts">
export default { name: 'LandingView' }
</script>
