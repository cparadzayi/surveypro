<template>
  <aside v-if="open" class="dock" :style="{ width: width }">
    <!-- Tab strip -->
    <div class="dock-tabs">
      <div class="flex items-end gap-0.5 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="dock-tab"
          :class="{ 'dock-tab-active': modelValue === tab.id }"
          :title="tab.title || tab.label"
          @click="$emit('update:modelValue', tab.id)"
        >
          <span aria-hidden="true">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
          <span v-if="tab.badge" class="dock-tab-badge">{{ tab.badge }}</span>
        </button>
      </div>
      <button
        type="button"
        class="dock-close"
        title="Hide the side panel (or use ▤ Side Panel in the ribbon)"
        @click="$emit('close')"
      >✕</button>
    </div>

    <!-- Content -->
    <div class="dock-body">
      <slot />
    </div>
  </aside>
</template>

<script setup lang="ts">
/**
 * Right-hand dock for the Parcel Digitization view — the ArcGIS / QGIS
 * "Layers / Attributes" panel. Chrome only; content comes from the parent
 * so the existing panel markup can stay where it is.
 */
withDefaults(defineProps<{
  open: boolean
  tabs: { id: string; label: string; icon: string; title?: string; badge?: string | number | null }[]
  modelValue: string
  width?: string
}>(), { width: '21rem' })

defineEmits<{
  (e: 'update:modelValue', id: string): void
  (e: 'close'): void
}>()
</script>

<style scoped>
.dock {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-left: 2px solid #d1d5db;
  box-shadow: -4px 0 12px rgb(0 0 0 / 0.12);
  z-index: 25;
}

.dock-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 3px 4px 0;
  background-color: #e5e7eb;
  border-bottom: 1px solid #d1d5db;
  flex-shrink: 0;
}

.dock-tab {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 9px 3px;
  font-size: 0.68rem;
  font-weight: 500;
  color: #4b5563;
  background-color: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 0.3rem 0.3rem 0 0;
  white-space: nowrap;
}
.dock-tab:hover { background-color: #f3f4f6; }

.dock-tab-active {
  background-color: #ffffff;
  border-color: #d1d5db;
  color: #1d4ed8;
  font-weight: 600;
}

.dock-tab-badge {
  font-size: 0.6rem;
  font-weight: 700;
  background-color: #e5e7eb;
  border-radius: 9999px;
  padding: 0 4px;
}
.dock-tab-active .dock-tab-badge { background-color: #dbeafe; color: #1d4ed8; }

.dock-close {
  padding: 2px 6px;
  font-size: 0.7rem;
  color: #4b5563;
  border: 1px solid #d1d5db;
  border-radius: 0.3rem;
  background-color: #ffffff;
  margin-bottom: 3px;
  flex-shrink: 0;
}
.dock-close:hover { background-color: #fee2e2; color: #b91c1c; }

.dock-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
