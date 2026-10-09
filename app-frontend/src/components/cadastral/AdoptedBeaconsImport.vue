<template>
  <div class="bg-white border border-gray-200 rounded-lg p-6">
    <div class="flex items-start justify-between mb-4">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">
          🏛️ Adopted Beacons
          <span class="text-sm font-normal text-gray-500">(optional)</span>
        </h3>
        <p class="mt-1 text-sm text-gray-600 max-w-2xl">
          Beacons carried forward from a previous approved survey, cited by that
          survey's record number (e.g. 112/2021). They are never visited in the
          field, so they do not appear in the Field Book or Calculations Part 1 —
          they are added to the Co-ordinate List under
          <strong>ADOPTED BEACONS</strong>, after the trig beacons.
        </p>
      </div>
      <button
        @click="downloadTemplate"
        class="ml-4 shrink-0 inline-flex items-center px-3 py-2 border border-blue-300 text-blue-700 text-sm font-medium rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        📥 Template
      </button>
    </div>

    <!-- Currently saved set -->
    <div
      v-if="saved.length > 0"
      class="mb-4 flex items-center justify-between bg-green-50 border border-green-200 rounded-md px-4 py-2"
    >
      <p class="text-sm text-green-800">
        ✅ {{ saved.length }} adopted beacon{{ saved.length === 1 ? '' : 's' }} saved
        <span class="text-green-600">
          ({{ savedSrNumbers }})
        </span>
      </p>
      <button
        @click="clearAll"
        :disabled="saving"
        class="text-sm text-red-600 hover:text-red-800 font-medium"
      >
        Remove all
      </button>
    </div>

    <!-- Upload -->
    <div class="flex items-center gap-3">
      <input
        ref="fileInputRef"
        type="file"
        accept=".csv,text/csv"
        class="hidden"
        @change="handleFileChange"
      />
      <button
        @click="fileInputRef?.click()"
        :disabled="!projectId || saving"
        :class="projectId && !saving
          ? 'bg-purple-600 hover:bg-purple-700'
          : 'bg-gray-400 cursor-not-allowed'"
        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        📤 {{ parsed.length > 0 ? 'Choose a different file' : 'Upload adopted beacons CSV' }}
      </button>
      <span v-if="fileName" class="text-sm text-gray-500">{{ fileName }}</span>
    </div>
    <p v-if="!projectId" class="mt-2 text-sm text-amber-600">
      ⚠️ Select a project first
    </p>

    <!-- Errors -->
    <div v-if="errors.length > 0" class="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
      <h4 class="text-sm font-semibold text-red-900 mb-2">
        ⚠️ {{ errors.length }} problem{{ errors.length === 1 ? '' : 's' }} — nothing was saved
      </h4>
      <ul class="list-disc list-inside text-sm text-red-800 space-y-1">
        <li v-for="(error, i) in errors.slice(0, 10)" :key="i">{{ error }}</li>
        <li v-if="errors.length > 10" class="text-red-600">
          … and {{ errors.length - 10 }} more
        </li>
      </ul>
    </div>

    <!-- Reclassification: these names are currently live observations of this
         survey (they were entered as found beacons/pegs by mistake). Saving
         removes them from this survey's fieldwork and adopts them instead. -->
    <div
      v-if="conflicts.length > 0 && errors.length === 0"
      class="mt-4 bg-amber-50 border border-amber-300 rounded-md p-4"
    >
      <h4 class="text-sm font-semibold text-amber-900 mb-1">
        ♻️ {{ conflicts.length }} of these {{ conflicts.length === 1 ? 'is' : 'are' }}
        already {{ conflicts.length === 1 ? 'a live observation' : 'live observations' }}
        of this survey
      </h4>
      <p class="text-sm text-amber-800">
        They will be removed from this survey's imported points, field book,
        calculations and co-ordinate list — then added under
        <strong>ADOPTED BEACONS</strong>. Do this only if they were entered as
        observed beacons by mistake.
      </p>
      <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-amber-900 font-mono">
        <li v-for="(c, i) in conflicts.slice(0, 20)" :key="i">
          {{ c.pointName }}
          <span class="text-amber-600 not-italic">(row {{ c.rowNumber }})</span>
        </li>
        <li v-if="conflicts.length > 20" class="text-amber-700">
          … and {{ conflicts.length - 20 }} more
        </li>
      </ul>
      <label class="mt-3 flex items-start gap-2 text-sm text-amber-900 cursor-pointer">
        <input
          v-model="reclassifyConfirmed"
          type="checkbox"
          class="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
        />
        <span>
          Yes — remove these {{ conflicts.length }} point{{ conflicts.length === 1 ? '' : 's' }}
          from this survey and adopt them.
        </span>
      </label>
    </div>

    <!-- Preview -->
    <div v-if="parsed.length > 0 && errors.length === 0" class="mt-4">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-sm font-semibold text-gray-900">
          Preview — {{ parsed.length }} beacon{{ parsed.length === 1 ? '' : 's' }}
        </h4>
        <button
          @click="save"
          :disabled="saving || (conflicts.length > 0 && !reclassifyConfirmed)"
          :class="saving || (conflicts.length > 0 && !reclassifyConfirmed)
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-700'"
          class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {{ saveLabel }}
        </button>
      </div>
      <div class="overflow-x-auto border border-gray-200 rounded-md max-h-72 overflow-y-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">S.R. No.</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Point</th>
              <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Y</th>
              <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">X</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">F/B</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(point, i) in parsed" :key="i">
              <td class="px-3 py-1.5 font-mono text-xs">{{ point.srNumber }}</td>
              <td class="px-3 py-1.5 font-medium">{{ point.pointName }}</td>
              <td class="px-3 py-1.5 text-right font-mono text-xs">{{ point.y.toFixed(3) }}</td>
              <td class="px-3 py-1.5 text-right font-mono text-xs">{{ point.x.toFixed(3) }}</td>
              <td class="px-3 py-1.5">{{ point.status || '—' }}</td>
              <td class="px-3 py-1.5 text-gray-600">{{ point.description || '—' }}</td>
              <td class="px-3 py-1.5 text-gray-600">{{ formatAdoptedSurveyDate(point.dateRaw) || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-gray-500">
        Saving replaces the whole adopted set for this project with these rows.
      </p>
    </div>

    <p v-if="statusMessage" class="mt-3 text-sm text-green-700">
      ✅ {{ statusMessage }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  parseAdoptedBeaconsCSV,
  generateAdoptedBeaconsTemplate,
  formatAdoptedSurveyDate,
  type AdoptedBeaconCSVRow,
  type AdoptedBeaconConflict,
} from '../../utils/adoptedBeaconsCsv';
import {
  listAdoptedBeacons,
  importAdoptedBeacons,
  clearAdoptedBeacons,
} from '../../services/adoptedBeacons';

const props = defineProps<{
  projectId: number | string | null;
  /** Names already imported for this project, to report collisions before saving. */
  importedPointNames?: string[];
  /**
   * Remove the named points from this survey's live observations (imported
   * points, adjusted coordinates, stored workflow state and coordinate_points),
   * so the adopted set can own those names. Required only when the file
   * collides with existing observations.
   */
  reclassify?: (pointNames: string[]) => Promise<void>;
}>();

const emit = defineEmits<{ (e: 'saved', count: number): void }>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const parsed = ref<AdoptedBeaconCSVRow[]>([]);
const errors = ref<string[]>([]);
const conflicts = ref<AdoptedBeaconConflict[]>([]);
const reclassifyConfirmed = ref(false);
const fileName = ref('');
const saving = ref(false);
const statusMessage = ref('');
const saved = ref<Array<{ sr_number: string }>>([]);

const saveLabel = computed(() => {
  if (saving.value) return 'Saving…';
  const count = parsed.value.length;
  const noun = `adopted beacon${count === 1 ? '' : 's'}`;
  if (conflicts.value.length > 0 && reclassifyConfirmed.value) {
    return `Remove ${conflicts.value.length} & save ${count} ${noun}`;
  }
  return `Save ${count} ${noun}`;
});

const savedSrNumbers = computed(() => {
  const unique = [...new Set(saved.value.map((b) => b.sr_number))];
  return unique.join(', ');
});

async function refreshSaved() {
  if (!props.projectId) {
    saved.value = [];
    return;
  }
  try {
    saved.value = await listAdoptedBeacons(props.projectId);
  } catch (error) {
    console.error('[AdoptedBeacons] Failed to load saved beacons:', error);
    saved.value = [];
  }
}

watch(() => props.projectId, refreshSaved, { immediate: true });

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  statusMessage.value = '';
  fileName.value = file.name;
  conflicts.value = [];
  reclassifyConfirmed.value = false;

  const reader = new FileReader();
  reader.onload = () => {
    const result = parseAdoptedBeaconsCSV(
      String(reader.result ?? ''),
      props.importedPointNames ?? [],
    );
    parsed.value = result.points;
    errors.value = result.errors;
    conflicts.value = result.conflicts;
  };
  reader.readAsText(file);
  input.value = '';
}

async function save() {
  if (!props.projectId || parsed.value.length === 0) return;
  const reclassify = props.reclassify;
  if (conflicts.value.length > 0) {
    if (!reclassifyConfirmed.value) return;
    if (!reclassify) {
      errors.value = [
        'This file reclassifies points that are already observations of this survey, but the page did not provide a reclassification handler.',
      ];
      return;
    }
  }
  saving.value = true;
  statusMessage.value = '';
  try {
    // Remove the mistaken live observations BEFORE saving, so the adopted set
    // can own these names without the Co-ordinate List showing the beacon twice.
    if (conflicts.value.length > 0 && reclassify) {
      await reclassify(conflicts.value.map((c) => c.pointName));
      conflicts.value = [];
      reclassifyConfirmed.value = false;
    }

    const inserted = await importAdoptedBeacons(
      props.projectId,
      parsed.value.map((p) => ({
        sr_number: p.srNumber,
        point_name: p.pointName,
        y: p.y,
        x: p.x,
        status: p.status || undefined,
        description: p.description || undefined,
        survey_date: p.dateRaw || undefined,
      })),
    );
    saved.value = inserted;
    statusMessage.value = `${inserted.length} adopted beacon${inserted.length === 1 ? '' : 's'} saved to this survey record.`;
    emit('saved', inserted.length);
  } catch (error: any) {
    const message =
      error?.response?.data?.error ?? error?.message ?? 'Unknown error';
    errors.value = [`Save failed: ${message}`];
  } finally {
    saving.value = false;
  }
}

async function clearAll() {
  if (!props.projectId) return;
  saving.value = true;
  try {
    await clearAdoptedBeacons(props.projectId);
    saved.value = [];
    statusMessage.value = 'Adopted beacons removed.';
  } catch (error: any) {
    const message =
      error?.response?.data?.error ?? error?.message ?? 'Unknown error';
    errors.value = [`Remove failed: ${message}`];
  } finally {
    saving.value = false;
  }
}

function downloadTemplate() {
  const blob = new Blob([generateAdoptedBeaconsTemplate()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'adopted_points_template.csv';
  link.click();
  URL.revokeObjectURL(url);
}
</script>
