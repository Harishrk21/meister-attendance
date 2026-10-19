import { exec, one, type Db } from '../db.js'
import { notFound } from '../errors.js'
import type { AuthResponse, Role, SessionDto } from '../dto.js'
import { signAccessToken } from '../auth/tokens.js'
import { loadTenantDto } from './settings.js'

export async function buildSession(
  db: Db,
  tenantId: string,
  userId: string,
  loggedInAt: Date
): Promise<SessionDto> {
  const row = await one<{
    id: string
    email: string
    role: Role
    employee_id: string
    full_name: string
    branch_name: string | null
  }>(
    db,
    `SELECT u.id, u.email, u.role, u.employee_id, e.full_name, b.name AS branch_name
       FROM users u
       JOIN employees e ON e.id = u.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
      WHERE u.tenant_id = ? AND u.id = ?`,
    [tenantId, userId]
  )
  if (!row) throw notFound('User not found')
  return {
    userId: row.id,
    email: row.email,
    role: row.role,
    employeeId: row.employee_id,
    name: row.full_name,
    branch: row.branch_name ?? '',
    loggedInAt: loggedInAt.toISOString(),
  }
}

/** Issues an access token for a verified user and records the login. */
export async function issueLogin(db: Db, tenantId: string, userId: string): Promise<AuthResponse> {
  const now = new Date()
  const session = await buildSession(db, tenantId, userId, now)
  await exec(db, 'UPDATE users SET last_login_at = ? WHERE id = ?', [now, userId])
  const token = await signAccessToken({
    userId,
    tenantId,
    employeeId: session.employeeId,
    role: session.role,
  })
  return { token, session, tenant: await loadTenantDto(db, tenantId) }
}
