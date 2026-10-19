import { useEffect, useRef, useState } from 'react'
import { format, parseISO, differenceInSeconds, differenceInMinutes } from 'date-fns'
import {
  MapPin,
  Coffee,
  LogIn,
  LogOut,
  Loader2,
  LocateFixed,
  Wifi,
  Monitor,
  Briefcase,
  Home,
  CheckCircle2,
  Clock as ClockIcon,
  TimerIcon,
  StickyNote,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/card'
import * as attendanceService from '@/lib/services/attendance'
import type { AttendanceRecord, WorkMode } from '@/types'
import { captureLocation } from '@/lib/geo'
import { formatMinutes, cn, parseTimeToMinutes } from '@/lib/utils'
import { DayTimeline } from '@/components/attendance/DayTimeline'

/* ─── live seconds elapsed ──────────────────────────────────── */
function useElapsed(clockIn?: string, active?: boolean) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!clockIn || !active) { setSecs(0); return }
    const tick = () => setSecs(differenceInSeconds(new Date(), parseISO(clockIn)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [clockIn, active])
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return { h, m, s, total: secs }
}

/* ─── SVG ring timer ────────────────────────────────────────── */
const R = 120
const CIRC = 2 * Math.PI * R

function RingTimer({
  pct,
  state,
  children,
}: {
  pct: number
  state: 'idle' | 'working' | 'break' | 'done'
  children?: React.ReactNode
}) {
  const offset = CIRC - pct * CIRC
  const ringClass = {
    idle: 'ring-idle',
    working: 'ring-working',
    break: 'ring-break',
    done: 'ring-done',
  }[state]

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={280} height={280} className="rotate-[-90deg]">
        {/* Track */}
        <circle cx={140} cy={140} r={R} fill="none" strokeWidth={10} className="ring-track" />
        {/* Fill */}
        <circle
          cx={140}
          cy={140}
          r={R}
          fill="none"
          strokeWidth={10}
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          className={cn('ring-fill', ringClass)}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────── */
export function ClockPage() {
  const { session } = useAuth()
  const { bump, data } = useData()

  const [record, setRecord] = useState<AttendanceRecord | undefined>()
  const [workMode, setWorkMode] = useState<WorkMode>('Field')
  const [notes, setNotes] = useState('')
  const [earlyNote, setEarlyNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [locBadge, setLocBadge] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const active = !!(record?.clockIn && !record.clockOut)
  const done = !!(record?.clockOut)
  const onBreak = !!(record?.isOnBreak)

  const clockState: 'idle' | 'working' | 'break' | 'done' =
    done ? 'done' : onBreak ? 'break' : active ? 'working' : 'idle'

  const elapsed = useElapsed(record?.clockIn, active)

  /* shift progress % */
  const shiftPct = (() => {
    if (!session || !data) return 0
    const emp = data.employees.find((e) => e.id === session.employeeId)
    const shift = data.shifts.find((s) => s.id === emp?.shiftId) ?? data.shifts[0]
    if (!shift) return 0
    const startMin = parseTimeToMinutes(shift.start)
    const endMin = parseTimeToMinutes(shift.end)
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    return Math.min(1, Math.max(0, (nowMin - startMin) / (endMin - startMin)))
  })()

  /* ring pct: while working = shift progress, break = amber constant, done = 1 */
  const ringPct = done ? 1 : onBreak ? 0.5 : active ? shiftPct : 0

  async function reload() {
    if (!session) return
    const r = await attendanceService.getTodayRecord(session.employeeId)
    setRecord(r)
    if (r?.workMode) setWorkMode(r.workMode)
  }

  useEffect(() => {
    void reload()
    const id = setInterval(() => {
      if (session && active) {
        void attendanceService.refreshLiveMinutes(session.employeeId).then((r) => { if (r) setRecord(r) })
      }
    }, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.employeeId, data])

  if (!session) return null

  async function handleClockIn() {
    if (!session) return
    setBusy(true)
    try {
      const location = await captureLocation()
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
      toast.success(r.status === 'Late' ? '⏰ Clocked in — marked Late' : '✅ Clocked in successfully!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Clock-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleClockOut() {
    if (!session) return
    setBusy(true)
    try {
      const r = await attendanceService.clockOut({
        employeeId: session.employeeId,
        earlyLeaveNote: earlyNote || undefined,
      })
      setRecord(r)
      bump()
      toast.success('👋 Clocked out — have a great evening!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Clock-out failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleBreak(start: boolean) {
    if (!session) return
    setBusy(true)
    try {
      const r = start
        ? await attendanceService.startBreak(session.employeeId)
        : await attendanceService.endBreak(session.employeeId)
      setRecord(r)
      bump()
      toast.success(start ? '☕ Break started' : '💪 Back to work!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Break update failed')
    } finally {
      setBusy(false)
    }
  }

  /* formatted elapsed */
  const { h, m, s } = elapsed
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')

  /* hero gradient */
  const heroCls = {
    idle:    'clock-bg-idle',
    working: 'clock-bg-working',
    break:   'clock-bg-break',
    done:    'clock-bg-done',
  }[clockState]

  /* status label */
  const statusLabel = {
    idle:    'Not clocked in',
    working: onBreak ? 'On Break' : `Working — ${workMode}`,
    break:   'On Break',
    done:    'Day Complete',
  }[clockState]

  /* pulse class on ring */
  const pulseCls = clockState === 'working' && !onBreak
    ? 'animate-clock-pulse'
    : clockState === 'break'
      ? 'animate-break-pulse'
      : ''

  return (
    <div className="animate-page">
      {/* ── Hero section ── */}
      <div className={cn('relative overflow-hidden rounded-3xl shadow-2xl', heroCls)}>
        {/* decorative blobs */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-white/5 blur-3xl" />

        <div className="relative px-4 py-8 sm:px-8 sm:py-10">
          {/* top bar */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/60">
                {format(new Date(), 'EEEE, d MMMM yyyy')}
              </p>
              <h1 className="font-display text-2xl font-bold text-white">
                {session.name.split(' ')[0]}'s Time Clock
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {record?.status && record.clockIn && (
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider',
                    record.status === 'Late'
                      ? 'bg-red-500/30 text-red-200'
                      : 'bg-emerald-500/30 text-emerald-200'
                  )}
                >
                  {record.status}
                </span>
              )}
              {(record?.location || locBadge) && (
                <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                  <LocateFixed className="h-3 w-3" /> GPS
                </span>
              )}
            </div>
          </div>

          {/* Ring + Clock */}
          <div className="mt-6 flex flex-col items-center gap-4">
            <div className={cn('rounded-full', pulseCls)}>
              <RingTimer pct={ringPct} state={clockState === 'working' && onBreak ? 'break' : clockState}>
                <div className="flex flex-col items-center">
                  {/* digital clock */}
                  <div className="flex items-end gap-1">
                    <span
                      className={cn(
                        'font-display text-5xl font-black tabular-nums tracking-tight sm:text-6xl',
                        active && !onBreak ? 'shimmer-text' : 'text-white'
                      )}
                    >
                      {active ? `${hh}:${mm}` : '00:00'}
                    </span>
                    {active && (
                      <span className="mb-1 font-display text-xl font-bold tabular-nums text-white/60">
                        :{ss}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/60">
                    {active ? 'elapsed' : 'not started'}
                  </p>
                  <div
                    className={cn(
                      'mt-2 rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                      clockState === 'working' && !onBreak ? 'bg-emerald-400/30 text-emerald-200' :
                      clockState === 'break' || onBreak ? 'bg-amber-400/30 text-amber-200' :
                      clockState === 'done' ? 'bg-blue-400/30 text-blue-200' :
                      'bg-white/20 text-white/60'
                    )}
                  >
                    {statusLabel}
                  </div>
                </div>
              </RingTimer>
            </div>

            {/* Shift progress bar */}
            {(active || done) && (
              <div className="w-full max-w-xs">
                <div className="mb-1 flex justify-between text-[11px] text-white/50">
                  <span>Shift start</span>
                  <span>{Math.round(shiftPct * 100)}% of shift</span>
                  <span>Shift end</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-1000"
                    style={{ width: `${Math.round(shiftPct * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Stats row */}
          {record?.clockIn && (
            <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
              {[
                { icon: ClockIcon,  label: 'Clocked in',  val: format(parseISO(record.clockIn), 'hh:mm a') },
                { icon: TimerIcon,  label: 'Work time',   val: formatMinutes(record.totalWorkMinutes) },
                { icon: Coffee,     label: 'Break time',  val: formatMinutes(record.totalBreakMinutes) },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur-sm">
                  <Icon className="mx-auto h-4 w-4 text-white/60" />
                  <div className="mt-1 font-display text-lg font-bold text-white tabular-nums">{val}</div>
                  <div className="text-[10px] text-white/50">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Clock out time */}
          {record?.clockOut && (
            <div className="mt-3 text-center text-sm text-white/60">
              Clocked out at <span className="font-bold text-white">{format(parseISO(record.clockOut), 'hh:mm a')}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="mt-4 space-y-4">

        {/* Work mode selector (only before clock-in) */}
        {!active && !done && (
          <div className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Work mode
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(['Office', 'Field', 'WFH'] as WorkMode[]).map((m) => {
                const cfg = {
                  Office: { icon: Monitor, label: 'Office', grad: 'from-blue-500 to-blue-600', glow: 'shadow-blue-200' },
                  Field:  { icon: Briefcase, label: 'Field', grad: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-200' },
                  WFH:    { icon: Home, label: 'WFH', grad: 'from-purple-500 to-indigo-600', glow: 'shadow-purple-200' },
                }[m]
                const sel = workMode === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setWorkMode(m)}
                    className={cn(
                      'relative flex flex-col items-center gap-2 rounded-2xl border-2 py-4 text-sm font-semibold transition-all duration-200',
                      sel
                        ? `bg-gradient-to-br ${cfg.grad} border-transparent text-white shadow-lg ${cfg.glow}`
                        : 'border-border bg-surface text-ink-muted hover:border-teal/50 hover:text-ink'
                    )}
                  >
                    <cfg.icon className="h-6 w-6" />
                    {cfg.label}
                    {sel && (
                      <CheckCircle2 className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-white text-emerald-600 shadow" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Note toggle */}
        {!active && !done && (
          <button
            type="button"
            onClick={() => { setShowNotes((v) => !v); setTimeout(() => noteRef.current?.focus(), 50) }}
            className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm text-ink-muted transition hover:border-teal/50 hover:text-ink"
          >
            <StickyNote className="h-4 w-4" />
            {notes ? `Note: "${notes.slice(0, 40)}${notes.length > 40 ? '…' : ''}"` : 'Add a note (optional)'}
          </button>
        )}
        {!active && !done && showNotes && (
          <textarea
            ref={noteRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="First call / site visit…"
            rows={2}
            className="w-full rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-teal"
          />
        )}

        {/* Early leave note (while clocked in) */}
        {active && (
          <div className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm">
            <Label htmlFor="early" className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Early leave note (required if leaving before shift end)
            </Label>
            <Textarea
              id="early"
              value={earlyNote}
              onChange={(e) => setEarlyNote(e.target.value)}
              placeholder="Reason for leaving early…"
              className="mt-2"
            />
          </div>
        )}

        {/* Action buttons */}
        {!done && (
          <div className={cn('grid gap-3', active ? 'grid-cols-2' : 'grid-cols-1')}>
            {!active && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleClockIn()}
                className={cn(
                  'group relative flex h-20 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl text-xl font-black text-white shadow-2xl transition-all duration-200 active:scale-95 disabled:opacity-60',
                  'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-emerald-300/50 hover:shadow-emerald-400/70 hover:brightness-110'
                )}
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 transition-opacity group-hover:opacity-100" />
                {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <LogIn className="h-7 w-7" />}
                Clock In
              </button>
            )}

            {active && (
              <>
                {!onBreak ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleBreak(true)}
                    className="group flex h-20 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 text-lg font-bold text-white shadow-xl shadow-amber-300/40 transition-all hover:brightness-110 active:scale-95 disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Coffee className="h-6 w-6" />}
                    Break
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleBreak(false)}
                    className="group flex h-20 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 text-lg font-bold text-white shadow-xl shadow-emerald-300/40 transition-all hover:brightness-110 active:scale-95 disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Coffee className="h-6 w-6" />}
                    Resume
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleClockOut()}
                  className="group flex h-20 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-red-500 via-rose-500 to-red-600 text-lg font-bold text-white shadow-xl shadow-red-300/40 transition-all hover:brightness-110 active:scale-95 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <LogOut className="h-6 w-6" />}
                  Clock Out
                </button>
              </>
            )}
          </div>
        )}

        {/* Done card */}
        {done && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center dark:border-blue-900/40 dark:bg-blue-950/20">
            <CheckCircle2 className="h-12 w-12 text-blue-500" />
            <div>
              <p className="font-display text-lg font-bold text-navy dark:text-white">Day complete!</p>
              <p className="mt-1 text-sm text-ink-muted">
                You worked <span className="font-bold text-navy dark:text-white">{formatMinutes(record?.totalWorkMinutes ?? 0)}</span> today.
              </p>
            </div>
          </div>
        )}

        {/* Geo note */}
        <p className="flex items-center gap-2 text-center text-xs text-ink-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          Location is optional — clock-in never blocks if GPS is denied.
          <Wifi className="h-3.5 w-3.5 shrink-0" />
        </p>
      </div>

      {/* Day timeline — Attendify-style */}
      {record?.clockIn && (
        <div className="mt-4">
          <DayTimeline record={record} />
        </div>
      )}

      {/* ── Breaks log ── */}
      {record?.breaks && record.breaks.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Today's breaks</p>
          <div className="space-y-2">
            {record.breaks.map((b, i) => {
              const dur = b.end
                ? differenceInMinutes(parseISO(b.end), parseISO(b.start))
                : differenceInMinutes(new Date(), parseISO(b.start))
              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-2.5 dark:bg-amber-950/20"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                    <Coffee className="h-4 w-4" />
                    Break {i + 1}
                  </div>
                  <div className="text-right text-sm tabular-nums text-ink-muted">
                    {format(parseISO(b.start), 'HH:mm')}
                    {b.end ? ` – ${format(parseISO(b.end), 'HH:mm')}` : ' – ongoing'}
                    <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-800/40 dark:text-amber-200">
                      {dur}m
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
