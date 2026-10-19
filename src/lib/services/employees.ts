import { updateAppData, getAppData } from '@/lib/storage'
import { apiFetch, isApiMode } from '@/lib/api'
import type { Employee } from '@/types'
import { delay, initials } from '@/lib/utils'
import { v4 as uuid } from 'uuid'

export async function listEmployees(filters?: {
  branch?: string
  department?: string
  status?: string
  search?: string
}): Promise<Employee[]> {
  await delay()
  const data = await getAppData()
  let list = data?.employees ?? []
  if (filters?.branch && filters.branch !== 'All') {
    list = list.filter((e) => e.branch === filters.branch)
  }
  if (filters?.department && filters.department !== 'All') {
    list = list.filter((e) => e.department === filters.department)
  }
  if (filters?.status && filters.status !== 'All') {
    list = list.filter((e) => e.status === filters.status)
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.phone.includes(q)
    )
  }
  return list.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode))
}

export async function getEmployee(id: string): Promise<Employee | undefined> {
  await delay()
  const data = await getAppData()
  return data?.employees.find((e) => e.id === id)
}

export async function createEmployee(
  input: Omit<Employee, 'id' | 'avatarInitials'> & { password?: string }
): Promise<Employee> {
  if (isApiMode) {
    // A blank code lets the server assign the next PREFIX-0001 style code.
    const body = { ...input, employeeCode: input.employeeCode.trim() || undefined }
    return apiFetch<Employee>('/v1/employees', { body })
  }
  const emp: Employee = {
    ...input,
    id: uuid(),
    avatarInitials: initials(input.name),
  }
  await updateAppData((data) => {
    data.employees.push(emp)
    data.users.push({
      id: uuid(),
      email: emp.email,
      password: input.password ?? 'Demo@12345',
      role: emp.role,
      employeeId: emp.id,
    })
    data.leaveBalances.push({
      employeeId: emp.id,
      Casual: 8,
      Sick: 6,
      Earned: 12,
      'Comp-Off': 0,
      Unpaid: 0,
    })
  })
  return emp
}

export async function updateEmployee(id: string, patch: Partial<Employee>): Promise<Employee> {
  if (isApiMode) {
    const { id: _id, avatarInitials: _initials, ...body } = patch
    return apiFetch<Employee>(`/v1/employees/${id}`, { method: 'PATCH', body })
  }
  let updated!: Employee
  await updateAppData((data) => {
    const idx = data.employees.findIndex((e) => e.id === id)
    if (idx < 0) throw new Error('Employee not found')
    const next = {
      ...data.employees[idx],
      ...patch,
      id,
      avatarInitials: initials(patch.name ?? data.employees[idx].name),
    }
    data.employees[idx] = next
    const user = data.users.find((u) => u.employeeId === id)
    if (user) {
      if (patch.email) user.email = patch.email
      if (patch.role) user.role = patch.role
    }
    updated = next
  })
  return updated
}

export interface InviteLink {
  url: string
  expiresAt: string
  email: string
}

/** One-time link where the person sets their own password (API mode only). */
export async function inviteEmployee(id: string): Promise<InviteLink> {
  if (!isApiMode) throw new Error('Invites need the attendance server. Demo accounts use the demo password.')
  return apiFetch<InviteLink>(`/v1/employees/${id}/invite`, { method: 'POST' })
}

export async function deactivateEmployee(id: string): Promise<void> {
  if (isApiMode) {
    await apiFetch(`/v1/employees/${id}/deactivate`, { method: 'POST' })
    return
  }
  await updateEmployee(id, { status: 'Inactive' })
}
