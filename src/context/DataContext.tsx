import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AppData } from '@/types'
import { getAppData } from '@/lib/storage'
import { ensureSeeded } from '@/lib/services/auth'
import { apiFetch, isApiMode } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

interface DataContextValue {
  data: AppData | null
  loading: boolean
  refresh: () => Promise<void>
  bump: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(async () => {
    if (isApiMode) {
      if (!session) {
        setData(null)
        setLoading(false)
        return
      }
      try {
        setData(await apiFetch<AppData>('/v1/bootstrap'))
      } catch {
        /* keep the last snapshot; 401s sign the user out via AuthContext */
      }
      setLoading(false)
      return
    }
    await ensureSeeded()
    setData(await getAppData())
    setLoading(false)
  }, [session])

  useEffect(() => {
    void refresh()
  }, [refresh, tick])

  // Pick up changes made on other devices while this tab was in the background.
  useEffect(() => {
    if (!isApiMode || !session) return
    const onFocus = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', onFocus)
    const id = setInterval(onFocus, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      clearInterval(id)
    }
  }, [session])

  const bump = useCallback(() => setTick((t) => t + 1), [])

  const value = useMemo(() => ({ data, loading, refresh, bump }), [data, loading, refresh, bump])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
