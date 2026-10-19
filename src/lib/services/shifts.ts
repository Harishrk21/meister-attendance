import { v4 as uuid } from 'uuid'
import { getAppData, updateAppData } from '@/lib/storage'
import { apiFetch, isApiMode } from '@/lib/api'
import type { Holiday, Shift } from '@/types'
import { delay } from '@/lib/utils'

export async function listShifts(): Promise<Shift[]> {
  if (isApiMode) return apiFetch<Shift[]>('/v1/shifts')
  await delay()
  const data = await getAppData()
  return data?.shifts ?? []
}

export async function saveShift(shift: Omit<Shift, 'id'> & { id?: string }): Promise<Shift> {
  if (isApiMode) {
    const { id, ...body } = shift
    return id
      ? apiFetch<Shift>(`/v1/shifts/${id}`, { method: 'PUT', body })
      : apiFetch<Shift>('/v1/shifts', { body })
  }
  let saved!: Shift
  await updateAppData((data) => {
    if (shift.id) {
      const idx = data.shifts.findIndex((s) => s.id === shift.id)
      if (idx < 0) throw new Error('Shift not found')
      data.shifts[idx] = shift as Shift
      saved = data.shifts[idx]
    } else {
      saved = { ...shift, id: uuid() }
      data.shifts.push(saved)
    }
  })
  return saved
}

export async function deleteShift(id: string): Promise<void> {
  if (isApiMode) {
    await apiFetch(`/v1/shifts/${id}`, { method: 'DELETE' })
    return
  }
  await updateAppData((data) => {
    if (data.employees.some((e) => e.shiftId === id)) {
      throw new Error('Shift is assigned to employees')
    }
    data.shifts = data.shifts.filter((s) => s.id !== id)
  })
}

export async function listHolidays(): Promise<Holiday[]> {
  if (isApiMode) return apiFetch<Holiday[]>('/v1/holidays')
  await delay()
  const data = await getAppData()
  return (data?.holidays ?? []).sort((a, b) => a.date.localeCompare(b.date))
}

export async function saveHoliday(holiday: Omit<Holiday, 'id'> & { id?: string }): Promise<Holiday> {
  if (isApiMode) {
    const { id, ...body } = holiday
    return id
      ? apiFetch<Holiday>(`/v1/holidays/${id}`, { method: 'PUT', body })
      : apiFetch<Holiday>('/v1/holidays', { body })
  }
  let saved!: Holiday
  await updateAppData((data) => {
    if (holiday.id) {
      const idx = data.holidays.findIndex((h) => h.id === holiday.id)
      if (idx < 0) throw new Error('Holiday not found')
      data.holidays[idx] = holiday as Holiday
      saved = data.holidays[idx]
    } else {
      saved = { ...holiday, id: uuid() }
      data.holidays.push(saved)
    }
  })
  return saved
}

export async function deleteHoliday(id: string): Promise<void> {
  if (isApiMode) {
    await apiFetch(`/v1/holidays/${id}`, { method: 'DELETE' })
    return
  }
  await updateAppData((data) => {
    data.holidays = data.holidays.filter((h) => h.id !== id)
  })
}
