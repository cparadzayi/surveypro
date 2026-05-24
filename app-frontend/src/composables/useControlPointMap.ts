/**
 * Composable for Control Point Map functionality
 * Manages map state, markers, and interactions
 */

import { ref, computed, watch, onMounted, onUnmounted, nextTick, toRef } from 'vue'
import maplibregl from 'maplibre-gl'
import type { ControlPoint, SurveyCenter } from '@/utils/controlPointMapUtils'
import {
  calculateDistance,
  detectCentralMeridian,
  generateRecommendations,
  loadFavorites,
  saveFavorites,
  loadRecentlyUsed,
  saveRecentlyUsed,
  addToRecentlyUsed as addToRecentlyUsedUtil
} from '@/utils/controlPointMapUtils'

export function useControlPointMap(
  pointsGetter: () => ControlPoint[],
  selectedIdsGetter: () => number[],
  surveyCenterGetter: () => SurveyCenter | null,
  projectId?: number
) {
  // Map instance
  const mapContainer = ref<HTMLDivElement | null>(null)
  const map = ref<maplibregl.Map | null>(null)
  const markers = ref<Map<number, maplibregl.Marker>>(new Map())

  // View state
  const viewMode = ref<'map' | 'list' | 'split'>('split')
  const showSatellite = ref(false)

  // Filter state (simplified - meridian and distance filtering done in parent)
  const searchQuery = ref('')
  const sortBy = ref<'distance' | 'name' | 'code'>('distance')
  const showFavoritesOnly = ref(false)

  // Interaction state
  const highlightedPointId = ref<number | null>(null)

  // Persistence
  const favorites = ref<Set<number>>(new Set())
  const recentlyUsed = ref<number[]>([])

  // Computed properties
  const pointsWithDistance = computed(() => {
    const points = pointsGetter()
    const surveyCenter = surveyCenterGetter()
    console.log('[useControlPointMap] 🔍 Computing pointsWithDistance, points:', points.length)
    
    // If points already have distance calculated (from parent), use them as-is
    if (points.length > 0 && points[0].distance !== undefined) {
      console.log('[useControlPointMap] ✅ Using pre-calculated distances from parent')
      return points
    }
    
    // Otherwise, calculate distance if we have a survey center
    if (!surveyCenter) {
      console.log('[useControlPointMap] ⚠️ No survey center, returning points without distance')
      return points
    }

    console.log('[useControlPointMap] 📐 Calculating distances...')
    return points.map((point: ControlPoint) => {
      // Only calculate distance if point has WGS84 coordinates
      if (point.lat_wgs84 != null && point.lng_wgs84 != null) {
        return {
          ...point,
          distance: calculateDistance(
            surveyCenter.lat,
            surveyCenter.lng,
            point.lat_wgs84,
            point.lng_wgs84
          )
        }
      } else {
        console.warn(`[useControlPointMap] Cannot calculate distance for point ${point.id}: missing WGS84 coordinates`)
        return {
          ...point,
          distance: undefined
        }
      }
    })
  })

  const suggestedMeridian = computed(() => {
    const surveyCenter = surveyCenterGetter()
    if (!surveyCenter) return null
    return detectCentralMeridian(surveyCenter.lng)
  })

  const filteredAndSortedPoints = computed(() => {
    let filtered = pointsWithDistance.value
    
    console.log('[useControlPointMap] 🔍 Initial points:', filtered.length)
    if (filtered.length > 0) {
      console.log('[useControlPointMap] 📍 Sample point:', {
        id: filtered[0].id,
        monu_num: filtered[0].monu_num,
        y: filtered[0].y,
        x: filtered[0].x,
        distance: filtered[0].distance
      })
    }

    // Search filter
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      console.log('[useControlPointMap] 🔍 Applying search filter:', query)
      filtered = filtered.filter(
        (p) =>
          p.monu_num?.toLowerCase().includes(query) ||
          p.type?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.y?.toString().includes(query) ||
          p.x?.toString().includes(query)
      )
      console.log('[useControlPointMap] 🔍 After search filter:', filtered.length)
    }

    // Favorites filter
    if (showFavoritesOnly.value) {
      console.log('[useControlPointMap] ⭐ Applying favorites filter')
      filtered = filtered.filter((p) => favorites.value.has(p.id))
      console.log('[useControlPointMap] ⭐ After favorites filter:', filtered.length)
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy.value) {
        case 'distance':
          return (a.distance || Infinity) - (b.distance || Infinity)
        case 'name':
          return (a.monu_num || '').localeCompare(b.monu_num || '')
        case 'code':
          return (a.type || '').localeCompare(b.type || '')
        default:
          return 0
      }
    })
    
    console.log('[useControlPointMap] ✅ Final filtered points:', sorted.length)

    return sorted
  })

  const recommendations = computed(() => {
    const surveyCenter = surveyCenterGetter()
    if (!surveyCenter) return []
    return generateRecommendations(
      pointsWithDistance.value,
      surveyCenter,
      favorites.value,
      5
    )
  })

  // Watch for filtered points changes and update map
  watch(filteredAndSortedPoints, (newPoints) => {
    console.log('[useControlPointMap] 🔄 Filtered points changed:', newPoints.length)
    // Only update if map is loaded AND style is loaded
    if (map.value && map.value.loaded() && map.value.isStyleLoaded()) {
      console.log('[useControlPointMap] 🗺️ Map and style loaded, re-adding points...')
      // Use nextTick to ensure all reactive updates are complete
      nextTick(() => {
        addPointsToMap()
      })
    } else {
      console.log('[useControlPointMap] ⏳ Map or style not loaded yet, will add points on load')
    }
  }, { flush: 'post' })

  // Map initialization
  function initMap() {
    if (!mapContainer.value) return

    const surveyCenter = surveyCenterGetter()
    map.value = new maplibregl.Map({
      container: mapContainer.value,
      style: 'https://demotiles.maplibre.org/style.json',
      center: surveyCenter
        ? [surveyCenter.lng, surveyCenter.lat]
        : [30.0, -19.0],
      zoom: surveyCenter ? 10 : 6
    })

    map.value.on('load', () => {
      addPointsToMap()
      if (surveyCenter) {
        addSurveyCenterMarker()
      }
    })
  }

  function addSurveyCenterMarker() {
    const surveyCenter = surveyCenterGetter()
    if (!map.value || !surveyCenter) return

    const el = document.createElement('div')
    el.className = 'survey-center-marker'
    el.innerHTML = '📍'
    el.style.fontSize = '28px'
    el.style.cursor = 'default'

    new maplibregl.Marker({ element: el })
      .setLngLat([surveyCenter.lng, surveyCenter.lat])
      .setPopup(
        new maplibregl.Popup({ offset: 25 }).setHTML(
          '<div style="padding: 4px;"><strong>Survey Center</strong></div>'
        )
      )
      .addTo(map.value)
  }

  function addPointsToMap() {
    if (!map.value) {
      console.log('[useControlPointMap] ⚠️ Map not initialized yet')
      return
    }

    if (!map.value.isStyleLoaded()) {
      console.log('[useControlPointMap] ⚠️ Style not loaded yet, waiting...')
      return
    }

    console.log('[useControlPointMap] 🗺️ Adding points to map:', filteredAndSortedPoints.value.length)
    
    // Don't add if no points
    if (filteredAndSortedPoints.value.length === 0) {
      console.log('[useControlPointMap] ℹ️ No points to add, skipping')
      return
    }

    // Remove old source and layers if they exist
    if (map.value.getLayer('control-points-symbols')) {
      map.value.removeLayer('control-points-symbols')
    }
    if (map.value.getLayer('control-points-labels')) {
      map.value.removeLayer('control-points-labels')
    }
    if (map.value.getSource('control-points')) {
      map.value.removeSource('control-points')
    }

    // Create cadastral triangle symbol (SGO standard for control points/trig beacons)
    // Black triangle with white inscribed circle at centroid
    const triangleSize = 48
    const triangleCanvas = document.createElement('canvas')
    triangleCanvas.width = triangleSize
    triangleCanvas.height = triangleSize
    const ctx = triangleCanvas.getContext('2d')!
    
    // Draw black triangle (cadastral symbol for trigonometrical beacon)
    ctx.fillStyle = '#000000' // Black fill (SGO standard)
    ctx.strokeStyle = '#ffffff' // White border for visibility
    ctx.lineWidth = 3
    
    // Triangle path (equilateral triangle pointing up)
    ctx.beginPath()
    ctx.moveTo(triangleSize / 2, 8) // Top point
    ctx.lineTo(triangleSize - 8, triangleSize - 8) // Bottom right
    ctx.lineTo(8, triangleSize - 8) // Bottom left
    ctx.closePath()
    
    // Fill and stroke
    ctx.fill()
    ctx.stroke()
    
    // Draw white inscribed circle (SGO standard enhancement)
    // Calculate incircle for equilateral triangle
    const triangleHeight = triangleSize - 16 // Height of the triangle (32px)
    const side = (triangleHeight * 2) / Math.sqrt(3) // Side length from height
    const fullInRadius = (side * Math.sqrt(3)) / 6 // Full incircle radius
    const inRadius = fullInRadius * 0.25 // Reduce by 75% (keep 25%)
    
    // Position at centroid (center of mass) of the triangle
    // For equilateral triangle, centroid is at 1/3 of height from base
    const centerX = triangleSize / 2 // Horizontal center
    const centerY = triangleSize - 8 - (triangleHeight / 3) // Centroid Y position
    
    ctx.fillStyle = '#ffffff' // White circle fill
    ctx.strokeStyle = '#000000' // Black circle outline
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(centerX, centerY, inRadius, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke() // Add black circumference
    
    // Add the triangle icon to the map
    if (!map.value.hasImage('control-point-triangle')) {
      map.value.addImage('control-point-triangle', ctx.getImageData(0, 0, triangleSize, triangleSize))
    }
    
    // Create selected version (red triangle)
    const selectedCanvas = document.createElement('canvas')
    selectedCanvas.width = triangleSize
    selectedCanvas.height = triangleSize
    const ctxSelected = selectedCanvas.getContext('2d')!
    
    // Draw red triangle for selected points
    ctxSelected.fillStyle = '#dc2626' // Red fill
    ctxSelected.strokeStyle = '#ffffff' // White border
    ctxSelected.lineWidth = 3
    
    ctxSelected.beginPath()
    ctxSelected.moveTo(triangleSize / 2, 8)
    ctxSelected.lineTo(triangleSize - 8, triangleSize - 8)
    ctxSelected.lineTo(8, triangleSize - 8)
    ctxSelected.closePath()
    ctxSelected.fill()
    ctxSelected.stroke()
    
    // Draw white inscribed circle
    ctxSelected.fillStyle = '#ffffff'
    ctxSelected.strokeStyle = '#dc2626' // Red outline
    ctxSelected.lineWidth = 1.5
    ctxSelected.beginPath()
    ctxSelected.arc(centerX, centerY, inRadius, 0, 2 * Math.PI)
    ctxSelected.fill()
    ctxSelected.stroke()
    
    if (!map.value.hasImage('control-point-triangle-selected')) {
      map.value.addImage('control-point-triangle-selected', ctxSelected.getImageData(0, 0, triangleSize, triangleSize))
    }

    // Create GeoJSON from filtered points
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: filteredAndSortedPoints.value
        .filter((point) => {
          // Validate WGS84 coordinates exist
          const hasWGS84 = point.lng_wgs84 != null && point.lat_wgs84 != null
          if (!hasWGS84) {
            console.warn(`[useControlPointMap] ⚠️ Point ${point.id} (${point.monu_num}) missing WGS84 coordinates, skipping`)
            console.warn('  Gauss coords:', { y: point.y, x: point.x })
            console.warn('  WGS84 coords:', { lng: point.lng_wgs84, lat: point.lat_wgs84 })
          }
          return hasWGS84
        })
        .map((point) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [point.lng_wgs84!, point.lat_wgs84!] as [number, number]
          },
          properties: {
            id: point.id,
            monu_num: point.monu_num || 'Unknown',
            type: point.type || '',
            description: point.description || '',
            distance: point.distance || 0,
            isSelected: selectedIdsGetter().includes(point.id),
            // Short ID for low zoom (first 6 chars or number only)
            shortId: (point.monu_num || '').replace(/[^0-9]/g, '').slice(0, 4) || (point.monu_num || '').slice(0, 6)
          }
        }))
    }
    
    console.log(`[useControlPointMap] 📍 Created ${geojson.features.length} valid GeoJSON features`)

    // Add source
    map.value.addSource('control-points', {
      type: 'geojson',
      data: geojson
    })

    // Add symbol layer for markers using cadastral triangle
    map.value.addLayer({
      id: 'control-points-symbols',
      type: 'symbol',
      source: 'control-points',
      layout: {
        'icon-image': [
          'case',
          ['get', 'isSelected'],
          'control-point-triangle-selected',  // Red triangle for selected
          'control-point-triangle'  // Black triangle for unselected
        ],
        'icon-size': [
          'case',
          ['get', 'isSelected'],
          0.7,   // Larger for selected
          0.5    // Smaller for unselected
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': false
      }
    })

    // Add adaptive labels with zoom-based text to avoid clutter
    map.value.addLayer({
      id: 'control-points-labels',
      type: 'symbol',
      source: 'control-points',
      layout: {
        // Adaptive text field based on zoom level
        'text-field': [
          'step', ['zoom'],
          '',  // No labels below zoom 9
          9, ['get', 'shortId'],  // Short ID from zoom 9-12
          12, ['get', 'monu_num'],  // Full monument number from zoom 12-14
          14, [
            'concat',
            ['get', 'monu_num'],  // Monument number
            '\n',
            ['to-string', ['round', ['get', 'distance']]],  // Distance in km
            ' km'
          ]
        ],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          9, 9,    // Small text at zoom 9
          12, 11,  // Medium at zoom 12
          15, 13   // Larger at zoom 15
        ],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-max-width': 12,
        'text-allow-overlap': false,  // Prevent label overlap
        'text-optional': true,  // Hide labels if they would overlap
        // Prioritize selected points
        'symbol-sort-key': [
          'case',
          ['get', 'isSelected'],
          0,   // Selected points have higher priority (lower number = higher priority)
          1    // Unselected points have lower priority
        ]
      },
      paint: {
        'text-color': [
          'case',
          ['get', 'isSelected'],
          '#991b1b',  // Dark red for selected
          '#1e40af'   // Dark blue for unselected
        ],
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 0.5
      }
    })

    // Add click interaction for popups
    map.value.on('click', 'control-points-symbols', (e: any) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0]
        const coordinates = feature.geometry.coordinates.slice()
        const { monu_num, type, description, distance } = feature.properties
        const [lng, lat] = coordinates

        new maplibregl.Popup()
          .setLngLat(coordinates)
          .setHTML(`
            <div style="padding: 8px; min-width: 200px;">
              <strong style="font-size: 14px;">${monu_num}</strong>
              <p style="margin: 4px 0; color: #666; font-size: 12px;">${type}</p>
              <p style="margin: 4px 0; font-size: 11px; font-family: monospace;">
                ${lat.toFixed(6)}, ${lng.toFixed(6)}
              </p>
              ${distance ? `<p style="margin: 4px 0; font-size: 12px;">📍 ${distance.toFixed(1)} km away</p>` : ''}
              ${description ? `<p style="margin: 4px 0; font-size: 11px; color: #666;">${description}</p>` : ''}
            </div>
          `)
          .addTo(map.value!)
      }
    })

    // Change cursor on hover
    map.value.on('mouseenter', 'control-points-symbols', () => {
      map.value!.getCanvas().style.cursor = 'pointer'
    })

    map.value.on('mouseleave', 'control-points-symbols', () => {
      map.value!.getCanvas().style.cursor = ''
    })

    console.log('[useControlPointMap] ✅ Added symbol layers with adaptive labels')
  }

  function updateMarkers() {
    if (!map.value) return
    
    // Update the GeoJSON source with new selection state
    const source = map.value.getSource('control-points') as maplibregl.GeoJSONSource
    if (!source) {
      console.log('[useControlPointMap] ⚠️ Source not found, re-adding points')
      addPointsToMap()
      return
    }
    
    // Recreate GeoJSON with updated selection state (only points with WGS84 coords)
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: filteredAndSortedPoints.value
        .filter((point) => point.lng_wgs84 != null && point.lat_wgs84 != null)
        .map((point) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [point.lng_wgs84!, point.lat_wgs84!] as [number, number]
          },
          properties: {
            id: point.id,
            monu_num: point.monu_num || 'Unknown',
            type: point.type || '',
            description: point.description || '',
            distance: point.distance || 0,
            isSelected: selectedIdsGetter().includes(point.id),
            shortId: (point.monu_num || '').replace(/[^0-9]/g, '').slice(0, 4) || (point.monu_num || '').slice(0, 6)
          }
        }))
    }
    
    source.setData(geojson)
    console.log('[useControlPointMap] ✅ Updated markers with new selection state')
  }

  // Map controls
  function zoomIn() {
    map.value?.zoomIn()
  }

  function zoomOut() {
    map.value?.zoomOut()
  }

  function fitBounds() {
    if (!map.value || filteredAndSortedPoints.value.length === 0) return

    const surveyCenter = surveyCenterGetter()
    const bounds = new maplibregl.LngLatBounds()
    
    // Only include points with valid WGS84 coordinates
    filteredAndSortedPoints.value.forEach((point) => {
      if (point.lng_wgs84 != null && point.lat_wgs84 != null) {
        bounds.extend([point.lng_wgs84, point.lat_wgs84])
      }
    })

    if (surveyCenter) {
      bounds.extend([surveyCenter.lng, surveyCenter.lat])
    }

    map.value.fitBounds(bounds, { padding: 50 })
  }

  function zoomToPoint(point: ControlPoint) {
    if (map.value && point.lng_wgs84 != null && point.lat_wgs84 != null) {
      map.value.flyTo({
        center: [point.lng_wgs84, point.lat_wgs84],
        zoom: 14,
        duration: 1000
      })
    } else {
      console.warn('[useControlPointMap] Cannot zoom to point: missing WGS84 coordinates', point.id)
    }
  }

  function toggleSatellite() {
    showSatellite.value = !showSatellite.value
    // Placeholder for satellite toggle
  }

  // Point interaction
  function highlightPoint(id: number) {
    highlightedPointId.value = id
    const marker = markers.value.get(id)
    if (marker) {
      const el = marker.getElement()
      el.style.transform = 'scale(1.5)'
    }
  }

  function unhighlightPoint(id: number) {
    highlightedPointId.value = null
    const marker = markers.value.get(id)
    if (marker) {
      const el = marker.getElement()
      el.style.transform = 'scale(1)'
    }
  }

  // Favorites management
  function toggleFavorite(id: number) {
    if (favorites.value.has(id)) {
      favorites.value.delete(id)
    } else {
      favorites.value.add(id)
    }
    saveFavorites(favorites.value, projectId)
  }

  function isFavorite(id: number): boolean {
    return favorites.value.has(id)
  }

  // Recently used management
  function addToRecentlyUsed(id: number) {
    recentlyUsed.value = addToRecentlyUsedUtil(id, recentlyUsed.value)
    saveRecentlyUsed(recentlyUsed.value, projectId)
  }

  // Filter management
  function clearFilters() {
    searchQuery.value = ''
    sortBy.value = 'distance'
    showFavoritesOnly.value = false
  }

  // Lifecycle
  onMounted(() => {
    favorites.value = loadFavorites(projectId)
    recentlyUsed.value = loadRecentlyUsed(projectId)
  })

  onUnmounted(() => {
    if (map.value) {
      map.value.remove()
    }
  })

  // Watchers
  watch(
    () => filteredAndSortedPoints.value,
    () => {
      if (map.value) {
        addPointsToMap()
      }
    }
  )

  return {
    // Refs
    mapContainer,
    map,
    
    // State
    viewMode,
    showSatellite,
    searchQuery,
    sortBy,
    showFavoritesOnly,
    highlightedPointId,
    favorites,
    recentlyUsed,
    
    // Computed
    pointsWithDistance,
    suggestedMeridian,
    filteredAndSortedPoints,
    recommendations,
    
    // Methods
    initMap,
    zoomIn,
    zoomOut,
    fitBounds,
    zoomToPoint,
    toggleSatellite,
    highlightPoint,
    unhighlightPoint,
    toggleFavorite,
    isFavorite,
    addToRecentlyUsed,
    clearFilters,
    updateMarkers
  }
}
