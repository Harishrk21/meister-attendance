import { useMemo, useState } from 'react'
import { addDays, addWeeks, format, isSameDay, isToday, parseISO, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DayTimeline } from '@/components/attendance/DayTimeline'
import { liveWorkSeconds, useNow } from '@/hooks/useTimeTracker'
import { cn, downloadCsv, formatMinutes } from '@/lib/utils'
import type { AttendanceRecord, Employee } from '@/types'

interface Cell {
  date: string
  record?: AttendanceRecord
  minutes: number
}

interface Row {
  emp: Employee
  cells: Cell[]
  total: number
  overtime: number
  daysWorked: number
}

const STATUS_SHORT: Record<string, string> = {
  'On Leave': 'Leave',
  Holiday: 'Holiday',
  Absent: 'Absent',
}

function hm(mins: number) {
  if (mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function TimesheetsPage() {
  const { session } = useAuth()
  const { data } = useData()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('All')
  const [detail, setDetail] = useState<{ emp: Employee; cell: Cell } | null>(null)

  const isAdmin = session?.role === 'admin'
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const currentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }))
  const now = useNow(currentWeek)

  const departments = useMemo(
    () => ['All', ...new Set((data?.employees ?? []).map((e) => e.department))],
    [data?.employees]
  )

  const rows: Row[] = useMemo(() => {
    if (!data || !session) return []
    const otAfter = data.settings.overtimeAfterHours * 60
    const keys = days.map((d) => format(d, 'yyyy-MM-dd'))
    const keySet = new Set(keys)
    const byEmpDate = new Map<string, AttendanceRecord>()
    for (const a of data.attendance) {
      if (keySet.has(a.date)) byEmpDate.set(`${a.employeeId}|${a.date}`, a)
    }
    const q = search.trim().toLowerCase()
    return data.employees
      .filter((e) => (isAdmin ? e.status === 'Active' : e.id === session.employeeId))
      .filter((e) => dept === 'All' || e.department === dept)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q))
      .map((emp) => {
        const cells = keys.map((date) => {
          const record = byEmpDate.get(`${emp.id}|${date}`)
          const minutes = record?.clockIn && !record.clockOut ? Math.floor(liveWorkSeconds(record, now) / 60) : (record?.totalWorkMinutes ?? 0)
          return { date, record, minutes }
        })
        const total = cells.reduce((s, c) => s + c.minutes, 0)
        const overtime = cells.reduce((s, c) => s + Math.max(0, c.minutes - otAfter), 0)
        return { emp, cells, total, overtime, daysWorked: cells.filter((c) => c.record?.clockIn).length }
      })
  }, [data, session, isAdmin, days, dept, search, now])

  const dayTotals = days.map((_, i) => rows.reduce((s, r) => s + r.cells[i]!.minutes, 0))
  const grandTotal = rows.reduce((s, r) => s + r.total, 0)
  const grandOt = rows.reduce((s, r) => s + r.overtime, 0)
  const targetMinutes = (data?.settings.overtimeAfterHours ?? 9) * 60

  function exportCsv() {
    downloadCsv(`timesheet-${format(weekStart, 'yyyy-MM-dd')}.csv`, [
      ['Employee', 'Code', 'Department', ...days.map((d) => format(d, 'EEE dd MMM')), 'Total', 'Overtime', 'Days worked'],
      ...rows.map((r) => [
        r.emp.name,
        r.emp.employeeCode,
        r.emp.department,
        ...r.cells.map((c) => (c.record && !c.record.clockIn ? c.record.status : formatMinutes(c.minutes))),
        formatMinutes(r.total),
        formatMinutes(r.overtime),
        String(r.daysWorked),
      ]),
    ])
  }

  if (!session || !data) return null

  return (
    <div className="animate-page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Timesheets</h1>
          <p className="text-sm text-ink-muted">
            {isAdmin ? 'Hours tracked by everyone, week by week' : 'Your tracked hours, week by week'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download /> Export CSV
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-surface-elevated">
          <button
            type="button"
            className="rounded-l-lg p-2 text-ink-muted hover:bg-surface hover:text-ink"
            onClick={() => setWeekStart((w) => addWeeks(w, -1))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[180px] px-2 text-center text-sm font-semibold text-ink">
            {format(days[0]!, 'd MMM')} – {format(days[6]!, 'd MMM yyyy')}
          </div>
          <button
            type="button"
            className="rounded-r-lg p-2 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-30"
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            disabled={currentWeek}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {!currentWeek && (
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            This week
          </Button>
        )}
        {isAdmin && (
          <>
            <div className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people"
                className="h-9 w-48 rounded-lg border border-border bg-surface-elevated pl-8 pr-3 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
              />
            </div>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface-elevated px-2 text-sm focus:border-teal focus:outline-none"
              aria-label="Department"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d === 'All' ? 'All departments' : d}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Tracked', formatMinutes(grandTotal)],
          ['Overtime', formatMinutes(grandOt)],
          [isAdmin ? 'People' : 'Days worked', isAdmin ? String(rows.length) : String(rows[0]?.daysWorked ?? 0)],
          ['Avg / day', formatMinutes(Math.round(grandTotal / Math.max(1, rows.reduce((s, r) => s + r.daysWorked, 0))))],
        ].map(([label, value]) => (
          <Card key={label} className="px-4 py-3">
            <div className="text-xs font-medium text-ink-muted">{label}</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-ink">{value}</div>
          </Card>
        ))}
      </div>

      {/* Grid */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/60 text-xs text-ink-muted">
                <th className="sticky left-0 z-10 bg-surface-elevated px-4 py-3 text-left font-semibold">Member</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className={cn('px-2 py-3 text-center font-semibold', isToday(d) && 'text-teal')}>
                    <div>{format(d, 'EEE')}</div>
                    <div className={cn('text-[11px] font-normal', isToday(d) && 'font-semibold')}>{format(d, 'd MMM')}</div>
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold">Overtime</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.emp.id} className="border-b border-border/60 hover:bg-surface/40">
                  <td className="sticky left-0 z-10 bg-surface-elevated px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal dark:bg-teal/20 dark:text-teal-100">
                        {r.emp.avatarInitials}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">{r.emp.name}</div>
                        <div className="truncate text-[11px] text-ink-muted">{r.emp.department}</div>
                      </div>
                    </div>
                  </td>
                  {r.cells.map((c) => {
                    const placeholder = c.record && !c.record.clockIn
                    const open = !!c.record?.clockIn && !c.record.clockOut
                    const pct = Math.min(1, c.minutes / targetMinutes)
                    return (
                      <td key={c.date} className="px-1.5 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={!c.record}
                          onClick={() => c.record && setDetail({ emp: r.emp, cell: c })}
                          className={cn(
                            'relative w-full overflow-hidden rounded-md px-1 py-2 text-xs font-semibold tabular-nums transition-colors',
                            !c.record && 'cursor-default text-ink-muted/50',
                            placeholder && c.record?.status === 'Absent' && 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
                            placeholder && c.record?.status === 'On Leave' && 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
                            placeholder && c.record?.status === 'Holiday' && 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
                            c.record?.clockIn && 'bg-surface text-ink hover:ring-1 hover:ring-teal/40',
                            c.record?.status === 'Late' && 'text-amber-700 dark:text-amber-300'
                          )}
                        >
                          {c.record?.clockIn && (
                            <span
                              className={cn('absolute inset-x-0 bottom-0 h-1', open ? 'bg-emerald-400 animate-pulse' : 'bg-teal/60')}
                              style={{ width: `${pct * 100}%` }}
                            />
                          )}
                          {placeholder ? STATUS_SHORT[c.record!.status] ?? c.record!.status : hm(c.minutes)}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-ink">{hm(r.total)}</td>
                  <td className={cn('px-4 py-2.5 text-right tabular-nums', r.overtime ? 'font-semibold text-amber-600' : 'text-ink-muted')}>
                    {hm(r.overtime)}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr className="bg-surface/60 text-xs font-semibold text-ink-muted">
                  <td className="sticky left-0 bg-surface-elevated px-4 py-3">Total</td>
                  {dayTotals.map((m, i) => (
                    <td key={i} className="px-2 py-3 text-center tabular-nums">{hm(m)}</td>
                  ))}
                  <td className="px-3 py-3 text-right tabular-nums text-ink">{hm(grandTotal)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-600">{hm(grandOt)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {rows.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">No people match these filters.</p>}
        </div>
      </Card>

      <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-teal/60" /> Progress to {data.settings.overtimeAfterHours}h day</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-emerald-400" /> Currently clocked in</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-violet-200" /> Leave</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-rose-200" /> Absent</span>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          {detail?.cell.record && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.emp.name}</DialogTitle>
                <DialogDescription>
                  {format(parseISO(detail.cell.date), 'EEEE, d MMMM yyyy')} · {detail.cell.record.status}
                  {detail.cell.record.activity ? ` · ${detail.cell.record.activity}` : ''}
                  {detail.cell.record.workMode ? ` · ${detail.cell.record.workMode}` : ''}
                </DialogDescription>
              </DialogHeader>
              <DayTimeline record={detail.cell.record} />
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Worked', formatMinutes(detail.cell.minutes)],
                  ['Breaks', formatMinutes(detail.cell.record.totalBreakMinutes)],
                  ['Overtime', formatMinutes(Math.max(0, detail.cell.minutes - targetMinutes))],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-surface px-2 py-2.5">
                    <div className="text-[10px] font-semibold uppercase text-ink-muted">{l}</div>
                    <div className="mt-0.5 text-sm font-bold text-ink">{v}</div>
                  </div>
                ))}
              </div>
              {(detail.cell.record.notes || detail.cell.record.earlyLeaveNote) && (
                <div className="mt-3 space-y-1 rounded-lg border border-border p-3 text-sm">
                  {detail.cell.record.notes && <p><span className="font-medium">Note:</span> {detail.cell.record.notes}</p>}
                  {detail.cell.record.earlyLeaveNote && (
                    <p><span className="font-medium">Early leave:</span> {detail.cell.record.earlyLeaveNote}</p>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
