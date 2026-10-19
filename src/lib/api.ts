import type { Tenant } from '@/types'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** When VITE_API_URL is set the app talks to the attendance API; otherwise it runs on browser demo data. */
export const isApiMode = API_URL.length > 0

const TOKEN_KEY = 'attendance_token'
const TENANT_KEY = 'attendance_tenant'
export const UNAUTHORIZED_EVENT = 'attendance:unauthorized'

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.removeItem(TOKEN_KEY)
}

export function getStoredTenant(): Tenant | null {
  try {
    const raw = sessionStorage.getItem(TENANT_KEY)
    return raw ? (JSON.parse(raw) as Tenant) : null
  } catch {
    return null
  }
}

export function setStoredTenant(tenant: Tenant | null): void {
  if (tenant) sessionStorage.setItem(TENANT_KEY, JSON.stringify(tenant))
  else sessionStorage.removeItem(TENANT_KEY)
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, message: string, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type Query = Record<string, string | number | undefined>

export async function apiFetch<T>(
  path: string,
  options: {
    method?: string
    body?: unknown
    query?: Query
    auth?: boolean
    /** Use this bearer token instead of the signed-in user's (platform console). */
    token?: string | null
  } = {}
): Promise<T> {
  const url = new URL(API_URL + path)
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const ownToken = options.token === undefined
  const token = ownToken ? getToken() : options.token
  if (token && options.auth !== false) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(url, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the attendance server. Check your connection.', 'NETWORK')
  }

  const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
  if (!res.ok) {
    if (res.status === 401 && token && ownToken && options.auth !== false) {
      setToken(null)
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    throw new ApiError(res.status, json?.error?.message ?? `Request failed (${res.status})`, json?.error?.code ?? 'ERROR')
  }
  return json as T
}
