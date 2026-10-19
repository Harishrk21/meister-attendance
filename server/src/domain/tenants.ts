import { randomUUID } from 'node:crypto'
import { exec, one, type Db } from '../db.js'
import { conflict } from '../errors.js'
import { createEmployeeWithUser } from './employees.js'

export const DEFAULT_LEAVE_TYPES = [
  { code: 'Casual', name: 'Casual Leave', quota: 8, paid: true },
  { code: 'Sick', name: 'Sick Leave', quota: 6, paid: true },
  { code: 'Earned', name: 'Earned Leave', quota: 12, paid: true },
  { code: 'Comp-Off', name: 'Compensatory Off', quota: 2, paid: true },
  { code: 'Unpaid', name: 'Unpaid Leave', quota: 0, paid: false },
] as const

/** Slugs that would collide with app routes or look like ours. */
export const RESERVED_SLUGS = new Set(['admin', 'api', 'app', 'platform', 'www', 'login', 'sso', 'invite', 'meister', 'support'])

export interface ProvisionTenantInput {
  name: string
  slug: string
  timezone: string
  status: 'trial' | 'active'
  plan: string
  seatLimit: number | null
  trialEndsOn: string | null
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  branchName: string
  employeeCodePrefix?: string
  logoUrl?: string
  primaryColor?: string
  admin: { name: string; email: string }
}

export async function provisionTenant(
  db: Db,
  input: ProvisionTenantInput,
  today: string
): Promise<{ tenantId: string; adminUserId: string }> {
  const tenantId = randomUUID()
  await exec(
    db,
    `INSERT INTO tenants (id, slug, name, status, plan, seat_limit, trial_ends_on, timezone, contact_name, contact_email, contact_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId, input.slug, input.name, input.status, input.plan, input.seatLimit, input.trialEndsOn, input.timezone,
      input.contactName || null, input.contactEmail || null, input.contactPhone || null,
    ]
  )
  await exec(
    db,
    `INSERT INTO tenant_settings (tenant_id, display_name, email, phone, logo_url, primary_color, employee_code_prefix)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId, input.name, input.contactEmail || null, input.contactPhone || null,
      input.logoUrl || null, input.primaryColor || null, input.employeeCodePrefix || null,
    ]
  )
  await exec(db, 'INSERT INTO branches (id, tenant_id, name) VALUES (?, ?, ?)', [randomUUID(), tenantId, input.branchName])
  await exec(
    db,
    `INSERT INTO shifts (id, tenant_id, name, start_time, end_time, grace_minutes, weekly_off_json)
     VALUES (?, ?, 'General', '09:00', '18:00', 15, '[0]')`,
    [randomUUID(), tenantId]
  )
  await exec(db, 'INSERT INTO leave_types (tenant_id, code, name, annual_quota, is_paid) VALUES ?', [
    DEFAULT_LEAVE_TYPES.map((t) => [tenantId, t.code, t.name, t.quota, t.paid ? 1 : 0]),
  ])

  const { userId } = await createEmployeeWithUser(
    db,
    tenantId,
    { name: input.admin.name, email: input.admin.email, role: 'admin', department: 'Management', passwordHash: null },
    today
  )
  return { tenantId, adminUserId: userId }
}

/**
 * Plans cap the number of active employees a client can have.
 * Call inside the transaction that adds the seat: the tenant row lock serialises concurrent adds.
 */
export async function assertSeatAvailable(db: Db, tenantId: string): Promise<void> {
  const tenant = await one<{ seat_limit: number | null }>(db, 'SELECT seat_limit FROM tenants WHERE id = ? FOR UPDATE', [
    tenantId,
  ])
  if (tenant?.seat_limit == null) return
  const row = await one<{ used: number }>(
    db,
    "SELECT COUNT(*) AS used FROM employees WHERE tenant_id = ? AND status = 'Active'",
    [tenantId]
  ).then((r) => ({ seat_limit: tenant.seat_limit, used: r?.used ?? 0 }))
  if (row?.seat_limit != null && row.used >= row.seat_limit) {
    throw conflict(
      `Your plan allows ${row.seat_limit} active employees. Deactivate someone or ask us to raise the limit.`,
      'SEAT_LIMIT_REACHED'
    )
  }
}
