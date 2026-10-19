import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exec, getPool, isDuplicateKey, one, withTx } from '../db.js'
import { createInvite } from '../domain/invites.js'
import { assertSeatAvailable } from '../domain/tenants.js'
import { badRequest, conflict, parse } from '../errors.js'
import { ROLES } from '../dto.js'
import { requireAdmin } from '../auth/guard.js'
import {
  createEmployeeWithUser,
  getEmployee,
  initials,
  listEmployeeRows,
  resolveBranchId,
  resolveDepartmentId,
  resolveShiftId,
  toEmployeeDto,
} from '../domain/employees.js'
import { audit } from '../domain/notify.js'
import { localDate } from '../time.js'

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-MM-dd')

const ListQuery = z.object({
  branch: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(['Active', 'Inactive', 'All']).optional(),
  search: z.string().trim().max(100).optional(),
})

const EmployeeFields = z.object({
  employeeCode: z.string().trim().min(1).max(32),
  externalRef: z.string().trim().max(120),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().max(32),
  role: z.enum(ROLES),
  department: z.string().trim().max(120),
  branch: z.string().trim().max(120),
  shiftId: z.string(),
  managerId: z.string(),
  joinDate: DateStr,
  status: z.enum(['Active', 'Inactive']),
})

const CreateBody = EmployeeFields.partial()
  .required({ name: true, email: true, role: true })
  .extend({ password: z.string().min(8).max(128).optional() })

const PatchBody = EmployeeFields.partial()

function duplicateMessage(err: unknown): never {
  if (isDuplicateKey(err)) throw conflict('An employee with this email or employee code already exists')
  throw err
}

export async function employeeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => requireAdmin(req.auth))

  app.get('/v1/employees', async (req) => {
    const q = parse(ListQuery, req.query)
    const where: string[] = []
    const params: unknown[] = []
    if (q.branch && q.branch !== 'All') (where.push('AND b.name = ?'), params.push(q.branch))
    if (q.department && q.department !== 'All') (where.push('AND d.name = ?'), params.push(q.department))
    if (q.status && q.status !== 'All') (where.push('AND e.status = ?'), params.push(q.status))
    if (q.search) {
      const like = `%${q.search.replace(/[\\%_]/g, '\\$&')}%`
      where.push('AND (e.full_name LIKE ? OR e.email LIKE ? OR e.employee_code LIKE ? OR e.phone LIKE ?)')
      params.push(like, like, like, like)
    }
    const list = await listEmployeeRows(getPool(), req.auth.tenantId, where.join(' '), params)
    return list.map(toEmployeeDto)
  })

  app.get('/v1/employees/:id', async (req) => {
    const { id } = req.params as { id: string }
    return toEmployeeDto(await getEmployee(getPool(), req.auth.tenantId, id))
  })

  app.post('/v1/employees', async (req) => {
    const { password, ...body } = parse(CreateBody, req.body)
    const { tenantId, userId, timezone } = req.auth
    const passwordHash = password ? await bcrypt.hash(password, 10) : null

    const employeeId = await withTx(async (conn) => {
      if (body.status !== 'Inactive') await assertSeatAvailable(conn, tenantId)
      if (body.managerId) await getEmployee(conn, tenantId, body.managerId)
      const created = await createEmployeeWithUser(
        conn,
        tenantId,
        { ...body, passwordHash },
        localDate(new Date(), timezone)
      ).catch(duplicateMessage)
      await audit(conn, {
        tenantId,
        actorUserId: userId,
        action: 'employee.create',
        entityType: 'employee',
        entityId: created.employeeId,
        payload: { email: body.email, role: body.role },
        ip: req.ip,
      })
      return created.employeeId
    })
    return toEmployeeDto(await getEmployee(getPool(), tenantId, employeeId))
  })

  app.patch('/v1/employees/:id', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(PatchBody, req.body)
    const { tenantId, userId, employeeId: selfId } = req.auth
    if (id === selfId && body.role && body.role !== 'admin') throw badRequest('You cannot remove your own admin role')
    if (id === selfId && body.status === 'Inactive') throw badRequest('You cannot deactivate yourself')
    if (body.managerId === id) throw badRequest('An employee cannot be their own manager')

    await withTx(async (conn) => {
      const current = await getEmployee(conn, tenantId, id)
      if (body.status === 'Active' && current.status !== 'Active') await assertSeatAvailable(conn, tenantId)
      const sets: string[] = []
      const params: unknown[] = []
      const set = (column: string, value: unknown) => (sets.push(`${column} = ?`), params.push(value))

      if (body.employeeCode !== undefined) set('employee_code', body.employeeCode)
      if (body.externalRef !== undefined) set('external_ref', body.externalRef || null)
      if (body.name !== undefined) (set('full_name', body.name), set('avatar_initials', initials(body.name)))
      if (body.email !== undefined) set('email', body.email)
      if (body.phone !== undefined) set('phone', body.phone || null)
      if (body.role !== undefined) set('role', body.role)
      if (body.department !== undefined) set('department_id', await resolveDepartmentId(conn, tenantId, body.department))
      if (body.branch !== undefined) set('branch_id', await resolveBranchId(conn, tenantId, body.branch))
      if (body.shiftId !== undefined) set('shift_id', await resolveShiftId(conn, tenantId, body.shiftId || undefined))
      if (body.managerId !== undefined) {
        if (body.managerId) await getEmployee(conn, tenantId, body.managerId)
        set('manager_id', body.managerId || null)
      }
      if (body.joinDate !== undefined) set('join_date', body.joinDate)
      if (body.status !== undefined) set('status', body.status)
      if (sets.length === 0) return

      await exec(conn, `UPDATE employees SET ${sets.join(', ')} WHERE tenant_id = ? AND id = ?`, [
        ...params,
        tenantId,
        id,
      ]).catch(duplicateMessage)

      const userSets: string[] = []
      const userParams: unknown[] = []
      if (body.email !== undefined) (userSets.push('email = ?'), userParams.push(body.email))
      if (body.role !== undefined) (userSets.push('role = ?'), userParams.push(body.role))
      if (body.status !== undefined) (userSets.push('is_active = ?'), userParams.push(body.status === 'Active' ? 1 : 0))
      if (userSets.length) {
        await exec(conn, `UPDATE users SET ${userSets.join(', ')} WHERE tenant_id = ? AND employee_id = ?`, [
          ...userParams,
          tenantId,
          id,
        ]).catch(duplicateMessage)
      }
      await audit(conn, {
        tenantId,
        actorUserId: userId,
        action: 'employee.update',
        entityType: 'employee',
        entityId: id,
        payload: body,
        ip: req.ip,
      })
    })
    return toEmployeeDto(await getEmployee(getPool(), tenantId, id))
  })

  app.post('/v1/employees/:id/deactivate', async (req) => {
    const { id } = req.params as { id: string }
    const { tenantId, userId, employeeId: selfId } = req.auth
    if (id === selfId) throw badRequest('You cannot deactivate yourself')
    await withTx(async (conn) => {
      await getEmployee(conn, tenantId, id)
      await exec(conn, "UPDATE employees SET status = 'Inactive' WHERE tenant_id = ? AND id = ?", [tenantId, id])
      await exec(conn, 'UPDATE users SET is_active = 0 WHERE tenant_id = ? AND employee_id = ?', [tenantId, id])
      await audit(conn, { tenantId, actorUserId: userId, action: 'employee.deactivate', entityType: 'employee', entityId: id, ip: req.ip })
    })
    return toEmployeeDto(await getEmployee(getPool(), tenantId, id))
  })

  /** One-time "set your password" link the admin can share by WhatsApp, email, etc. */
  app.post('/v1/employees/:id/invite', async (req) => {
    const { id } = req.params as { id: string }
    const { tenantId, userId } = req.auth
    return withTx(async (conn) => {
      const emp = await getEmployee(conn, tenantId, id)
      if (emp.status !== 'Active') throw badRequest('Reactivate this employee before inviting them')
      const user = await one<{ id: string }>(conn, 'SELECT id FROM users WHERE tenant_id = ? AND employee_id = ?', [tenantId, id])
      if (!user) throw badRequest('This employee has no login')
      const link = await createInvite(conn, { tenantId, userId: user.id, createdByUserId: userId })
      await audit(conn, { tenantId, actorUserId: userId, action: 'employee.invite', entityType: 'employee', entityId: id, ip: req.ip })
      return { ...link, email: emp.email }
    })
  })
}
