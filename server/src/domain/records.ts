import { rows, type Db } from '../db.js'
import {
  iso,
  opt,
  type HolidayDto,
  type LeaveBalanceDto,
  type LeaveRequestDto,
  type NotificationDto,
  type OnDutyDto,
  type RegularizationDto,
  type RegularizationType,
  type RequestStatus,
  type ShiftDto,
  type WorkMode,
} from '../dto.js'

export interface LeaveRequestRow {
  id: string
  employee_id: string
  leave_type_code: string
  from_date: string
  to_date: string
  half_day: number
  half_day_period: 'AM' | 'PM' | null
  days: number
  reason: string
  attachment_note: string | null
  status: RequestStatus
  approver_id: string | null
  approver_comment: string | null
  created_at: Date
  updated_at: Date
}

export function toLeaveRequestDto(r: LeaveRequestRow): LeaveRequestDto {
  return {
    id: r.id,
    employeeId: r.employee_id,
    type: r.leave_type_code,
    from: r.from_date,
    to: r.to_date,
    halfDay: !!r.half_day,
    halfDayPeriod: opt(r.half_day_period),
    reason: r.reason,
    attachmentNote: opt(r.attachment_note),
    status: r.status,
    approverId: opt(r.approver_id),
    approverComment: opt(r.approver_comment),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    days: r.days,
  }
}

export interface RegularizationRow {
  id: string
  employee_id: string
  work_date: string
  request_type: RegularizationType
  proposed_clock_in: Date | null
  proposed_clock_out: Date | null
  proposed_work_mode: WorkMode | null
  reason: string
  status: RequestStatus
  approver_id: string | null
  approver_comment: string | null
  attendance_id: string | null
  created_at: Date
  updated_at: Date
}

export function toRegularizationDto(r: RegularizationRow): RegularizationDto {
  return {
    id: r.id,
    employeeId: r.employee_id,
    workDate: r.work_date,
    requestType: r.request_type,
    proposedClockIn: iso(r.proposed_clock_in),
    proposedClockOut: iso(r.proposed_clock_out),
    proposedWorkMode: opt(r.proposed_work_mode),
    reason: r.reason,
    status: r.status,
    approverId: opt(r.approver_id),
    approverComment: opt(r.approver_comment),
    attendanceId: opt(r.attendance_id),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }
}

export interface OnDutyRow {
  id: string
  employee_id: string
  from_date: string
  to_date: string
  location_label: string | null
  purpose: string
  status: RequestStatus
  approver_id: string | null
  approver_comment: string | null
  created_at: Date
  updated_at: Date
}

export function toOnDutyDto(r: OnDutyRow): OnDutyDto {
  return {
    id: r.id,
    employeeId: r.employee_id,
    from: r.from_date,
    to: r.to_date,
    locationLabel: opt(r.location_label),
    purpose: r.purpose,
    status: r.status,
    approverId: opt(r.approver_id),
    approverComment: opt(r.approver_comment),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }
}

export interface ShiftRow {
  id: string
  name: string
  start_time: string
  end_time: string
  grace_minutes: number
  weekly_off_json: number[]
}

export function toShiftDto(r: ShiftRow): ShiftDto {
  return {
    id: r.id,
    name: r.name,
    start: r.start_time,
    end: r.end_time,
    graceMinutes: r.grace_minutes,
    weeklyOff: r.weekly_off_json,
  }
}

export async function listShiftDtos(db: Db, tenantId: string): Promise<ShiftDto[]> {
  const list = await rows<ShiftRow>(db, 'SELECT * FROM shifts WHERE tenant_id = ? ORDER BY created_at', [tenantId])
  return list.map(toShiftDto)
}

export async function listHolidayDtos(db: Db, tenantId: string): Promise<HolidayDto[]> {
  const list = await rows<{
    id: string
    name: string
    holiday_date: string
    applies_to_all: number
    is_recurring: number
    branch_names: string | null
  }>(
    db,
    `SELECT h.id, h.name, h.holiday_date, h.applies_to_all, h.is_recurring,
            GROUP_CONCAT(b.name ORDER BY b.name SEPARATOR '\u001f') AS branch_names
       FROM holidays h
       LEFT JOIN holiday_branches hb ON hb.holiday_id = h.id
       LEFT JOIN branches b ON b.id = hb.branch_id
      WHERE h.tenant_id = ?
      GROUP BY h.id
      ORDER BY h.holiday_date`,
    [tenantId]
  )
  return list.map((h) => ({
    id: h.id,
    name: h.name,
    date: h.holiday_date,
    branches: h.applies_to_all ? 'All' : (h.branch_names?.split('\u001f') ?? []),
    recurring: !!h.is_recurring || undefined,
  }))
}

export async function listBalanceDtos(db: Db, tenantId: string, employeeId?: string): Promise<LeaveBalanceDto[]> {
  const list = await rows<{ employee_id: string; leave_type_code: string; balance_days: number }>(
    db,
    `SELECT employee_id, leave_type_code, balance_days FROM leave_balances
      WHERE tenant_id = ? ${employeeId ? 'AND employee_id = ?' : ''}`,
    employeeId ? [tenantId, employeeId] : [tenantId]
  )
  const byEmployee = new Map<string, LeaveBalanceDto>()
  for (const b of list) {
    const dto = byEmployee.get(b.employee_id) ?? { employeeId: b.employee_id }
    dto[b.leave_type_code] = b.balance_days
    byEmployee.set(b.employee_id, dto)
  }
  return [...byEmployee.values()]
}

export interface NotificationRow {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  link: string | null
  is_read: number
  created_at: Date
}

export function toNotificationDto(r: NotificationRow): NotificationDto {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    message: r.message,
    read: !!r.is_read,
    createdAt: r.created_at.toISOString(),
    link: opt(r.link),
  }
}
