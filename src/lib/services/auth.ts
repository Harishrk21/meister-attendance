import { getAppData, setAppData, getSession, setSession } from '@/lib/storage'
import { apiFetch, getToken, isApiMode, setStoredTenant, setToken } from '@/lib/api'
import type { SessionAuth, Tenant } from '@/types'
import { delay } from '@/lib/utils'

interface AuthResponse {
  token: string
  session: SessionAuth
  tenant: Tenant
}

async function freshSeed() {
  const { createSeedData } = await import('@/data/seed')
  return createSeedData()
}

function storeAuth(res: AuthResponse): SessionAuth {
  setToken(res.token)
  setStoredTenant(res.tenant)
  return res.session
}

export async function ensureSeeded(): Promise<void> {
  if (isApiMode) return
  const data = await getAppData()
  if (!data) {
    await setAppData(await freshSeed())
  }
}

export async function resetDemoData(): Promise<void> {
  if (isApiMode) throw new Error('Demo reset is not available when connected to the server')
  const session = await getSession()
  await setAppData(await freshSeed())
  if (session) {
    const data = await getAppData()
    const user = data?.users.find((u) => u.email === session.email)
    const emp = data?.employees.find((e) => e.id === user?.employeeId)
    if (user && emp) {
      await setSession({
        userId: user.id,
        email: user.email,
        role: user.role,
        employeeId: emp.id,
        name: emp.name,
        branch: emp.branch,
        loggedInAt: new Date().toISOString(),
      })
    }
  }
}

export async function login(email: string, password: string, tenant?: string): Promise<SessionAuth> {
  if (isApiMode) {
    const res = await apiFetch<AuthResponse>('/v1/auth/login', {
      body: { email: email.trim(), password, tenant: tenant?.trim() || undefined },
      auth: false,
    })
    return storeAuth(res)
  }
  await ensureSeeded()
  await delay(200)
  const data = await getAppData()
  if (!data) throw new Error('Failed to initialize data')
  const user = data.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  if (!user || user.password !== password) {
    throw new Error('Invalid email or password')
  }
  const emp = data.employees.find((e) => e.id === user.employeeId)
  if (!emp) throw new Error('Employee profile not found')
  if (emp.status === 'Inactive') throw new Error('Account is inactive. Contact admin.')

  const session: SessionAuth = {
    userId: user.id,
    email: user.email,
    role: user.role,
    employeeId: emp.id,
    name: emp.name,
    branch: emp.branch,
    loggedInAt: new Date().toISOString(),
  }
  await setSession(session)
  return session
}

/** Exchanges a one-time ticket minted by a host dashboard for a session (no second login). */
export async function exchangeSsoTicket(ticket: string): Promise<SessionAuth> {
  if (!isApiMode) throw new Error('Single sign-on needs the attendance server (set VITE_API_URL)')
  const res = await apiFetch<AuthResponse>('/v1/auth/sso/exchange', { body: { ticket }, auth: false })
  return storeAuth(res)
}

export interface InviteInfo {
  email: string
  name: string
  tenant: { name: string; logoUrl?: string; primaryColor?: string }
}

export async function getInvite(token: string): Promise<InviteInfo> {
  if (!isApiMode) throw new Error('Invites need the attendance server (set VITE_API_URL)')
  return apiFetch<InviteInfo>(`/v1/invites/${encodeURIComponent(token)}`, { auth: false })
}

/** Sets the invited user's password and signs them straight in. */
export async function acceptInvite(token: string, password: string): Promise<SessionAuth> {
  const res = await apiFetch<AuthResponse>('/v1/invites/accept', { body: { token, password }, auth: false })
  return storeAuth(res)
}

export async function logout(): Promise<void> {
  if (isApiMode) {
    setToken(null)
    setStoredTenant(null)
    return
  }
  await setSession(null)
}

export async function getCurrentSession(): Promise<SessionAuth | null> {
  if (isApiMode) {
    if (!getToken()) return null
    try {
      const res = await apiFetch<{ session: SessionAuth; tenant: Tenant }>('/v1/auth/me')
      setStoredTenant(res.tenant)
      return res.session
    } catch {
      return null
    }
  }
  await ensureSeeded()
  return getSession()
}
