<template>
  <Ribbon
    :tabs="tabs"
    initial-tab="digitize"
    :collapsed="collapsed"
    @update:collapsed="$emit('update:collapsed', $event)"
    @action="$emit('action', $event)"
  />
</template>

<script setup lang="ts">
/**
 * Parcel digitizing ribbon — the view-specific command set for the area
 * computation step. All rendering and styling is the shared `Ribbon`; this file
 * only declares *which* commands exist right now, based on the editor's state.
 *
 * Every id emitted here must be handled by `runRibbonAction()` in
 * `MapLibreAreaView.vue`.
 */
import { computed } from 'vue'
import Ribbon from '../ribbon/Ribbon.vue'
import { group, type RibbonButton, type RibbonItem, type RibbonTab } from '../ribbon/types'

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
  collapsed?: boolean
}>(), {
  editingParcelDesignation: '',
  insertAfterIndex: null,
  insertAfterLabel: '',
  collapsed: false,
})

defineEmits<{ (e: 'action', id: string): void; (e: 'update:collapsed', v: boolean): void }>()

const idle = (selectedPoints = 0) => selectedPoints === 0

/**
 * The two view-level controls that belong to the window, not to any one tab —
 * shown at the right end of the tab strip, like QGIS's panel toggles.
 */
const windowControls = (): RibbonItem[] => [
  {
    id: 'toggle-dock',
    icon: props.dockOpen ? '▥' : '▤',
    label: props.dockOpen ? 'Hide Panel' : 'Side Panel',
    title: props.dockOpen
      ? 'Hide the side panel'
      : 'Show the parcels / vertices / legend side panel',
    active: props.dockOpen,
  },
  {
    id: 'toggle-focus',
    icon: props.focusMode ? '⤢' : '⛶',
    label: props.focusMode ? 'Show Ribbon' : 'Clear Drawing Area',
    title: props.focusMode
      ? 'Bring the header, ribbon and overlays back'
      : 'Hide the header, ribbon and every overlay so the whole map is free for digitizing',
    active: props.focusMode,
    tone: 'accent',
  },
]

const digitizeGroups = computed(() => {
  const groups = []

  groups.push(group('Parcel', [
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
  ]))

  if (props.isDrawing && !props.isEditingVertices) {
    groups.push(group('Drawing', [
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
    ], `${props.selectedCount} point${props.selectedCount === 1 ? '' : 's'} placed — click the start vertex to close`))
  }

  if (props.isSplitting) {
    groups.push(group('Cut Line', [
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
    ], `${props.cutVertexCount} cut vertex/vertices placed`))
  }

  groups.push(group('Assist', [
    {
      id: 'toggle-ai',
      icon: '🤖',
      label: 'AI Detect',
      title: 'Detect parcel outlines from the coordinate points',
      tone: 'accent',
      active: props.showAIPanel,
      when: !props.isDrawing,
    },
  ]))

  groups.push(group('Output', [
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
  ]))

  return groups
})

const modifyGroups = computed(() => {
  if (!props.isEditingVertices) {
    return [group('Geometry', [
      {
        id: 'open-panel',
        icon: '▤',
        label: 'Parcels',
        title: 'Open the side panel to choose a parcel',
        tone: 'primary',
        disabled: props.dockOpen,
      },
    ], 'Pick a parcel in the side panel and press its 🔺 button to edit its vertices.')]
  }

  return [
    group('Editing', [
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
    ], props.insertAfterIndex !== null
      ? `Click a beacon to insert it after vertex ${props.insertAfterIndex + 1} (${props.insertAfterLabel})`
      : 'Click a beacon to append it. Use ➕ on a row to insert at a position.'),
    group('Current', [
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
    ]),
  ]
})

const layerGroups = computed(() => [
  group('Layers', [
    {
      id: 'toggle-satellite',
      icon: props.satelliteVisible ? '🛰️' : '🗺️',
      label: props.satelliteVisible ? 'Satellite' : 'Street Map',
      title: 'Switch the basemap between satellite imagery and OpenStreetMap',
      tone: (props.satelliteVisible ? 'success' : 'default') as RibbonButton['tone'],
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
  ]),
  group('Navigation', [
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
  ]),
  group('Legend', [
    {
      id: 'toggle-dock',
      icon: '▥',
      label: 'Legend',
      title: 'Show the side panel with the legend and layer summary',
      tone: 'primary',
      active: props.dockOpen,
    },
  ], 'Legend for the parcel outline colours.'),
])

const pointGroups = computed(() => [
  group('Coordinate Points', [
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
  ]),
  group('How It Works', [
    {
      id: 'noop-info',
      icon: '⚡',
      label: 'Auto-calc',
      title: 'Areas, perimeters and centroids are computed automatically on save',
      disabled: true,
    },
  ], 'Areas, perimeters and centroids are computed from the geometry automatically when a parcel is saved.'),
])

const tabs = computed<RibbonTab[]>(() => {
  const control = windowControls()
  return [
    { id: 'digitize', label: 'Digitize', icon: '✏️', groups: digitizeGroups.value, trailing: control },
    { id: 'modify', label: 'Modify', icon: '🔺', groups: modifyGroups.value, trailing: control },
    { id: 'layers', label: 'Layers & View', icon: '🗺️', groups: layerGroups.value, trailing: control },
    { id: 'points', label: 'Points', icon: '📍', groups: pointGroups.value, trailing: control },
  ]
})
</script>
