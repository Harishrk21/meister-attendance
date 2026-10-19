import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { SessionAuth, Tenant } from '@/types'
import * as authService from '@/lib/services/auth'
import { getStoredTenant, UNAUTHORIZED_EVENT } from '@/lib/api'

interface AuthContextValue {
  session: SessionAuth | null
  tenant: Tenant | null
  loading: boolean
  login: (email: string, password: string, tenant?: string) => Promise<void>
  loginWithSsoTicket: (ticket: string) => Promise<void>
  acceptInvite: (token: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionAuth | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const s = await authService.getCurrentSession()
    setSession(s)
    setTenant(s ? getStoredTenant() : null)
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      await authService.ensureSeeded()
      const s = await authService.getCurrentSession()
      if (mounted) {
        setSession(s)
        setTenant(s ? getStoredTenant() : null)
        setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const onUnauthorized = () => {
      setSession(null)
      setTenant(null)
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const login = useCallback(async (email: string, password: string, tenantSlug?: string) => {
    const s = await authService.login(email, password, tenantSlug)
    setSession(s)
    setTenant(getStoredTenant())
  }, [])

  const loginWithSsoTicket = useCallback(async (ticket: string) => {
    const s = await authService.exchangeSsoTicket(ticket)
    setSession(s)
    setTenant(getStoredTenant())
  }, [])

  const acceptInvite = useCallback(async (token: string, password: string) => {
    const s = await authService.acceptInvite(token, password)
    setSession(s)
    setTenant(getStoredTenant())
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setSession(null)
    setTenant(null)
  }, [])

  const value = useMemo(
    () => ({ session, tenant, loading, login, loginWithSsoTicket, acceptInvite, logout, refresh }),
    [session, tenant, loading, login, loginWithSsoTicket, acceptInvite, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
