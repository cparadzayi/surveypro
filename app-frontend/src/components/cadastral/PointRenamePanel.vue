<template>
  <div class="contents">
  <div class="bg-white border border-blue-200 rounded-lg shadow-sm">
    <!-- Panel Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-t-lg border-b border-blue-200">
      <div class="flex items-center gap-2">
        <span class="text-blue-700 font-semibold text-sm">✏️ Edit Point Names</span>
        <span class="text-xs text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">{{ points.length }} points</span>
        <span v-if="savedCount > 0" class="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
          ✅ {{ savedCount }} renamed
        </span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">Click a point to edit it</span>
        <button
          @click="$emit('close')"
          class="px-2 py-1 text-blue-500 hover:text-blue-700 text-xs transition-colors"
        >
          Hide ▲
        </button>
      </div>
    </div>

    <!-- Info banner -->
    <div class="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
      ⚠️ Renaming updates the database and all documents. Regenerate field book and calculations after renaming.
    </div>

    <!-- Search -->
    <div class="px-4 py-2 border-b border-gray-100">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search points by name..."
        class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    </div>

    <!-- Point cards grid -->
    <div class="overflow-y-auto p-3" style="max-height: 240px;">
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
        <button
          v-for="row in filteredRows"
          :key="row.originalName"
          @click="openModal(row)"
          :class="[
            'flex flex-col items-center gap-1 p-2 rounded-lg border text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400',
            row.saved
              ? 'border-green-400 bg-green-50 hover:bg-green-100'
              : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300'
          ]"
          :title="`Click to edit ${row.currentName}`"
        >
          <span :class="[
            'text-xs font-bold px-2 py-0.5 rounded-full w-full text-center truncate',
            row.status === 'TRIG' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
          ]">{{ row.status || 'P' }}</span>
          <span class="font-mono text-xs font-semibold text-gray-800 truncate w-full text-center">
            {{ row.currentName }}
          </span>
          <span class="text-gray-400 text-xs truncate w-full text-center">
            {{ row.y }}, {{ row.x }}
          </span>
          <span v-if="row.saved" class="text-green-600 text-xs font-semibold">✓ saved</span>
          <span v-else class="text-blue-400 text-xs">✏️ edit</span>
        </button>
        <div v-if="filteredRows.length === 0" class="col-span-full py-4 text-center text-gray-400 text-xs">
          No points match your search.
        </div>
      </div>
    </div>

    <!-- Footer summary -->
    <div v-if="savedCount > 0" class="px-4 py-2 bg-green-50 border-t border-green-100 text-xs text-green-700 rounded-b-lg">
      ✅ {{ savedCount }} point{{ savedCount !== 1 ? 's' : '' }} edited. Regenerate field book and calculations to reflect changes.
    </div>
  </div>

  <!-- Edit Modal (teleported to body to avoid clipping) -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modalRow"
        class="fixed inset-0 flex items-center justify-center"
        style="z-index: 99999;"
        @click.self="cancelModal"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>

        <!-- Dialog -->
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <!-- Dialog header -->
          <div class="bg-blue-600 px-5 py-4">
            <h3 class="text-white font-semibold text-base">Edit Point</h3>
            <p class="text-blue-200 text-xs mt-0.5">Update name, coordinates, or description</p>
          </div>

          <!-- Point badge -->
          <div class="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
            <div :class="[
              'w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0',
              modalRow.status === 'TRIG' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            ]">{{ modalRow.status || 'P' }}</div>
            <div>
              <p class="font-mono text-xs text-gray-500">Original: {{ modalRow.originalName }}</p>
              <p class="text-[11px] text-gray-400">Edit any field and click Save</p>
            </div>
          </div>

          <!-- Edit form -->
          <div class="px-5 py-4 space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                ref="modalInputRef"
                v-model="modalNewName"
                @keydown.escape="cancelModal"
                type="text"
                class="w-full border rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
                :placeholder="modalRow.originalName"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Y (north)</label>
                <input
                  v-model="modalY"
                  @keydown.escape="cancelModal"
                  type="number"
                  step="0.001"
                  class="w-full border rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">X (east)</label>
                <input
                  v-model="modalX"
                  @keydown.escape="cancelModal"
                  type="number"
                  step="0.001"
                  class="w-full border rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
                />
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                v-model="modalDescription"
                @keydown.escape="cancelModal"
                rows="3"
                class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
                placeholder="Optional"
              />
            </div>
            <p v-if="modalError" class="text-xs text-red-600">{{ modalError }}</p>
          </div>

          <!-- Actions (Delete goes left, Cancel/Save go right) -->
          <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
            <button
              @click="confirmDelete"
              :disabled="isSaving || isDeleting"
              class="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <span v-if="isDeleting" class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
              🗑 {{ isDeleting ? 'Deleting...' : 'Delete' }}
            </button>
            <div class="flex gap-2">
              <button
                @click="cancelModal"
                :disabled="isSaving"
                class="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                @click="confirmEdit"
                :disabled="isSaving || !canSave"
                class="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <span v-if="isSaving" class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                {{ isSaving ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';

interface PointRow {
  originalName: string;
  currentName: string;
  y: string;        // display-formatted (2dp)
  x: string;        // display-formatted (2dp)
  status: string;
  saved: boolean;
  // Diff tracking — current numeric values + original snapshot
  numericY: number;
  numericX: number;
  description: string;
  originalY: number;
  originalX: number;
  originalDescription: string;
}

interface PointInput {
  id: string;
  y: number;
  x: number;
  status?: string;
  description?: string;
}

const props = defineProps<{
  points: PointInput[];
  editHandler: (
    oldName: string,
    patch: { name?: string; y?: number; x?: number; description?: string }
  ) => Promise<void>;
  deleteHandler: (name: string) => Promise<void>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'edit-complete', payload: { oldName: string; patch: { name?: string; y?: number; x?: number; description?: string } }): void;
}>();

const searchQuery = ref('');
const isSaving = ref(false);
const isDeleting = ref(false);
const savedCount = ref(0);
const rows = ref<PointRow[]>([]);

// Modal state
const modalRow = ref<PointRow | null>(null);
const modalNewName = ref('');
const modalY = ref<string>('');
const modalX = ref<string>('');
const modalDescription = ref<string>('');
const modalError = ref('');
const modalInputRef = ref<HTMLInputElement | null>(null);

watch(() => props.points, (pts) => {
  rows.value = pts.map(p => {
    const yNum = typeof p.y === 'number' ? p.y : parseFloat(p.y as any);
    const xNum = typeof p.x === 'number' ? p.x : parseFloat(p.x as any);
    const desc = p.description ?? '';
    return {
      originalName: p.id,
      currentName: p.id,
      y: yNum.toFixed(2),
      x: xNum.toFixed(2),
      status: p.status || 'P',
      saved: false,
      numericY: yNum,
      numericX: xNum,
      description: desc,
      originalY: yNum,
      originalX: xNum,
      originalDescription: desc,
    };
  });
}, { immediate: true });

const filteredRows = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return rows.value;
  return rows.value.filter(r =>
    r.currentName.toLowerCase().includes(q) ||
    r.originalName.toLowerCase().includes(q)
  );
});

function parseCoord(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const canSave = computed(() => {
  if (!modalRow.value || modalError.value) return false;
  const trimmedName = modalNewName.value.trim();
  if (!trimmedName) return false;
  const y = parseCoord(modalY.value);
  const x = parseCoord(modalX.value);
  if (y === null || x === null) return false;
  const row = modalRow.value;
  const nameChanged = trimmedName !== row.originalName;
  const yChanged    = y !== row.originalY;
  const xChanged    = x !== row.originalX;
  const descChanged = modalDescription.value !== row.originalDescription;
  return nameChanged || yChanged || xChanged || descChanged;
});

function openModal(row: PointRow) {
  modalRow.value = row;
  modalNewName.value = row.currentName;
  modalY.value = String(row.numericY);
  modalX.value = String(row.numericX);
  modalDescription.value = row.description;
  modalError.value = '';
  nextTick(() => {
    modalInputRef.value?.focus();
    modalInputRef.value?.select();
  });
}

function cancelModal() {
  modalRow.value = null;
  modalNewName.value = '';
  modalY.value = '';
  modalX.value = '';
  modalDescription.value = '';
  modalError.value = '';
}

// Live validation feedback (errors only — disablement is via canSave)
watch([modalNewName, modalY, modalX], () => {
  if (!modalRow.value) return;
  const trimmedName = modalNewName.value.trim();
  if (!trimmedName) {
    modalError.value = 'Name cannot be empty';
    return;
  }
  if (trimmedName !== modalRow.value.currentName) {
    const dup = rows.value.some(r => r !== modalRow.value && r.currentName === trimmedName);
    if (dup) {
      modalError.value = `"${trimmedName}" already exists`;
      return;
    }
  }
  if (parseCoord(modalY.value) === null) {
    modalError.value = 'Y must be a number';
    return;
  }
  if (parseCoord(modalX.value) === null) {
    modalError.value = 'X must be a number';
    return;
  }
  modalError.value = '';
});

async function confirmEdit() {
  if (!modalRow.value || !canSave.value || isSaving.value) return;
  const row = modalRow.value;
  const trimmedName = modalNewName.value.trim();
  const newY = parseCoord(modalY.value)!;
  const newX = parseCoord(modalX.value)!;
  const newDesc = modalDescription.value;

  const patch: { name?: string; y?: number; x?: number; description?: string } = {};
  if (trimmedName !== row.originalName)    patch.name = trimmedName;
  if (newY !== row.originalY)              patch.y = newY;
  if (newX !== row.originalX)             patch.x = newX;
  if (newDesc !== row.originalDescription) patch.description = newDesc;

  isSaving.value = true;
  try {
    const prev = row.currentName;
    await props.editHandler(prev, patch);
    if (patch.name)        { row.currentName = patch.name; row.originalName = patch.name; }
    if (patch.y !== undefined) { row.numericY = patch.y; row.originalY = patch.y; row.y = patch.y.toFixed(2); }
    if (patch.x !== undefined) { row.numericX = patch.x; row.originalX = patch.x; row.x = patch.x.toFixed(2); }
    if (patch.description !== undefined) { row.description = patch.description; row.originalDescription = patch.description; }
    row.saved = true;
    savedCount.value++;
    emit('edit-complete', { oldName: prev, patch });
    cancelModal();
    setTimeout(() => { row.saved = false; }, 4000);
  } catch (err: any) {
    if (err?.message !== 'cancelled') {
      modalError.value = err?.message || 'Save failed. Please try again.';
    }
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  if (!modalRow.value || isDeleting.value || isSaving.value) return;
  const row = modalRow.value;
  isDeleting.value = true;
  try {
    await props.deleteHandler(row.currentName);
    rows.value = rows.value.filter(r => r !== row);
    cancelModal();
  } catch (err: any) {
    if (err?.message !== 'cancelled') {
      modalError.value = err?.message || 'Delete failed. Please try again.';
    }
  } finally {
    isDeleting.value = false;
  }
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.15s ease;
}
.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
}
</style>
