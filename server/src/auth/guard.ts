import type { FastifyRequest } from 'fastify'
import { getPool, one } from '../db.js'
import { forbidden, unauthorized } from '../errors.js'
import type { Role } from '../dto.js'
import { verifyAccessToken, verifyPlatformToken } from './tokens.js'

export interface AuthContext {
  tenantId: string
  userId: string
  employeeId: string
  role: Role
  timezone: string
  issuedAt: Date
}

export interface PlatformAuthContext {
  platformAdminId: string
  email: string
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext
    platform: PlatformAuthContext
  }
}

export async function authenticatePlatform(req: FastifyRequest): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw unauthorized()
  let id: string
  try {
    id = await verifyPlatformToken(header.slice(7))
  } catch {
    throw unauthorized('Session expired. Please sign in again.', 'TOKEN_INVALID')
  }
  const admin = await one<{ email: string }>(
    getPool(),
    'SELECT email FROM platform_admins WHERE id = ? AND is_active = 1',
    [id]
  )
  if (!admin) throw unauthorized('Account is no longer active', 'ACCOUNT_INACTIVE')
  req.platform = { platformAdminId: id, email: admin.email }
}

interface ActiveUserRow {
  role: Role
  timezone: string
}

export async function authenticate(req: FastifyRequest): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw unauthorized()

  let claims
  try {
    claims = await verifyAccessToken(header.slice(7))
  } catch {
    throw unauthorized('Session expired. Please sign in again.', 'TOKEN_INVALID')
  }

  // Re-checked on every request so deactivation or suspension takes effect immediately.
  const user = await one<ActiveUserRow>(
    getPool(),
    `SELECT u.role, t.timezone
       FROM users u
       JOIN employees e ON e.id = u.employee_id
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = ? AND u.tenant_id = ? AND u.is_active = 1
        AND e.status = 'Active' AND t.status <> 'suspended'`,
    [claims.userId, claims.tenantId]
  )
  if (!user) throw unauthorized('Account is no longer active', 'ACCOUNT_INACTIVE')

  req.auth = {
    tenantId: claims.tenantId,
    userId: claims.userId,
    employeeId: claims.employeeId,
    role: user.role,
    timezone: user.timezone,
    issuedAt: claims.issuedAt,
  }
}

export function requireAdmin(auth: AuthContext): void {
  if (auth.role !== 'admin') throw forbidden('Only administrators can perform this action')
}

export function isAdmin(auth: AuthContext): boolean {
  return auth.role === 'admin'
}

/** Non-admins may only act on their own employee record. */
export function scopeEmployeeId(auth: AuthContext, requested?: string): string | undefined {
  if (isAdmin(auth)) return requested
  if (requested && requested !== auth.employeeId) throw forbidden()
  return auth.employeeId
}
