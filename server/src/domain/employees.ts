import { randomUUID } from 'node:crypto'
import { exec, one, rows, type Db } from '../db.js'
import { badRequest, notFound } from '../errors.js'
import { opt, type EmployeeDto, type Role } from '../dto.js'

export interface EmployeeRow {
  id: string
  tenant_id: string
  employee_code: string
  external_ref: string | null
  full_name: string
  email: string
  phone: string | null
  role: Role
  department_id: string | null
  branch_id: string | null
  shift_id: string | null
  manager_id: string | null
  join_date: string
  status: 'Active' | 'Inactive'
  avatar_initials: string
  department_name: string | null
  branch_name: string | null
}

export const SELECT_EMPLOYEE = `
  SELECT e.*, d.name AS department_name, b.name AS branch_name
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN branches b ON b.id = e.branch_id`

export function toEmployeeDto(r: EmployeeRow): EmployeeDto {
  return {
    id: r.id,
    employeeCode: r.employee_code,
    externalRef: opt(r.external_ref),
    name: r.full_name,
    email: r.email,
    phone: r.phone ?? '',
    role: r.role,
    department: r.department_name ?? '',
    branch: r.branch_name ?? '',
    shiftId: r.shift_id ?? '',
    joinDate: r.join_date,
    status: r.status,
    avatarInitials: r.avatar_initials,
    managerId: opt(r.manager_id),
  }
}

export async function getEmployee(db: Db, tenantId: string, id: string): Promise<EmployeeRow> {
  const row = await one<EmployeeRow>(db, `${SELECT_EMPLOYEE} WHERE e.tenant_id = ? AND e.id = ?`, [tenantId, id])
  if (!row) throw notFound('Employee not found')
  return row
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export async function resolveDepartmentId(db: Db, tenantId: string, name?: string): Promise<string | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null
  const existing = await one<{ id: string }>(db, 'SELECT id FROM departments WHERE tenant_id = ? AND name = ?', [
    tenantId,
    trimmed,
  ])
  if (existing) return existing.id
  const id = randomUUID()
  await exec(db, 'INSERT INTO departments (id, tenant_id, name) VALUES (?, ?, ?)', [id, tenantId, trimmed])
  return id
}

/** Named branch if given, otherwise the tenant's first branch. */
export async function resolveBranchId(db: Db, tenantId: string, name?: string): Promise<string | null> {
  const trimmed = name?.trim()
  if (trimmed) {
    const b = await one<{ id: string }>(db, 'SELECT id FROM branches WHERE tenant_id = ? AND name = ?', [
      tenantId,
      trimmed,
    ])
    if (!b) throw badRequest(`Unknown branch "${trimmed}"`)
    return b.id
  }
  const first = await one<{ id: string }>(
    db,
    'SELECT id FROM branches WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at LIMIT 1',
    [tenantId]
  )
  return first?.id ?? null
}

export async function resolveShiftId(db: Db, tenantId: string, shiftId?: string): Promise<string | null> {
  if (shiftId) {
    const s = await one<{ id: string }>(db, 'SELECT id FROM shifts WHERE tenant_id = ? AND id = ?', [tenantId, shiftId])
    if (!s) throw badRequest('Unknown shift')
    return s.id
  }
  const first = await one<{ id: string }>(db, 'SELECT id FROM shifts WHERE tenant_id = ? ORDER BY created_at LIMIT 1', [
    tenantId,
  ])
  return first?.id ?? null
}

async function nextEmployeeCode(db: Db, tenantId: string): Promise<string> {
  const row = await one<{ n: number; prefix: string | null }>(
    db,
    `SELECT (SELECT COUNT(*) FROM employees WHERE tenant_id = ?) AS n,
            (SELECT employee_code_prefix FROM tenant_settings WHERE tenant_id = ?) AS prefix`,
    [tenantId, tenantId]
  )
  const prefix = row?.prefix || 'EMP'
  let n = (row?.n ?? 0) + 1
  for (;;) {
    const code = `${prefix}-${String(n).padStart(4, '0')}`
    const taken = await one(db, 'SELECT 1 FROM employees WHERE tenant_id = ? AND employee_code = ?', [tenantId, code])
    if (!taken) return code
    n++
  }
}

export interface NewEmployeeInput {
  employeeCode?: string
  externalRef?: string
  name: string
  email: string
  phone?: string
  role: Role
  department?: string
  branch?: string
  shiftId?: string
  managerId?: string
  joinDate?: string
  status?: 'Active' | 'Inactive'
  passwordHash: string | null
}

/** Creates the employee, its login and opening leave balances from the tenant's leave types. */
export async function createEmployeeWithUser(
  db: Db,
  tenantId: string,
  input: NewEmployeeInput,
  today: string
): Promise<{ employeeId: string; userId: string }> {
  const employeeId = randomUUID()
  const userId = randomUUID()
  const email = input.email.trim().toLowerCase()

  await exec(
    db,
    `INSERT INTO employees
       (id, tenant_id, employee_code, external_ref, full_name, email, phone, role,
        department_id, branch_id, shift_id, manager_id, join_date, status, avatar_initials)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employeeId,
      tenantId,
      input.employeeCode?.trim() || (await nextEmployeeCode(db, tenantId)),
      input.externalRef || null,
      input.name.trim(),
      email,
      input.phone || null,
      input.role,
      await resolveDepartmentId(db, tenantId, input.department),
      await resolveBranchId(db, tenantId, input.branch),
      await resolveShiftId(db, tenantId, input.shiftId),
      input.managerId || null,
      input.joinDate || today,
      input.status ?? 'Active',
      initials(input.name),
    ]
  )
  await exec(
    db,
    `INSERT INTO users (id, tenant_id, employee_id, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, tenantId, employeeId, email, input.passwordHash, input.role, input.status === 'Inactive' ? 0 : 1]
  )
  await exec(
    db,
    `INSERT INTO leave_balances (tenant_id, employee_id, leave_type_code, balance_days)
     SELECT tenant_id, ?, code, annual_quota FROM leave_types WHERE tenant_id = ? AND is_active = 1`,
    [employeeId, tenantId]
  )
  return { employeeId, userId }
}

export async function listEmployeeRows(db: Db, tenantId: string, where = '', params: unknown[] = []) {
  return rows<EmployeeRow>(
    db,
    `${SELECT_EMPLOYEE} WHERE e.tenant_id = ? ${where} ORDER BY e.employee_code`,
    [tenantId, ...params]
  )
}
