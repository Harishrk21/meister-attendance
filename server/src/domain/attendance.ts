import { one, rows, type Db } from '../db.js'
import { notFound } from '../errors.js'
import { iso, opt, type AttendanceDto, type AttendanceStatus, type WorkMode } from '../dto.js'
import { hhmmToMinutes, localMinutes, minutesBetween } from '../time.js'

export interface AttendanceRow {
  id: string
  employee_id: string
  work_date: string
  branch_name: string | null
  clock_in_at: Date | null
  clock_out_at: Date | null
  total_work_minutes: number
  total_break_minutes: number
  status: AttendanceStatus
  work_mode: WorkMode | null
  activity: string | null
  location_lat: number | null
  location_lng: number | null
  location_captured_at: Date | null
  notes: string | null
  early_leave_note: string | null
  is_on_break: number
}

export interface BreakRow {
  id: string
  attendance_id: string
  start_at: Date
  end_at: Date | null
  kind?: 'break' | 'lunch'
}

export const SELECT_ATTENDANCE = `
  SELECT a.*, b.name AS branch_name
    FROM attendance_records a
    LEFT JOIN branches b ON b.id = a.branch_id`

export function breakMinutes(breaks: BreakRow[], now = new Date()): number {
  return breaks.reduce((sum, b) => sum + Math.max(0, minutesBetween(b.start_at, b.end_at ?? now)), 0)
}

export function workMinutes(clockIn: Date, clockOut: Date | null, breakMins: number, now = new Date()): number {
  return Math.max(0, minutesBetween(clockIn, clockOut ?? now) - breakMins)
}

/** Present when clocked in on or before shift start + grace (tenant-local time). */
export function arrivalStatus(clockIn: Date, shiftStart: string, graceMinutes: number, timezone: string): 'Present' | 'Late' {
  return localMinutes(clockIn, timezone) <= hhmmToMinutes(shiftStart) + graceMinutes ? 'Present' : 'Late'
}

export function toAttendanceDto(r: AttendanceRow, breaks: BreakRow[], now = new Date()): AttendanceDto {
  const open = !!r.clock_in_at && !r.clock_out_at
  const totalBreak = open ? breakMinutes(breaks, now) : r.total_break_minutes
  const totalWork = open && r.clock_in_at ? workMinutes(r.clock_in_at, null, totalBreak, now) : r.total_work_minutes
  return {
    id: r.id,
    date: r.work_date,
    employeeId: r.employee_id,
    clockIn: iso(r.clock_in_at),
    clockOut: iso(r.clock_out_at),
    breaks: breaks.map((b) => ({
      id: b.id,
      start: b.start_at.toISOString(),
      end: iso(b.end_at),
      kind: b.kind === 'lunch' ? 'lunch' : 'break',
    })),
    totalWorkMinutes: totalWork,
    totalBreakMinutes: totalBreak,
    status: r.status,
    workMode: opt(r.work_mode),
    activity: opt(r.activity),
    location:
      r.location_lat !== null && r.location_lng !== null
        ? {
            lat: r.location_lat,
            lng: r.location_lng,
            capturedAt: (r.location_captured_at ?? r.clock_in_at ?? now).toISOString(),
          }
        : undefined,
    notes: opt(r.notes),
    earlyLeaveNote: opt(r.early_leave_note),
    branch: r.branch_name ?? '',
    isOnBreak: !!r.is_on_break,
  }
}

const BREAK_CHUNK = 1000

export async function withBreaks(db: Db, records: AttendanceRow[]): Promise<AttendanceDto[]> {
  if (records.length === 0) return []
  const byAttendance = new Map<string, BreakRow[]>()
  for (let i = 0; i < records.length; i += BREAK_CHUNK) {
    const ids = records.slice(i, i + BREAK_CHUNK).map((r) => r.id)
    const breaks = await rows<BreakRow>(
      db,
      'SELECT id, attendance_id, start_at, end_at, kind FROM attendance_breaks WHERE attendance_id IN (?) ORDER BY start_at',
      [ids]
    )
    for (const b of breaks) {
      const list = byAttendance.get(b.attendance_id) ?? []
      list.push(b)
      byAttendance.set(b.attendance_id, list)
    }
  }
  const now = new Date()
  return records.map((r) => toAttendanceDto(r, byAttendance.get(r.id) ?? [], now))
}

export async function getAttendanceDto(db: Db, tenantId: string, id: string): Promise<AttendanceDto> {
  const row = await one<AttendanceRow>(db, `${SELECT_ATTENDANCE} WHERE a.tenant_id = ? AND a.id = ?`, [tenantId, id])
  if (!row) throw notFound('Attendance record not found')
  const [dto] = await withBreaks(db, [row])
  return dto!
}

export interface EmployeeShift {
  employeeId: string
  branchId: string | null
  start: string
  end: string
  graceMinutes: number
}

export async function loadEmployeeShift(db: Db, tenantId: string, employeeId: string): Promise<EmployeeShift> {
  const row = await one<{
    id: string
    branch_id: string | null
    start_time: string | null
    end_time: string | null
    grace_minutes: number | null
  }>(
    db,
    `SELECT e.id, e.branch_id, s.start_time, s.end_time, s.grace_minutes
       FROM employees e
       LEFT JOIN shifts s ON s.id = COALESCE(
         e.shift_id,
         (SELECT id FROM shifts WHERE tenant_id = e.tenant_id ORDER BY created_at LIMIT 1)
       )
      WHERE e.tenant_id = ? AND e.id = ? AND e.status = 'Active'`,
    [tenantId, employeeId]
  )
  if (!row) throw notFound('Employee not found')
  const asHhmm = (v: string | Date | null | undefined, fallback: string) => {
    if (v == null) return fallback
    if (typeof v === 'string') return v.slice(0, 5)
    // mysql2 may return TIME as Date in some configs
    const h = v.getUTCHours()
    const m = v.getUTCMinutes()
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return {
    employeeId: row.id,
    branchId: row.branch_id,
    start: asHhmm(row.start_time, '09:00'),
    end: asHhmm(row.end_time, '18:00'),
    graceMinutes: row.grace_minutes ?? 0,
  }
}
