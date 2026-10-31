/**
 * Zoom-driven styling for the Boundaries & Abutters map. Everything here is a
 * MapLibre style expression (or a number), so the map does the work per frame and
 * no JavaScript runs while the user zooms. Pure, so the thresholds are testable.
 */

export type BasemapMode = 'auto' | 'satellite' | 'street'

export const BASEMAP_MODES: Array<{ mode: BasemapMode; label: string }> = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'satellite', label: 'Satellite' },
  { mode: 'street', label: 'Street' },
]

/** Zoom at which satellite starts to show, and at which it has fully replaced the street map. */
export const SATELLITE_FADE = { from: 15, to: 18 } as const

/** Stand labels: hidden when zoomed out (a layout has ~150 of them), fading in, then full. */
export const STAND_LABEL_ZOOM = { min: 16, full: 17.2, large: 19 } as const
/** Beacon names are smaller and more numerous: they come in later. */
export const BEACON_LABEL_ZOOM = { min: 18, full: 18.8 } as const

/** `['interpolate', ['linear'], ['zoom'], z0, v0, z1, v1, ...]` from [zoom, value] stops. */
export function zoomRamp(stops: Array<[number, number]>): unknown[] {
  return ['interpolate', ['linear'], ['zoom'], ...stops.flat()]
}

/**
 * Raster opacity of the two basemap layers. In Auto the street map is always fully
 * drawn underneath (so a tile that has not arrived never shows as a hole) and the
 * satellite fades in over it as the user zooms toward the parcels.
 */
export function basemapOpacities(mode: BasemapMode): { satellite: number | unknown[]; street: number } {
  if (mode === 'satellite') return { satellite: 1, street: 1 }
  if (mode === 'street') return { satellite: 0, street: 1 }
  return { satellite: zoomRamp([[SATELLITE_FADE.from, 0], [SATELLITE_FADE.to, 1]]), street: 1 }
}

export const standLabelOpacity = (): unknown[] =>
  zoomRamp([[STAND_LABEL_ZOOM.min, 0], [STAND_LABEL_ZOOM.full, 1]])

export const standLabelSize = (): unknown[] =>
  zoomRamp([[STAND_LABEL_ZOOM.min, 9], [STAND_LABEL_ZOOM.full, 11], [STAND_LABEL_ZOOM.large, 14], [21, 17]])

export const beaconLabelOpacity = (): unknown[] =>
  zoomRamp([[BEACON_LABEL_ZOOM.min, 0], [BEACON_LABEL_ZOOM.full, 1]])

/**
 * Collision priority for `symbol-sort-key` (lower wins): the selected subject, then
 * a stand that already carries a tag, then the rest -- so when two labels compete for
 * the same spot it is the ones the surveyor is working with that survive.
 */
export function labelPriority(isSelected: boolean, isTagged: boolean): 0 | 1 | 2 {
  return isSelected ? 0 : isTagged ? 1 : 2
}
