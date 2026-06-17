# Authentication & Land Surveyor Integration Proposal

## 🎯 Executive Summary

**Current State**: Authentication and surveyor information are **disconnected**. Users log in with email/password, but surveyor selection happens manually in each module.

**Proposed State**: Seamless integration where logged-in users are automatically linked to their surveyor profile, with session persistence across the entire application.

---

## 📊 Current Architecture Analysis

### Database Schema
```sql
users table:
  - id (PK)
  - email
  - password_hash
  - created_at

surveyors table:
  - id (PK)
  - name
  - license_number (UNIQUE)
  - firm, address, phone, email
  - user_id (FK → users.id)  ✅ RELATIONSHIP EXISTS!
  - is_active
  - created_at, updated_at

survey_projects table:
  - id (PK)
  - surveyor_id (FK → surveyors.id)
  - name, client_name, location, etc.
```

### Current Authentication Flow
```
1. User logs in with email/password
2. JWT token stored in localStorage
3. User profile fetched (/auth/me)
4. Profile stored in auth store
   ❌ BUT: Profile only contains { id, email, created_at }
   ❌ NO surveyor information loaded!
```

### Current Surveyor Selection Flow
```
1. User navigates to Cadastral Standard or Areas module
2. Manually selects surveyor from dropdown
3. Then selects project from filtered list
4. ❌ Selection is NOT persisted across modules
5. ❌ User must re-select surveyor in each module
```

---

## 🏆 Expert Recommendations (Industry Best Practices)

### ✅ Option 1: Enhanced Auth Store with Surveyor Context (RECOMMENDED)

**Concept**: Extend the authentication store to include surveyor profile and maintain global session state.

**Architecture**:
```typescript
// Enhanced auth store
interface UserProfile {
  id: number
  email: string
  role: 'surveyor' | 'admin' | 'client'
  surveyor?: {
    id: number
    name: string
    license_number: string
    firm?: string
    address?: string
    phone?: string
    email?: string
  }
  created_at: string
}

// Global state flow
Login → Fetch Profile → Load Surveyor → Set Active Context → Persist
```

**Benefits**:
- ✅ Single source of truth
- ✅ Automatic surveyor detection
- ✅ Session persistence across modules
- ✅ No manual selection needed
- ✅ Follows OAuth/OIDC patterns (profile enrichment)
- ✅ Scalable for multi-role systems

**Implementation Complexity**: Medium (2-3 hours)

---

### ✅ Option 2: Dedicated Surveyor Context Store (ALTERNATIVE)

**Concept**: Separate Pinia store specifically for surveyor context, initialized on login.

**Architecture**:
```typescript
// New store: surveyorContext.ts
interface SurveyorContext {
  surveyor: Surveyor | null
  activeProject: SurveyProject | null
  recentProjects: SurveyProject[]
}

// Initialization flow
Login → Auth Store → Trigger Surveyor Context Load → Persist
```

**Benefits**:
- ✅ Separation of concerns
- ✅ Can be used independently
- ✅ Easier to test
- ✅ Follows single responsibility principle

**Trade-offs**:
- ⚠️ Two stores to manage
- ⚠️ Requires synchronization logic

**Implementation Complexity**: Low-Medium (1-2 hours)

---

### ❌ Option 3: Route-Based Context (NOT RECOMMENDED)

**Concept**: Load surveyor context on each route navigation.

**Why NOT Recommended**:
- ❌ Repeated API calls
- ❌ Flickering UI during loads
- ❌ Poor user experience
- ❌ Doesn't persist across tabs
- ❌ Against modern SPA best practices

---

## 🎯 Recommended Implementation: Enhanced Auth Store

### Phase 1: Backend Changes

#### 1.1 Update `/auth/me` Endpoint
```javascript
// app-backend/src/routes/auth.js
fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
  const userId = request.user.id
  
  // Fetch user
  const user = await User.findById(userId)
  
  // Fetch associated surveyor (if exists)
  const surveyor = await Surveyor.findByUserId(userId)
  
  return {
    id: user.id,
    email: user.email,
    role: surveyor ? 'surveyor' : 'user',
    surveyor: surveyor ? {
      id: surveyor.id,
      name: surveyor.name,
      license_number: surveyor.license_number,
      firm: surveyor.firm,
      address: surveyor.address,
      phone: surveyor.phone,
      email: surveyor.email
    } : null,
    created_at: user.created_at
  }
})
```

#### 1.2 Add `findByUserId` to Surveyor Model
```javascript
// app-backend/src/models/Surveyor.js
static async findByUserId(userId) {
  const result = await db.query(
    'SELECT * FROM surveyors WHERE user_id = $1 AND is_active = true',
    [userId]
  )
  return result.rows[0]
}
```

### Phase 2: Frontend Changes

#### 2.1 Update Auth Store
```typescript
// app-frontend/src/stores/auth.ts
interface Surveyor {
  id: number
  name: string
  license_number: string
  firm?: string
  address?: string
  phone?: string
  email?: string
}

interface UserProfile {
  id: number
  email: string
  role: 'surveyor' | 'user' | 'admin'
  surveyor?: Surveyor
  created_at: string
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    profile: null as UserProfile | null,
    loading: false,
    error: '' as string | null,
  }),
  getters: {
    isAuthed: (state) => !!state.token,
    isSurveyor: (state) => state.profile?.role === 'surveyor',
    currentSurveyor: (state) => state.profile?.surveyor || null,
    surveyorId: (state) => state.profile?.surveyor?.id || null,
  },
  actions: {
    async fetchProfile() {
      if (!this.token) return
      try {
        const { data } = await api.get<UserProfile>('/auth/me')
        this.profile = data
        
        // Store surveyor info in localStorage for persistence
        if (data.surveyor) {
          localStorage.setItem('surveyor', JSON.stringify(data.surveyor))
        }
      } catch (e: any) {
        console.error('Failed to fetch profile:', e)
      }
    },
    
    logout() {
      this.token = ''
      this.profile = null
      localStorage.removeItem('token')
      localStorage.removeItem('surveyor')
    }
  }
})
```

#### 2.2 Update Project Context Store
```typescript
// app-frontend/src/stores/projectContext.ts
import { useAuthStore } from './auth'

export const useProjectContext = defineStore('projectContext', {
  state: () => ({
    currentProject: null as SurveyProject | null,
    recentProjects: [] as SurveyProject[],
  }),
  
  getters: {
    currentProjectId: (state) => state.currentProject?.id || null,
    currentSurveyorId: () => {
      const auth = useAuthStore()
      return auth.surveyorId
    }
  },
  
  actions: {
    async loadSurveyorProjects() {
      const auth = useAuthStore()
      if (!auth.surveyorId) return
      
      // Auto-load projects for logged-in surveyor
      const projects = await fetchSurveyProjects(auth.surveyorId)
      this.recentProjects = projects
    }
  }
})
```

#### 2.3 Update Module Views (Remove Manual Selection)
```typescript
// app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { currentSurveyor } = storeToRefs(auth)

// Auto-load projects for logged-in surveyor
onMounted(async () => {
  if (currentSurveyor.value) {
    await fetchSurveyProjects(currentSurveyor.value.id)
    
    // Display surveyor info banner
    console.log(`✅ Logged in as: ${currentSurveyor.value.name} (${currentSurveyor.value.license_number})`)
  }
})
```

### Phase 3: UI Enhancements

#### 3.1 Add Surveyor Info Banner (Global)
```vue
<!-- app-frontend/src/App.vue -->
<template>
  <div v-if="auth.isSurveyor && auth.currentSurveyor" class="bg-blue-50 border-b border-blue-200 px-4 py-2">
    <div class="max-w-7xl mx-auto flex items-center justify-between text-sm">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-blue-600"><!-- User icon --></svg>
        <span class="font-medium text-blue-900">{{ auth.currentSurveyor.name }}</span>
        <span class="text-blue-600">•</span>
        <span class="text-blue-700">License: {{ auth.currentSurveyor.license_number }}</span>
        <span v-if="auth.currentSurveyor.firm" class="text-blue-600">•</span>
        <span v-if="auth.currentSurveyor.firm" class="text-blue-700">{{ auth.currentSurveyor.firm }}</span>
      </div>
      <button @click="auth.logout" class="text-blue-600 hover:text-blue-800">
        Logout
      </button>
    </div>
  </div>
  <router-view />
</template>
```

#### 3.2 Simplify Module Views
```vue
<!-- Remove surveyor selection dropdown -->
<!-- Only show project selection -->
<select v-model="selectedProjectId">
  <option :value="null">Select a project...</option>
  <option v-for="project in surveyorProjects" :key="project.id" :value="project.id">
    {{ project.name }}
  </option>
</select>
```

---

## 🔐 Security Considerations

### ✅ Best Practices Implemented
1. **JWT Token**: Stored in localStorage (consider httpOnly cookies for production)
2. **Token Expiry**: Implement refresh token mechanism
3. **Role-Based Access**: Check `isSurveyor` before allowing surveyor-specific actions
4. **Data Isolation**: Filter projects by `surveyor_id` on backend
5. **Audit Trail**: Log surveyor actions with `user_id` and `surveyor_id`

### 🔒 Additional Recommendations
```typescript
// Add token expiry check
getters: {
  isTokenExpired: (state) => {
    if (!state.token) return true
    const payload = JSON.parse(atob(state.token.split('.')[1]))
    return Date.now() >= payload.exp * 1000
  }
}

// Auto-logout on token expiry
router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (auth.isTokenExpired) {
    auth.logout()
    next('/login')
  } else {
    next()
  }
})
```

---

## 📈 Migration Path

### Step 1: Database (No Changes Needed!)
✅ `surveyors.user_id` column already exists
✅ Foreign key relationship already established

### Step 2: Backend (2 changes)
1. Update `/auth/me` endpoint to include surveyor
2. Add `Surveyor.findByUserId()` method

### Step 3: Frontend (3 changes)
1. Update `auth.ts` store with surveyor profile
2. Update module views to use `auth.currentSurveyor`
3. Add global surveyor info banner

### Step 4: Testing
1. Create test user with linked surveyor
2. Login and verify surveyor auto-loaded
3. Navigate between modules and verify persistence
4. Test logout and verify cleanup

---

## 🎨 User Experience Flow

### Before (Current)
```
1. Login → Dashboard
2. Navigate to Cadastral Standard
3. Select Surveyor (manual)
4. Select Project
5. Navigate to Areas Module
6. Select Surveyor AGAIN (manual) ❌
7. Select Project AGAIN ❌
```

### After (Proposed)
```
1. Login → Dashboard
   ✅ Surveyor auto-loaded
   ✅ Banner shows: "John Doe • License: LS-12345 • ABC Surveys"
2. Navigate to Cadastral Standard
   ✅ Projects auto-loaded for John Doe
3. Select Project (only)
4. Navigate to Areas Module
   ✅ Same surveyor context
   ✅ Same project context (if using projectContext store)
5. Seamless workflow! 🎉
```

---

## 💡 Additional Enhancements (Future)

### 1. Multi-Surveyor Support (for firms)
```typescript
// If user manages multiple surveyors
interface UserProfile {
  surveyors: Surveyor[]  // Array instead of single
  activeSurveyor: Surveyor
}

// Allow switching between surveyors
actions: {
  switchSurveyor(surveyorId: number) {
    const surveyor = this.profile.surveyors.find(s => s.id === surveyorId)
    if (surveyor) {
      this.profile.activeSurveyor = surveyor
      localStorage.setItem('activeSurveyorId', surveyorId.toString())
    }
  }
}
```

### 2. Remember Last Project
```typescript
// Auto-select last used project on login
localStorage.setItem('lastProjectId', projectId.toString())

onMounted(() => {
  const lastProjectId = localStorage.getItem('lastProjectId')
  if (lastProjectId) {
    selectedProjectId.value = parseInt(lastProjectId)
  }
})
```

### 3. Session Timeout Warning
```vue
<div v-if="showSessionWarning" class="fixed bottom-4 right-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg">
  <p class="text-sm text-yellow-800">Your session will expire in {{ timeRemaining }} minutes.</p>
  <button @click="refreshSession" class="text-yellow-600 hover:text-yellow-800 text-sm font-medium">
    Extend Session
  </button>
</div>
```

---

## 🚀 Implementation Timeline

| Phase | Task | Effort | Priority |
|-------|------|--------|----------|
| 1 | Backend: Update `/auth/me` endpoint | 30 min | High |
| 1 | Backend: Add `findByUserId()` method | 15 min | High |
| 2 | Frontend: Update auth store | 1 hour | High |
| 2 | Frontend: Update module views | 1 hour | High |
| 3 | Frontend: Add surveyor banner | 30 min | Medium |
| 3 | Frontend: Update project context | 30 min | Medium |
| 4 | Testing & QA | 1 hour | High |
| **Total** | | **4.5 hours** | |

---

## ✅ Conclusion

**Recommendation**: Implement **Option 1 (Enhanced Auth Store)** immediately.

**Why**:
1. ✅ Minimal code changes (4.5 hours)
2. ✅ Database schema already supports it
3. ✅ Industry best practice (profile enrichment)
4. ✅ Seamless user experience
5. ✅ Scalable for future enhancements
6. ✅ Session persistence across modules
7. ✅ No manual surveyor selection needed

**Next Steps**:
1. Review and approve this proposal
2. Create test user with linked surveyor
3. Implement backend changes (Phase 1)
4. Implement frontend changes (Phase 2)
5. Add UI enhancements (Phase 3)
6. Test end-to-end workflow
7. Deploy to production

---

**Document Version**: 1.0  
**Date**: November 3, 2025  
**Status**: Awaiting Approval
