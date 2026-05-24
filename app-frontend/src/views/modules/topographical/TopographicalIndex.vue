<template>
  <ModuleScaffold title="Topographical" description="Terrain points, surfaces & contour utilities." :breadcrumbs="[{label:'Topographical'}]">
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      <RouterLink v-for="s in submenus" :key="s.slug" :to="`/modules/topographical/${s.slug}`" class="p-3 rounded border bg-white shadow-sm hover:bg-gray-50 text-xs">
        <div class="font-medium">{{ s.title }}</div>
        <div v-if="s.description" class="mt-0.5 text-[10px] text-gray-500 line-clamp-2">{{ s.description }}</div>
        <span v-if="s.badge" class="inline-block mt-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">{{ s.badge }}</span>
        <span v-if="s.disabled" class="inline-block mt-1 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[10px]">Disabled</span>
      </RouterLink>
    </div>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import ModuleScaffold from '../../../components/scaffold/ModuleScaffold.vue'
import { computed } from 'vue'
import { useModulesStore } from '../../../stores/modules'
const store = useModulesStore()
const module = computed(()=> store.getBySlug('topographical'))
const submenus = computed(()=> module.value?.submenus || [])
</script>
