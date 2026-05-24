import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'
import type { User, LoginCredentials, RegisterData } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  async function login(credentials: LoginCredentials) {
    loading.value = true
    error.value = null
    try {
      const response = await api.post('/auth/login', credentials)
      const { token: authToken, ...userData } = response.data
      
      token.value = authToken
      user.value = userData
      localStorage.setItem('token', authToken)
      
      return true
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Login failed'
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(data: RegisterData) {
    loading.value = true
    error.value = null
    try {
      const response = await api.post('/auth/register', data)
      const { token: authToken, ...userData } = response.data
      
      token.value = authToken
      user.value = userData
      localStorage.setItem('token', authToken)
      
      return true
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Registration failed'
      return false
    } finally {
      loading.value = false
    }
  }

  async function checkAuth() {
    if (!token.value) {
      return false
    }

    try {
      const response = await api.get('/auth/me')
      user.value = response.data
      return true
    } catch (err: any) {
      // Only logout on 401 (unauthorized), not on network errors
      if (err.response?.status === 401) {
        logout()
      }
      return false
    }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated,
    login,
    register,
    checkAuth,
    logout
  }
})
