<template>
  <div v-if="module" class="space-y-4">
    <div class="flex items-center gap-3">
      <span class="text-4xl" aria-hidden="true">{{ module.icon }}</span>
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">{{ module.title }}</h2>
        <p class="text-sm text-gray-600 max-w-prose">{{ module.description }}</p>
      </div>
    </div>

    <div v-if="module.comingSoon" class="p-3 rounded border border-dashed bg-yellow-50 text-yellow-900 text-sm">
      This module is marked as “Coming Soon”. Features will unlock over upcoming releases.
    </div>

    <section class="space-y-2" aria-labelledby="submenu-heading">
      <h3 id="submenu-heading" class="text-sm font-semibold uppercase tracking-wide text-gray-700">Submenus</h3>
      <ul class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        <li v-for="submenu in submenus" :key="submenu.slug">
          <button
            type="button"
            class="w-full text-left px-3 py-2 rounded bg-white border shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            :disabled="submenu.disabled"
          >
            <span class="block text-xs font-medium">{{ submenu.title }}</span>
            <span v-if="submenu.badge" class="mt-0.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{{ submenu.badge }}</span>
          </button>
        </li>
      </ul>
      <p v-if="!submenus.length" class="text-xs text-gray-500">No submenus defined yet.</p>
    </section>
  </div>
  <div v-else class="text-sm text-gray-500">Module not found.</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useModulesStore } from '../stores/modules'

const route = useRoute()
const store = useModulesStore()

const module = computed(() => store.getBySlug(route.params.slug as string))

const submenus = computed(() => module.value?.submenus || [])
</script>
