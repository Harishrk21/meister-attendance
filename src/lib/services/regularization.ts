import { differenceInMinutes, parseISO } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { getAppData, updateAppData } from '@/lib/storage'
import { apiFetch, isApiMode } from '@/lib/api'
import type { AttendanceStatus, RegularizationRequest, RegularizationType, WorkMode } from '@/types'
import { delay, parseTimeToMinutes } from '@/lib/utils'

function determineStatus(clockInIso: string, shiftStart: string, grace: number): AttendanceStatus {
  const d = parseISO(clockInIso)
  const startMin = parseTimeToMinutes(shiftStart)
  const thresholdMin = startMin + grace
  const inMin = d.getHours() * 60 + d.getMinutes()
  return inMin <= thresholdMin ? 'Present' : 'Late'
}

export async function listRegularizations(filters?: {
  employeeId?: string
  status?: string
}): Promise<RegularizationRequest[]> {
  if (isApiMode) return apiFetch<RegularizationRequest[]>('/v1/regularizations', { query: filters })
  await delay()
  const data = await getAppData()
  let list = data?.regularizationRequests ?? []
  if (filters?.employeeId) list = list.filter((r) => r.employeeId === filters.employeeId)
  if (filters?.status && filters.status !== 'All') list = list.filter((r) => r.status === filters.status)
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function applyRegularization(input: {
  employeeId: string
  workDate: string
  requestType: RegularizationType
  proposedClockIn?: string
  proposedClockOut?: string
  proposedWorkMode?: WorkMode
  reason: string
}): Promise<RegularizationRequest> {
  if (!input.reason.trim()) throw new Error('Please explain why you need regularization')
  if (input.requestType === 'missed_punch' || input.requestType === 'wrong_time') {
    if (!input.proposedClockIn || !input.proposedClockOut) {
      throw new Error('Proposed clock-in and clock-out are required')
    }
  }

  if (isApiMode) return apiFetch<RegularizationRequest>('/v1/regularizations', { body: input })

  let created!: RegularizationRequest
  await updateAppData((data) => {
    if (!data.regularizationRequests) data.regularizationRequests = []

    const duplicate = data.regularizationRequests.find(
      (r) =>
        r.employeeId === input.employeeId &&
        r.workDate === input.workDate &&
        r.status === 'Pending'
    )
    if (duplicate) throw new Error('A pending regularization already exists for this date')

    const req: RegularizationRequest = {
      id: uuid(),
      ...input,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    data.regularizationRequests.unshift(req)

    const emp = data.employees.find((e) => e.id === input.employeeId)
    const managers = data.users.filter((u) => u.role === 'admin')
    for (const m of managers) {
      data.notifications.unshift({
        id: uuid(),
        userId: m.id,
        type: 'regularization_pending',
        title: 'Regularization pending',
        message: `${emp?.name ?? 'Employee'} raised a concern for ${input.workDate}`,
        read: false,
        createdAt: new Date().toISOString(),
        link: '/my-attendance?tab=regularization',
      })
    }
    created = req
  })
  return created
}

export async function reviewRegularization(params: {
  requestId: string
  approverId: string
  status: 'Approved' | 'Rejected'
  comment?: string
}): Promise<RegularizationRequest> {
  if (isApiMode) {
    return apiFetch<RegularizationRequest>(`/v1/regularizations/${params.requestId}/review`, {
      body: { status: params.status, comment: params.comment || undefined },
    })
  }
  let updated!: RegularizationRequest
  await updateAppData((data) => {
    if (!data.regularizationRequests) data.regularizationRequests = []
    const req = data.regularizationRequests.find((r) => r.id === params.requestId)
    if (!req) throw new Error('Request not found')
    if (req.status !== 'Pending') throw new Error('Request already reviewed')

    req.status = params.status
    req.approverId = params.approverId
    req.approverComment = params.comment
    req.updatedAt = new Date().toISOString()

    if (params.status === 'Approved') {
      const emp = data.employees.find((e) => e.id === req.employeeId)
      if (!emp) throw new Error('Employee not found')
      const shift = data.shifts.find((s) => s.id === emp.shiftId) ?? data.shifts[0]
      const clockIn = req.proposedClockIn
      const clockOut = req.proposedClockOut

      let status: AttendanceStatus = 'Present'
      let workMins = 0
      if (clockIn && clockOut) {
        status = determineStatus(clockIn, shift.start, shift.graceMinutes || data.settings.gracePeriodMinutes)
        workMins = Math.max(0, differenceInMinutes(parseISO(clockOut), parseISO(clockIn)))
        const half = data.settings.halfDayThresholdHours * 60
        if (workMins < half) status = 'Half-Day'
      }

      const existingIdx = data.attendance.findIndex(
        (a) => a.employeeId === req.employeeId && a.date === req.workDate
      )
      const record = {
        id: existingIdx >= 0 ? data.attendance[existingIdx].id : uuid(),
        date: req.workDate,
        employeeId: req.employeeId,
        clockIn,
        clockOut,
        breaks: [] as { id: string; start: string; end?: string }[],
        totalWorkMinutes: workMins,
        totalBreakMinutes: 0,
        status,
        workMode: req.proposedWorkMode ?? 'Office',
        notes: `Regularized: ${req.reason}`,
        branch: emp.branch,
        isOnBreak: false,
      }
      if (existingIdx >= 0) data.attendance[existingIdx] = record
      else data.attendance.push(record)
      req.attendanceId = record.id
    }

    const user = data.users.find((u) => u.employeeId === req.employeeId)
    if (user) {
      data.notifications.unshift({
        id: uuid(),
        userId: user.id,
        type: 'regularization_result',
        title: `Regularization ${params.status.toLowerCase()}`,
        message: `Your request for ${req.workDate} was ${params.status.toLowerCase()}.`,
        read: false,
        createdAt: new Date().toISOString(),
        link: '/my-attendance?tab=regularization',
      })
    }
    updated = { ...req }
  })
  return updated
}

export async function cancelRegularization(requestId: string, employeeId: string): Promise<void> {
  if (isApiMode) {
    await apiFetch(`/v1/regularizations/${requestId}/cancel`, { method: 'POST' })
    return
  }
  await updateAppData((data) => {
    const req = data.regularizationRequests?.find((r) => r.id === requestId && r.employeeId === employeeId)
    if (!req) throw new Error('Request not found')
    if (req.status !== 'Pending') throw new Error('Only pending requests can be cancelled')
    req.status = 'Cancelled'
    req.updatedAt = new Date().toISOString()
  })
}
