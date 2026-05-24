<template>
  <div class="max-w-sm mx-auto bg-white shadow p-6 rounded">
    <h2 class="text-lg font-semibold mb-4">Register</h2>
    <form @submit.prevent="onSubmit" class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">Email</label>
        <input v-model="email" type="email" required class="w-full border px-3 py-2 rounded" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Password</label>
        <input v-model="password" type="password" required class="w-full border px-3 py-2 rounded" />
      </div>
      <p v-if="auth.error" class="text-sm text-red-600">{{ auth.error }}</p>
      <button :disabled="auth.loading" class="w-full bg-green-600 text-white py-2 rounded disabled:opacity-50">
        {{ auth.loading ? 'Registering...' : 'Register' }}
      </button>
    </form>
    <p class="mt-4 text-sm text-center">
      Have an account? <RouterLink to="/login" class="text-blue-600 hover:underline">Login</RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useRouter, RouterLink } from 'vue-router';

const auth = useAuthStore();
const router = useRouter();

const email = ref('');
const password = ref('');

async function onSubmit() {
  await auth.register(email.value, password.value);
  if (auth.isAuthed) {
    router.push('/dashboard');
  }
}
</script>
