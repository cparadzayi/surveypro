<template>
  <div class="settings-index">
    <div class="text-center py-12">
      <div class="text-6xl mb-4">⚙️</div>
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Settings & Management</h2>
      <p class="text-gray-600 mb-8">
        Manage surveyors, projects, and application settings
      </p>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <router-link
          to="/modules/settings/surveyors"
          class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-8 text-center"
        >
          <div class="text-5xl mb-3">👤</div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Surveyors</h3>
          <p class="text-sm text-gray-600">
            Manage surveyor profiles and license information
          </p>
        </router-link>

        <router-link
          to="/modules/settings/projects"
          class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-8 text-center"
        >
          <div class="text-5xl mb-3">📁</div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Projects</h3>
          <p class="text-sm text-gray-600">
            Manage survey projects and link them to surveyors
          </p>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Settings index page
</script>
