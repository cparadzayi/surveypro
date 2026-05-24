import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

interface FieldBookEntry {
  id?: number
  project_id: number
  field_book_id: number
  page_id?: number
  entry_number?: number
  point: string
  y_coordinate: number  // Westing
  x_coordinate: number  // Southing
  status: 'F' | 'P' | 'R' | 'D' | 'C'  // Found, Placed, Replaced, Destroyed, Calculated
  monument_type?: string
  monument_condition?: string
  calcs_page?: number
  description?: string
  date_of_survey?: string
  survey_method?: string
  accuracy_class?: string
  horizontal_accuracy?: number
  vertical_accuracy?: number
  notes?: string
  created_at?: string
  updated_at?: string
}

interface ElectronicFieldBook {
  id: number
  project_id: number
  title: string
  surveyor_name?: string
  surveyor_registration?: string
  survey_of?: string
  survey_date?: string
  survey_location?: string
  instruments?: Array<any>
  surveyor_address?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface Project {
  id: number
  name: string
  description?: string
  coordinate_system?: string
  zone?: string
  central_meridian?: number
  created_at: string
  updated_at: string
}

interface StandCalculation {
  id?: number
  project_id: number
  stand_number: string
  property_description?: string
  area_hectares: number
  area_square_meters: number
  perimeter: number
  boundary_coordinates: Array<{point: string, y: number, x: number}>
  calculation_method?: string
  created_at?: string
}

interface ComputationResult {
  id?: number
  project_id: number
  sheet_type: string
  calculation_data: any
  input_points?: any
  output_points?: any
  created_at?: string
}

export const useSurveyStore = defineStore('survey', () => {
  const currentProject = ref<Project | null>(null)
  const currentFieldBook = ref<ElectronicFieldBook | null>(null)
  const fieldData = ref<FieldBookEntry[]>([])
  const standCalculations = ref<StandCalculation[]>([])
  const computationHistory = ref<ComputationResult[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const getFieldDataByPage = computed(() => (page: number, itemsPerPage = 20) => {
    const start = (page - 1) * itemsPerPage
    const end = start + itemsPerPage
    return fieldData.value.slice(start, end)
  })

  const totalPages = computed(() => Math.ceil(fieldData.value.length / 20))

  const foundMonuments = computed(() => fieldData.value.filter((item: FieldBookEntry) => item.status === 'F'))
  const placedMonuments = computed(() => fieldData.value.filter((item: FieldBookEntry) => item.status === 'P'))
  const calculatedPoints = computed(() => fieldData.value.filter((item: FieldBookEntry) => item.status === 'C'))

  // Actions
  const loadProject = async (projectId: number) => {
    try {
      isLoading.value = true
      error.value = null
      
      const response = await api.get(`/api/projects/${projectId}/dev`)
      
      currentProject.value = response.data
      await loadFieldData(projectId)
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to load project'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadFieldData = async (projectId: number) => {
    try {
      isLoading.value = true
      error.value = null
      
      const response = await api.get(`/api/field-data/project/${projectId}`)
      
      fieldData.value = response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to load field data'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const uploadFieldBook = async (file: File, projectId: number) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('projectId', projectId.toString())

    try {
      isLoading.value = true
      error.value = null
      
      const response = await api.post('/api/field-data/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      await loadFieldData(projectId)
      await loadFieldBook(projectId)
      return response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to upload field book'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadFieldBook = async (projectId: number) => {
    try {
      isLoading.value = true
      error.value = null
      
      const response = await api.get(`/api/field-book/${projectId}`)
      currentFieldBook.value = response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to load field book'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const generateStandCalculation = async (projectId: number, standNumber: string, boundaryPoints: string[], propertyDescription?: string) => {
    try {
      isLoading.value = true
      error.value = null
      
      const response = await api.post('/api/computations/stand-area', {
        project_id: projectId,
        stand_number: standNumber,
        boundary_points: boundaryPoints,
        property_description: propertyDescription
      })
      
      await loadStandCalculations(projectId)
      return response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to calculate stand area'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadStandCalculations = async (projectId: number) => {
    try {
      const response = await api.get(`/api/computations/stands/${projectId}`)
      standCalculations.value = response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to load stand calculations'
      throw err
    }
  }

  const loadComputationHistory = async (projectId: number) => {
    try {
      const response = await api.get(`/api/computations/history/${projectId}`)
      computationHistory.value = response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to load computation history'
      throw err
    }
  }

  const generateFieldBook = async (projectId: number, format: 'json' | 'pdf' | 'geojson' = 'json') => {
    try {
      isLoading.value = true
      error.value = null
      
      const response = await api.get(
        `/api/field-data/generate-field-book/${projectId}`,
        {
          params: { format },
          responseType: format === 'pdf' || format === 'geojson' ? 'blob' : 'json'
        }
      )
      
      return response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to generate field book'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const downloadFieldBook = async (projectId: number, format: 'pdf' | 'geojson', fileName?: string) => {
    try {
      const blob = await generateFieldBook(projectId, format)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      const extension = format === 'pdf' ? 'pdf' : 'geojson'
      const defaultName = `fieldbook-${projectId}.${extension}`
      link.setAttribute('download', fileName || defaultName)
      
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to download field book'
      throw err
    }
  }

  const clearError = () => {
    error.value = null
  }

  const reset = () => {
    currentProject.value = null
    currentFieldBook.value = null
    fieldData.value = []
    standCalculations.value = []
    computationHistory.value = []
    error.value = null
    isLoading.value = false
  }

  return {
    // State
    currentProject,
    currentFieldBook,
    fieldData,
    standCalculations,
    computationHistory,
    isLoading,
    error,
    
    // Getters
    getFieldDataByPage,
    totalPages,
    foundMonuments,
    placedMonuments,
    calculatedPoints,
    
    // Actions
    loadProject,
    loadFieldData,
    loadFieldBook,
    uploadFieldBook,
    generateFieldBook,
    downloadFieldBook,
    generateStandCalculation,
    loadStandCalculations,
    loadComputationHistory,
    clearError,
    reset
  }
})
