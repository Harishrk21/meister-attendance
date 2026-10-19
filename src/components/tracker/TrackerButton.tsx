import { useState } from 'react'
import { Play } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { formatClock, useTimeTracker } from '@/hooks/useTimeTracker'
import { cn } from '@/lib/utils'
import { TimeTrackerPanel } from './TimeTrackerPanel'

/** Always-visible header control: "Clock in" when idle, a live timer pill otherwise. */
export function TrackerButton() {
  const { state, workSeconds, breakSeconds, record } = useTimeTracker()
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {state === 'idle' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-colors hover:bg-emerald-600"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Clock in</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors',
            state === 'working' && 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
            state === 'break' && 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
            state === 'done' && 'border-border bg-surface text-ink-muted hover:bg-surface-elevated'
          )}
          aria-label="Open time tracker"
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              state === 'working' && 'bg-emerald-500 animate-pulse',
              state === 'break' && 'bg-amber-500 animate-pulse',
              state === 'done' && 'bg-indigo-400'
            )}
          />
          <span className="font-mono tabular-nums">{formatClock(state === 'break' ? breakSeconds : workSeconds)}</span>
          {state === 'working' && record?.activity && (
            <span className="hidden max-w-[120px] truncate text-xs font-medium opacity-80 md:inline">{record.activity}</span>
          )}
          {state === 'break' && <span className="hidden text-xs md:inline">Break</span>}
        </button>
      )}
      <SheetContent>
        <div className="border-b border-border px-5 py-4">
          <SheetTitle className="font-display text-base font-semibold">Time Tracker</SheetTitle>
          <SheetDescription className="text-xs text-ink-muted">Clock in, take breaks and clock out from anywhere</SheetDescription>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <TimeTrackerPanel />
        </div>
      </SheetContent>
    </Sheet>
  )
}
