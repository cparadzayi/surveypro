<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold mb-6 text-gray-800">SurveyPro User Manual</h1>
      
      <div class="bg-white rounded-lg shadow-md p-6 mb-8">
        <div class="prose max-w-none">
          <div v-html="compiledMarkdown"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { marked } from 'marked';
import { useHead } from '@vueuse/head';

useHead({
  title: 'User Manual - SurveyPro'
});

const markdownContent = ref('');
const compiledMarkdown = ref('');

// Load markdown content
const loadMarkdown = async () => {
  try {
    const response = await fetch('/user-manual.md');
    if (!response.ok) throw new Error('Failed to load user manual');
    const text = await response.text();
    markdownContent.value = text;
    compiledMarkdown.value = marked(text);
  } catch (error) {
    console.error('Error loading user manual:', error);
    markdownContent.value = '# Error Loading Manual\n\nSorry, we could not load the user manual. Please try again later.';
    compiledMarkdown.value = marked(markdownContent.value);
  }
};

onMounted(() => {
  loadMarkdown();
});
</script>

<style scoped>
.prose {
  line-height: 1.7;
}

.prose h2 {
  @apply text-2xl font-bold mt-8 mb-4 text-gray-800 border-b pb-2;
}

.prose h3 {
  @apply text-xl font-semibold mt-6 mb-3 text-gray-800;
}

.prose p {
  @apply mb-4 text-gray-700;
}

.prose ul, .prose ol {
  @apply mb-4 pl-6;
}

.prose li {
  @apply mb-2;
}

.prose pre {
  @apply bg-gray-100 p-4 rounded-md overflow-x-auto my-4;
}

.prose code {
  @apply bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono;
}

.prose pre code {
  @apply bg-transparent p-0;
}

.prose a {
  @apply text-blue-600 hover:underline;
}
</style>
