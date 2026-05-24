import axios from 'axios';
import { useAuthStore } from '../stores/auth';

const api = axios.create({
  // Use relative base to leverage Vite dev proxy; override via VITE_API_BASE in production
  baseURL: import.meta.env.VITE_API_BASE || '/api',
});

api.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>)['Authorization'] = `Bearer ${auth.token}`;
    console.log('🔑 Token attached to request:', config.url);
  } else {
    console.warn('⚠️ No token available for request:', config.url);
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response && error.response.status === 401) {
      const auth = useAuthStore();
      auth.logout();
    }
    return Promise.reject(error);
  }
);

export default api;
