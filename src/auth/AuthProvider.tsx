import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { AuthUser } from '@/types'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: () => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = sessionStorage.getItem('auth_user')
    return stored ? JSON.parse(stored) : null
  })
  const [loading, setLoading] = useState(!sessionStorage.getItem('auth_user'))

  useEffect(() => {
    // Check if the user has an active SWA session and resolve their AppUser record
    async function checkSession() {
      try {
        // 1. Check SWA auth session
        const meRes = await fetch('/.auth/me')
        if (!meRes.ok) { setLoading(false); return }
        const meData = await meRes.json()
        const principal = meData.clientPrincipal
        if (!principal?.userDetails) { setLoading(false); return }

        // 2. Resolve the user from our API (reads x-ms-client-principal header injected by SWA)
        const apiRes = await fetch('/api/auth/me')
        if (!apiRes.ok) {
          // Authenticated with Microsoft but not authorized in our app
          sessionStorage.removeItem('auth_user')
          // Logout from SWA session and redirect to login with error
          window.location.href = '/.auth/logout?post_logout_redirect_uri=/login?error=unauthorized'
          return
        }
        const userData: AuthUser = await apiRes.json()
        setUser(userData)
        sessionStorage.setItem('auth_user', JSON.stringify(userData))
      } catch {
        // Network error or not deployed on SWA (local dev) — keep existing session if any
      }
      setLoading(false)
    }
    checkSession()
  }, [])

  const login = useCallback(() => {
    const redirectUri = sessionStorage.getItem('redirectAfterLogin') || '/'
    window.location.href = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(redirectUri)}`
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    sessionStorage.removeItem('auth_user')
    window.location.href = '/.auth/logout?post_logout_redirect_uri=/login'
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
