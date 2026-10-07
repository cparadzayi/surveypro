import axios from 'axios';
import { useAuthStore } from '../stores/auth';

/**
 * Single source of truth for the API base URL.
 *
 * Previously six different base URLs existed across the app, using two env var
 * names (`VITE_API_BASE` / `VITE_API_BASE_URL`) and two ports (3050 / a dead
 * 3042). Every non-relative value also bypassed the Vite dev proxy, which
 * reintroduced CORS. Import `API_BASE` from here instead of re-deriving it.
 */
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>)['Authorization'] = `Bearer ${auth.token}`;
  }
  // Deliberately no token logging: this wrote the bearer token to the console
  // on every request, and console output ends up in committed log files.
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response && error.response.status === 401) {
      const auth = useAuthStore();
      auth.logout();
      // Previously logout() ran but nothing navigated, leaving the user on a
      // view whose every subsequent request 401s with no login screen.
      // Imported lazily: a static `import router` here would be circular
      // (router -> views -> stores -> api). Navigated by path — the router has
      // no route *named* 'login'; /login only redirects to /landing, where the
      // login form lives.
      import('../router')
        .then(({ default: router }) => router.replace('/landing'))
        .catch(() => {
          /* router unavailable (e.g. during teardown) - nothing else to do */
        });
    }
    return Promise.reject(error);
  }
);

export default api;