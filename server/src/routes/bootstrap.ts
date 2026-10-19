import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getPool, rows } from '../db.js'
import { parse } from '../errors.js'
import { isAdmin } from '../auth/guard.js'
import { SELECT_ATTENDANCE, withBreaks, type AttendanceRow } from '../domain/attendance.js'
import { listEmployeeRows, toEmployeeDto } from '../domain/employees.js'
import {
  listBalanceDtos,
  listHolidayDtos,
  listShiftDtos,
  toLeaveRequestDto,
  toNotificationDto,
  toOnDutyDto,
  toRegularizationDto,
  type LeaveRequestRow,
  type NotificationRow,
  type OnDutyRow,
  type RegularizationRow,
} from '../domain/records.js'
import { loadSettingsDto, loadTenantDto } from '../domain/settings.js'
import { addDays, localDate } from '../time.js'

const DEFAULT_WINDOW_DAYS = 92
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const Query = z.object({ from: DateStr.optional() })

/**
 * One-call snapshot in the SPA's AppData shape, scoped by role:
 * admins get the whole tenant, everyone else gets only their own records.
 */
export async function bootstrapRoutes(app: FastifyInstance) {
  app.get('/v1/bootstrap', async (req) => {
    const { from: fromParam } = parse(Query, req.query)
    const { tenantId, employeeId, userId, timezone } = req.auth
    const admin = isAdmin(req.auth)
    const db = getPool()
    const from = fromParam ?? addDays(localDate(new Date(), timezone), -DEFAULT_WINDOW_DAYS)

    const own = admin ? '' : 'AND employee_id = ?'
    const ownParams = admin ? [] : [employeeId]

    const [employees, users, attendanceRows, balances, leaves, regs, onDuty, shifts, holidays, notifications] =
      await Promise.all([
        admin ? listEmployeeRows(db, tenantId) : listEmployeeRows(db, tenantId, 'AND e.id = ?', [employeeId]),
        rows<{ id: string; email: string; role: string; employee_id: string }>(
          db,
          `SELECT id, email, role, employee_id FROM users WHERE tenant_id = ? ${admin ? '' : 'AND id = ?'}`,
          admin ? [tenantId] : [tenantId, userId]
        ),
        rows<AttendanceRow>(
          db,
          `${SELECT_ATTENDANCE} WHERE a.tenant_id = ? AND a.work_date >= ? ${admin ? '' : 'AND a.employee_id = ?'}
           ORDER BY a.work_date DESC`,
          [tenantId, from, ...ownParams]
        ),
        listBalanceDtos(db, tenantId, admin ? undefined : employeeId),
        rows<LeaveRequestRow>(
          db,
          `SELECT * FROM leave_requests WHERE tenant_id = ? ${own} ORDER BY created_at DESC`,
          [tenantId, ...ownParams]
        ),
        rows<RegularizationRow>(
          db,
          `SELECT * FROM regularization_requests WHERE tenant_id = ? ${own} ORDER BY created_at DESC`,
          [tenantId, ...ownParams]
        ),
        rows<OnDutyRow>(
          db,
          `SELECT * FROM on_duty_requests WHERE tenant_id = ? ${own} ORDER BY created_at DESC`,
          [tenantId, ...ownParams]
        ),
        listShiftDtos(db, tenantId),
        listHolidayDtos(db, tenantId),
        rows<NotificationRow>(
          db,
          'SELECT * FROM notifications WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100',
          [tenantId, userId]
        ),
      ])

    return {
      tenant: await loadTenantDto(db, tenantId),
      settings: await loadSettingsDto(db, tenantId),
      users: users.map((u) => ({ id: u.id, email: u.email, role: u.role, employeeId: u.employee_id })),
      employees: employees.map(toEmployeeDto),
      attendance: await withBreaks(db, attendanceRows),
      attendanceFrom: from,
      leaveBalances: balances,
      leaveRequests: leaves.map(toLeaveRequestDto),
      regularizationRequests: regs.map(toRegularizationDto),
      onDutyRequests: onDuty.map(toOnDutyDto),
      shifts,
      holidays,
      notifications: notifications.map(toNotificationDto),
      seededAt: new Date().toISOString(),
    }
  })
}
