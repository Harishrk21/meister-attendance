import type { AppData, AppTheme, SessionAuth } from '@/types'
import { STORAGE_KEYS } from '@/types'
import { delay } from '@/lib/utils'

function readRaw<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeRaw(key: string, value: unknown): void {
  sessionStorage.setItem(key, JSON.stringify(value))
}

export async function getAppData(): Promise<AppData | null> {
  await delay(40)
  const data = readRaw<AppData>(STORAGE_KEYS.DATA)
  if (!data) return null
  // Migrate older session payloads
  if (!data.regularizationRequests) data.regularizationRequests = []
  if (!data.onDutyRequests) data.onDutyRequests = []
  return data
}

export async function setAppData(data: AppData): Promise<void> {
  await delay(40)
  writeRaw(STORAGE_KEYS.DATA, data)
}

export async function clearAppData(): Promise<void> {
  await delay(20)
  sessionStorage.removeItem(STORAGE_KEYS.DATA)
}

export async function getSession(): Promise<SessionAuth | null> {
  await delay(20)
  return readRaw<SessionAuth>(STORAGE_KEYS.SESSION)
}

export async function setSession(session: SessionAuth | null): Promise<void> {
  await delay(20)
  if (!session) {
    sessionStorage.removeItem(STORAGE_KEYS.SESSION)
    return
  }
  writeRaw(STORAGE_KEYS.SESSION, session)
}

export async function getTheme(): Promise<AppTheme> {
  await delay(10)
  return readRaw<AppTheme>(STORAGE_KEYS.THEME) ?? { mode: 'light' }
}

export async function setTheme(theme: AppTheme): Promise<void> {
  await delay(10)
  writeRaw(STORAGE_KEYS.THEME, theme)
}

export async function exportAllData(): Promise<AppData | null> {
  return getAppData()
}

export async function importAllData(data: AppData): Promise<void> {
  await setAppData(data)
}

/** Mutate helper used by services */
export async function updateAppData(mutator: (data: AppData) => AppData | void): Promise<AppData> {
  const current = await getAppData()
  if (!current) throw new Error('App data not initialized')
  const next = mutator(current) ?? current
  await setAppData(next)
  return next
}
