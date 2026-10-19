import { format, parseISO, differenceInMinutes, isBefore, setHours, setMinutes } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { getAppData, updateAppData } from '@/lib/storage'
import { apiFetch, isApiMode } from '@/lib/api'
import type { AttendanceRecord, AttendanceStatus, Branch, GeoLocation, WorkMode } from '@/types'
import { delay, parseTimeToMinutes } from '@/lib/utils'

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

function computeBreakMinutes(record: AttendanceRecord): number {
  return record.breaks.reduce((sum, b) => {
    if (!b.end) return sum + Math.max(0, differenceInMinutes(new Date(), parseISO(b.start)))
    return sum + Math.max(0, differenceInMinutes(parseISO(b.end), parseISO(b.start)))
  }, 0)
}

function computeWorkMinutes(record: AttendanceRecord): number {
  if (!record.clockIn) return 0
  const end = record.clockOut ? parseISO(record.clockOut) : new Date()
  const total = differenceInMinutes(end, parseISO(record.clockIn))
  return Math.max(0, total - computeBreakMinutes(record))
}

function determineStatus(
  clockInIso: string,
  shiftStart: string,
  grace: number,
  settingsGrace: number
): AttendanceStatus {
  const d = parseISO(clockInIso)
  const startMin = parseTimeToMinutes(shiftStart)
  const graceMin = grace || settingsGrace
  const threshold = setMinutes(setHours(d, Math.floor(startMin / 60)), (startMin % 60) + graceMin)
  return isBefore(d, threshold) || d.getTime() === threshold.getTime() ? 'Present' : 'Late'
}

export async function getAttendance(filters?: {
  employeeId?: string
  branch?: Branch | 'All'
  from?: string
  to?: string
  date?: string
  status?: AttendanceStatus | 'All'
}): Promise<AttendanceRecord[]> {
  if (isApiMode) {
    const { branch: _branch, ...query } = filters ?? {}
    return apiFetch<AttendanceRecord[]>('/v1/attendance', { query })
  }
  await delay()
  const data = await getAppData()
  let list = data?.attendance ?? []
  if (filters?.employeeId) list = list.filter((a) => a.employeeId === filters.employeeId)
  if (filters?.branch && filters.branch !== 'All') list = list.filter((a) => a.branch === filters.branch)
  if (filters?.date) list = list.filter((a) => a.date === filters.date)
  if (filters?.from) list = list.filter((a) => a.date >= filters.from!)
  if (filters?.to) list = list.filter((a) => a.date <= filters.to!)
  if (filters?.status && filters.status !== 'All') list = list.filter((a) => a.status === filters.status)
  return list.sort((a, b) => b.date.localeCompare(a.date) || (b.clockIn ?? '').localeCompare(a.clockIn ?? ''))
}

export async function getTodayRecord(employeeId: string): Promise<AttendanceRecord | undefined> {
  if (isApiMode) {
    const res = await apiFetch<{ record: AttendanceRecord | null }>('/v1/attendance/today')
    return res.record ?? undefined
  }
  const list = await getAttendance({ employeeId, date: todayStr() })
  return list.find((a) => a.status !== 'On Leave' && a.status !== 'Holiday' && a.status !== 'Absent') ?? list[0]
}

export async function clockIn(params: {
  employeeId: string
  branch: Branch
  workMode: WorkMode
  activity?: string
  notes?: string
  location?: GeoLocation
}): Promise<AttendanceRecord> {
  if (isApiMode) {
    const { workMode, activity, notes, location } = params
    return apiFetch<AttendanceRecord>('/v1/attendance/clock-in', { body: { workMode, activity, notes, location } })
  }
  const data = await getAppData()
  if (!data) throw new Error('No data')
  const emp = data.employees.find((e) => e.id === params.employeeId)
  if (!emp) throw new Error('Employee not found')
  const date = todayStr()
  const existing = data.attendance.find(
    (a) => a.employeeId === params.employeeId && a.date === date && a.clockIn && !['Absent', 'Holiday', 'On Leave'].includes(a.status)
  )
  if (existing?.clockIn && !existing.clockOut) throw new Error('Already clocked in')
  if (existing?.clockOut) throw new Error('Already completed attendance for today')

  const shift = data.shifts.find((s) => s.id === emp.shiftId) ?? data.shifts[0]
  const now = new Date().toISOString()
  const status = determineStatus(now, shift.start, shift.graceMinutes, data.settings.gracePeriodMinutes)

  const record: AttendanceRecord = {
    id: uuid(),
    date,
    employeeId: params.employeeId,
    clockIn: now,
    breaks: [],
    totalWorkMinutes: 0,
    totalBreakMinutes: 0,
    status,
    workMode: params.workMode,
    activity: params.activity,
    location: params.location,
    notes: params.notes,
    branch: params.branch,
    isOnBreak: false,
  }

  await updateAppData((d) => {
    // remove placeholder absent/empty for today if any
    d.attendance = d.attendance.filter(
      (a) => !(a.employeeId === params.employeeId && a.date === date && (a.status === 'Absent' || !a.clockIn))
    )
    d.attendance.push(record)
  })
  return record
}

export async function clockOut(params: {
  employeeId: string
  earlyLeaveNote?: string
}): Promise<AttendanceRecord> {
  if (isApiMode) {
    return apiFetch<AttendanceRecord>('/v1/attendance/clock-out', { body: { earlyLeaveNote: params.earlyLeaveNote } })
  }
  let updated!: AttendanceRecord
  await updateAppData((data) => {
    const date = todayStr()
    const idx = data.attendance.findIndex(
      (a) => a.employeeId === params.employeeId && a.date === date && a.clockIn && !a.clockOut
    )
    if (idx < 0) throw new Error('No active clock-in found')
    const rec = data.attendance[idx]
    if (rec.isOnBreak) throw new Error('End your break before clocking out')

    const emp = data.employees.find((e) => e.id === params.employeeId)
    const shift = data.shifts.find((s) => s.id === emp?.shiftId) ?? data.shifts[0]
    const now = new Date()
    const endMin = parseTimeToMinutes(shift.end)
    const shiftEnd = setMinutes(setHours(now, Math.floor(endMin / 60)), endMin % 60)
    const early = isBefore(now, shiftEnd)

    if (early && data.settings.requireNoteForEarlyLeave && !params.earlyLeaveNote) {
      throw new Error('Early leave note required before shift end')
    }

    rec.clockOut = now.toISOString()
    rec.earlyLeaveNote = params.earlyLeaveNote
    rec.totalBreakMinutes = computeBreakMinutes(rec)
    rec.totalWorkMinutes = computeWorkMinutes(rec)
    rec.isOnBreak = false

    const halfThreshold = data.settings.halfDayThresholdHours * 60
    if (rec.totalWorkMinutes < halfThreshold && rec.status !== 'Late') {
      rec.status = 'Half-Day'
    } else if (rec.totalWorkMinutes < halfThreshold && rec.status === 'Late') {
      rec.status = 'Half-Day'
    }

    updated = { ...rec }
  })
  return updated
}

export async function startBreak(employeeId: string): Promise<AttendanceRecord> {
  if (isApiMode) return apiFetch<AttendanceRecord>('/v1/attendance/breaks/start', { method: 'POST' })
  let updated!: AttendanceRecord
  await updateAppData((data) => {
    const date = todayStr()
    const rec = data.attendance.find((a) => a.employeeId === employeeId && a.date === date && a.clockIn && !a.clockOut)
    if (!rec) throw new Error('Clock in first')
    if (rec.isOnBreak) throw new Error('Already on break')
    rec.breaks.push({ id: uuid(), start: new Date().toISOString() })
    rec.isOnBreak = true
    updated = { ...rec }
  })
  return updated
}

export async function endBreak(employeeId: string): Promise<AttendanceRecord> {
  if (isApiMode) return apiFetch<AttendanceRecord>('/v1/attendance/breaks/end', { method: 'POST' })
  let updated!: AttendanceRecord
  await updateAppData((data) => {
    const date = todayStr()
    const rec = data.attendance.find((a) => a.employeeId === employeeId && a.date === date && a.clockIn && !a.clockOut)
    if (!rec) throw new Error('Clock in first')
    if (!rec.isOnBreak) throw new Error('Not on break')
    const open = [...rec.breaks].reverse().find((b) => !b.end)
    if (!open) throw new Error('No open break')
    open.end = new Date().toISOString()
    rec.isOnBreak = false
    rec.totalBreakMinutes = computeBreakMinutes(rec)
    rec.totalWorkMinutes = computeWorkMinutes(rec)
    updated = { ...rec }
  })
  return updated
}

export async function refreshLiveMinutes(employeeId: string): Promise<AttendanceRecord | undefined> {
  if (isApiMode) return getTodayRecord(employeeId)
  let updated: AttendanceRecord | undefined
  await updateAppData((data) => {
    const date = todayStr()
    const rec = data.attendance.find((a) => a.employeeId === employeeId && a.date === date && a.clockIn && !a.clockOut)
    if (!rec) return
    rec.totalBreakMinutes = computeBreakMinutes(rec)
    rec.totalWorkMinutes = computeWorkMinutes(rec)
    updated = { ...rec }
  })
  return updated
}

export async function generateTodaysAbsences(): Promise<number> {
  let count = 0
  await updateAppData((data) => {
    const date = todayStr()
    const holidayIds = new Set(
      data.holidays.filter((h) => h.date === date).flatMap((h) => (h.branches === 'All' ? data.settings.branches : h.branches))
    )
    const isCompanyHoliday = data.holidays.some((h) => h.date === date && h.branches === 'All')
    if (isCompanyHoliday || new Date().getDay() === 0) return

    for (const emp of data.employees.filter((e) => e.status === 'Active')) {
      if (holidayIds.has(emp.branch) && data.holidays.some((h) => h.date === date && h.branches !== 'All' && h.branches.includes(emp.branch))) {
        continue
      }
      const exists = data.attendance.some((a) => a.employeeId === emp.id && a.date === date)
      if (exists) continue
      const onLeave = data.leaveRequests.some(
        (l) =>
          l.employeeId === emp.id &&
          l.status === 'Approved' &&
          l.from <= date &&
          l.to >= date
      )
      data.attendance.push({
        id: uuid(),
        date,
        employeeId: emp.id,
        breaks: [],
        totalWorkMinutes: 0,
        totalBreakMinutes: 0,
        status: onLeave ? 'On Leave' : 'Absent',
        branch: emp.branch,
      })
      count++
    }
  })
  return count
}

export async function bulkMarkStatus(params: {
  date: string
  employeeIds: string[]
  status: AttendanceStatus
  branch?: Branch
}): Promise<void> {
  if (isApiMode) {
    const { date, employeeIds, status } = params
    await apiFetch('/v1/attendance/bulk-status', { body: { date, employeeIds, status } })
    return
  }
  await updateAppData((data) => {
    for (const empId of params.employeeIds) {
      const emp = data.employees.find((e) => e.id === empId)
      if (!emp) continue
      const idx = data.attendance.findIndex((a) => a.employeeId === empId && a.date === params.date)
      const base: AttendanceRecord = {
        id: uuid(),
        date: params.date,
        employeeId: empId,
        breaks: [],
        totalWorkMinutes: 0,
        totalBreakMinutes: 0,
        status: params.status,
        branch: emp.branch,
      }
      if (idx >= 0) {
        data.attendance[idx] = { ...data.attendance[idx], status: params.status, clockIn: undefined, clockOut: undefined }
      } else {
        data.attendance.push(base)
      }
    }
  })
}

export { computeWorkMinutes, computeBreakMinutes }
