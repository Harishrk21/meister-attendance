import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exec, getPool, one, rows, withTx } from '../db.js'
import { badRequest, conflict, notFound, parse } from '../errors.js'
import { ATTENDANCE_STATUSES, WORK_MODES } from '../dto.js'
import { requireAdmin, scopeEmployeeId } from '../auth/guard.js'
import {
  arrivalStatus,
  breakMinutes,
  getAttendanceDto,
  loadEmployeeShift,
  SELECT_ATTENDANCE,
  withBreaks,
  workMinutes,
  type AttendanceRow,
  type BreakRow,
} from '../domain/attendance.js'
import { audit } from '../domain/notify.js'
import { assertWithinGeofence, loadGeofenceForEmployee } from '../domain/geofence.js'
import { loadRules } from '../domain/settings.js'
import { hhmmToMinutes, localDate, localMinutes } from '../time.js'

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-MM-dd')

const ListQuery = z.object({
  employeeId: z.string().optional(),
  from: DateStr.optional(),
  to: DateStr.optional(),
  date: DateStr.optional(),
  status: z.enum([...ATTENDANCE_STATUSES, 'All']).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
})

const ClockInBody = z.object({
  workMode: z.enum(WORK_MODES),
  activity: z.string().trim().max(80).optional(),
  notes: z.string().max(500).optional(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      capturedAt: z.string().datetime().optional(),
    })
    .optional(),
})

const ClockOutBody = z.object({ earlyLeaveNote: z.string().max(500).optional() })

const BulkBody = z.object({
  date: DateStr,
  employeeIds: z.array(z.string()).min(1).max(1000),
  status: z.enum(ATTENDANCE_STATUSES),
})

const NON_WORKING: ReadonlySet<string> = new Set(['Absent', 'Holiday', 'On Leave'])

export async function attendanceRoutes(app: FastifyInstance) {
  app.get('/v1/attendance', async (req) => {
    const q = parse(ListQuery, req.query)
    const employeeId = scopeEmployeeId(req.auth, q.employeeId)
    const where: string[] = ['a.tenant_id = ?']
    const params: unknown[] = [req.auth.tenantId]
    if (employeeId) (where.push('a.employee_id = ?'), params.push(employeeId))
    if (q.date) (where.push('a.work_date = ?'), params.push(q.date))
    if (q.from) (where.push('a.work_date >= ?'), params.push(q.from))
    if (q.to) (where.push('a.work_date <= ?'), params.push(q.to))
    if (q.status && q.status !== 'All') (where.push('a.status = ?'), params.push(q.status))
    const db = getPool()
    const list = await rows<AttendanceRow>(
      db,
      `${SELECT_ATTENDANCE} WHERE ${where.join(' AND ')}
       ORDER BY a.work_date DESC, a.clock_in_at DESC LIMIT ?`,
      [...params, q.limit]
    )
    return withBreaks(db, list)
  })

  app.get('/v1/attendance/today', async (req) => {
    const { tenantId, employeeId, timezone } = req.auth
    const db = getPool()
    const list = await rows<AttendanceRow>(
      db,
      `${SELECT_ATTENDANCE} WHERE a.tenant_id = ? AND a.employee_id = ? AND a.work_date = ?`,
      [tenantId, employeeId, localDate(new Date(), timezone)]
    )
    const dtos = await withBreaks(db, list)
    return { record: dtos.find((d) => !NON_WORKING.has(d.status)) ?? dtos[0] ?? null }
  })

  app.post('/v1/attendance/clock-in', async (req) => {
    const body = parse(ClockInBody, req.body)
    const { tenantId, employeeId, userId } = req.auth

    const id = await withTx(async (conn) => {
      const rules = await loadRules(conn, tenantId)
      const now = new Date()
      const date = localDate(now, rules.timezone)
      const shift = await loadEmployeeShift(conn, tenantId, employeeId)

      const fence = await loadGeofenceForEmployee(conn, tenantId, employeeId)
      if (fence) assertWithinGeofence(fence, body.location)

      const existing = await one<{ id: string; clock_in_at: Date | null; clock_out_at: Date | null; status: string }>(
        conn,
        `SELECT id, clock_in_at, clock_out_at, status FROM attendance_records
          WHERE tenant_id = ? AND employee_id = ? AND work_date = ? FOR UPDATE`,
        [tenantId, employeeId, date]
      )
      if (existing?.clock_in_at && !NON_WORKING.has(existing.status)) {
        throw conflict(existing.clock_out_at ? 'Already completed attendance for today' : 'Already clocked in')
      }
      // A placeholder (absent / leave / holiday without punches) is replaced by the real punch.
      if (existing) await exec(conn, 'DELETE FROM attendance_records WHERE id = ?', [existing.id])

      const recordId = randomUUID()
      await exec(
        conn,
        `INSERT INTO attendance_records
           (id, tenant_id, employee_id, work_date, branch_id, clock_in_at, status, work_mode, activity,
            location_lat, location_lng, location_captured_at, notes, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'punch')`,
        [
          recordId,
          tenantId,
          employeeId,
          date,
          shift.branchId,
          now,
          arrivalStatus(now, shift.start, shift.graceMinutes || rules.graceMinutes, rules.timezone),
          body.workMode,
          body.activity || null,
          body.location?.lat ?? null,
          body.location?.lng ?? null,
          body.location ? (body.location.capturedAt ? new Date(body.location.capturedAt) : now) : null,
          body.notes?.trim() || null,
        ]
      )
      await audit(conn, { tenantId, actorUserId: userId, action: 'attendance.clock_in', entityType: 'attendance', entityId: recordId, ip: req.ip })
      return recordId
    })
    return getAttendanceDto(getPool(), tenantId, id)
  })

  app.post('/v1/attendance/clock-out', async (req) => {
    const body = parse(ClockOutBody, req.body)
    const { tenantId, employeeId, userId } = req.auth

    const id = await withTx(async (conn) => {
      const rules = await loadRules(conn, tenantId)
      const now = new Date()
      const rec = await one<{ id: string; clock_in_at: Date; is_on_break: number; status: string }>(
        conn,
        `SELECT id, clock_in_at, is_on_break, status FROM attendance_records
          WHERE tenant_id = ? AND employee_id = ? AND work_date = ?
            AND clock_in_at IS NOT NULL AND clock_out_at IS NULL FOR UPDATE`,
        [tenantId, employeeId, localDate(now, rules.timezone)]
      )
      if (!rec) throw notFound('No active clock-in found')
      if (rec.is_on_break) throw conflict('End your break before clocking out')

      const shift = await loadEmployeeShift(conn, tenantId, employeeId)
      const note = body.earlyLeaveNote?.trim()
      const early = localMinutes(now, rules.timezone) < hhmmToMinutes(shift.end)
      if (early && rules.requireNoteForEarlyLeave && !note) {
        throw badRequest('Early leave note required before shift end', 'EARLY_LEAVE_NOTE_REQUIRED')
      }

      const breaks = await rows<BreakRow>(conn, 'SELECT * FROM attendance_breaks WHERE attendance_id = ?', [rec.id])
      const totalBreak = breakMinutes(breaks, now)
      const totalWork = workMinutes(rec.clock_in_at, now, totalBreak)
      const status = totalWork < rules.halfDayThresholdMinutes ? 'Half-Day' : rec.status

      await exec(
        conn,
        `UPDATE attendance_records
            SET clock_out_at = ?, early_leave_note = ?, total_break_minutes = ?, total_work_minutes = ?,
                status = ?, is_on_break = 0
          WHERE id = ?`,
        [now, note || null, totalBreak, totalWork, status, rec.id]
      )
      await audit(conn, { tenantId, actorUserId: userId, action: 'attendance.clock_out', entityType: 'attendance', entityId: rec.id, ip: req.ip })
      return rec.id
    })
    return getAttendanceDto(getPool(), tenantId, id)
  })

  app.post('/v1/attendance/breaks/start', async (req) => {
    const { tenantId, employeeId } = req.auth
    const id = await withTx(async (conn) => {
      const rules = await loadRules(conn, tenantId)
      const rec = await one<{ id: string; is_on_break: number }>(
        conn,
        `SELECT id, is_on_break FROM attendance_records
          WHERE tenant_id = ? AND employee_id = ? AND work_date = ?
            AND clock_in_at IS NOT NULL AND clock_out_at IS NULL FOR UPDATE`,
        [tenantId, employeeId, localDate(new Date(), rules.timezone)]
      )
      if (!rec) throw conflict('Clock in first')
      if (rec.is_on_break) throw conflict('Already on break')
      await exec(conn, 'INSERT INTO attendance_breaks (id, tenant_id, attendance_id, start_at) VALUES (?, ?, ?, ?)', [
        randomUUID(),
        tenantId,
        rec.id,
        new Date(),
      ])
      await exec(conn, 'UPDATE attendance_records SET is_on_break = 1 WHERE id = ?', [rec.id])
      return rec.id
    })
    return getAttendanceDto(getPool(), tenantId, id)
  })

  app.post('/v1/attendance/breaks/end', async (req) => {
    const { tenantId, employeeId } = req.auth
    const id = await withTx(async (conn) => {
      const rules = await loadRules(conn, tenantId)
      const now = new Date()
      const rec = await one<{ id: string; clock_in_at: Date; is_on_break: number }>(
        conn,
        `SELECT id, clock_in_at, is_on_break FROM attendance_records
          WHERE tenant_id = ? AND employee_id = ? AND work_date = ?
            AND clock_in_at IS NOT NULL AND clock_out_at IS NULL FOR UPDATE`,
        [tenantId, employeeId, localDate(now, rules.timezone)]
      )
      if (!rec) throw conflict('Clock in first')
      if (!rec.is_on_break) throw conflict('Not on break')
      const result = await exec(
        conn,
        'UPDATE attendance_breaks SET end_at = ? WHERE attendance_id = ? AND end_at IS NULL',
        [now, rec.id]
      )
      if (result.affectedRows === 0) throw conflict('No open break')
      const breaks = await rows<BreakRow>(conn, 'SELECT * FROM attendance_breaks WHERE attendance_id = ?', [rec.id])
      const totalBreak = breakMinutes(breaks, now)
      await exec(
        conn,
        'UPDATE attendance_records SET is_on_break = 0, total_break_minutes = ?, total_work_minutes = ? WHERE id = ?',
        [totalBreak, workMinutes(rec.clock_in_at, now, totalBreak), rec.id]
      )
      return rec.id
    })
    return getAttendanceDto(getPool(), tenantId, id)
  })

  app.post('/v1/attendance/bulk-status', async (req) => {
    requireAdmin(req.auth)
    const body = parse(BulkBody, req.body)
    const { tenantId, userId } = req.auth

    const updated = await withTx(async (conn) => {
      const employees = await rows<{ id: string; branch_id: string | null }>(
        conn,
        'SELECT id, branch_id FROM employees WHERE tenant_id = ? AND id IN (?)',
        [tenantId, body.employeeIds]
      )
      for (const e of employees) {
        await exec(
          conn,
          `DELETE br FROM attendance_breaks br
             JOIN attendance_records a ON a.id = br.attendance_id
            WHERE a.employee_id = ? AND a.work_date = ?`,
          [e.id, body.date]
        )
        await exec(
          conn,
          `INSERT INTO attendance_records (id, tenant_id, employee_id, work_date, branch_id, status, source)
           VALUES (?, ?, ?, ?, ?, ?, 'admin')
           ON DUPLICATE KEY UPDATE status = ?, clock_in_at = NULL, clock_out_at = NULL,
             total_work_minutes = 0, total_break_minutes = 0, is_on_break = 0, source = 'admin'`,
          [randomUUID(), tenantId, e.id, body.date, e.branch_id, body.status, body.status]
        )
      }
      await audit(conn, {
        tenantId,
        actorUserId: userId,
        action: 'attendance.bulk_status',
        entityType: 'attendance',
        payload: { date: body.date, status: body.status, employeeIds: employees.map((e) => e.id) },
        ip: req.ip,
      })
      return employees.length
    })
    return { updated }
  })
}
