import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exec, getPool, one, rows, withTx, type Db } from '../db.js'
import { badRequest, conflict, notFound, parse } from '../errors.js'
import { REGULARIZATION_TYPES, REQUEST_STATUSES, WORK_MODES } from '../dto.js'
import { requireAdmin, scopeEmployeeId } from '../auth/guard.js'
import { arrivalStatus, loadEmployeeShift } from '../domain/attendance.js'
import { getEmployee } from '../domain/employees.js'
import { audit, notifyAdmins, notifyEmployee } from '../domain/notify.js'
import { toRegularizationDto, type RegularizationRow } from '../domain/records.js'
import { loadRules } from '../domain/settings.js'
import { localDate, minutesBetween } from '../time.js'

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-MM-dd')

const ListQuery = z.object({
  employeeId: z.string().optional(),
  status: z.enum([...REQUEST_STATUSES, 'All']).optional(),
})

const ApplyBody = z.object({
  employeeId: z.string().optional(),
  workDate: DateStr,
  requestType: z.enum(REGULARIZATION_TYPES),
  proposedClockIn: z.string().datetime({ offset: true }).optional(),
  proposedClockOut: z.string().datetime({ offset: true }).optional(),
  proposedWorkMode: z.enum(WORK_MODES).optional(),
  reason: z.string().trim().min(1, 'Please explain why you need regularization').max(1000),
})

const ReviewBody = z.object({
  status: z.enum(['Approved', 'Rejected']),
  comment: z.string().trim().max(500).optional(),
})

const NEEDS_BOTH_TIMES = new Set(['missed_punch', 'wrong_time'])

async function loadRequest(db: Db, tenantId: string, id: string, lock = false) {
  const row = await one<RegularizationRow>(
    db,
    `SELECT * FROM regularization_requests WHERE tenant_id = ? AND id = ? ${lock ? 'FOR UPDATE' : ''}`,
    [tenantId, id]
  )
  if (!row) throw notFound('Request not found')
  return row
}

export async function regularizationRoutes(app: FastifyInstance) {
  app.get('/v1/regularizations', async (req) => {
    const q = parse(ListQuery, req.query)
    const employeeId = scopeEmployeeId(req.auth, q.employeeId)
    const where = ['tenant_id = ?']
    const params: unknown[] = [req.auth.tenantId]
    if (employeeId) (where.push('employee_id = ?'), params.push(employeeId))
    if (q.status && q.status !== 'All') (where.push('status = ?'), params.push(q.status))
    const list = await rows<RegularizationRow>(
      getPool(),
      `SELECT * FROM regularization_requests WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
      params
    )
    return list.map(toRegularizationDto)
  })

  app.post('/v1/regularizations', async (req) => {
    const body = parse(ApplyBody, req.body)
    const { tenantId, userId, timezone } = req.auth
    const employeeId = scopeEmployeeId(req.auth, body.employeeId)!

    if (NEEDS_BOTH_TIMES.has(body.requestType) && (!body.proposedClockIn || !body.proposedClockOut)) {
      throw badRequest('Proposed clock-in and clock-out are required')
    }
    const clockIn = body.proposedClockIn ? new Date(body.proposedClockIn) : null
    const clockOut = body.proposedClockOut ? new Date(body.proposedClockOut) : null
    if (clockIn && clockOut && clockOut <= clockIn) throw badRequest('Clock-out must be after clock-in')
    if (body.workDate > localDate(new Date(), timezone)) throw badRequest('Cannot regularize a future date')

    const id = await withTx(async (conn) => {
      const employee = await getEmployee(conn, tenantId, employeeId)
      const duplicate = await one(
        conn,
        `SELECT 1 FROM regularization_requests
          WHERE employee_id = ? AND work_date = ? AND status = 'Pending' FOR UPDATE`,
        [employeeId, body.workDate]
      )
      if (duplicate) throw conflict('A pending regularization already exists for this date')

      const requestId = randomUUID()
      await exec(
        conn,
        `INSERT INTO regularization_requests
           (id, tenant_id, employee_id, work_date, request_type, proposed_clock_in, proposed_clock_out,
            proposed_work_mode, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          requestId,
          tenantId,
          employeeId,
          body.workDate,
          body.requestType,
          clockIn,
          clockOut,
          body.proposedWorkMode ?? null,
          body.reason,
        ]
      )
      await notifyAdmins(conn, tenantId, {
        type: 'regularization_pending',
        title: 'Regularization pending',
        message: `${employee.full_name} raised a concern for ${body.workDate}`,
        link: '/my-attendance?tab=regularization',
      })
      await audit(conn, { tenantId, actorUserId: userId, action: 'regularization.apply', entityType: 'regularization', entityId: requestId, ip: req.ip })
      return requestId
    })
    return toRegularizationDto(await loadRequest(getPool(), tenantId, id))
  })

  app.post('/v1/regularizations/:id/review', async (req) => {
    requireAdmin(req.auth)
    const { id } = req.params as { id: string }
    const body = parse(ReviewBody, req.body)
    const { tenantId, userId, employeeId: approverEmployeeId } = req.auth

    await withTx(async (conn) => {
      const r = await loadRequest(conn, tenantId, id, true)
      if (r.status !== 'Pending') throw conflict('Request already reviewed')

      let attendanceId: string | null = null
      if (body.status === 'Approved') {
        const rules = await loadRules(conn, tenantId)
        const shift = await loadEmployeeShift(conn, tenantId, r.employee_id)
        let status: 'Present' | 'Late' | 'Half-Day' = 'Present'
        let workMins = 0
        if (r.proposed_clock_in && r.proposed_clock_out) {
          status = arrivalStatus(r.proposed_clock_in, shift.start, shift.graceMinutes || rules.graceMinutes, rules.timezone)
          workMins = Math.max(0, minutesBetween(r.proposed_clock_in, r.proposed_clock_out))
          if (workMins < rules.halfDayThresholdMinutes) status = 'Half-Day'
        }

        const existing = await one<{ id: string }>(
          conn,
          'SELECT id FROM attendance_records WHERE employee_id = ? AND work_date = ? FOR UPDATE',
          [r.employee_id, r.work_date]
        )
        attendanceId = existing?.id ?? randomUUID()
        const values = [
          r.proposed_clock_in,
          r.proposed_clock_out,
          workMins,
          status,
          r.proposed_work_mode ?? 'Office',
          `Regularized: ${r.reason}`.slice(0, 500),
        ]
        if (existing) {
          await exec(conn, 'DELETE FROM attendance_breaks WHERE attendance_id = ?', [existing.id])
          await exec(
            conn,
            `UPDATE attendance_records
                SET clock_in_at = ?, clock_out_at = ?, total_work_minutes = ?, total_break_minutes = 0,
                    status = ?, work_mode = ?, notes = ?, early_leave_note = NULL, is_on_break = 0,
                    source = 'regularization'
              WHERE id = ?`,
            [...values, existing.id]
          )
        } else {
          await exec(
            conn,
            `INSERT INTO attendance_records
               (id, tenant_id, employee_id, work_date, branch_id, clock_in_at, clock_out_at,
                total_work_minutes, status, work_mode, notes, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'regularization')`,
            [attendanceId, tenantId, r.employee_id, r.work_date, shift.branchId, ...values]
          )
        }
      }

      await exec(
        conn,
        `UPDATE regularization_requests
            SET status = ?, approver_id = ?, approver_comment = ?, attendance_id = COALESCE(?, attendance_id)
          WHERE id = ?`,
        [body.status, approverEmployeeId, body.comment || null, attendanceId, id]
      )
      const verb = body.status.toLowerCase()
      await notifyEmployee(conn, tenantId, r.employee_id, {
        type: 'regularization_result',
        title: `Regularization ${verb}`,
        message: `Your request for ${r.work_date} was ${verb}.`,
        link: '/my-attendance?tab=regularization',
      })
      await audit(conn, {
        tenantId,
        actorUserId: userId,
        action: `regularization.${verb}`,
        entityType: 'regularization',
        entityId: id,
        payload: { comment: body.comment },
        ip: req.ip,
      })
    })
    return toRegularizationDto(await loadRequest(getPool(), tenantId, id))
  })

  app.post('/v1/regularizations/:id/cancel', async (req) => {
    const { id } = req.params as { id: string }
    const { tenantId, employeeId, userId } = req.auth
    await withTx(async (conn) => {
      const r = await loadRequest(conn, tenantId, id, true)
      if (r.employee_id !== employeeId) throw notFound('Request not found')
      if (r.status !== 'Pending') throw conflict('Only pending requests can be cancelled')
      await exec(conn, "UPDATE regularization_requests SET status = 'Cancelled' WHERE id = ?", [id])
      await audit(conn, { tenantId, actorUserId: userId, action: 'regularization.cancel', entityType: 'regularization', entityId: id, ip: req.ip })
    })
    return toRegularizationDto(await loadRequest(getPool(), tenantId, id))
  })
}
