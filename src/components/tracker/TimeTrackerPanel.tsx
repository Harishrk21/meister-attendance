import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Briefcase, Coffee, Home, Loader2, LogIn, LogOut, MapPin, Play, Square, StickyNote, Truck } from 'lucide-react'
import { formatClock, useTimeTracker } from '@/hooks/useTimeTracker'
import { mapsUrl } from '@/lib/geo'
import { cn, formatMinutes } from '@/lib/utils'
import type { WorkMode } from '@/types'

const MODES: { value: WorkMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'Office', label: 'Office', icon: Briefcase },
  { value: 'Field', label: 'Field', icon: Truck },
  { value: 'WFH', label: 'Remote', icon: Home },
]

const STATE_STYLE = {
  idle: { dot: 'bg-slate-400', label: 'Not clocked in', text: 'text-ink-muted' },
  working: { dot: 'bg-emerald-500 animate-pulse', label: 'Working', text: 'text-emerald-600 dark:text-emerald-400' },
  break: { dot: 'bg-amber-500 animate-pulse', label: 'On break', text: 'text-amber-600 dark:text-amber-400' },
  done: { dot: 'bg-indigo-500', label: 'Day complete', text: 'text-indigo-600 dark:text-indigo-400' },
} as const

const t = (iso?: string) => (iso ? format(parseISO(iso), 'hh:mm a') : '—')

/**
 * Jibble-style time tracker: pick what you're working on, then one big button.
 * `compact` trims chrome for the embeddable widget.
 */
export function TimeTrackerPanel({ compact = false }: { compact?: boolean }) {
  const tracker = useTimeTracker()
  const { record, state, busy, workSeconds, breakSeconds, activities, needsEarlyNote } = tracker

  const [activity, setActivity] = useState<string | undefined>()
  const [workMode, setWorkMode] = useState<WorkMode>('Office')
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [earlyNote, setEarlyNote] = useState('')
  const [askEarly, setAskEarly] = useState(false)

  const style = STATE_STYLE[state]

  async function handleClockOut() {
    if (needsEarlyNote && !earlyNote.trim()) {
      setAskEarly(true)
      return
    }
    const ok = await tracker.clockOut(earlyNote)
    if (ok) {
      setAskEarly(false)
      setEarlyNote('')
    }
  }

  return (
    <div className={cn('flex flex-col', compact ? 'gap-4' : 'gap-5')}>
      {/* Timer */}
      <div className="text-center">
        <div className={cn('inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide', style.text)}>
          <span className={cn('h-2 w-2 rounded-full', style.dot)} />
          {style.label}
        </div>
        <div
          className={cn(
            'mt-2 font-mono font-semibold tabular-nums tracking-tight text-ink',
            compact ? 'text-4xl' : 'text-5xl'
          )}
          aria-live="polite"
        >
          {formatClock(state === 'break' ? breakSeconds : workSeconds)}
        </div>
        <div className="mt-1 text-xs text-ink-muted">
          {state === 'break'
            ? `Break time · worked ${formatMinutes(Math.floor(workSeconds / 60))} today`
            : state === 'idle'
              ? format(new Date(), 'EEEE, d MMMM')
              : record?.activity
                ? `${record.activity} · ${record.workMode ?? ''}`
                : `Worked today · ${record?.workMode ?? ''}`}
        </div>
      </div>

      {/* Idle: choose activity + mode */}
      {state === 'idle' && (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-ink-muted">What are you working on?</div>
            <div className="flex flex-wrap gap-1.5">
              {activities.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setActivity(activity === a ? undefined : a)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    activity === a
                      ? 'border-teal bg-teal text-white'
                      : 'border-border bg-surface-elevated text-ink hover:border-teal/50 hover:bg-teal-100/50 dark:hover:bg-teal/10'
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-ink-muted">Working from</div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface p-1">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setWorkMode(m.value)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-all',
                    workMode === m.value ? 'bg-surface-elevated text-teal shadow-sm' : 'text-ink-muted hover:text-ink'
                  )}
                >
                  <m.icon className="h-3.5 w-3.5" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {showNote ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-teal"
            >
              <StickyNote className="h-3.5 w-3.5" /> Add note
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => tracker.clockIn({ workMode, activity, notes: note })}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-base font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-current" />}
            Clock In
          </button>
        </div>
      )}

      {/* Working */}
      {state === 'working' && (
        <div className="space-y-3">
          {askEarly && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Leaving before shift end{tracker.shift ? ` (${tracker.shift.end})` : ''} — add a reason
              </div>
              <textarea
                autoFocus
                value={earlyNote}
                onChange={(e) => setEarlyNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. Customer site visit, medical appointment"
                className="w-full resize-none rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 dark:border-amber-500/40 dark:bg-surface-elevated"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={tracker.startBreak}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-amber-400 font-semibold text-amber-600 transition-colors hover:bg-amber-50 disabled:opacity-60 dark:hover:bg-amber-500/10"
            >
              <Coffee className="h-4 w-4" /> Break
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleClockOut}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-rose-500 font-semibold text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-600 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-current" />}
              Clock Out
            </button>
          </div>
        </div>
      )}

      {/* On break */}
      {state === 'break' && (
        <button
          type="button"
          disabled={busy}
          onClick={tracker.endBreak}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-600 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-current" />}
          Resume Work
        </button>
      )}

      {/* Done */}
      {state === 'done' && record && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Worked', formatMinutes(record.totalWorkMinutes)],
            ['Breaks', formatMinutes(record.totalBreakMinutes)],
            ['Status', record.status],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-surface px-2 py-2.5">
              <div className="text-[10px] font-semibold uppercase text-ink-muted">{label}</div>
              <div className="mt-0.5 text-sm font-bold text-ink">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Today's entries */}
      {record?.clockIn && (
        <div>
          <div className="mb-2 text-xs font-semibold text-ink-muted">Today</div>
          <ol className="relative space-y-2.5 border-l-2 border-border pl-4">
            <Entry icon={LogIn} color="bg-emerald-500" label="Clocked in" time={t(record.clockIn)} sub={record.activity} />
            {record.breaks.map((b) => (
              <Entry
                key={b.id}
                icon={Coffee}
                color="bg-amber-500"
                label={b.end ? 'Break' : 'On break'}
                time={b.end ? `${t(b.start)} – ${t(b.end)}` : `since ${t(b.start)}`}
              />
            ))}
            {record.clockOut && (
              <Entry icon={LogOut} color="bg-rose-500" label="Clocked out" time={t(record.clockOut)} sub={record.earlyLeaveNote} />
            )}
          </ol>
          {record.location && !compact && (
            <a
              href={mapsUrl(record.location)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-teal hover:underline"
            >
              <MapPin className="h-3.5 w-3.5" /> Clock-in location
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function Entry({
  icon: Icon,
  color,
  label,
  time,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>
  color: string
  label: string
  time: string
  sub?: string
}) {
  return (
    <li className="relative">
      <span className={cn('absolute -left-[25px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white', color)}>
        <Icon className="h-2.5 w-2.5" />
      </span>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="shrink-0 tabular-nums text-xs text-ink-muted">{time}</span>
      </div>
      {sub && <div className="truncate text-xs text-ink-muted">{sub}</div>}
    </li>
  )
}
