import { differenceInCalendarDays } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { getAppData, updateAppData } from '@/lib/storage'
import { apiFetch, isApiMode } from '@/lib/api'
import type { LeaveBalance, LeaveRequest, LeaveType } from '@/types'
import { delay } from '@/lib/utils'

export async function listLeaveRequests(filters?: {
  employeeId?: string
  branch?: string
  status?: string
}): Promise<LeaveRequest[]> {
  if (isApiMode) return apiFetch<LeaveRequest[]>('/v1/leaves', { query: filters })
  await delay()
  const data = await getAppData()
  if (!data) return []
  let list = data.leaveRequests
  if (filters?.employeeId) list = list.filter((l) => l.employeeId === filters.employeeId)
  if (filters?.status && filters.status !== 'All') list = list.filter((l) => l.status === filters.status)
  if (filters?.branch && filters.branch !== 'All') {
    const ids = new Set(data.employees.filter((e) => e.branch === filters.branch).map((e) => e.id))
    list = list.filter((l) => ids.has(l.employeeId))
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getLeaveBalance(employeeId: string): Promise<LeaveBalance | undefined> {
  if (isApiMode) return apiFetch<LeaveBalance>(`/v1/leaves/balances/${employeeId}`)
  await delay()
  const data = await getAppData()
  return data?.leaveBalances.find((b) => b.employeeId === employeeId)
}

export async function applyLeave(input: {
  employeeId: string
  type: LeaveType
  from: string
  to: string
  halfDay: boolean
  halfDayPeriod?: 'AM' | 'PM'
  reason: string
  attachmentNote?: string
}): Promise<LeaveRequest> {
  if (isApiMode) {
    return apiFetch<LeaveRequest>('/v1/leaves', {
      body: { ...input, attachmentNote: input.attachmentNote || undefined },
    })
  }
  const days = input.halfDay ? 0.5 : differenceInCalendarDays(new Date(input.to), new Date(input.from)) + 1
  if (days <= 0) throw new Error('Invalid date range')

  let created!: LeaveRequest
  await updateAppData((data) => {
    const bal = data.leaveBalances.find((b) => b.employeeId === input.employeeId)
    if (input.type !== 'Unpaid' && bal && bal[input.type] < days) {
      throw new Error(`Insufficient ${input.type} leave balance`)
    }
    const req: LeaveRequest = {
      id: uuid(),
      ...input,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      days,
    }
    data.leaveRequests.push(req)

    const emp = data.employees.find((e) => e.id === input.employeeId)
    const admins = data.users.filter((u) => u.role === 'admin')
    for (const m of admins) {
      data.notifications.unshift({
        id: uuid(),
        userId: m.id,
        type: 'leave_pending',
        title: 'New leave request',
        message: `${emp?.name ?? 'Employee'} requested ${input.type} leave`,
        read: false,
        createdAt: new Date().toISOString(),
        link: '/leaves',
      })
    }
    created = req
  })
  return created
}

export async function reviewLeave(params: {
  leaveId: string
  approverId: string
  status: 'Approved' | 'Rejected'
  comment?: string
}): Promise<LeaveRequest> {
  if (isApiMode) {
    return apiFetch<LeaveRequest>(`/v1/leaves/${params.leaveId}/review`, {
      body: { status: params.status, comment: params.comment || undefined },
    })
  }
  let updated!: LeaveRequest
  await updateAppData((data) => {
    const lr = data.leaveRequests.find((l) => l.id === params.leaveId)
    if (!lr) throw new Error('Leave not found')
    if (lr.status !== 'Pending') throw new Error('Leave already reviewed')
    lr.status = params.status
    lr.approverId = params.approverId
    lr.approverComment = params.comment
    lr.updatedAt = new Date().toISOString()

    if (params.status === 'Approved' && lr.type !== 'Unpaid') {
      const bal = data.leaveBalances.find((b) => b.employeeId === lr.employeeId)
      if (bal) bal[lr.type] = Math.max(0, bal[lr.type] - lr.days)

      // Mark attendance On Leave for range
      const emp = data.employees.find((e) => e.id === lr.employeeId)
      if (emp) {
        const start = new Date(lr.from)
        const end = new Date(lr.to)
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          if (d.getDay() === 0) continue
          const date = d.toISOString().slice(0, 10)
          const existing = data.attendance.find((a) => a.employeeId === emp.id && a.date === date)
          if (existing) {
            existing.status = 'On Leave'
            existing.clockIn = undefined
            existing.clockOut = undefined
            existing.totalWorkMinutes = 0
          } else {
            data.attendance.push({
              id: uuid(),
              date,
              employeeId: emp.id,
              breaks: [],
              totalWorkMinutes: 0,
              totalBreakMinutes: 0,
              status: 'On Leave',
              branch: emp.branch,
            })
          }
        }
      }
    }

    const user = data.users.find((u) => u.employeeId === lr.employeeId)
    if (user) {
      data.notifications.unshift({
        id: uuid(),
        userId: user.id,
        type: 'leave_result',
        title: `Leave ${params.status.toLowerCase()}`,
        message: `Your ${lr.type} leave (${lr.from}) was ${params.status.toLowerCase()}.`,
        read: false,
        createdAt: new Date().toISOString(),
        link: '/leaves',
      })
    }
    updated = { ...lr }
  })
  return updated
}

export async function cancelLeave(leaveId: string, employeeId: string): Promise<void> {
  if (isApiMode) {
    await apiFetch(`/v1/leaves/${leaveId}/cancel`, { method: 'POST' })
    return
  }
  await updateAppData((data) => {
    const lr = data.leaveRequests.find((l) => l.id === leaveId && l.employeeId === employeeId)
    if (!lr) throw new Error('Leave not found')
    if (lr.status !== 'Pending') throw new Error('Only pending leave can be cancelled')
    lr.status = 'Cancelled'
    lr.updatedAt = new Date().toISOString()
  })
}
