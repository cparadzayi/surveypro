import { ref, computed } from 'vue'
import api from '../services/api'

/**
 * Build a message that says what actually went wrong.
 *
 * The backend returns a short summary in `error` and the real cause in
 * `details` — a Postgres message, a constraint violation, whatever the
 * database or validator said. Keeping only the summary is how a missing
 * column once surfaced as a bare "Failed to update survey project", with
 * the sentence that identified it discarded on arrival.
 */
const describeApiError = (err: any, fallback: string): string => {
  const body = err?.response?.data
  const summary = body?.error || fallback
  return body?.details ? `${summary}: ${body.details}` : summary
}

export interface Surveyor {
  id: number
  name: string
  license_number: string
  firm?: string
  address?: string
  phone?: string
  email?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type SurveyorType = 'registered' | 'in_training' | 'technician' | 'student'

/** What an administrator supplies to add a surveyor (the field names the server takes). */
export interface NewSurveyor {
  name: string
  email: string
  surveyorType: SurveyorType
  licenseNumber?: string
  registrationNumber?: string
  studentNumber?: string
  firm?: string
  address?: string
  phone?: string
  institution?: string
}

/** A one-time link for the new surveyor to set their password. */
export interface SetPasswordLink { token: string; expiresAt: string; resetPath: string }

export interface CreatedSurveyor { surveyor: Surveyor; setPassword: SetPasswordLink | null }

export interface SurveyProject {
  id: number
  name: string
  surveyor_id: number
  surveyor_name?: string
  license_number?: string
  project_id?: number
  client_name?: string
  district?: string
  survey_type?: string
  survey_date?: string
  instruments?: string
  designation?: string
  working_directory?: string
  central_meridian?: number | null
  control_point_ids?: number[]
  control_points?: Array<{
    id: number
    monu_num: string
    monu_name: string
    point_order: number
  }>
  status: string
  /** When the project was last opened (set by POST /survey-projects/:id/touch); null if never. */
  last_used?: string | null
  /** Saved workflow progress ({ completed_steps: [...], ... }); null/absent for a project not started. */
  workflow_state?: unknown
  created_at: string
  updated_at: string
}

const surveyors = ref<Surveyor[]>([])
const surveyProjects = ref<SurveyProject[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

export function useSurveyors() {
  const fetchSurveyors = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await api.get('/surveyors')
      if (response.data.ok) {
        surveyors.value = response.data.surveyors
      }
    } catch (err: any) {
      error.value = describeApiError(err, 'Failed to fetch surveyors')
      console.error('Error fetching surveyors:', err?.response?.data ?? err)
    } finally {
      loading.value = false
    }
  }

  const getSurveyorById = async (id: number): Promise<Surveyor | null> => {
    try {
      const response = await api.get(`/surveyors/${id}`)
      if (response.data.ok) {
        return response.data.surveyor
      }
    } catch (err: any) {
      error.value = describeApiError(err, 'Failed to fetch surveyor')
      console.error('Error fetching surveyor:', err?.response?.data ?? err)
    }
    return null
  }

  /**
   * Adds a surveyor (an administrator only): the server makes the sign-in account, the profile and the
   * surveyor's own schema, and returns a one-time link for them to set their password. `setPassword` is
   * null when the account was made but the link could not be (issue one from the surveyor's card).
   *
   * Throws an Error whose message says what went wrong (a duplicate e-mail, a missing field...). It does
   * not use the shared `error`, which the surveyors page shows in place of its list: a refused form
   * should be reported on the form.
   */
  const createSurveyor = async (data: NewSurveyor): Promise<CreatedSurveyor> => {
    loading.value = true
    try {
      const response = await api.post('/surveyors', data)
      if (!response.data.ok) throw new Error('Failed to create surveyor')
      surveyors.value.push(response.data.surveyor)
      return { surveyor: response.data.surveyor, setPassword: response.data.setPassword ?? null }
    } catch (err: any) {
      console.error('Error creating surveyor:', err?.response?.data ?? err)
      throw new Error(err?.response ? describeApiError(err, 'Failed to create surveyor') : (err?.message || 'Failed to create surveyor'))
    } finally {
      loading.value = false
    }
  }

  const updateSurveyor = async (id: number, data: Partial<Surveyor>): Promise<Surveyor | null> => {
    loading.value = true
    error.value = null
    try {
      const response = await api.put(`/surveyors/${id}`, {
        name: data.name,
        licenseNumber: data.license_number,
        firm: data.firm,
        address: data.address,
        phone: data.phone,
        email: data.email
      })
      if (response.data.ok) {
        const index = surveyors.value.findIndex(s => s.id === id)
        if (index !== -1) {
          surveyors.value[index] = response.data.surveyor
        }
        return response.data.surveyor
      }
    } catch (err: any) {
      error.value = describeApiError(err, 'Failed to update surveyor')
      console.error('Error updating surveyor:', err?.response?.data ?? err)
    } finally {
      loading.value = false
    }
    return null
  }

  const deleteSurveyor = async (id: number): Promise<boolean> => {
    loading.value = true
    error.value = null
    try {
      const response = await api.delete(`/surveyors/${id}`)
      if (response.data.ok) {
        surveyors.value = surveyors.value.filter(s => s.id !== id)
        return true
      }
    } catch (err: any) {
      error.value = describeApiError(err, 'Failed to delete surveyor')
      console.error('Error deleting surveyor:', err?.response?.data ?? err)
    } finally {
      loading.value = false
    }
    return false
  }

  // Survey Projects (filtered by authenticated user's surveyor profile)
  const fetchSurveyProjects = async (surveyorProfileId?: number) => {
    console.log('[useSurveyors] 🔍 Fetching survey projects...')
    console.log('[useSurveyors] - Surveyor Profile ID:', surveyorProfileId || 'Auto (from auth)')
    
    loading.value = true
    error.value = null
    try {
      // Let backend auto-filter by authenticated user if no ID provided
      const url = surveyorProfileId 
        ? `/survey-projects?surveyorProfileId=${surveyorProfileId}`
        : `/survey-projects`
      
      console.log('[useSurveyors] - Request URL:', url)
      
      const response = await api.get(url)
      
      console.log('[useSurveyors] ✅ Response received:', response.data.ok)
      
      if (response.data.ok) {
        surveyProjects.value = response.data.projects
        console.log(`[useSurveyors] ✅ Loaded ${response.data.projects.length} projects`)
        
        // Log each project's details
        response.data.projects.forEach((project: SurveyProject, index: number) => {
          console.log(`[useSurveyors] 📋 Project ${index + 1}: "${project.name}" (ID: ${project.id})`)
          console.log(`[useSurveyors]   - Survey Type: ${project.survey_type || 'N/A'}`)
          console.log(`[useSurveyors]   - District: ${project.district || 'N/A'}`)
          console.log(`[useSurveyors]   - Survey Date: ${project.survey_date || 'N/A'}`)
          console.log(`[useSurveyors]   - Working Directory: ${project.working_directory || 'N/A'}`)
          console.log(`[useSurveyors]   - Designation: ${project.designation || 'N/A'}`)
          console.log(`[useSurveyors]   - Central Meridian: ${project.central_meridian || 'N/A'}`)
          console.log(`[useSurveyors]   - Control Points: ${project.control_point_ids?.length || 0}`)
        })
      }
    } catch (err: any) {
      error.value = describeApiError(err, 'Failed to fetch survey projects')
      console.error('[useSurveyors] ❌ Error fetching survey projects:', err?.response?.data ?? err)
      console.error('[useSurveyors] - Response status:', err.response?.status)
      console.error('[useSurveyors] - Response data:', err.response?.data)
      console.error('[useSurveyors] - Request URL:', err.config?.url)
    } finally {
      loading.value = false
    }
  }

  const createSurveyProject = async (data: any): Promise<boolean> => {
    loading.value = true
    error.value = null
    try {
      console.log(`[useSurveyors] Creating project with data:`, data)
      const response = await api.post('/survey-projects', data)
      console.log(`[useSurveyors] Create response:`, response.data)
      
      if (response.data.ok) {
        // Refresh the full list to get updated data with control points
        await fetchSurveyProjects()
        return true
      }
    } catch (err: any) {
      error.value = describeApiError(err, 'Failed to create survey project')
      console.error('Error creating survey project:', err?.response?.data ?? err)
    } finally {
      loading.value = false
    }
    return false
  }

  const updateSurveyProject = async (id: number, data: any): Promise<boolean> => {
    loading.value = true
    error.value = null
    try {
      console.log(`[useSurveyors] Updating project ${id} with data:`, data)
      const response = await api.put(`/survey-projects/${id}`, data)
      console.log(`[useSurveyors] Update response:`, response.data)
      
      if (response.data.ok) {
        // Refresh the full list to get updated data with control points
        await fetchSurveyProjects()
        return true
      }
    } catch (err: any) {
      error.value = describeApiError(err, 'Failed to update survey project')
      console.error('Error updating survey project:', err?.response?.data ?? err)
    } finally {
      loading.value = false
    }
    return false
  }

  const archiveSurveyProject = async (id: number): Promise<boolean> => {
    loading.value = true
    error.value = null
    try {
      console.log(`[useSurveyors] Archiving project ${id}`)
      const response = await api.delete(`/survey-projects/${id}`)
      console.log(`[useSurveyors] Archive response:`, response.data)
      
      if (response.data.ok) {
        // Refresh the list to remove archived project
        await fetchSurveyProjects()
        return true
      }
    } catch (err: any) {
      error.value = describeApiError(err, 'Failed to archive survey project')
      console.error('Error archiving survey project:', err?.response?.data ?? err)
    } finally {
      loading.value = false
    }
    return false
  }

  const deleteSurveyProject = async (id: number): Promise<boolean> => {
    loading.value = true
    error.value = null
    try {
      console.log(`[useSurveyors] Permanently deleting project ${id}`)
      const response = await api.delete(`/survey-projects/${id}?permanent=true`)
      console.log(`[useSurveyors] Delete response:`, response.data)
      
      if (response.data.ok) {
        // Refresh the list to remove deleted project
        await fetchSurveyProjects()
        return true
      }
    } catch (err: any) {
      error.value = describeApiError(err, 'Failed to delete survey project')
      console.error('Error deleting survey project:', err?.response?.data ?? err)
    } finally {
      loading.value = false
    }
    return false
  }

  const surveyorOptions = computed(() => 
    surveyors.value.map(s => ({
      value: s.id,
      label: `${s.name} (${s.license_number})`,
      surveyor: s
    }))
  )

  return {
    surveyors,
    surveyProjects,
    surveyorOptions,
    loading,
    error,
    fetchSurveyors,
    getSurveyorById,
    createSurveyor,
    updateSurveyor,
    deleteSurveyor,
    fetchSurveyProjects,
    createSurveyProject,
    updateSurveyProject,
    archiveSurveyProject,
    deleteSurveyProject
  }
}
