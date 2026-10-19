import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getTheme, setTheme } from '@/lib/storage'

interface ThemeContextValue {
  mode: 'light' | 'dark'
  toggle: () => void
  setMode: (mode: 'light' | 'dark') => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    getTheme().then((t) => {
      setModeState(t.mode)
      document.documentElement.classList.toggle('dark', t.mode === 'dark')
    })
  }, [])

  const setMode = useCallback((m: 'light' | 'dark') => {
    setModeState(m)
    document.documentElement.classList.toggle('dark', m === 'dark')
    void setTheme({ mode: m })
  }, [])

  const toggle = useCallback(() => {
    setMode(mode === 'light' ? 'dark' : 'light')
  }, [mode, setMode])

  const value = useMemo(() => ({ mode, toggle, setMode }), [mode, toggle, setMode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
