<template>
  <div class="ribbon-root">
    <!-- ── Tab strip ───────────────────────────────────────────────── -->
    <div class="ribbon-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="ribbon-tab"
        :class="{ 'ribbon-tab-active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <span class="ribbon-tab-icon" aria-hidden="true">{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
      </button>

      <div class="flex-1"></div>

      <button
        type="button"
        class="ribbon-tab-action"
        :class="{ 'ribbon-action-on': dockOpen }"
        :title="dockOpen ? 'Hide the side panel' : 'Show the parcels / vertices / info side panel'"
        @click="$emit('action', 'toggle-dock')"
      >
        {{ dockOpen ? '▥ Hide Panel' : '▤ Side Panel' }}
      </button>
      <button
        type="button"
        class="ribbon-tab-action"
        :class="{ 'ribbon-action-on': focusMode }"
        title="Hide the header, ribbon and every overlay so the whole map is free for digitizing"
        @click="$emit('action', 'toggle-focus')"
      >
        {{ focusMode ? '⤢ Show Ribbon' : '⛶ Clear Drawing Area' }}
      </button>
    </div>

    <!-- ── Ribbon body ─────────────────────────────────────────────── -->
    <div class="ribbon-body">
      <div v-if="!groups.length" class="ribbon-empty">
        Nothing to do in this tab right now.
      </div>

      <div v-for="group in groups" :key="group.label" class="ribbon-group">
        <div class="ribbon-group-items">
          <RibbonButton
            v-for="btn in group.buttons"
            :key="btn.id"
            v-bind="btn"
            @click="$emit('action', btn.id)"
          />
        </div>
        <p v-if="group.note" class="ribbon-note">{{ group.note }}</p>
        <p class="ribbon-group-label">{{ group.label }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import RibbonButton from './RibbonButton.vue'

type Tone = 'default' | 'primary' | 'success' | 'danger' | 'warn' | 'accent'

interface RibbonBtn {
  id: string
  icon: string
  label: string
  title?: string
  disabled?: boolean
  active?: boolean
  large?: boolean
  badge?: string | number | null
  tone?: Tone
  /** Drop the tile entirely when false instead of greying it out. */
  when?: boolean
}

interface RibbonGroup {
  label: string
  note?: string
  buttons: RibbonBtn[]
}

const props = withDefaults(defineProps<{
  isDrawing: boolean
  isSplitting: boolean
  isEditingVertices: boolean
  editingParcelDesignation: string | null
  selectedCount: number
  cutVertexCount: number
  cutReady: boolean
  insertAfterIndex: number | null
  insertAfterLabel: string
  isComputing: boolean
  isRecomputing: boolean
  hasStoredCut: boolean
  showAIPanel: boolean
  showLabels: boolean
  showTrigInset: boolean
  satelliteVisible: boolean
  trigBeaconCount: number
  savedParcelCount: number
  computedParcelCount: number
  showRenamePanel: boolean
  surveyPegCount: number
  dockOpen: boolean
  focusMode: boolean
}>(), {
  editingParcelDesignation: '',
  insertAfterIndex: null,
  insertAfterLabel: '',
})

defineEmits<{ (e: 'action', id: string): void }>()

const tabs = [
  { id: 'digitize', label: 'Digitize', icon: '✏️' },
  { id: 'modify', label: 'Modify', icon: '🔺' },
  { id: 'layers', label: 'Layers & View', icon: '🗺️' },
  { id: 'points', label: 'Points', icon: '📍' },
]

const activeTab = ref('digitize')

const idle = (selectedPoints = 0) => selectedPoints === 0

/** Strip the tiles whose `when` is false — greyed-out dead buttons add noise. */
function visible(buttons: RibbonBtn[]): RibbonBtn[] {
  return buttons.filter(b => b.when !== false)
}

const digitizeGroups = computed<RibbonGroup[]>(() => {
  const groups: RibbonGroup[] = []

  groups.push({
    label: 'Parcel',
    buttons: visible([
      {
        id: 'start-drawing',
        icon: '✏️',
        label: 'Draw Parcel',
        title: 'Start drawing a parcel polygon — click pegs on the map',
        tone: 'success',
        when: !props.isDrawing && !props.isSplitting,
      },
      {
        id: 'start-splitting',
        icon: '✂️',
        label: 'Split Figure',
        title: 'Cut the Outside Figure into sheets along a line through road space',
        tone: 'accent',
        when: !props.isDrawing && !props.isSplitting,
      },
      {
        id: 'delete-cut',
        icon: '🗑️',
        label: 'Remove Cut',
        title: 'Delete the stored cut so the plan renders as one sheet again',
        tone: 'danger',
        when: props.hasStoredCut && !props.isSplitting && !props.isDrawing,
      },
      {
        id: 'add-beacon',
        icon: '➕',
        label: 'Add Beacon',
        title: 'Add a new survey beacon (Cape Lo coordinates)',
        when: !props.isDrawing,
      },
    ]),
  })

  if (props.isDrawing && !props.isEditingVertices) {
    groups.push({
      label: 'Drawing',
      note: `${props.selectedCount} point${props.selectedCount === 1 ? '' : 's'} placed — click the start vertex to close`,
      buttons: [
        {
          id: 'undo-point',
          icon: '↩️',
          label: `Undo (${props.selectedCount})`,
          title: 'Remove the last point placed (Ctrl+Z)',
          tone: 'warn',
          disabled: idle(props.selectedCount),
        },
        {
          id: 'complete-polygon',
          icon: '✅',
          label: 'Complete',
          title: 'Finish the parcel and compute its area',
          tone: 'primary',
          disabled: props.selectedCount < 3,
        },
        {
          id: 'cancel-drawing',
          icon: '✕',
          label: 'Cancel',
          title: 'Abandon the sketch',
          tone: 'danger',
        },
      ],
    })
  }

  if (props.isSplitting) {
    groups.push({
      label: 'Cut Line',
      note: `${props.cutVertexCount} cut vertex/vertices placed`,
      buttons: [
        {
          id: 'undo-cut',
          icon: '↩️',
          label: `Undo (${props.cutVertexCount})`,
          title: 'Remove the last cut vertex (Ctrl+Z)',
          tone: 'warn',
          disabled: props.cutVertexCount === 0,
        },
        {
          id: 'finish-split',
          icon: '✅',
          label: 'Finish',
          title: 'Apply the cut (or double-click the map)',
          tone: 'primary',
          disabled: !props.cutReady,
        },
        {
          id: 'cancel-split',
          icon: '✕',
          label: 'Cancel',
          title: 'Discard the cut (Esc)',
          tone: 'danger',
        },
      ],
    })
  }

  groups.push({
    label: 'Assist',
    buttons: [
      {
        id: 'toggle-ai',
        icon: '🤖',
        label: 'AI Detect',
        title: 'Detect parcel outlines from the coordinate points',
        tone: 'accent',
        active: props.showAIPanel,
        when: !props.isDrawing,
      },
    ],
  })

  groups.push({
    label: 'Output',
    buttons: [
      {
        id: 'export-pdf',
        icon: '📄',
        label: 'Area PDF',
        title: 'Export the area & consistency report (SGO format)',
        tone: 'primary',
        disabled: props.computedParcelCount === 0,
      },
      {
        id: 'save-all',
        icon: '💾',
        label: 'Save All',
        title: 'Save every in-memory parcel to the database',
        tone: 'success',
        disabled: props.computedParcelCount === 0,
      },
    ],
  })

  return groups.filter(g => g.buttons.length > 0)
})

const modifyGroups = computed<RibbonGroup[]>(() => {
  if (!props.isEditingVertices) {
    return [{
      label: 'Geometry',
      note: 'Pick a parcel in the side panel and press its 🔺 button to edit its vertices.',
      buttons: [
        {
          id: 'open-panel',
          icon: '▤',
          label: 'Parcels',
          title: 'Open the side panel to choose a parcel',
          tone: 'primary',
          disabled: props.dockOpen,
        },
      ],
    }]
  }

  return [
    {
      label: 'Editing',
      note: props.insertAfterIndex !== null
        ? `Click a beacon to insert it after vertex ${props.insertAfterIndex + 1} (${props.insertAfterLabel})`
        : 'Click a beacon to append it. Use ➕ on a row to insert at a position.',
      buttons: [
        {
          id: 'commit-vertex-edit',
          icon: '💾',
          label: 'Save Changes',
          title: 'Recompute and save the edited geometry',
          tone: 'success',
          disabled: props.selectedCount < 3 || props.isComputing,
          badge: props.isComputing ? '⏳' : null,
        },
        {
          id: 'cancel-vertex-edit',
          icon: '✕',
          label: 'Cancel Edit',
          title: 'Discard the vertex changes',
          tone: 'danger',
        },
      ],
    },
    {
      label: 'Current',
      buttons: [
        {
          id: 'noop-parcel',
          icon: '🔺',
          label: props.editingParcelDesignation || '—',
          title: 'Parcel currently being edited',
          disabled: true,
        },
        {
          id: 'open-panel',
          icon: '▤',
          label: 'Vertices',
          title: 'Show the vertex list in the side panel',
          tone: 'primary',
          active: props.dockOpen,
        },
      ],
    },
  ]
})

const layerGroups = computed<RibbonGroup[]>(() => [
  {
    label: 'Layers',
    buttons: [
      {
        id: 'toggle-satellite',
        icon: props.satelliteVisible ? '🛰️' : '🗺️',
        label: props.satelliteVisible ? 'Satellite' : 'Street Map',
        title: 'Switch the basemap between satellite imagery and OpenStreetMap',
        tone: props.satelliteVisible ? 'success' : 'default',
        active: props.satelliteVisible,
      },
      {
        id: 'toggle-labels',
        icon: '🏷️',
        label: 'Labels',
        title: 'Show or hide the beacon name labels',
        tone: 'primary',
        active: props.showLabels,
      },
      {
        id: 'toggle-trigs',
        icon: '🔺',
        label: 'Trig Beacons',
        title: 'Inset map of the national trig beacons',
        tone: 'danger',
        active: props.showTrigInset,
        badge: props.trigBeaconCount || null,
      },
    ],
  },
  {
    label: 'Navigation',
    buttons: [
      {
        id: 'fit-view',
        icon: '🎯',
        label: 'Fit View',
        title: 'Zoom the map to the extent of all survey points',
      },
      {
        id: 'refresh',
        icon: '🔄',
        label: 'Refresh',
        title: 'Reload the saved parcels from the database',
      },
      {
        id: 'recompute',
        icon: '🔧',
        label: 'Recompute',
        title: 'Recompute every saved parcel with the latest backend rules',
        tone: 'warn',
        disabled: props.isRecomputing || props.savedParcelCount === 0,
        badge: props.isRecomputing ? '⏳' : null,
      },
    ],
  },
  {
    label: 'Status',
    note: 'Legend for the parcel outline colours.',
    buttons: [
      {
        id: 'toggle-dock',
        icon: '▥',
        label: 'Legend',
        title: 'Show the side panel with the legend and layer summary',
        tone: 'primary',
        active: props.dockOpen,
      },
    ],
  },
])

const pointGroups = computed<RibbonGroup[]>(() => [
  {
    label: 'Coordinate Points',
    buttons: [
      {
        id: 'toggle-rename',
        icon: '✏️',
        label: 'Edit Names',
        title: 'Rename the imported coordinate points before digitizing',
        tone: 'primary',
        active: props.showRenamePanel,
        badge: props.surveyPegCount || null,
      },
      {
        id: 'repair-beacons',
        icon: '🔧',
        label: 'Repair Beacons',
        title: 'Re-match saved parcel beacon names to the current point names',
        tone: 'warn',
        disabled: props.isRecomputing,
      },
    ],
  },
  {
    label: 'How it works',
    note: 'Areas, perimeters and centroids are computed from the geometry automatically when a parcel is saved.',
    buttons: [
      {
        id: 'noop-info',
        icon: '⚡',
        label: 'Auto-calc',
        title: 'Areas, perimeters and centroids are computed automatically on save',
        disabled: true,
      },
    ],
  },
])

const groups = computed<RibbonGroup[]>(() => {
  switch (activeTab.value) {
    case 'modify': return modifyGroups.value
    case 'layers': return layerGroups.value
    case 'points': return pointGroups.value
    default: return digitizeGroups.value
  }
})
</script>

<style scoped>
.ribbon-root {
  flex-shrink: 0;
  background-color: #f3f4f6;
  border-bottom: 1px solid #d1d5db;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
  z-index: 30;
  position: relative;
}

/* Tab strip */
.ribbon-tabs {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 0 4px;
  background-color: #e5e7eb;
  border-bottom: 1px solid #d1d5db;
  overflow-x: auto;
}

.ribbon-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px 4px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #4b5563;
  background-color: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 0.375rem 0.375rem 0 0;
  margin-bottom: -1px;
  white-space: nowrap;
  transition: background-color 120ms ease, color 120ms ease;
}
.ribbon-tab:hover { background-color: #f3f4f6; color: #111827; }

.ribbon-tab-active {
  background-color: #ffffff;
  border-color: #d1d5db;
  color: #1d4ed8;
  font-weight: 600;
}

.ribbon-tab-icon { font-size: 0.85rem; }

.ribbon-tab-action {
  margin: 4px 0;
  padding: 4px 10px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #374151;
  background-color: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  white-space: nowrap;
  transition: background-color 120ms ease, color 120ms ease;
}
.ribbon-tab-action:hover { background-color: #eef2ff; border-color: #6366f1; }
.ribbon-action-on { background-color: #4f46e5; border-color: #4338ca; color: #ffffff; }
.ribbon-action-on:hover { background-color: #4338ca; color: #ffffff; }

/* Group row */
.ribbon-body {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 4px 4px 0;
  overflow-x: auto;
  background-color: #ffffff;
  min-height: 5.5rem;
}

.ribbon-group {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 8px 2px;
  border-right: 1px solid #e5e7eb;
}
.ribbon-group:last-child { border-right: none; }

.ribbon-group-items {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  flex: 1;
}

.ribbon-group-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280;
  text-align: center;
  margin-top: 2px;
}

.ribbon-note {
  font-size: 0.6rem;
  color: #6b7280;
  max-width: 16rem;
  margin: 2px 0 0;
  line-height: 1.25;
}

.ribbon-empty {
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 0.7rem;
  color: #9ca3af;
}
</style>
