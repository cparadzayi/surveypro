import { defineStore } from 'pinia';
import api from '../services/api';

interface Supervisor {
  id: number;
  name: string;
  license_number?: string;
}

interface SurveyorProfile {
  id: number;
  name: string;
  surveyor_type: 'registered' | 'in_training' | 'technician' | 'student';
  license_number?: string;
  registration_number?: string;
  student_number?: string;
  firm?: string;
  address?: string;
  phone?: string;
  institution?: string;
  supervisor?: Supervisor;
}

interface UserProfile {
  id: number;
  email: string;
  user_type: 'registered_surveyor' | 'surveyor_in_training' | 'technician' | 'student';
  profile?: SurveyorProfile;
  created_at: string;
}

interface Credentials { email: string; password: string }

const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000 // 4 hours
const LAST_ACTIVITY_KEY = 'lastActivity'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    profile: null as UserProfile | null,
    loading: false,
    error: '' as string | null,
    lastActivity: parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0'),
  }),
  getters: {
    isAuthed: (state) => {
      if (!state.token) return false
      
      // Check session timeout
      const now = Date.now()
      const timeSinceActivity = now - state.lastActivity
      
      if (timeSinceActivity > SESSION_TIMEOUT_MS) {
        console.log('⏱️ Session expired due to inactivity')
        return false
      }
      
      return true
    },
    isSurveyor: (state) => !!state.profile?.profile,
    currentSurveyor: (state) => state.profile?.profile || null,
    surveyorId: (state) => state.profile?.profile?.id || null,
    surveyorType: (state) => state.profile?.profile?.surveyor_type || null,
    surveyorName: (state) => state.profile?.profile?.name || '',
    surveyorEmail: (state) => state.profile?.email || '',
    
    // Role-based getters
    isRegistered: (state) => state.profile?.profile?.surveyor_type === 'registered',
    isInTraining: (state) => state.profile?.profile?.surveyor_type === 'in_training',
    isTechnician: (state) => state.profile?.profile?.surveyor_type === 'technician',
    isStudent: (state) => state.profile?.profile?.surveyor_type === 'student',
    requiresSupervision: (state) => ['in_training', 'student'].includes(state.profile?.profile?.surveyor_type || ''),
    
    // Access level getters
    canAccessProfessionalModules: (state) => ['registered', 'in_training'].includes(state.profile?.profile?.surveyor_type || ''),
    canAccessCadastral: (state) => state.profile?.profile?.surveyor_type === 'registered',
    canCreateProjects: (state) => ['registered', 'in_training'].includes(state.profile?.profile?.surveyor_type || ''),
  },
  actions: {
    async register(email: string, password: string, name: string, additionalInfo?: {
      surveyorType?: string;
      licenseNumber?: string;
      firm?: string;
      phone?: string;
    }) {
      this.error = '';
      this.loading = true;
      try {
        await api.post('/auth/register', { 
          email, 
          password, 
          name,
          ...additionalInfo
        });
        await this.login(email, password);
      } catch (e: any) {
        this.error = e.response?.data?.error || e.message;
      } finally {
        this.loading = false;
      }
    },
    async login(email: string, password: string) {
      this.error = '';
      this.loading = true;
      try {
        const { data } = await api.post<{ token: string }>('/auth/login', { email, password });
        console.log('🔐 Login response received, token length:', data.token?.length || 0);
        this.token = data.token;
        localStorage.setItem('token', this.token);
        console.log('🔐 Token stored in localStorage');
        await this.fetchProfile();
      } catch (e: any) {
        this.error = e.response?.data?.error || e.message;
      } finally {
        this.loading = false;
      }
    },
    async fetchProfile() {
      if (!this.token) return;
      
      // Update activity timestamp
      this.updateActivity();
      
      try {
        const { data } = await api.get<UserProfile>('/auth/me');
        this.profile = data;
        
        // Store complete profile in localStorage for persistence
        if (data) {
          localStorage.setItem('userProfile', JSON.stringify(data));
          
          if (data.profile) {
            console.log('✅ Surveyor profile loaded:', data.profile.name, `(${data.profile.surveyor_type})`);
          } else {
            console.log('ℹ️ User authenticated but no surveyor profile found');
          }
        }
      } catch (e: any) {
        console.error('Failed to fetch profile:', e);
        // If fetch fails due to auth, logout
        if (e.response?.status === 401) {
          this.logout();
        }
      }
    },
    
    async restoreSession() {
      // Attempt to restore session from localStorage
      const token = localStorage.getItem('token');
      const profileStr = localStorage.getItem('userProfile');
      const lastActivity = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0');
      
      if (!token) return false;
      
      // Check if session expired
      const timeSinceActivity = Date.now() - lastActivity;
      if (timeSinceActivity > SESSION_TIMEOUT_MS) {
        console.log('⏱️ Session expired, logging out');
        this.logout();
        return false;
      }
      
      // Restore from localStorage
      this.token = token;
      this.lastActivity = lastActivity;
      
      if (profileStr) {
        try {
          this.profile = JSON.parse(profileStr);
          console.log('✅ Session restored from localStorage');
        } catch (e) {
          console.error('Failed to parse stored profile');
        }
      }
      
      // Fetch fresh profile to verify token is still valid
      await this.fetchProfile();
      
      return this.isAuthed;
    },
    
    updateActivity() {
      const now = Date.now();
      this.lastActivity = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
    },
    logout() {
      this.token = '';
      this.profile = null;
      this.lastActivity = 0;
      localStorage.removeItem('token');
      localStorage.removeItem('userProfile');
      localStorage.removeItem('surveyorProfile'); // Legacy key
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      console.log('✅ Logged out successfully');
    }
  }
});
