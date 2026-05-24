import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface LandParcel {
  id?: number;
  project_id: number;
  parcel_number: string;
  parcel_name?: string;
  boundary_points: string[];
  area_sqm?: number;
  area_hectares?: number;
  area_acres?: number;
  status: 'draft' | 'calculated';
  geometry_geojson?: any;
  
  // QGIS-style measurements
  perimeter_m?: number;
  compactness_index?: number;
  
  // Shape statistics
  shape_type?: 'Regular' | 'Moderate' | 'Irregular' | 'Highly Irregular';
  elongation_ratio?: number;
  longest_side_m?: number;
  shortest_side_m?: number;
  average_side_m?: number;
  
  // Validation fields
  is_valid_geometry?: boolean;
  validation_errors?: string[];
  validation_warnings?: string[];
  closure_error_m?: number;
  self_intersections?: number;
  has_spikes?: number;
  bounding_box?: [number, number, number, number];
  
  created_at?: string;
  updated_at?: string;
}

export const useParcelsStore = defineStore('parcels', () => {
  const parcels = ref<LandParcel[]>([]);
  const currentProjectId = ref<number | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3050/api';

  const currentParcels = computed(() => {
    if (!currentProjectId.value) return [];
    return parcels.value.filter(p => p.project_id === currentProjectId.value);
  });

  const draftParcels = computed(() => currentParcels.value.filter(p => p.status === 'draft'));
  const calculatedParcels = computed(() => currentParcels.value.filter(p => p.status === 'calculated'));

  async function loadParcels(projectId: number) {
    isLoading.value = true;
    error.value = null;
    currentProjectId.value = projectId;

    try {
      const response = await fetch(`${API_BASE}/parcels/${projectId}`);
      const data = await response.json();
      if (data.success) {
        parcels.value = data.data;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      isLoading.value = false;
    }
  }

  async function createParcel(parcel: Omit<LandParcel, 'id'>) {
    try {
      console.log('[Parcels Store] Creating parcel:', parcel.parcel_number);
      const response = await fetch(`${API_BASE}/parcels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parcel)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.success) {
        parcels.value.push(data.data);
        console.log('[Parcels Store] Parcel created successfully:', data.data.id);
      }
      return data.data;
    } catch (err) {
      console.error('[Parcels Store] Error creating parcel:', err);
      throw err;
    }
  }

  async function updateParcel(id: number, updates: Partial<LandParcel>) {
    try {
      const response = await fetch(`${API_BASE}/parcels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const index = parcels.value.findIndex(p => p.id === id);
      if (index !== -1) parcels.value[index] = data.data;
      return data.data;
    } catch (err) {
      console.error('[Parcels Store] Error updating parcel:', err);
      throw err;
    }
  }

  async function deleteParcel(id: number) {
    try {
      const response = await fetch(`${API_BASE}/parcels/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      parcels.value = parcels.value.filter(p => p.id !== id);
    } catch (err) {
      console.error('[Parcels Store] Error deleting parcel:', err);
      throw err;
    }
  }

  async function checkDuplicate(projectId: number, parcelNumber: string) {
    try {
      const response = await fetch(`${API_BASE}/parcels/${projectId}/check-duplicate/${parcelNumber}`);
      
      if (!response.ok) {
        console.error('[Parcels Store] Duplicate check failed:', response.status);
        return false; // Assume not duplicate if check fails
      }
      
      const data = await response.json();
      return data.exists;
    } catch (err) {
      console.error('[Parcels Store] Error checking duplicate:', err);
      return false; // Assume not duplicate if check fails
    }
  }

  return {
    parcels,
    currentParcels,
    draftParcels,
    calculatedParcels,
    isLoading,
    error,
    loadParcels,
    createParcel,
    updateParcel,
    deleteParcel,
    checkDuplicate
  };
});
