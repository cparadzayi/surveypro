/**
 * Composable for managing land parcels
 * Handles parcel creation, storage, and area computation
 */

import { ref, computed, type Ref } from 'vue';
import L from 'leaflet';
import { areaCompute, type AreaComputeResponse } from '../services/compute';

export interface ParcelPoint {
  id: string;
  y: number;
  x: number;
  status?: string;
}

export interface Parcel {
  id?: number;
  designation: string;
  points: ParcelPoint[];
  areaResult?: AreaComputeResponse;
  polygon?: any; // L.Polygon (using any to avoid type conflicts)
  projectId?: number;
  saved?: boolean;
}

export function useParcelManagement() {
  const parcels = ref<Parcel[]>([]);
  const isComputing = ref(false);
  
  /**
   * Add new parcel
   */
  async function addParcel(designation: string, points: ParcelPoint[], polygon?: L.Polygon): Promise<Parcel> {
    const newParcel: Parcel = {
      designation,
      points: [...points],
      polygon,
      saved: false
    };
    
    parcels.value.push(newParcel);
    
    // Compute area automatically
    await computeParcelArea(parcels.value.length - 1);
    
    return newParcel;
  }
  
  /**
   * Compute area for a specific parcel
   */
  async function computeParcelArea(index: number): Promise<void> {
    const parcel = parcels.value[index];
    if (!parcel || parcel.points.length < 3) return;
    
    isComputing.value = true;
    
    try {
      const result = await areaCompute({
        points: parcel.points.map(p => ({ y: p.y, x: p.x })),
        includeResiduals: true
      });
      parcel.areaResult = result;
      console.log(`[Parcel] Area computed for "${parcel.designation}":`, result.area.abs_m2, 'm²');
    } catch (error) {
      console.error(`[Parcel] Failed to compute area for "${parcel.designation}":`, error);
    } finally {
      isComputing.value = false;
    }
  }
  
  /**
   * Compute areas for all parcels
   */
  async function computeAllAreas(): Promise<void> {
    isComputing.value = true;
    
    for (let i = 0; i < parcels.value.length; i++) {
      if (!parcels.value[i].areaResult) {
        await computeParcelArea(i);
      }
    }
    
    isComputing.value = false;
  }
  
  /**
   * Delete parcel
   */
  function deleteParcel(index: number, map?: L.Map): void {
    const parcel = parcels.value[index];
    
    // Remove polygon from map if exists
    if (parcel.polygon && map) {
      map.removeLayer(parcel.polygon as any);
    }
    
    parcels.value.splice(index, 1);
  }
  
  /**
   * Clear all parcels
   */
  function clearAllParcels(map?: L.Map): void {
    if (map) {
      parcels.value.forEach(parcel => {
        if (parcel.polygon) {
          map.removeLayer(parcel.polygon as any);
        }
      });
    }
    
    parcels.value = [];
  }
  
  /**
   * Update parcel designation
   */
  function updateParcelDesignation(index: number, designation: string): void {
    if (parcels.value[index]) {
      parcels.value[index].designation = designation;
    }
  }
  
  /**
   * Get parcel by index
   */
  function getParcel(index: number): Parcel | undefined {
    return parcels.value[index];
  }
  
  /**
   * Find matching survey points from drawn polygon vertices
   */
  function findMatchingPoints(
    drawnPoints: L.LatLng[],
    availablePoints: ParcelPoint[],
    threshold: number = 50
  ): ParcelPoint[] {
    const matched: ParcelPoint[] = [];
    
    drawnPoints.forEach(latlng => {
      // Leaflet uses [lat, lng] which maps to [-y, -x] in our coordinate system
      const targetY = -latlng.lat;
      const targetX = -latlng.lng;
      
      let closest: ParcelPoint | null = null;
      let minDist = Infinity;
      
      availablePoints.forEach(point => {
        const dist = Math.sqrt(
          Math.pow(point.y - targetY, 2) + Math.pow(point.x - targetX, 2)
        );
        
        if (dist < minDist && dist < threshold) {
          minDist = dist;
          closest = point;
        }
      });
      
      // Only add if found and not already in matched list
      if (closest && !matched.find(p => p.id === closest!.id)) {
        matched.push(closest);
      }
    });
    
    return matched;
  }
  
  // Computed properties
  const totalParcels = computed(() => parcels.value.length);
  
  const computedParcelsCount = computed(() =>
    parcels.value.filter(p => p.areaResult !== undefined).length
  );
  
  const totalArea = computed(() =>
    parcels.value
      .filter(p => p.areaResult)
      .reduce((sum, p) => sum + p.areaResult!.area.abs_m2, 0)
  );
  
  const totalAreaHa = computed(() => totalArea.value / 10000);
  
  const allParcelsComputed = computed(() =>
    totalParcels.value > 0 && computedParcelsCount.value === totalParcels.value
  );
  
  return {
    parcels,
    isComputing,
    totalParcels,
    computedParcelsCount,
    totalArea,
    totalAreaHa,
    allParcelsComputed,
    addParcel,
    computeParcelArea,
    computeAllAreas,
    deleteParcel,
    clearAllParcels,
    updateParcelDesignation,
    getParcel,
    findMatchingPoints
  };
}
