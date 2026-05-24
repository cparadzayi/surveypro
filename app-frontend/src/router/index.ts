import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useModulesStore } from '../stores/modules';

// Dynamic module and submenu components are resolved by loader SFCs under views/modules.

// Static core routes
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/landing' },
  { path: '/landing', component: () => import('../views/LandingView.vue'), meta: { public: true } },
  { path: '/login', redirect: '/landing' }, // Legacy redirect
  { path: '/register', redirect: '/landing' }, // Legacy redirect
  { path: '/complete-profile', component: () => import('../views/CompleteProfileView.vue'), meta: { requiresAuth: true } },
  { path: '/dashboard', component: () => import('../views/DashboardView.vue'), meta: { requiresAuth: true } },
  { path: '/map', component: () => import('../views/MapView.vue') },
  { path: '/test-project', component: () => import('../views/TestProjectRunner.vue'), meta: { requiresAuth: true } },

  // Module index (dynamic). We'll lazy-resolve the component path based on slug.
  {
    path: '/modules/:module',
    name: 'module-index',
    component: () => import('../views/modules/ModuleIndexLoader.vue')
  },
  // Submenu
  {
    path: '/modules/:module/:submenu',
    name: 'module-submenu',
    component: () => import('../views/modules/SubmenuLoader.vue')
  },
  // Legacy fallback: old ModuleView route (kept temporarily)
  { path: '/modules-legacy/:slug', component: () => import('../views/ModuleView.vue') },
  // 404 catch-all
  { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue'), meta: { public: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});

// Global navigation guard with session restoration and timeout
let sessionRestored = false;

router.beforeEach(async (to, from) => {
  const auth = useAuthStore();
  
  // Restore session on first navigation (page load/refresh)
  if (!sessionRestored) {
    sessionRestored = true;
    await auth.restoreSession();
  }
  
  // Update activity on every navigation if authenticated
  if (auth.isAuthed) {
    auth.updateActivity();
  }
  
  // Check if route requires authentication
  const requiresAuth = to.meta.requiresAuth || (!to.meta.public && to.path !== '/landing');
  
  if (requiresAuth && !auth.isAuthed) {
    console.log('🔒 Access denied, redirecting to landing');
    return '/landing';
  }
  
  // Redirect authenticated users away from landing page
  if (to.path === '/landing' && auth.isAuthed) {
    return '/dashboard';
  }
  
  // Check if user needs to complete profile
  if (requiresAuth && auth.isAuthed && !auth.isSurveyor && to.path !== '/complete-profile') {
    console.log('ℹ️ Profile incomplete, redirecting to complete profile');
    return '/complete-profile';
  }
});

// Module access validation with role-based filtering
router.beforeResolve((to) => {
  if (to.name === 'module-index' || to.name === 'module-submenu') {
    const modulesStore = useModulesStore();
    const auth = useAuthStore();
    const moduleSlug = to.params.module as string;
    
    const module = modulesStore.getBySlug(moduleSlug);
    if (!module) {
      console.log(`❌ Module not found: ${moduleSlug}`);
      return { path: '/404', replace: true };
    }
    
    // Check role-based access
    if (!modulesStore.canAccessModule(moduleSlug)) {
      console.log(`🚫 Access denied to module: ${moduleSlug} (requires ${module.requiredRole})`);
      return { path: '/dashboard', replace: true };
    }
  }
});

export default router;
