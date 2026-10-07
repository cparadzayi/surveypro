import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

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

  // Requests must carry the bearer token. These previously used bare fetch()
  // with a hardcoded http://localhost:3050/api base, so parcel CRUD failed
  // entirely outside the developer's machine and never surfaced a 401.
  // Bumped per load so a slow response for a previous project cannot overwrite
  // the current one (see loadParcels).
  let loadToken = 0;

  const currentParcels = computed(() => {
    if (!currentProjectId.value) return [];
    return parcels.value.filter(p => p.project_id === currentProjectId.value);
  });

  const draftParcels = computed(() => currentParcels.value.filter(p => p.status === 'draft'));
  const calculatedParcels = computed(() => currentParcels.value.filter(p => p.status === 'calculated'));

  async function loadParcels(projectId: number) {
    const token = ++loadToken;
    isLoading.value = true;
    error.value = null;
    currentProjectId.value = projectId;

    try {
      const response = await api.get(`/parcels/${projectId}`);
      const data = response.data;
      // Discard a response the user has already navigated away from: assigning
      // here would repopulate `parcels` with the previous project's rows while
      // currentProjectId reads the new one, and currentParcels filters on it.
      if (token !== loadToken) return;
      if (data.success) {
        parcels.value = data.data;
      }
    } catch (err) {
      if (token !== loadToken) return;
      error.value = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      if (token === loadToken) isLoading.value = false;
    }
  }

  async function createParcel(parcel: Omit<LandParcel, 'id'>) {
    try {
      console.log('[Parcels Store] Creating parcel:', parcel.parcel_number);
      const response = await api.post('/parcels', parcel);
      const data = response.data;
      if (data.success) {
        parcels.value.push(data.data);
      }
      return data.data;
    } catch (err) {
      console.error('[Parcels Store] Error creating parcel:', err);
      throw err;
    }
  }

  async function updateParcel(id: number, updates: Partial<LandParcel>) {
    try {
      const response = await api.put(`/parcels/${id}`, updates);
      const data = response.data;
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
      await api.delete(`/parcels/${id}`);
      parcels.value = parcels.value.filter(p => p.id !== id);
    } catch (err) {
      console.error('[Parcels Store] Error deleting parcel:', err);
      throw err;
    }
  }

  async function checkDuplicate(projectId: number, parcelNumber: string) {
    try {
      const response = await api.get(
        `/parcels/${projectId}/check-duplicate/${encodeURIComponent(parcelNumber)}`
      );
      return response.data.exists;
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
