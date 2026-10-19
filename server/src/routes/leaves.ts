import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exec, getPool, one, rows, withTx, type Db } from '../db.js'
import { badRequest, conflict, notFound, parse } from '../errors.js'
import { REQUEST_STATUSES } from '../dto.js'
import { requireAdmin, scopeEmployeeId } from '../auth/guard.js'
import { getEmployee } from '../domain/employees.js'
import { audit, notifyAdmins, notifyEmployee } from '../domain/notify.js'
import { listBalanceDtos, toLeaveRequestDto, type LeaveRequestRow } from '../domain/records.js'
import { calendarDaysInclusive, eachDate, weekday } from '../time.js'

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-MM-dd')
const MAX_LEAVE_DAYS = 90

const ListQuery = z.object({
  employeeId: z.string().optional(),
  status: z.enum([...REQUEST_STATUSES, 'All']).optional(),
  branch: z.string().optional(),
})

const ApplyBody = z.object({
  employeeId: z.string().optional(),
  type: z.string().trim().min(1).max(32),
  from: DateStr,
  to: DateStr,
  halfDay: z.boolean().default(false),
  halfDayPeriod: z.enum(['AM', 'PM']).optional(),
  reason: z.string().trim().min(1).max(1000),
  attachmentNote: z.string().trim().max(500).optional(),
})

const ReviewBody = z.object({
  status: z.enum(['Approved', 'Rejected']),
  comment: z.string().trim().max(500).optional(),
})

async function loadLeave(db: Db, tenantId: string, id: string, lock = false) {
  const row = await one<LeaveRequestRow>(
    db,
    `SELECT * FROM leave_requests WHERE tenant_id = ? AND id = ? ${lock ? 'FOR UPDATE' : ''}`,
    [tenantId, id]
  )
  if (!row) throw notFound('Leave not found')
  return row
}

export async function leaveRoutes(app: FastifyInstance) {
  app.get('/v1/leaves', async (req) => {
    const q = parse(ListQuery, req.query)
    const employeeId = scopeEmployeeId(req.auth, q.employeeId)
    const where = ['l.tenant_id = ?']
    const params: unknown[] = [req.auth.tenantId]
    if (employeeId) (where.push('l.employee_id = ?'), params.push(employeeId))
    if (q.status && q.status !== 'All') (where.push('l.status = ?'), params.push(q.status))
    if (q.branch && q.branch !== 'All') (where.push('b.name = ?'), params.push(q.branch))
    const list = await rows<LeaveRequestRow>(
      getPool(),
      `SELECT l.* FROM leave_requests l
         JOIN employees e ON e.id = l.employee_id
         LEFT JOIN branches b ON b.id = e.branch_id
        WHERE ${where.join(' AND ')}
        ORDER BY l.created_at DESC`,
      params
    )
    return list.map(toLeaveRequestDto)
  })

  app.get('/v1/leaves/balances/:employeeId', async (req) => {
    const { employeeId } = req.params as { employeeId: string }
    const scoped = scopeEmployeeId(req.auth, employeeId)!
    const [balance] = await listBalanceDtos(getPool(), req.auth.tenantId, scoped)
    return balance ?? { employeeId: scoped }
  })

  app.get('/v1/leaves/types', async (req) => {
    return rows(
      getPool(),
      `SELECT code, name, annual_quota AS annualQuota, is_paid = 1 AS isPaid
         FROM leave_types WHERE tenant_id = ? AND is_active = 1 ORDER BY name`,
      [req.auth.tenantId]
    )
  })

  app.post('/v1/leaves', async (req) => {
    const body = parse(ApplyBody, req.body)
    const { tenantId, userId } = req.auth
    const employeeId = scopeEmployeeId(req.auth, body.employeeId)!
    if (body.to < body.from) throw badRequest('Invalid date range')
    const span = calendarDaysInclusive(body.from, body.to)
    if (span > MAX_LEAVE_DAYS) throw badRequest(`Leave cannot exceed ${MAX_LEAVE_DAYS} days`)
    if (body.halfDay && body.from !== body.to) throw badRequest('Half-day leave must be a single date')
    const days = body.halfDay ? 0.5 : span

    const id = await withTx(async (conn) => {
      const employee = await getEmployee(conn, tenantId, employeeId)
      const type = await one<{ is_paid: number }>(
        conn,
        'SELECT is_paid FROM leave_types WHERE tenant_id = ? AND code = ? AND is_active = 1',
        [tenantId, body.type]
      )
      if (!type) throw badRequest(`Unknown leave type "${body.type}"`)
      if (type.is_paid) {
        const bal = await one<{ balance_days: number }>(
          conn,
          'SELECT balance_days FROM leave_balances WHERE employee_id = ? AND leave_type_code = ?',
          [employeeId, body.type]
        )
        if (bal && bal.balance_days < days) throw badRequest(`Insufficient ${body.type} leave balance`)
      }
      const overlap = await one(
        conn,
        `SELECT 1 FROM leave_requests
          WHERE employee_id = ? AND status IN ('Pending','Approved') AND from_date <= ? AND to_date >= ?`,
        [employeeId, body.to, body.from]
      )
      if (overlap) throw conflict('You already have leave applied for these dates')

      const leaveId = randomUUID()
      await exec(
        conn,
        `INSERT INTO leave_requests
           (id, tenant_id, employee_id, leave_type_code, from_date, to_date, half_day, half_day_period,
            days, reason, attachment_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          leaveId,
          tenantId,
          employeeId,
          body.type,
          body.from,
          body.to,
          body.halfDay ? 1 : 0,
          body.halfDay ? (body.halfDayPeriod ?? null) : null,
          days,
          body.reason,
          body.attachmentNote || null,
        ]
      )
      await notifyAdmins(conn, tenantId, {
        type: 'leave_pending',
        title: 'New leave request',
        message: `${employee.full_name} requested ${body.type} leave`,
        link: '/leaves',
      })
      await audit(conn, { tenantId, actorUserId: userId, action: 'leave.apply', entityType: 'leave', entityId: leaveId, ip: req.ip })
      return leaveId
    })
    return toLeaveRequestDto(await loadLeave(getPool(), tenantId, id))
  })

  app.post('/v1/leaves/:id/review', async (req) => {
    requireAdmin(req.auth)
    const { id } = req.params as { id: string }
    const body = parse(ReviewBody, req.body)
    const { tenantId, userId, employeeId: approverEmployeeId } = req.auth

    await withTx(async (conn) => {
      const lr = await loadLeave(conn, tenantId, id, true)
      if (lr.status !== 'Pending') throw conflict('Leave already reviewed')
      await exec(
        conn,
        'UPDATE leave_requests SET status = ?, approver_id = ?, approver_comment = ? WHERE id = ?',
        [body.status, approverEmployeeId, body.comment || null, id]
      )

      if (body.status === 'Approved') {
        const type = await one<{ is_paid: number }>(
          conn,
          'SELECT is_paid FROM leave_types WHERE tenant_id = ? AND code = ?',
          [tenantId, lr.leave_type_code]
        )
        if (type?.is_paid) {
          await exec(
            conn,
            `UPDATE leave_balances SET balance_days = GREATEST(0, balance_days - ?)
              WHERE employee_id = ? AND leave_type_code = ?`,
            [lr.days, lr.employee_id, lr.leave_type_code]
          )
          const emp = await one<{ branch_id: string | null }>(conn, 'SELECT branch_id FROM employees WHERE id = ?', [
            lr.employee_id,
          ])
          for (const date of eachDate(lr.from_date, lr.to_date)) {
            if (weekday(date) === 0) continue
            await exec(
              conn,
              `DELETE br FROM attendance_breaks br
                 JOIN attendance_records a ON a.id = br.attendance_id
                WHERE a.employee_id = ? AND a.work_date = ?`,
              [lr.employee_id, date]
            )
            await exec(
              conn,
              `INSERT INTO attendance_records (id, tenant_id, employee_id, work_date, branch_id, status, source)
               VALUES (?, ?, ?, ?, ?, 'On Leave', 'leave')
               ON DUPLICATE KEY UPDATE status = 'On Leave', clock_in_at = NULL, clock_out_at = NULL,
                 total_work_minutes = 0, total_break_minutes = 0, is_on_break = 0, source = 'leave'`,
              [randomUUID(), tenantId, lr.employee_id, date, emp?.branch_id ?? null]
            )
          }
        }
      }

      const verb = body.status.toLowerCase()
      await notifyEmployee(conn, tenantId, lr.employee_id, {
        type: 'leave_result',
        title: `Leave ${verb}`,
        message: `Your ${lr.leave_type_code} leave (${lr.from_date}) was ${verb}.`,
        link: '/leaves',
      })
      await audit(conn, {
        tenantId,
        actorUserId: userId,
        action: `leave.${verb}`,
        entityType: 'leave',
        entityId: id,
        payload: { comment: body.comment },
        ip: req.ip,
      })
    })
    return toLeaveRequestDto(await loadLeave(getPool(), tenantId, id))
  })

  app.post('/v1/leaves/:id/cancel', async (req) => {
    const { id } = req.params as { id: string }
    const { tenantId, employeeId, userId } = req.auth
    await withTx(async (conn) => {
      const lr = await loadLeave(conn, tenantId, id, true)
      if (lr.employee_id !== employeeId) throw notFound('Leave not found')
      if (lr.status !== 'Pending') throw conflict('Only pending leave can be cancelled')
      await exec(conn, "UPDATE leave_requests SET status = 'Cancelled' WHERE id = ?", [id])
      await audit(conn, { tenantId, actorUserId: userId, action: 'leave.cancel', entityType: 'leave', entityId: id, ip: req.ip })
    })
    return toLeaveRequestDto(await loadLeave(getPool(), tenantId, id))
  })
}
