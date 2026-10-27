import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { clearUnsavedWork, confirmDiscardUnsaved } from './useUnsavedWork'

/**
 * Sign the user out and take them to the sign-in page.
 *
 * Asks first when something is unsaved, then moves through the router. A full page load
 * (`window.location.href`) after logout() trips the browser's own "Leave site?" prompt whenever
 * input is unsaved; if that prompt is refused or never shown the token is already cleared, so the
 * page stays put signed out with no way back to sign-in.
 */
export function useSignOut() {
  const router = useRouter()
  const auth = useAuthStore()
  return async function signOut(): Promise<void> {
    if (!(await confirmDiscardUnsaved())) return
    clearUnsavedWork()
    auth.logout()
    await router.replace('/landing')
  }
}
