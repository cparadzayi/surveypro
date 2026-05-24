<template>
  <div class="flex items-center gap-2">
    <select v-model.number="projectId" class="rounded border px-2 py-1 text-sm">
      <option :value="0" disabled>Select project...</option>
      <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
    <select v-model.number="localLayerId" class="rounded border px-2 py-1 text-sm" :disabled="!projectId">
      <option :value="0" disabled>Select layer...</option>
      <option v-for="l in layers" :key="l.id" :value="l.id">{{ l.name }}<span v-if="l.srid"> (SRID {{ l.srid }})</span></option>
    </select>
    <span v-if="currentLayer" class="text-[11px] rounded border px-1.5 py-0.5 text-slate-600 bg-slate-50">SRID: {{ currentLayer.srid || 'none' }}</span>
    <div v-if="currentLayer && !currentLayer.srid" class="flex items-center gap-1 text-xs ml-2">
      <span class="text-slate-500">Set SRID:</span>
      <select v-model="srChoice" class="border rounded px-1 py-0.5">
        <option value="">Choose…</option>
        <option value="Lo25">Lo25 (22285)</option>
        <option value="Lo27">Lo27 (22287)</option>
        <option value="Lo29">Lo29 (22289)</option>
        <option value="Lo31">Lo31 (22291)</option>
        <option value="Lo33">Lo33 (22293)</option>
        <option value="custom">Custom…</option>
      </select>
      <input v-if="srChoice==='custom'" v-model.number="srCustom" type="number" class="border rounded px-1 py-0.5 w-24" placeholder="SRID" />
      <button class="px-2 py-0.5 bg-emerald-600 text-white rounded disabled:opacity-50" :disabled="!canApplySrid" @click="applySrid">Apply</button>
      <span v-if="srStatus" class="text-[11px] ml-1" :class="srStatusOk ? 'text-emerald-600' : 'text-red-600'">{{ srStatus }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { listProjects, listLayers, updateLayerSrid, type Project, type Layer } from '../../services/spatial'

const props = defineProps<{ modelValue?: number }>()
const emit = defineEmits<{ (e:'update:modelValue', v:number|undefined): void }>()

const projects = ref<Project[]>([])
const layers = ref<Layer[]>([])
const projectId = ref<number>(0)
const localLayerId = ref<number>(props.modelValue ?? 0)

async function refreshProjects() {
  projects.value = await listProjects().catch(() => [])
}
async function refreshLayers() {
  layers.value = projectId.value ? await listLayers(projectId.value).catch(() => []) : []
}

const currentLayer = computed(() => layers.value.find(l => l.id === localLayerId.value))

// SRID inline editor state
const srChoice = ref('')
const srCustom = ref<number | null>(null)
const srStatus = ref('')
const srStatusOk = ref(false)
const canApplySrid = computed(() => {
  if (!currentLayer.value) return false
  if (srChoice.value === 'custom') return !!srCustom.value
  return ['Lo25','Lo27','Lo29','Lo31','Lo33'].includes(srChoice.value)
})

async function applySrid() {
  if (!currentLayer.value) return
  try {
    const payload: any = {}
    if (srChoice.value === 'custom' && srCustom.value) payload.srid = srCustom.value
    else if (srChoice.value) payload.central_meridian = srChoice.value
    const updated = await updateLayerSrid(currentLayer.value.id, payload)
    srStatus.value = `Updated SRID to ${updated.srid}`
    srStatusOk.value = true
    // Refresh layers to reflect new SRID
    await refreshLayers()
  } catch (e:any) {
    srStatus.value = 'Failed to update SRID'
    srStatusOk.value = false
  }
}

watch(projectId, async () => {
  localLayerId.value = 0
  await refreshLayers()
  emit('update:modelValue', undefined)
})
watch(localLayerId, (v) => emit('update:modelValue', v || undefined))

onMounted(async () => {
  await refreshProjects()
})
</script>

<script lang="ts">
export default { name: 'LayerSelect' }
</script>
