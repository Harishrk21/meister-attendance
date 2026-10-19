import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Coffee, LogOut, MapPin, Moon, Palmtree, Search, Zap } from 'lucide-react'
import { useData } from '@/context/DataContext'
import { Card } from '@/components/ui/card'
import { formatClock, liveWorkSeconds, useNow } from '@/hooks/useTimeTracker'
import { mapsUrl } from '@/lib/geo'
import { cn } from '@/lib/utils'
import type { AttendanceRecord, Employee } from '@/types'

type Bucket = 'working' | 'break' | 'out' | 'notIn' | 'away'

const BUCKETS: { key: Bucket; label: string; icon: React.ComponentType<{ className?: string }>; tone: string; dot: string }[] = [
  { key: 'working', label: 'Working', icon: Zap, tone: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  { key: 'break', label: 'On break', icon: Coffee, tone: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  { key: 'out', label: 'Clocked out', icon: LogOut, tone: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-400' },
  { key: 'notIn', label: 'Not in yet', icon: Moon, tone: 'text-ink-muted', dot: 'bg-slate-300 dark:bg-slate-600' },
  { key: 'away', label: 'On leave / holiday', icon: Palmtree, tone: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-400' },
]

function bucketOf(r?: AttendanceRecord): Bucket {
  if (!r) return 'notIn'
  if (r.status === 'On Leave' || r.status === 'Holiday') return 'away'
  if (!r.clockIn) return 'notIn'
  if (r.clockOut) return 'out'
  return r.isOnBreak ? 'break' : 'working'
}

const t = (iso?: string) => (iso ? format(parseISO(iso), 'hh:mm a') : '')

export function WhosInPage() {
  const { data } = useData()
  const [filter, setFilter] = useState<Bucket | 'all'>('all')
  const [search, setSearch] = useState('')
  const now = useNow(true)
  const today = format(new Date(now), 'yyyy-MM-dd')

  const people = useMemo(() => {
    if (!data) return []
    const todays = new Map<string, AttendanceRecord>()
    for (const a of data.attendance) {
      if (a.date !== today) continue
      const prev = todays.get(a.employeeId)
      if (!prev || (a.clockIn && !prev.clockIn)) todays.set(a.employeeId, a)
    }
    return data.employees
      .filter((e) => e.status === 'Active')
      .map((emp) => {
        const record = todays.get(emp.id)
        return { emp, record, bucket: bucketOf(record) }
      })
  }, [data, today])

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { working: 0, break: 0, out: 0, notIn: 0, away: 0 }
    for (const p of people) c[p.bucket]++
    return c
  }, [people])

  const q = search.trim().toLowerCase()
  const visible = people.filter(
    (p) =>
      (filter === 'all' || p.bucket === filter) &&
      (!q || p.emp.name.toLowerCase().includes(q) || p.emp.department.toLowerCase().includes(q))
  )

  if (!data) return null

  return (
    <div className="animate-page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Who&apos;s In</h1>
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Live · {format(new Date(now), 'EEEE, d MMM · hh:mm a')}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people or teams"
            className="h-9 w-56 rounded-lg border border-border bg-surface-elevated pl-8 pr-3 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setFilter(filter === b.key ? 'all' : b.key)}
            className={cn(
              'rounded-xl border bg-surface-elevated px-4 py-3 text-left transition-all hover:shadow-sm',
              filter === b.key ? 'border-teal ring-2 ring-teal/20' : 'border-border'
            )}
          >
            <div className={cn('flex items-center gap-1.5 text-xs font-semibold', b.tone)}>
              <b.icon className="h-3.5 w-3.5" /> {b.label}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-ink">{counts[b.key]}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map(({ emp, record, bucket }) => (
          <PersonCard key={emp.id} emp={emp} record={record} bucket={bucket} now={now} />
        ))}
      </div>
      {visible.length === 0 && (
        <Card className="py-12 text-center text-sm text-ink-muted">Nobody matches this filter right now.</Card>
      )}
    </div>
  )
}

function PersonCard({ emp, record, bucket, now }: { emp: Employee; record?: AttendanceRecord; bucket: Bucket; now: number }) {
  const meta = BUCKETS.find((b) => b.key === bucket)!
  const openBreak = record?.breaks.find((b) => !b.end)
  const timer =
    bucket === 'working'
      ? formatClock(liveWorkSeconds(record, now))
      : bucket === 'break' && openBreak
        ? formatClock(Math.max(0, Math.floor((now - parseISO(openBreak.start).getTime()) / 1000)))
        : null

  return (
    <Card className="flex items-center gap-3 p-3.5">
      <div className="relative shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal dark:bg-teal/20 dark:text-teal-100">
          {emp.avatarInitials}
        </div>
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface-elevated', meta.dot)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-ink">{emp.name}</div>
        <div className="truncate text-xs text-ink-muted">
          {bucket === 'working' && `${record?.activity ?? record?.workMode ?? 'Working'} · since ${t(record?.clockIn)}`}
          {bucket === 'break' && `On break since ${t(openBreak?.start)}`}
          {bucket === 'out' && `${t(record?.clockIn)} – ${t(record?.clockOut)}`}
          {bucket === 'notIn' && (record?.status === 'Absent' ? 'Marked absent' : emp.department)}
          {bucket === 'away' && record?.status}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {timer && <div className={cn('font-mono text-sm font-semibold tabular-nums', meta.tone)}>{timer}</div>}
        {bucket === 'out' && record && (
          <div className="text-sm font-semibold tabular-nums text-ink">
            {Math.floor(record.totalWorkMinutes / 60)}h {record.totalWorkMinutes % 60}m
          </div>
        )}
        {record?.location && (bucket === 'working' || bucket === 'break') && (
          <a
            href={mapsUrl(record.location)}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-teal hover:underline"
          >
            <MapPin className="h-3 w-3" /> Map
          </a>
        )}
      </div>
    </Card>
  )
}
