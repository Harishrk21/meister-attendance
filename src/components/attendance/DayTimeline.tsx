import { format, parseISO, differenceInMinutes } from 'date-fns'
import type { AttendanceRecord } from '@/types'
import { cn } from '@/lib/utils'

interface DayTimelineProps {
  record?: AttendanceRecord
  className?: string
}

/**
 * Horizontal colorful timeline: Time In → Breaks → Time Out
 * Inspired by Attendify-style day progress UI.
 */
export function DayTimeline({ record, className }: DayTimelineProps) {
  if (!record?.clockIn) {
    return (
      <div className={cn('rounded-2xl border border-dashed border-border bg-surface p-6 text-center', className)}>
        <p className="text-sm text-ink-muted">No punches yet today. Clock in to see your day timeline.</p>
      </div>
    )
  }

  const nodes: Array<{
    id: string
    label: string
    time: string
    sub?: string
    tone: 'in' | 'break' | 'out' | 'ongoing'
  }> = []

  nodes.push({
    id: 'in',
    label: 'Time In',
    time: format(parseISO(record.clockIn), 'hh:mm a'),
    sub: record.workMode,
    tone: 'in',
  })

  for (const b of record.breaks ?? []) {
    const start = format(parseISO(b.start), 'hh:mm a')
    const end = b.end ? format(parseISO(b.end), 'hh:mm a') : '…'
    const mins = differenceInMinutes(b.end ? parseISO(b.end) : new Date(), parseISO(b.start))
    nodes.push({
      id: b.id,
      label: b.end ? 'Break' : 'On Break',
      time: `${start} – ${end}`,
      sub: `${mins} min`,
      tone: 'break',
    })
  }

  if (record.clockOut) {
    nodes.push({
      id: 'out',
      label: 'Time Out',
      time: format(parseISO(record.clockOut), 'hh:mm a'),
      tone: 'out',
    })
  } else if (!record.isOnBreak) {
    nodes.push({
      id: 'live',
      label: 'Working',
      time: 'Live',
      sub: 'In progress',
      tone: 'ongoing',
    })
  }

  const toneDot: Record<string, string> = {
    in: 'bg-emerald-500 ring-emerald-200',
    break: 'bg-amber-500 ring-amber-200',
    out: 'bg-violet-500 ring-violet-200',
    ongoing: 'bg-teal-500 ring-teal-200 animate-pulse',
  }
  const toneText: Record<string, string> = {
    in: 'text-emerald-700',
    break: 'text-amber-700',
    out: 'text-violet-700',
    ongoing: 'text-teal-700',
  }
  const toneBadge: Record<string, string> = {
    in: 'bg-emerald-50 border-emerald-200',
    break: 'bg-amber-50 border-amber-200',
    out: 'bg-violet-50 border-violet-200',
    ongoing: 'bg-teal-50 border-teal-200',
  }

  return (
    <div className={cn('rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-navy dark:text-white">Today&apos;s Timeline</h3>
        {record.status && (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
              record.status === 'Late' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
            )}
          >
            {record.status}
          </span>
        )}
      </div>

      {/* Desktop / tablet horizontal */}
      <div className="hidden sm:block">
        <div className="relative flex items-start justify-between gap-2 px-2">
          {/* connecting line */}
          <div className="absolute left-8 right-8 top-4 h-0.5 bg-gradient-to-r from-emerald-300 via-amber-300 to-violet-300" />
          {nodes.map((n) => (
            <div key={n.id} className="relative z-[1] flex min-w-0 flex-1 flex-col items-center text-center">
              <div className={cn('h-8 w-8 rounded-full ring-4 shadow-md', toneDot[n.tone])} />
              <div className={cn('mt-3 w-full max-w-[7.5rem] rounded-xl border px-2 py-2', toneBadge[n.tone])}>
                <div className={cn('text-[10px] font-bold uppercase tracking-wider', toneText[n.tone])}>{n.label}</div>
                <div className="mt-0.5 text-xs font-semibold tabular-nums text-ink">{n.time}</div>
                {n.sub && <div className="mt-0.5 text-[10px] text-ink-muted">{n.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile vertical */}
      <div className="space-y-0 sm:hidden">
        {nodes.map((n, i) => (
          <div key={n.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('h-7 w-7 shrink-0 rounded-full ring-4 shadow', toneDot[n.tone])} />
              {i < nodes.length - 1 && <div className="my-1 w-0.5 flex-1 bg-gradient-to-b from-emerald-300 to-violet-300" />}
            </div>
            <div className={cn('mb-3 flex-1 rounded-xl border px-3 py-2', toneBadge[n.tone])}>
              <div className={cn('text-[10px] font-bold uppercase tracking-wider', toneText[n.tone])}>{n.label}</div>
              <div className="text-sm font-semibold tabular-nums text-ink">{n.time}</div>
              {n.sub && <div className="text-xs text-ink-muted">{n.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
