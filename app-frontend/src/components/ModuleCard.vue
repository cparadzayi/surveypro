<template>
  <button
    type="button"
    :class="[
      'relative w-full rounded-lg p-4 text-left shadow focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors flex flex-col gap-2',
      module.color,
      module.colorHover,
      module.text,
      module.border,
      'border'
    ]"
    @click="go"
    :aria-label="`${module.title} module`"
  >
    <div class="flex items-start justify-between">
      <span class="text-2xl leading-none" aria-hidden="true">{{ module.icon }}</span>
      <span v-if="module.comingSoon" class="text-[10px] uppercase font-semibold bg-black/20 px-2 py-0.5 rounded">Soon</span>
    </div>
    <h3 class="text-base font-semibold tracking-tight">
      {{ module.short }}
    </h3>
    <p class="text-xs leading-snug line-clamp-3 opacity-90">
      {{ module.description }}
    </p>
  </button>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { SurveyModule } from '../stores/modules'

const props = defineProps<{ module: SurveyModule }>()
const router = useRouter()
function go() {
  router.push(`/modules/${props.module.slug}`)
}
</script>

<script lang="ts">
export default { name: 'ModuleCard' }
</script>

<style scoped>
/* Mobile-first fine-tuning */
button { min-height: 120px; }
@media (min-width: 640px) { button { min-height: 140px; } }
</style>
