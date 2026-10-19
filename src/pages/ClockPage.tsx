import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO, differenceInSeconds, differenceInMinutes } from 'date-fns'
import {
  MapPin,
  Coffee,
  LogIn,
  LogOut,
  Loader2,
  LocateFixed,
  Monitor,
  Briefcase,
  Home,
  CheckCircle2,
  Clock as ClockIcon,
  Utensils,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/card'
import * as attendanceService from '@/lib/services/attendance'
import type { AttendanceRecord, WorkMode } from '@/types'
import { captureLocation, GeoError } from '@/lib/geo'
import { formatMinutes, cn, parseTimeToMinutes } from '@/lib/utils'
import { DayTimeline } from '@/components/attendance/DayTimeline'

function useElapsed(clockIn?: string, active?: boolean) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!clockIn || !active) {
      setSecs(0)
      return
    }
    const tick = () => setSecs(differenceInSeconds(new Date(), parseISO(clockIn)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [clockIn, active])
  return {
    h: Math.floor(secs / 3600),
    m: Math.floor((secs % 3600) / 60),
    s: secs % 60,
    total: secs,
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

const WORK_MODES: { mode: WorkMode; icon: typeof Monitor; label: string }[] = [
  { mode: 'Office', icon: Monitor, label: 'Office' },
  { mode: 'Field', icon: Briefcase, label: 'Field' },
  { mode: 'WFH', icon: Home, label: 'WFH' },
]

export function ClockPage() {
  const { session } = useAuth()
  const { bump, data } = useData()

  const [record, setRecord] = useState<AttendanceRecord | undefined>()
  const [workMode, setWorkMode] = useState<WorkMode>('Field')
  const [notes, setNotes] = useState('')
  const [earlyNote, setEarlyNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [locBadge, setLocBadge] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const active = !!(record?.clockIn && !record.clockOut)
  const done = !!(record?.clockOut)
  const onBreak = !!(record?.isOnBreak)
  const elapsed = useElapsed(record?.clockIn, active && !onBreak)
  const now = useNow(active)

  const emp = data?.employees.find((e) => e.id === session?.employeeId)
  const shift = data?.shifts.find((s) => s.id === emp?.shiftId) ?? data?.shifts[0]
  const maxBreak = data?.settings.maxBreakMinutes ?? 20
  const maxLunch = data?.settings.maxLunchMinutes ?? 30
  const requireEarly = data?.settings.requireNoteForEarlyLeave !== false

  const openBreak = record?.breaks.find((b) => !b.end)
  const openKind = openBreak?.kind === 'lunch' ? 'lunch' : 'break'
  const openAllowance = openKind === 'lunch' ? maxLunch : maxBreak
  const openBreakSecs = openBreak
    ? Math.max(0, Math.floor((now - parseISO(openBreak.start).getTime()) / 1000))
    : 0
  const openBreakMins = Math.floor(openBreakSecs / 60)
  const overAllowance = onBreak && openBreakMins >= openAllowance

  const beforeShiftEnd = useMemo(() => {
    if (!shift) return false
    const mins = new Date(now).getHours() * 60 + new Date(now).getMinutes()
    return mins < parseTimeToMinutes(shift.end)
  }, [shift, now])

  const lunchTaken = !!record?.breaks.some((b) => b.kind === 'lunch')

  useEffect(() => {
    if (!session) return
    void attendanceService.getTodayRecord(session.employeeId).then(setRecord)
    const id = setInterval(() => {
      void attendanceService.refreshLiveMinutes(session.employeeId).then((r) => {
        if (r) setRecord(r)
      })
    }, 30_000)
    return () => clearInterval(id)
  }, [session?.employeeId, data])

  if (!session) return null

  async function handleClockIn() {
    if (!session) return
    setBusy(true)
    try {
      const geofenceRequired = !!data?.settings.geofenceEnabled
      const location = await captureLocation({ required: geofenceRequired })
      setLocBadge(!!location)
      const r = await attendanceService.clockIn({
        employeeId: session.employeeId,
        branch: session.branch,
        workMode,
        notes: notes || undefined,
        location,
      })
      setRecord(r)
      bump()
      toast.success(r.status === 'Late' ? 'Clocked in — marked Late' : 'Clocked in')
    } catch (e) {
      toast.error(e instanceof GeoError || e instanceof Error ? e.message : 'Clock-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleClockOut() {
    if (!session) return
    if (requireEarly && beforeShiftEnd && !earlyNote.trim()) {
      toast.error('Enter an early leave reason — you are clocking out before shift end')
      return
    }
    if (record?.clockIn) {
      const secs = Math.floor((Date.now() - parseISO(record.clockIn).getTime()) / 1000)
      if (secs < 60) {
        toast.error('You just clocked in. Wait at least one minute before clocking out.')
        return
      }
    }
    const confirmMsg =
      requireEarly && beforeShiftEnd
        ? 'Clock out early? This will end your day before shift end.'
        : 'Clock out and end your day?'
    if (!window.confirm(confirmMsg)) return
    setBusy(true)
    try {
      const r = await attendanceService.clockOut({
        employeeId: session.employeeId,
        earlyLeaveNote: earlyNote || undefined,
      })
      setRecord(r)
      bump()
      toast.success('Clocked out')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Clock-out failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleBreak(start: boolean, kind: 'break' | 'lunch' = 'break') {
    if (!session) return
    setBusy(true)
    try {
      if (start) {
        const r = await attendanceService.startBreak(session.employeeId, kind)
        setRecord(r)
        toast.success(kind === 'lunch' ? `Lunch started (${maxLunch} min allowance)` : `Break started (${maxBreak} min allowance)`)
      } else {
        if (overAllowance) {
          toast.warning(
            `${openKind === 'lunch' ? 'Lunch' : 'Break'} ran over the ${openAllowance} min allowance`
          )
        }
        const r = await attendanceService.endBreak(session.employeeId)
        setRecord(r)
        toast.success('Back to work')
      }
      bump()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Break update failed')
    } finally {
      setBusy(false)
    }
  }

  const hh = String(elapsed.h).padStart(2, '0')
  const mm = String(elapsed.m).padStart(2, '0')
  const ss = String(elapsed.s).padStart(2, '0')
  const statusText = done
    ? 'Day complete'
    : onBreak
      ? openKind === 'lunch'
        ? 'On lunch'
        : 'On break'
      : active
        ? 'Working'
        : 'Not clocked in'

  return (
    <div className="mx-auto max-w-lg animate-page space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {format(new Date(), 'EEEE, d MMM yyyy')}
          </p>
          <h1 className="font-display text-xl font-semibold text-ink">Time clock</h1>
          {shift && (
            <p className="mt-0.5 text-xs text-ink-muted">
              Shift {shift.start} – {shift.end}
              {requireEarly ? ' · Early leave needs a reason' : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-semibold',
              done
                ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
                : onBreak
                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                  : active
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'bg-surface-elevated text-ink-muted'
            )}
          >
            {statusText}
          </span>
          {record?.status && record.clockIn && (
            <span
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-semibold',
                record.status === 'Late'
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
              )}
            >
              {record.status}
            </span>
          )}
          {(record?.location || locBadge) && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-2 py-1 text-[11px] font-medium text-ink-muted">
              <LocateFixed className="h-3 w-3" /> GPS
            </span>
          )}
        </div>
      </div>

      {/* Primary actions — top */}
      <div className="rounded-xl border border-border bg-surface-elevated p-3 shadow-sm">
        {!done && !active && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {WORK_MODES.map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setWorkMode(mode)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-semibold transition',
                    workMode === mode
                      ? 'border-teal bg-teal/10 text-teal'
                      : 'border-border text-ink-muted hover:border-teal/40 hover:text-ink'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <Textarea
              ref={noteRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note…"
              rows={2}
              className="text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleClockIn()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal text-sm font-semibold text-white transition hover:bg-teal/90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Clock in
            </button>
          </div>
        )}

        {active && (
          <div className="space-y-3">
            {requireEarly && beforeShiftEnd && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <Label htmlFor="early" className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Early leave reason (required before {shift?.end ?? 'shift end'})
                </Label>
                <Textarea
                  id="early"
                  value={earlyNote}
                  onChange={(e) => setEarlyNote(e.target.value)}
                  placeholder="Why are you leaving early?"
                  className="mt-2 border-amber-200 bg-white dark:border-amber-900/40"
                  rows={2}
                />
              </div>
            )}

            {!onBreak ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleBreak(true, 'break')}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-semibold text-ink transition hover:bg-surface-elevated disabled:opacity-60"
                >
                  <Coffee className="h-4 w-4 text-amber-600" />
                  Break ({maxBreak}m)
                </button>
                <button
                  type="button"
                  disabled={busy || lunchTaken}
                  onClick={() => void handleBreak(true, 'lunch')}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-semibold text-ink transition hover:bg-surface-elevated disabled:opacity-60"
                  title={lunchTaken ? 'Lunch already taken today' : undefined}
                >
                  <Utensils className="h-4 w-4 text-orange-600" />
                  Lunch ({maxLunch}m)
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-center text-xs dark:border-amber-900/40 dark:bg-amber-950/20">
                <span className="font-semibold text-amber-900 dark:text-amber-200">
                  {openKind === 'lunch' ? 'Lunch' : 'Break'}: {Math.floor(openBreakSecs / 60)}:
                  {String(openBreakSecs % 60).padStart(2, '0')}
                </span>
                <span className="text-amber-800/80 dark:text-amber-300/80">
                  {' '}
                  / {openAllowance} min
                  {overAllowance ? ' — over allowance' : ''}
                </span>
              </div>
            )}

            <div className={cn('grid gap-2', onBreak ? 'grid-cols-2' : 'grid-cols-1')}>
              {onBreak && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleBreak(false)}
                  className="flex h-12 items-center justify-center gap-2 rounded-lg border border-teal/40 bg-teal/10 text-sm font-semibold text-teal transition hover:bg-teal/15 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coffee className="h-4 w-4" />}
                  End {openKind === 'lunch' ? 'lunch' : 'break'}
                </button>
              )}
              <button
                type="button"
                disabled={busy || onBreak}
                onClick={() => void handleClockOut()}
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-ink text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Clock out
              </button>
            </div>
            {onBreak && (
              <p className="text-center text-[11px] text-ink-muted">End your break before clocking out</p>
            )}
          </div>
        )}

        {done && (
          <div className="flex items-center gap-3 py-2">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-sky-600" />
            <div>
              <p className="text-sm font-semibold text-ink">Day complete</p>
              <p className="text-xs text-ink-muted">
                Worked {formatMinutes(record?.totalWorkMinutes ?? 0)}
                {record?.clockOut
                  ? ` · Out ${format(parseISO(record.clockOut), 'hh:mm a')}`
                  : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Compact timer card */}
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {active && !onBreak ? 'Worked today' : onBreak ? 'Paused' : done ? 'Total work' : 'Ready'}
            </p>
            <p className="mt-1 font-display text-4xl font-semibold tabular-nums tracking-tight text-ink">
              {active || done ? `${hh}:${mm}` : '00:00'}
              {(active || done) && (
                <span className="ml-1 text-lg font-medium text-ink-muted">:{ss}</span>
              )}
            </p>
          </div>
          <div className="text-right text-xs text-ink-muted">
            {record?.clockIn && (
              <div className="flex items-center justify-end gap-1">
                <ClockIcon className="h-3.5 w-3.5" />
                In {format(parseISO(record.clockIn), 'hh:mm a')}
              </div>
            )}
            <div className="mt-1">Break {formatMinutes(record?.totalBreakMinutes ?? 0)}</div>
          </div>
        </div>

        {(active || done) && shift && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[10px] text-ink-muted">
              <span>{shift.start}</span>
              <span>Shift progress</span>
              <span>{shift.end}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-teal transition-all duration-700"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (() => {
                        const startMin = parseTimeToMinutes(shift.start)
                        const endMin = parseTimeToMinutes(shift.end)
                        const span = Math.max(1, endMin - startMin)
                        const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()
                        return ((nowMin - startMin) / span) * 100
                      })()
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-ink-muted">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {data?.settings.geofenceEnabled
          ? `GPS required — within ${data.settings.geofenceRadiusM ?? 10} m of the office.`
          : 'GPS optional for this company.'}
        {' · '}
        Short break {maxBreak}m · Lunch {maxLunch}m (admin settings)
      </p>

      {record?.clockIn && <DayTimeline record={record} />}

      {record?.breaks && record.breaks.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-elevated p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Breaks today
          </p>
          <div className="space-y-2">
            {record.breaks.map((b, i) => {
              const dur = b.end
                ? differenceInMinutes(parseISO(b.end), parseISO(b.start))
                : differenceInMinutes(new Date(), parseISO(b.start))
              const kind = b.kind === 'lunch' ? 'Lunch' : 'Break'
              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm"
                >
                  <span className="font-medium text-ink">
                    {kind} {i + 1}
                  </span>
                  <span className="tabular-nums text-ink-muted">
                    {format(parseISO(b.start), 'HH:mm')}
                    {b.end ? ` – ${format(parseISO(b.end), 'HH:mm')}` : ' – now'}
                    <span className="ml-2 font-semibold text-ink">{dur}m</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
