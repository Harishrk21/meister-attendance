import { getAppData, updateAppData, exportAllData, importAllData } from '@/lib/storage'
import { apiFetch, isApiMode } from '@/lib/api'
import type { AppData, CompanySettings, Notification } from '@/types'
import { delay } from '@/lib/utils'

export async function getSettings(): Promise<CompanySettings> {
  if (isApiMode) return apiFetch<CompanySettings>('/v1/settings')
  await delay()
  const data = await getAppData()
  if (!data) throw new Error('Not initialized')
  return data.settings
}

export async function updateSettings(patch: Partial<CompanySettings>): Promise<CompanySettings> {
  if (isApiMode) {
    const { branches: _branches, ...body } = patch
    return apiFetch<CompanySettings>('/v1/settings', { method: 'PATCH', body })
  }
  let next!: CompanySettings
  await updateAppData((data) => {
    data.settings = { ...data.settings, ...patch }
    next = data.settings
  })
  return next
}

export async function completeSetup(): Promise<CompanySettings> {
  if (isApiMode) return apiFetch<CompanySettings>('/v1/settings/setup-complete', { method: 'POST' })
  return updateSettings({ setupCompleted: true })
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  if (isApiMode) return apiFetch<Notification[]>('/v1/notifications')
  await delay()
  const data = await getAppData()
  return (data?.notifications ?? [])
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isApiMode) {
    await apiFetch(`/v1/notifications/${id}/read`, { method: 'POST' })
    return
  }
  await updateAppData((data) => {
    const n = data.notifications.find((x) => x.id === id)
    if (n) n.read = true
  })
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (isApiMode) {
    await apiFetch('/v1/notifications/read-all', { method: 'POST' })
    return
  }
  await updateAppData((data) => {
    data.notifications.forEach((n) => {
      if (n.userId === userId) n.read = true
    })
  })
}

export async function backupJson(): Promise<AppData> {
  if (isApiMode) return apiFetch<AppData>('/v1/bootstrap')
  const data = await exportAllData()
  if (!data) throw new Error('No data')
  return data
}

export async function restoreJson(data: AppData): Promise<void> {
  if (isApiMode) throw new Error('Import is only available in demo mode')
  if (!data.employees || !data.users || !data.settings) {
    throw new Error('Invalid backup file')
  }
  await importAllData(data)
}

export async function resetToSeed(): Promise<AppData> {
  if (isApiMode) throw new Error('Reset is only available in demo mode')
  const { createSeedData } = await import('@/data/seed')
  const seed = createSeedData()
  await importAllData(seed)
  return seed
}
