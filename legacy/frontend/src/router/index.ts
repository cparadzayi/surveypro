import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  // Auth routes removed for MVP
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
  meta: { }
  },
  {
    path: '/projects',
    name: 'Projects',
    component: () => import('@/views/ProjectsView.vue'),
  meta: { }
  },
  {
    path: '/projects/:id',
    name: 'ProjectDetail',
    component: () => import('@/views/ProjectDetailView.vue'),
  meta: { }
  },
  {
    path: '/map',
    name: 'Map',
    component: () => import('@/views/MapView.vue'),
  meta: { }
  },
  {
    path: '/computations',
    name: 'Computations',
    component: () => import('@/views/ComputationsView.vue'),
  meta: { }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/manual',
    name: 'UserManual',
    component: () => import('@/views/UserManualView.vue'),
  meta: { title: 'User Manual' }
  },
  {
    path: '/projects/:projectId/field-book',
    name: 'FieldBook',
    component: () => import('@/views/FieldBookView.vue'),
  meta: { }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// Auth guard removed

export default router
