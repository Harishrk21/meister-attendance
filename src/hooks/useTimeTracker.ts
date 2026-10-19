import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import * as attendanceService from '@/lib/services/attendance'
import { postToHost } from '@/lib/embed'
import { captureLocation } from '@/lib/geo'
import { parseTimeToMinutes } from '@/lib/utils'
import { DEFAULT_ACTIVITIES, type AppData, type AttendanceRecord, type WorkMode } from '@/types'

export type TrackerState = 'idle' | 'working' | 'break' | 'done'

const PLACEHOLDER = new Set(['On Leave', 'Holiday', 'Absent'])

export function todayRecordOf(data: AppData | null, employeeId: string | undefined): AttendanceRecord | undefined {
  if (!data || !employeeId) return undefined
  const today = format(new Date(), 'yyyy-MM-dd')
  const list = data.attendance.filter((a) => a.employeeId === employeeId && a.date === today)
  return list.find((a) => !PLACEHOLDER.has(a.status)) ?? list[0]
}

/** Seconds worked so far (breaks excluded), live for an open record. */
export function liveWorkSeconds(record: AttendanceRecord | undefined, now = Date.now()): number {
  if (!record?.clockIn) return 0
  const end = record.clockOut ? parseISO(record.clockOut).getTime() : now
  const breakMs = record.breaks.reduce((sum, b) => {
    const bEnd = b.end ? parseISO(b.end).getTime() : now
    return sum + Math.max(0, bEnd - parseISO(b.start).getTime())
  }, 0)
  return Math.max(0, Math.floor((end - parseISO(record.clockIn).getTime() - breakMs) / 1000))
}

export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

/** Re-renders every second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

/** Single source of truth for clocking actions, shared by the header pill, panel, page and widget. */
export function useTimeTracker() {
  const { session } = useAuth()
  const { data, bump } = useData()
  const [busy, setBusy] = useState(false)

  const record = useMemo(() => todayRecordOf(data, session?.employeeId), [data, session?.employeeId])
  const state: TrackerState = record?.clockOut
    ? 'done'
    : record?.isOnBreak
      ? 'break'
      : record?.clockIn
        ? 'working'
        : 'idle'

  const now = useNow(state === 'working' || state === 'break')
  const workSeconds = liveWorkSeconds(record, now)
  const openBreak = record?.breaks.find((b) => !b.end)
  const breakSeconds = openBreak ? Math.max(0, Math.floor((now - parseISO(openBreak.start).getTime()) / 1000)) : 0

  const employee = data?.employees.find((e) => e.id === session?.employeeId)
  const shift = data?.shifts.find((s) => s.id === employee?.shiftId) ?? data?.shifts[0]
  const activities = data?.settings.activities?.length ? data.settings.activities : DEFAULT_ACTIVITIES

  const beforeShiftEnd = shift
    ? new Date(now).getHours() * 60 + new Date(now).getMinutes() < parseTimeToMinutes(shift.end)
    : false
  const needsEarlyNote = state === 'working' && beforeShiftEnd && !!data?.settings.requireNoteForEarlyLeave

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true)
      try {
        await fn()
        bump()
        return true
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong')
        return false
      } finally {
        setBusy(false)
      }
    },
    [bump]
  )

  const clockIn = useCallback(
    (opts: { workMode: WorkMode; activity?: string; notes?: string }) =>
      run(async () => {
        if (!session) return
        const location = await captureLocation()
        const r = await attendanceService.clockIn({
          employeeId: session.employeeId,
          branch: session.branch,
          workMode: opts.workMode,
          activity: opts.activity,
          notes: opts.notes?.trim() || undefined,
          location,
        })
        toast.success(r.status === 'Late' ? 'Clocked in — marked Late' : 'Clocked in')
        postToHost('clock-in', { at: r.clockIn, status: r.status, activity: r.activity })
      }),
    [run, session]
  )

  const clockOut = useCallback(
    (earlyLeaveNote?: string) =>
      run(async () => {
        if (!session) return
        const r = await attendanceService.clockOut({
          employeeId: session.employeeId,
          earlyLeaveNote: earlyLeaveNote?.trim() || undefined,
        })
        toast.success('Clocked out — see you tomorrow')
        postToHost('clock-out', { at: r.clockOut, workedMinutes: r.totalWorkMinutes, status: r.status })
      }),
    [run, session]
  )

  const startBreak = useCallback(
    () =>
      run(async () => {
        if (!session) return
        await attendanceService.startBreak(session.employeeId)
        toast('Break started')
        postToHost('break-start')
      }),
    [run, session]
  )

  const endBreak = useCallback(
    () =>
      run(async () => {
        if (!session) return
        await attendanceService.endBreak(session.employeeId)
        toast.success('Back to work')
        postToHost('break-end')
      }),
    [run, session]
  )

  return {
    session,
    record,
    state,
    busy,
    workSeconds,
    breakSeconds,
    shift,
    activities,
    needsEarlyNote,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
  }
}
