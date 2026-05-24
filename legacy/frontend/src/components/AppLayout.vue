<template>
  <div class="flex flex-col h-screen bg-gray-50">
    <!-- Top Navigation Bar (Mobile) -->
    <header class="bg-white shadow-sm border-b border-gray-200 md:hidden">
      <div class="flex items-center justify-between px-4 py-3">
        <h1 class="text-xl font-bold text-primary-700">SurveyPro</h1>
        <button
          @click="showMobileMenu = !showMobileMenu"
          class="p-2 rounded-lg hover:bg-gray-100"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar (Desktop) -->
      <aside class="hidden md:flex md:flex-col w-64 bg-white border-r border-gray-200">
        <div class="p-4 border-b border-gray-200">
          <h1 class="text-2xl font-bold text-primary-700">SurveyPro</h1>
          <!-- Auth removed: user email placeholder -->
        </div>

        <nav class="flex-1 p-4 space-y-2 overflow-y-auto">
          <RouterLink
            v-for="item in menuItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ 'nav-item-active': isActive(item.path) }"
          >
            <component :is="item.icon" class="w-5 h-5" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>

        <!-- Logout removed for MVP -->
      </aside>

      <!-- Mobile Menu Overlay -->
      <div
        v-if="showMobileMenu"
        class="fixed inset-0 z-50 md:hidden"
        @click="showMobileMenu = false"
      >
        <div class="absolute inset-0 bg-black/50"></div>
        <div class="absolute inset-y-0 left-0 w-64 bg-white" @click.stop>
          <div class="p-4 border-b border-gray-200">
            <h2 class="text-xl font-bold text-primary-700">Menu</h2>
            <!-- Auth removed -->
          </div>

          <nav class="p-4 space-y-2">
            <RouterLink
              v-for="item in menuItems"
              :key="item.path"
              :to="item.path"
              class="nav-item"
              :class="{ 'nav-item-active': isActive(item.path) }"
              @click="showMobileMenu = false"
            >
              <component :is="item.icon" class="w-5 h-5" />
              <span>{{ item.label }}</span>
            </RouterLink>

            <!-- Logout removed -->
          </nav>
        </div>
      </div>

      <!-- Main Content Area -->
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  DashboardIcon,
  ProjectsIcon,
  MapIcon,
  CalculatorIcon,
  UserIcon,
  HelpIcon
} from '@/components/icons'

const route = useRoute()
// Auth removed
const showMobileMenu = ref(false)

const menuItems = [
  { path: '/', label: 'Dashboard', icon: DashboardIcon },
  { path: '/projects', label: 'Projects', icon: ProjectsIcon },
  { path: '/map', label: 'Map View', icon: MapIcon },
  { path: '/computations', label: 'Computations', icon: CalculatorIcon },
  { path: '/profile', label: 'Profile', icon: UserIcon },
  { path: '/manual', label: 'User Manual', icon: HelpIcon }
]

const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(path)
}

// handleLogout removed
</script>
