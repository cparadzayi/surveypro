<template>
  <div v-if="tabs.length" class="rbn-root" :class="{ 'rbn-collapsed': collapsed }">
    <!-- ── Tab strip ─────────────────────────────────────────────────────── -->
    <div class="rbn-tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        class="rbn-tab"
        :class="{ 'rbn-tab-active': activeTab === tab.id }"
        :aria-selected="activeTab === tab.id"
        @click="activeTab = tab.id"
      >
        <span v-if="tab.icon" class="rbn-tab-icon" aria-hidden="true">{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
      </button>

      <div class="flex-1 min-w-2"></div>

      <!-- Per-view controls live in `trailing` of the active tab -->
      <div v-if="activeTrailing.length" class="rbn-trailing">
        <template v-for="(item, i) in activeTrailing" :key="keyFor(item, i)">
          <span v-if="isSeparator(item)" class="rbn-sep rbn-sep-v" aria-hidden="true"></span>
          <RibbonButton
            v-else
            v-bind="item"
            :large="false"
            @click="$emit('action', item.id)"
          />
        </template>
      </div>

      <button
        type="button"
        class="rbn-collapse"
        :title="collapsed ? 'Expand the ribbon' : 'Collapse the ribbon to its tabs'"
        :aria-label="collapsed ? 'Expand the ribbon' : 'Collapse the ribbon'"
        @click="collapsed = !collapsed"
      >{{ collapsed ? '⤢' : '⤡' }}</button>
    </div>

    <!-- ── Body ──────────────────────────────────────────────────────────── -->
    <div v-if="!collapsed" class="rbn-body">
      <div v-if="!activeGroups.length" class="rbn-empty">
        Nothing to do in this tab right now.
      </div>

      <div v-for="g in activeGroups" :key="g.label" class="rbn-group">
        <div class="rbn-group-items">
          <template v-for="(item, i) in g.items" :key="keyFor(item, i)">
            <span v-if="isSeparator(item)" class="rbn-sep" aria-hidden="true"></span>
            <RibbonButton
              v-else
              v-bind="item"
              @click="$emit('action', item.id)"
            />
          </template>
        </div>
        <p v-if="g.note" class="rbn-note">{{ g.note }}</p>
        <p class="rbn-group-label">{{ g.label }}</p>
      </div>
    </div>

    <!-- Collapsed ribbon hides the body; the map underneath grows taller. -->
    <div v-else class="rbn-collapsed-hint">
      {{ active?.groups[0]?.items.filter(i => !isSeparator(i)).length || 0 }} commands —
      expand to reach them
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import RibbonButton from './RibbonButton.vue'
import { isSeparator, type RibbonItem, type RibbonTab } from './types'

/**
 * Generic ribbon renderer. Declare tabs as data, get a QGIS/ArcGIS-style
 * toolbar. Every command leaves the component as an `action` event carrying the
 * button id — the host view owns the behaviour.
 */
const props = withDefaults(defineProps<{
  tabs: RibbonTab[]
  /** Which tab to show first. Defaults to the first declared tab. */
  initialTab?: string
  /** Collapsed shows only the tab strip — the AutoCAD/CAD "minimise ribbon" mode. */
  collapsed?: boolean
}>(), { initialTab: '', collapsed: false })

const emit = defineEmits<{
  (e: 'action', id: string): void
  (e: 'update:collapsed', value: boolean): void
}>()

const collapsed = ref(props.collapsed)
const activeTab = ref(props.initialTab || props.tabs[0]?.id || '')

/** `when: false` items are dropped before anything else looks at them. */
function keep(item: RibbonItem): boolean {
  return isSeparator(item) || item.when !== false
}

const tabs = computed<RibbonTab[]>(() =>
  props.tabs
    .map(t => ({
      ...t,
      groups: t.groups.map(g => ({ ...g, items: g.items.filter(keep) })),
      trailing: t.trailing?.filter(keep),
    }))
    // A tab with nothing left in it has no business taking up tab-strip space.
    .filter(t => t.groups.some(g => g.items.length > 0))
)

const active = computed(() =>
  tabs.value.find(t => t.id === activeTab.value) || tabs.value[0]
)
const activeGroups = computed(() =>
  (active.value?.groups ?? []).filter(g => g.items.length > 0)
)
const activeTrailing = computed(() => active.value?.trailing ?? [])

/** Stable key for both buttons and separators. */
function keyFor(item: RibbonItem, i: number): string {
  return isSeparator(item) ? `sep-${i}` : item.id
}

watch(collapsed, v => emit('update:collapsed', v))

// Parent may change collapsed from outside (e.g. another control); track it.
watch(() => props.collapsed, v => { if (v !== collapsed.value) collapsed.value = v })

// Keep the selection pointing at something real when tabs come and go.
watch(tabs, list => {
  if (list.length && !list.some(t => t.id === activeTab.value)) activeTab.value = list[0].id
})
</script>

<style scoped>
.rbn-root {
  flex-shrink: 0;
  position: relative;
  z-index: 30;
  background-color: #f3f4f6;
  border-bottom: 1px solid #d1d5db;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
}

/* Tab strip */
.rbn-tabs {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 0 4px;
  background-color: #e5e7eb;
  border-bottom: 1px solid #d1d5db;
  overflow-x: auto;
  scrollbar-width: thin;
}

.rbn-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px 4px;
  margin-bottom: -1px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #4b5563;
  background-color: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 0.375rem 0.375rem 0 0;
  white-space: nowrap;
  transition: background-color 120ms ease, color 120ms ease;
}
.rbn-tab:hover { background-color: #f3f4f6; color: #111827; }

.rbn-tab-active {
  background-color: #ffffff;
  border-color: #d1d5db;
  color: #1d4ed8;
  font-weight: 600;
}

.rbn-tab-icon { font-size: 0.85rem; }

.rbn-trailing {
  display: flex;
  align-items: center;
  gap: 3px;
  margin: 4px 0;
  padding-left: 6px;
  border-left: 1px solid #d1d5db;
}

.rbn-collapse {
  margin: 4px 2px 4px 4px;
  padding: 2px 7px;
  font-size: 0.8rem;
  color: #4b5563;
  background-color: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  flex-shrink: 0;
}
.rbn-collapse:hover { background-color: #eef2ff; border-color: #6366f1; color: #1d4ed8; }

/* Body */
.rbn-body {
  display: flex;
  align-items: stretch;
  padding: 4px 4px 0;
  background-color: #ffffff;
  min-height: 5.5rem;
  overflow-x: auto;
  scrollbar-width: thin;
}

.rbn-group {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 8px 2px;
  border-right: 1px solid #e5e7eb;
}
.rbn-group:last-child { border-right: none; }

.rbn-group-items {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  flex: 1;
}

.rbn-sep {
  width: 1px;
  align-self: stretch;
  margin: 2px 4px;
  background-color: #e5e7eb;
}

/* In the tab strip the separator is short and vertical, matching tile height. */
.rbn-sep-v {
  align-self: center;
  height: 1.1rem;
  margin: 0 4px;
}

.rbn-collapsed-hint {
  padding: 3px 10px 4px;
  font-size: 0.65rem;
  color: #9ca3af;
  background-color: #ffffff;
  border-top: 1px solid #f3f4f6;
}

.rbn-group-label {
  margin-top: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280;
  text-align: center;
}

.rbn-note {
  max-width: 16rem;
  margin: 2px 0 0;
  font-size: 0.6rem;
  line-height: 1.25;
  color: #6b7280;
}

.rbn-empty {
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 0.7rem;
  color: #9ca3af;
}

/* Collapsed: tab strip plus the one-line hint, flush against the content below. */
.rbn-collapsed .rbn-tabs { border-bottom: none; }
</style>