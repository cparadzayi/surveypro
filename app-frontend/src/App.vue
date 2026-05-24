<template>
  <div class="min-h-screen flex flex-col md:flex-row bg-gray-50">
    <!-- Side Navigation (only show when authenticated) -->
    <SideNav v-if="isAuthed" :open="navOpen" @toggle="toggleNav" />

    <!-- Main Column -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header (only show when authenticated) -->
      <header v-if="isAuthed" class="bg-white border-b p-4 flex items-center gap-4 sticky top-0 z-20">
        <button
          class="md:hidden p-2 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          @click="toggleNav"
          aria-label="Toggle navigation"
        >
          <span v-if="!navOpen">☰</span>
          <span v-else>✕</span>
        </button>
        <h1 class="text-xl font-semibold tracking-tight flex-1">SurveyPro</h1>
        <nav class="flex gap-4 items-center">
          <RouterLink to="/dashboard" class="text-sm text-gray-600 hover:text-gray-900 hover:underline">Dashboard</RouterLink>
          <button @click="handleLogout" class="text-sm text-red-600 hover:text-red-700 hover:underline font-medium">Logout</button>
        </nav>
      </header>
      
      <!-- Surveyor Info Banner -->
      <div v-if="isSurveyor && currentSurveyor" :class="[
        'border-b px-4 py-2 sticky top-[73px] z-10',
        currentSurveyor.surveyor_type === 'registered' ? 'bg-blue-50 border-blue-200' :
        currentSurveyor.surveyor_type === 'in_training' ? 'bg-yellow-50 border-yellow-200' :
        currentSurveyor.surveyor_type === 'technician' ? 'bg-purple-50 border-purple-200' :
        'bg-green-50 border-green-200'
      ]">
        <div class="max-w-7xl mx-auto flex items-center justify-between text-sm">
          <div class="flex items-center gap-3">
            <!-- Icon based on surveyor type -->
            <svg v-if="currentSurveyor.surveyor_type === 'registered'" class="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <svg v-else-if="currentSurveyor.surveyor_type === 'in_training'" class="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <svg v-else-if="currentSurveyor.surveyor_type === 'technician'" class="w-5 h-5 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <svg v-else class="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            
            <div class="flex flex-wrap items-center gap-2">
              <span :class="[
                'font-semibold',
                currentSurveyor.surveyor_type === 'registered' ? 'text-blue-900' :
                currentSurveyor.surveyor_type === 'in_training' ? 'text-yellow-900' :
                currentSurveyor.surveyor_type === 'technician' ? 'text-purple-900' :
                'text-green-900'
              ]">{{ currentSurveyor.name }}</span>
              
              <span :class="[
                currentSurveyor.surveyor_type === 'registered' ? 'text-blue-400' :
                currentSurveyor.surveyor_type === 'in_training' ? 'text-yellow-400' :
                currentSurveyor.surveyor_type === 'technician' ? 'text-purple-400' :
                'text-green-400'
              ]">•</span>
              
              <!-- Display appropriate credential -->
              <span v-if="currentSurveyor.license_number" :class="[
                currentSurveyor.surveyor_type === 'registered' ? 'text-blue-700' : 'text-gray-700'
              ]">
                License: {{ currentSurveyor.license_number }}
              </span>
              <span v-else-if="currentSurveyor.registration_number" class="text-yellow-700">
                Reg: {{ currentSurveyor.registration_number }}
              </span>
              <span v-else-if="currentSurveyor.student_number" class="text-green-700">
                Student: {{ currentSurveyor.student_number }}
              </span>
              
              <template v-if="currentSurveyor.firm">
                <span :class="[
                  currentSurveyor.surveyor_type === 'registered' ? 'text-blue-400' :
                  currentSurveyor.surveyor_type === 'in_training' ? 'text-yellow-400' :
                  currentSurveyor.surveyor_type === 'technician' ? 'text-purple-400' :
                  'text-green-400'
                ]">•</span>
                <span :class="[
                  currentSurveyor.surveyor_type === 'registered' ? 'text-blue-700' :
                  currentSurveyor.surveyor_type === 'in_training' ? 'text-yellow-700' :
                  currentSurveyor.surveyor_type === 'technician' ? 'text-purple-700' :
                  'text-green-700'
                ]">{{ currentSurveyor.firm }}</span>
              </template>
              
              <!-- Type badge -->
              <span :class="[
                'px-2 py-0.5 text-xs rounded-full font-medium',
                currentSurveyor.surveyor_type === 'registered' ? 'bg-blue-100 text-blue-800' :
                currentSurveyor.surveyor_type === 'in_training' ? 'bg-yellow-100 text-yellow-800' :
                currentSurveyor.surveyor_type === 'technician' ? 'bg-purple-100 text-purple-800' :
                'bg-green-100 text-green-800'
              ]">
                {{ formatSurveyorType(currentSurveyor.surveyor_type) }}
              </span>
            </div>
          </div>
          <div :class="[
            'text-xs hidden sm:block',
            currentSurveyor.surveyor_type === 'registered' ? 'text-blue-600' :
            currentSurveyor.surveyor_type === 'in_training' ? 'text-yellow-600' :
            currentSurveyor.surveyor_type === 'technician' ? 'text-purple-600' :
            'text-green-600'
          ]">
            {{ formatSurveyorType(currentSurveyor.surveyor_type) }}
          </div>
        </div>
      </div>
      
      <main :class="isAuthed ? 'flex-1 p-4 sm:p-6' : 'flex-1'">
        <RouterView />
      </main>
      <footer v-if="isAuthed" class="text-center text-xs text-gray-500 py-4">&copy; {{ new Date().getFullYear() }} SurveyPro</footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './stores/auth'
// @ts-ignore - SFC default export provided via shim
import SideNav from './components/SideNav.vue'

const auth = useAuthStore()
const { isAuthed, isSurveyor, currentSurveyor } = storeToRefs(auth)

function handleLogout() {
  auth.logout()
  window.location.href = '/landing'
}

// Nav state
const navOpen = ref(false)
function toggleNav() { navOpen.value = !navOpen.value }

// Format surveyor type for display
function formatSurveyorType(type: string): string {
  const typeMap: Record<string, string> = {
    'registered': 'Registered Surveyor',
    'in_training': 'Surveyor-in-Training',
    'technician': 'Survey Technician',
    'student': 'Student Surveyor'
  }
  return typeMap[type] || type
}

// Auto-close nav on route change (mobile)
watch(() => window.location.pathname, () => { if (navOpen.value) navOpen.value = false })
</script>

<style scoped>
</style>
