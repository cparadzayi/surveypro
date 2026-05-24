/**
 * Composable for Leaflet polygon drawing functionality
 * Provides QGIS-like polygon digitization experience
 */

import { ref, type Ref } from 'vue';
import L from 'leaflet';

export interface DrawingPoint {
  latlng: L.LatLng;
  matched?: boolean;
  pointId?: string;
}

export interface UsePolygonDrawingOptions {
  map: Ref<L.Map | null>;
  onPolygonComplete?: (points: L.LatLng[]) => void;
  snappingTolerance?: number;
}

export function usePolygonDrawing(options: UsePolygonDrawingOptions) {
  const { map, onPolygonComplete, snappingTolerance = 10 } = options;
  
  const isDrawing = ref(false);
  const drawingPoints = ref<L.LatLng[]>([]);
  const currentPolygon = ref<L.Polygon | null>(null);
  const temporaryMarkers = ref<L.CircleMarker[]>([]);
  
  /**
   * Start drawing mode
   */
  function startDrawing() {
    if (!map.value) return;
    
    isDrawing.value = true;
    drawingPoints.value = [];
    clearTemporaryLayers();
    
    // Change cursor
    map.value.getContainer().style.cursor = 'crosshair';
  }
  
  /**
   * Add point to drawing
   */
  function addPoint(latlng: L.LatLng) {
    if (!map.value || !isDrawing.value) return;
    
    drawingPoints.value.push(latlng);
    
    // Add visual marker
    const marker = L.circleMarker(latlng, {
      radius: 5,
      fillColor: '#fbbf24',
      color: '#f59e0b',
      weight: 2,
      fillOpacity: 1
    }).addTo(map.value) as L.CircleMarker;
    
    temporaryMarkers.value.push(marker);
    
    // Update polygon preview
    updatePolygonPreview();
  }
  
  /**
   * Update polygon preview as user draws
   */
  function updatePolygonPreview() {
    if (!map.value) return;
    
    // Remove existing preview
    if (currentPolygon.value) {
      map.value.removeLayer(currentPolygon.value);
    }
    
    // Draw new preview if we have at least 2 points
    if (drawingPoints.value.length >= 2) {
      currentPolygon.value = L.polygon(drawingPoints.value, {
        color: '#fbbf24',
        fillColor: '#fef3c7',
        fillOpacity: 0.3,
        weight: 2,
        dashArray: '5, 5'
      }).addTo(map.value) as L.Polygon;
    }
  }
  
  /**
   * Finish drawing and return polygon
   */
  function finishDrawing(): L.LatLng[] | null {
    if (!map.value || drawingPoints.value.length < 3) {
      alert('Minimum 3 points required to create a polygon.');
      return null;
    }
    
    const points = [...drawingPoints.value];
    
    // Clean up
    clearTemporaryLayers();
    isDrawing.value = false;
    drawingPoints.value = [];
    map.value.getContainer().style.cursor = '';
    
    // Callback
    if (onPolygonComplete) {
      onPolygonComplete(points);
    }
    
    return points;
  }
  
  /**
   * Cancel drawing
   */
  function cancelDrawing() {
    if (!map.value) return;
    
    clearTemporaryLayers();
    isDrawing.value = false;
    drawingPoints.value = [];
    map.value.getContainer().style.cursor = '';
  }
  
  /**
   * Clear temporary drawing layers
   */
  function clearTemporaryLayers() {
    if (!map.value) return;
    
    // Remove polygon preview
    if (currentPolygon.value) {
      map.value.removeLayer(currentPolygon.value as any);
      currentPolygon.value = null;
    }
    
    // Remove markers
    temporaryMarkers.value.forEach(marker => {
      map.value!.removeLayer(marker as any);
    });
    temporaryMarkers.value = [];
  }
  
  /**
   * Remove last point
   */
  function undoLastPoint() {
    if (drawingPoints.value.length === 0) return;
    
    drawingPoints.value.pop();
    
    // Remove last marker
    const lastMarker = temporaryMarkers.value.pop();
    if (lastMarker && map.value) {
      map.value.removeLayer(lastMarker);
    }
    
    // Update preview
    updatePolygonPreview();
  }
  
  return {
    isDrawing,
    drawingPoints,
    startDrawing,
    addPoint,
    finishDrawing,
    cancelDrawing,
    undoLastPoint
  };
}
