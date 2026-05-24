<template>
  <div class="space-y-4">
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title">
          Upload Field Book Data
        </h2>
        
        <div class="form-control w-full">
          <label class="label">
            <span class="label-text">Select CSV File</span>
          </label>
          <input 
            type="file" 
            accept=".csv" 
            class="file-input file-input-bordered w-full" 
            :disabled="isUploading"
            @change="handleFileChange"
          />
          <label class="label">
            <span class="label-text-alt">CSV format: Point,Y,X,Status,Calcs Page,Description,Date of survey</span>
          </label>
        </div>

        <div
          v-if="previewData.length > 0"
          class="mt-4"
        >
          <h3 class="font-bold mb-2">
            Preview (first 5 rows)
          </h3>
          <div class="overflow-x-auto">
            <table class="table table-zebra w-full">
              <thead>
                <tr>
                  <th
                    v-for="header in Object.keys(previewData[0] || {})"
                    :key="header"
                  >
                    {{ header }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, index) in previewData"
                  :key="index"
                >
                  <td
                    v-for="(value, key) in row"
                    :key="key"
                  >
                    {{ value }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-if="error"
          class="alert alert-error mt-4"
        >
          <div class="flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <label>{{ error }}</label>
          </div>
        </div>

        <div class="card-actions justify-end mt-4">
          <button 
            class="btn btn-primary" 
            :class="{ 'loading': isUploading }" 
            :disabled="!selectedFile || isUploading"
            @click="uploadFile"
          >
            {{ isUploading ? 'Uploading...' : 'Upload Data' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSurveyStore } from '@/stores/survey'

const props = defineProps<{
  projectId: number
}>()

const emit = defineEmits(['uploaded'])

const surveyStore = useSurveyStore()
const selectedFile = ref<File | null>(null)
const previewData = ref<Array<Record<string, any>>>([])
const isUploading = ref(false)
const error = ref<string | null>(null)

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0]
    parseCSV(selectedFile.value)
  }
}

const parseCSV = (file: File) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(line => line.trim() !== '')
      const headers = lines[0].split(',').map(h => h.trim())
      
      // Parse CSV data
      previewData.value = lines.slice(1, 6) // Show first 5 rows for preview
        .map(line => {
          const values = line.split(',')
          return headers.reduce((obj, header, index) => {
            return { ...obj, [header]: values[index]?.trim() || '' }
          }, {} as Record<string, any>)
        })
      
      error.value = null
    } catch (err) {
      console.error('Error parsing CSV:', err)
      error.value = 'Error parsing CSV file. Please check the format and try again.'
      previewData.value = []
    }
  }
  reader.readAsText(file)
}

const uploadFile = async () => {
  if (!selectedFile.value) return
  
  isUploading.value = true
  error.value = null
  
  try {
    await surveyStore.uploadFieldBook(selectedFile.value, props.projectId)
    emit('uploaded')
  } catch (err: any) {
    error.value = err.message || 'Upload failed. Please try again.'
  } finally {
    isUploading.value = false
  }
}
</script>
