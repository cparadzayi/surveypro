<template>
  <ModuleScaffold title="Least Squares" description="Network adjustments & precision analysis." :breadcrumbs="[{label:'Least Squares'}]">
    <p class="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 p-3 rounded">All features in this module are planned. Placeholder views scaffolded for future releases.</p>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
      <RouterLink v-for="s in submenus" :key="s.slug" :to="`/modules/least-squares/${s.slug}`" class="p-3 rounded border bg-white shadow-sm hover:bg-gray-50 text-xs" :class="{'opacity-60 pointer-events-none': s.disabled}">
        <div class="font-medium">{{ s.title }}</div>
        <div v-if="s.description" class="mt-0.5 text-[10px] text-gray-500 line-clamp-2">{{ s.description }}</div>
        <span v-if="s.badge" class="inline-block mt-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px]">{{ s.badge }}</span>
      </RouterLink>
    </div>
  </ModuleScaffold>
</template>
<script setup lang="ts">
import ModuleScaffold from '../../../components/scaffold/ModuleScaffold.vue'
import { computed } from 'vue'
import { useModulesStore } from '../../../stores/modules'
const store = useModulesStore()
const module = computed(()=> store.getBySlug('least-squares'))
const submenus = computed(()=> module.value?.submenus || [])
</script>
