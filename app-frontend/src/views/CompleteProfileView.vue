<template>
  <div class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-rose-50 flex items-center justify-center px-4 py-8">
    <div class="w-full max-w-2xl">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-600 to-rose-500 rounded-2xl mb-4 shadow-lg">
          <span class="text-3xl">👤</span>
        </div>
        <h1 class="text-3xl font-bold text-gray-900 mb-2">Complete Your Profile</h1>
        <p class="text-gray-600">Tell us about yourself to get started with SurveyPro</p>
      </div>

      <!-- Profile Form Card -->
      <div class="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
        <div class="p-8">
          <form @submit.prevent="handleSubmit" class="space-y-6">
            <!-- Surveyor Type Selection -->
            <div>
              <label class="block text-sm font-semibold text-gray-900 mb-3">
                I am a: <span class="text-red-500">*</span>
              </label>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  @click="formData.surveyorType = 'registered'"
                  :class="[
                    'p-4 border-2 rounded-lg text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500',
                    formData.surveyorType === 'registered'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-300 hover:border-gray-400'
                  ]"
                >
                  <div class="font-semibold text-gray-900">Registered Surveyor</div>
                  <div class="text-xs text-gray-600 mt-1">Licensed professional</div>
                </button>
                
                <button
                  type="button"
                  @click="formData.surveyorType = 'in_training'"
                  :class="[
                    'p-4 border-2 rounded-lg text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500',
                    formData.surveyorType === 'in_training'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-300 hover:border-gray-400'
                  ]"
                >
                  <div class="font-semibold text-gray-900">Surveyor-in-Training</div>
                  <div class="text-xs text-gray-600 mt-1">Under supervision</div>
                </button>
                
                <button
                  type="button"
                  @click="formData.surveyorType = 'technician'"
                  :class="[
                    'p-4 border-2 rounded-lg text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500',
                    formData.surveyorType === 'technician'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-300 hover:border-gray-400'
                  ]"
                >
                  <div class="font-semibold text-gray-900">Survey Technician</div>
                  <div class="text-xs text-gray-600 mt-1">Technical specialist</div>
                </button>
                
                <button
                  type="button"
                  @click="formData.surveyorType = 'student'"
                  :class="[
                    'p-4 border-2 rounded-lg text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500',
                    formData.surveyorType === 'student'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-300 hover:border-gray-400'
                  ]"
                >
                  <div class="font-semibold text-gray-900">Student Surveyor</div>
                  <div class="text-xs text-gray-600 mt-1">Currently studying</div>
                </button>
              </div>
            </div>

            <div class="border-t pt-6"></div>

            <!-- Basic Information -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div class="md:col-span-2">
                <label for="name" class="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name <span class="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  v-model="formData.name"
                  type="text"
                  required
                  placeholder="John Doe"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <!-- Conditional Fields based on Surveyor Type -->
              <div v-if="formData.surveyorType === 'registered'">
                <label for="license-number" class="block text-sm font-medium text-gray-700 mb-1.5">
                  License Number <span class="text-red-500">*</span>
                </label>
                <input
                  id="license-number"
                  v-model="formData.licenseNumber"
                  type="text"
                  required
                  placeholder="LS-1234"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div v-if="formData.surveyorType === 'in_training'">
                <label for="registration-number" class="block text-sm font-medium text-gray-700 mb-1.5">
                  Registration Number
                </label>
                <input
                  id="registration-number"
                  v-model="formData.registrationNumber"
                  type="text"
                  placeholder="SIT-5678"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div v-if="formData.surveyorType === 'student'">
                <label for="student-number" class="block text-sm font-medium text-gray-700 mb-1.5">
                  Student Number <span class="text-red-500">*</span>
                </label>
                <input
                  id="student-number"
                  v-model="formData.studentNumber"
                  type="text"
                  required
                  placeholder="STU-2024-001"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div v-if="formData.surveyorType === 'student'">
                <label for="institution" class="block text-sm font-medium text-gray-700 mb-1.5">
                  Institution
                </label>
                <input
                  id="institution"
                  v-model="formData.institution"
                  type="text"
                  placeholder="University of Zimbabwe"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div v-if="formData.surveyorType === 'registered' || formData.surveyorType === 'in_training'">
                <label for="firm" class="block text-sm font-medium text-gray-700 mb-1.5">
                  Firm / Company
                </label>
                <input
                  id="firm"
                  v-model="formData.firm"
                  type="text"
                  placeholder="Survey Company Ltd"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label for="phone" class="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone Number
                </label>
                <input
                  id="phone"
                  v-model="formData.phone"
                  type="tel"
                  placeholder="+263 77 123 4567"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div class="md:col-span-2">
                <label for="address" class="block text-sm font-medium text-gray-700 mb-1.5">
                  Address
                </label>
                <textarea
                  id="address"
                  v-model="formData.address"
                  rows="2"
                  placeholder="123 Survey Street, Harare"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                ></textarea>
              </div>
            </div>

            <!-- Error Display -->
            <div v-if="error" class="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm text-red-700 flex items-center gap-2">
                <span>⚠️</span>
                <span>{{ error }}</span>
              </p>
            </div>

            <!-- Actions -->
            <div class="flex gap-3 pt-4">
              <button
                type="button"
                @click="handleSkip"
                class="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Skip for Now
              </button>
              <button
                type="submit"
                :disabled="loading || !isFormValid"
                class="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-3 px-4 rounded-lg font-medium hover:from-indigo-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
              >
                <span v-if="loading" class="flex items-center justify-center gap-2">
                  <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
                <span v-else>Complete Profile</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../services/api'

const auth = useAuthStore()
const router = useRouter()

const loading = ref(false)
const error = ref<string | null>(null)

const formData = ref({
  surveyorType: '' as 'registered' | 'in_training' | 'technician' | 'student' | '',
  name: '',
  licenseNumber: '',
  registrationNumber: '',
  studentNumber: '',
  firm: '',
  address: '',
  phone: '',
  institution: ''
})

const isFormValid = computed(() => {
  if (!formData.value.name || !formData.value.surveyorType) return false
  
  // Type-specific validation
  if (formData.value.surveyorType === 'registered' && !formData.value.licenseNumber) return false
  if (formData.value.surveyorType === 'student' && !formData.value.studentNumber) return false
  
  return true
})

async function handleSubmit() {
  if (!isFormValid.value) return
  
  loading.value = true
  error.value = null
  
  try {
    const payload = {
      name: formData.value.name,
      surveyorType: formData.value.surveyorType,
      licenseNumber: formData.value.licenseNumber || undefined,
      registrationNumber: formData.value.registrationNumber || undefined,
      studentNumber: formData.value.studentNumber || undefined,
      firm: formData.value.firm || undefined,
      address: formData.value.address || undefined,
      phone: formData.value.phone || undefined,
      institution: formData.value.institution || undefined
    }
    
    const response = await api.post('/surveyor-profiles', payload)
    
    if (response.data) {
      // Refresh profile in auth store
      await auth.fetchProfile()
      
      console.log('✅ Profile created successfully')
      router.push('/dashboard')
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to create profile. Please try again.'
    console.error('Profile creation error:', err)
  } finally {
    loading.value = false
  }
}

function handleSkip() {
  router.push('/dashboard')
}
</script>

<script lang="ts">
export default { name: 'CompleteProfileView' }
</script>
