<template>
  <div class="surveyors-management">
    <div class="mb-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Surveyors Management</h1>
          <p class="mt-1 text-sm text-gray-600">
            Manage surveyor profiles and license information
          </p>
        </div>
        <button
          @click="showAddModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span class="text-lg">+</span>
          Add Surveyor
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && surveyors.length === 0" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading surveyors...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="surveyors.length === 0" class="text-center py-12 bg-gray-50 rounded-lg">
      <div class="text-6xl mb-4">👤</div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">No Surveyors Yet</h3>
      <p class="text-gray-600 mb-6">Add your first surveyor to get started</p>
      <button
        @click="showAddModal = true"
        class="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Add First Surveyor
      </button>
    </div>

    <!-- Surveyors List -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="surveyor in surveyors"
        :key="surveyor.id"
        class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
      >
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">{{ surveyor.name }}</h3>
            <p class="text-sm text-gray-600">License: {{ surveyor.license_number }}</p>
          </div>
          <div class="flex gap-2">
            <button
              @click="editSurveyor(surveyor)"
              class="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="Edit"
            >
              ✏️
            </button>
            <button
              @click="confirmDelete(surveyor)"
              class="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Delete"
            >
              🗑️
            </button>
          </div>
        </div>

        <div class="space-y-2 text-sm">
          <div v-if="surveyor.firm">
            <span class="font-medium text-gray-700">Firm:</span>
            <span class="ml-2 text-gray-900">{{ surveyor.firm }}</span>
          </div>
          <div v-if="surveyor.phone">
            <span class="font-medium text-gray-700">Phone:</span>
            <span class="ml-2 text-gray-900">{{ surveyor.phone }}</span>
          </div>
          <div v-if="surveyor.email">
            <span class="font-medium text-gray-700">Email:</span>
            <span class="ml-2 text-gray-900">{{ surveyor.email }}</span>
          </div>
          <div v-if="surveyor.address" class="pt-2 border-t border-gray-200">
            <span class="font-medium text-gray-700">Address:</span>
            <p class="mt-1 text-gray-900 whitespace-pre-line">{{ surveyor.address }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showAddModal || editingsurveyor" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 class="text-xl font-bold text-gray-900 mb-4">
          {{ editingsurveyor ? 'Edit Surveyor' : 'Add New Surveyor' }}
        </h2>
        
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              v-model="formData.name"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter surveyor name"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">License Number *</label>
            <input
              v-model="formData.license_number"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., LS-2019-001"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Firm</label>
            <input
              v-model="formData.firm"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter firm name"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              v-model="formData.phone"
              type="tel"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="+263 4 123456"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              v-model="formData.email"
              type="email"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="surveyor@example.com"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              v-model="formData.address"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter address"
            ></textarea>
          </div>

          <div class="flex gap-2 pt-2">
            <button
              type="submit"
              :disabled="loading"
              class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {{ loading ? 'Saving...' : (editingsurveyor ? 'Update' : 'Add Surveyor') }}
            </button>
            <button
              type="button"
              @click="closeModal"
              class="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="deletingSurveyor" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg p-6 max-w-sm w-full">
        <h3 class="text-lg font-bold text-gray-900 mb-2">Confirm Delete</h3>
        <p class="text-gray-600 mb-6">
          Are you sure you want to delete <strong>{{ deletingSurveyor.name }}</strong>?
          This action cannot be undone.
        </p>
        <div class="flex gap-2">
          <button
            @click="handleDelete"
            :disabled="loading"
            class="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:bg-gray-400 transition-colors"
          >
            {{ loading ? 'Deleting...' : 'Delete' }}
          </button>
          <button
            @click="deletingSurveyor = null"
            class="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSurveyors, type Surveyor } from '../../../composables/useSurveyors'

const { surveyors, loading, error, fetchSurveyors, createSurveyor, updateSurveyor, deleteSurveyor } = useSurveyors()

const showAddModal = ref(false)
const editingsurveyor = ref<Surveyor | null>(null)
const deletingSurveyor = ref<Surveyor | null>(null)

const formData = ref({
  name: '',
  license_number: '',
  firm: '',
  phone: '',
  email: '',
  address: ''
})

const resetForm = () => {
  formData.value = {
    name: '',
    license_number: '',
    firm: '',
    phone: '',
    email: '',
    address: ''
  }
}

const closeModal = () => {
  showAddModal.value = false
  editingsurveyor.value = null
  resetForm()
}

const editSurveyor = (surveyor: Surveyor) => {
  editingsurveyor.value = surveyor
  formData.value = {
    name: surveyor.name,
    license_number: surveyor.license_number,
    firm: surveyor.firm || '',
    phone: surveyor.phone || '',
    email: surveyor.email || '',
    address: surveyor.address || ''
  }
}

const confirmDelete = (surveyor: Surveyor) => {
  deletingSurveyor.value = surveyor
}

const handleSubmit = async () => {
  if (editingsurveyor.value) {
    const success = await updateSurveyor(editingsurveyor.value.id, formData.value)
    if (success) {
      closeModal()
    }
  } else {
    const success = await createSurveyor(formData.value)
    if (success) {
      closeModal()
    }
  }
}

const handleDelete = async () => {
  if (deletingSurveyor.value) {
    const success = await deleteSurveyor(deletingSurveyor.value.id)
    if (success) {
      deletingSurveyor.value = null
    }
  }
}

onMounted(() => {
  fetchSurveyors()
})
</script>
