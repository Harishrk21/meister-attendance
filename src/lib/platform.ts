import { ApiError, apiFetch } from '@/lib/api'
import type { Role } from '@/types'

/** Platform-owner (Meister) session — kept apart from client-company logins. */
const PLATFORM_TOKEN_KEY = 'platform_token'

export const getPlatformToken = () => sessionStorage.getItem(PLATFORM_TOKEN_KEY)
export function setPlatformToken(token: string | null) {
  if (token) sessionStorage.setItem(PLATFORM_TOKEN_KEY, token)
  else sessionStorage.removeItem(PLATFORM_TOKEN_KEY)
}

export type TenantStatus = 'trial' | 'active' | 'suspended'

export interface PlatformAdmin {
  id: string
  name: string
  email: string
}

export interface TenantSummary {
  id: string
  slug: string
  name: string
  displayName: string
  status: TenantStatus
  plan: string
  seatLimit: number | null
  activeEmployees: number
  trialEndsOn: string | null
  timezone: string
  contactName: string
  contactEmail: string
  contactPhone: string
  notes: string
  logoUrl: string
  primaryColor: string
  employeeCodePrefix: string
  setupCompleted: boolean
  createdAt: string
  lastActivityAt: string | null
}

export interface TenantAdmin {
  userId: string
  name: string
  email: string
  lastLoginAt: string | null
  hasPassword: boolean
  inviteExpiresAt: string | null
}

export interface SsoConnection {
  id: string
  issuer: string
  autoProvision: boolean
  syncRole: boolean
  defaultRole: Role
  allowedOrigins: string[]
  isEnabled: boolean
  createdAt: string
}

export interface TenantDetail extends TenantSummary {
  admins: TenantAdmin[]
  sso: SsoConnection[]
}

export interface Invite {
  url: string
  expiresAt: string
}

export interface Overview {
  tenants: { total: number; trial: number; active: number; suspended: number }
  activeEmployees: number
  clockInsLast24h: number
}

export interface NewTenantInput {
  name: string
  slug: string
  timezone: string
  status: 'trial' | 'active'
  plan: string
  seatLimit: number | null
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  branchName: string
  employeeCodePrefix?: string
  primaryColor?: string
  logoUrl?: string
  admin: { name: string; email: string }
}

export const PLANS = ['starter', 'standard', 'premium', 'enterprise'] as const

async function call<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await apiFetch<T>(path, { ...opts, token: getPlatformToken() })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) setPlatformToken(null)
    throw err
  }
}

export const platformApi = {
  async login(email: string, password: string): Promise<PlatformAdmin> {
    const res = await apiFetch<{ token: string; admin: PlatformAdmin }>('/v1/platform/auth/login', {
      body: { email, password },
      auth: false,
    })
    setPlatformToken(res.token)
    return res.admin
  },
  me: () => call<PlatformAdmin>('/v1/platform/me'),
  overview: () => call<Overview>('/v1/platform/overview'),
  tenants: () => call<TenantSummary[]>('/v1/platform/tenants'),
  tenant: (id: string) => call<TenantDetail>(`/v1/platform/tenants/${id}`),
  createTenant: (body: NewTenantInput) =>
    call<{ tenant: TenantDetail; invite: Invite }>('/v1/platform/tenants', { body }),
  updateTenant: (id: string, body: Partial<TenantSummary>) =>
    call<TenantDetail>(`/v1/platform/tenants/${id}`, { method: 'PATCH', body }),
  addAdmin: (id: string, body: { name: string; email: string }) =>
    call<{ tenant: TenantDetail; invite: Invite }>(`/v1/platform/tenants/${id}/admins`, { body }),
  reinviteAdmin: (id: string, userId: string) =>
    call<{ tenant: TenantDetail; invite: Invite }>(`/v1/platform/tenants/${id}/admins/${userId}/invite`, { method: 'POST' }),
  addSso: (id: string, body: { issuer: string; allowedOrigins: string[]; defaultRole: Role; autoProvision: boolean }) =>
    call<{ tenant: TenantDetail; sharedSecret: string }>(`/v1/platform/tenants/${id}/sso`, { body }),
  rotateSso: (id: string, ssoId: string) =>
    call<{ tenant: TenantDetail; sharedSecret: string }>(`/v1/platform/tenants/${id}/sso/${ssoId}/rotate`, { method: 'POST' }),
  toggleSso: (id: string, ssoId: string, isEnabled: boolean) =>
    call<TenantDetail>(`/v1/platform/tenants/${id}/sso/${ssoId}`, { method: 'PATCH', body: { isEnabled } }),
  deleteSso: (id: string, ssoId: string) =>
    call<TenantDetail>(`/v1/platform/tenants/${id}/sso/${ssoId}`, { method: 'DELETE' }),
}

/** "Acme Industries Pvt Ltd" → "acme-industries" */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|enterprises?)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}
