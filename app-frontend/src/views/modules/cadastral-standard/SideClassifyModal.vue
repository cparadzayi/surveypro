<template>
  <div v-if="editor" v-dialog="{ label: 'Classify side', onClose: () => emit('cancel') }" class="side-modal-backdrop" @click.self="emit('cancel')">
    <div class="side-modal">
      <div class="side-modal-title">Classify side {{ editor.side }}</div>
      <label>Role
        <select v-model="editor.role">
          <option v-if="roleAllowed('contiguous')" value="contiguous">Contiguous parcel</option>
          <option v-if="roleAllowed('road')" value="road">Road</option>
          <option v-if="roleAllowed('servitude')" value="servitude">Servitude</option>
        </select>
      </label>
      <label>Label
        <input v-model="editor.label" type="text" placeholder="e.g. STAND 86 … / Klein Road" />
      </label>
      <label v-if="editor.role === 'servitude' || editor.role === 'road'">Width (m)
        <input v-model.number="editor.widthM" type="number" min="0" step="0.1" />
      </label>
      <label v-if="editor.role === 'road'">Leads to (from {{ editor.side[0] }})
        <input v-model="editor.destinationFrom" type="text" placeholder="e.g. Gwelo" />
      </label>
      <label v-if="editor.role === 'road'">Leads to (from {{ editor.side[1] }})
        <input v-model="editor.destinationTo" type="text" placeholder="e.g. Gweru" />
      </label>
      <label v-if="editor.role === 'contiguous'">Abutment
        <select v-model="editor.end">
          <option value="from">From terminal ({{ editor.side[0] }})</option>
          <option value="both">Whole side (both terminals)</option>
          <option value="mid">Midway (no terminals)</option>
          <option value="to">To terminal ({{ editor.side[1] }})</option>
        </select>
      </label>
      <div class="side-modal-actions">
        <button type="button" class="btn-primary" @click="emit('save')">Save</button>
        <button type="button" @click="emit('clear')">Clear</button>
        <button type="button" @click="emit('cancel')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The classify-a-side dialog (role, label, width, destinations, abutment), shared
 * by every screen that tags sides. It edits the `editor` object it is given in
 * place and reports Save / Clear / Cancel; the owner converts it with
 * `sideEditorToAnnotation` and persists.
 */
import { vDialog } from '@/directives/dialog'
import type { SideEditorState } from './sideEditor'
import type { SideRole } from './sideAnnotations'

/** `roles` limits the Role choices; omitted, all three are offered. A screen where servitudes
 *  are records with their own form offers only road and contiguous here. */
const props = defineProps<{ editor: SideEditorState | null; roles?: SideRole[] }>()
const roleAllowed = (r: SideRole) => !props.roles || props.roles.includes(r)
const emit = defineEmits<{ (e: 'save'): void; (e: 'clear'): void; (e: 'cancel'): void }>()
</script>

<style scoped>
.side-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.side-modal {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  min-width: 260px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}
.side-modal-title { font-weight: 600; font-size: 14px; }
.side-modal label { display: flex; flex-direction: column; gap: 3px; }
.side-modal select, .side-modal input { padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; }
.side-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
.side-modal button { cursor: pointer; padding: 5px 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; }
.side-modal .btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
</style>
