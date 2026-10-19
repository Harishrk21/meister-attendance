import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fileSlug } from '@/lib/brand'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  isSunday,
  isWithinInterval,
} from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  ChevronDown,
  FileWarning,
  Timer,
  MapPin,
  Users,
  UserCheck,
  UserX,
  Clock,
  Download,
  Search,
  TrendingUp,
  BarChart2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, Badge, Label } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { formatMinutes, cn } from '@/lib/utils'
import * as regularizationService from '@/lib/services/regularization'
import type { AttendanceRecord, RegularizationType, WorkMode } from '@/types'

type TabKey = 'summary' | 'regularization' | 'overtime' | 'onduty'
type ViewMode = 'calendar' | 'list'
type Scope = 'mine' | 'company'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'summary', label: 'Attendance Summary' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'regularization', label: 'Regularization' },
  { key: 'onduty', label: 'On Duty' },
]

function subDaysSafe(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() - n)
  return x
}

function statusLabel(rec?: AttendanceRecord, date?: Date): string {
  if (date && isSunday(date)) return 'Weekend'
  if (!rec) return '—'
  if (rec.status === 'On Leave') return 'On Leave'
  if (rec.status === 'Holiday') return 'Holiday'
  if (rec.status === 'Absent') return 'Absent'
  if (rec.workMode === 'WFH') return 'Remote-in'
  if (rec.workMode === 'Field') return 'Field-in'
  if (['Present', 'Late', 'Half-Day'].includes(rec.status)) return 'Office-in'
  return rec.status
}

function statusPill(label: string): string {
  if (label === 'Absent') return 'bg-white text-red-600 border-red-200 shadow-sm'
  if (label === 'Weekend' || label === 'Holiday') return 'bg-white text-amber-600 border-amber-200 shadow-sm'
  if (label === 'On Leave') return 'bg-white text-sky-600 border-sky-200 shadow-sm'
  if (label === 'Late' || label === 'Half-Day') return 'bg-white text-orange-600 border-orange-200 shadow-sm'
  if (label === 'Remote-in' || label === 'Field-in' || label === 'Office-in')
    return 'bg-white text-emerald-600 border-emerald-200 shadow-sm'
  return 'bg-white text-slate-500 border-slate-200 shadow-sm'
}

function lineTone(label: string): string {
  if (label === 'Absent') return 'bg-red-400'
  if (label === 'Weekend' || label === 'Holiday') return 'bg-amber-400'
  if (label === 'On Leave') return 'bg-sky-400'
  return 'bg-emerald-500'
}

function statusBadge(status: string) {
  if (status === 'Present') return 'bg-emerald-100 text-emerald-700'
  if (status === 'Absent') return 'bg-red-100 text-red-700'
  if (status === 'Late') return 'bg-orange-100 text-orange-700'
  if (status === 'On Leave') return 'bg-sky-100 text-sky-700'
  if (status === 'Half-Day') return 'bg-purple-100 text-purple-700'
  if (status === 'Holiday') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

/* ─── Company Overview Section (Admin only) ─────────────────── */
function CompanyOverview() {
  const { data } = useData()
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [empSearch, setEmpSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'status'>('date')
  const [chartMode, setChartMode] = useState<'daily' | 'employee'>('daily')

  const departments = useMemo(() => {
    if (!data) return []
    return ['All', ...Array.from(new Set(data.employees.map((e) => e.department))).sort()]
  }, [data])

  /* Filtered rows: one row per attendance record in range */
  const rows = useMemo(() => {
    if (!data) return []
    const from = parseISO(dateFrom)
    const to = parseISO(dateTo)
    const activeEmps = data.employees.filter((e) => e.status === 'Active')

    return data.attendance
      .filter((a) => {
        const d = parseISO(a.date)
        return isWithinInterval(d, { start: from, end: to })
      })
      .map((a) => {
        const emp = activeEmps.find((e) => e.id === a.employeeId)
        if (!emp) return null
        return { a, emp }
      })
      .filter((item): item is { a: AttendanceRecord; emp: (typeof data.employees)[0] } => item !== null)
      .filter(({ emp }) => {
        if (deptFilter !== 'All' && emp.department !== deptFilter) return false
        if (empSearch && !emp.name.toLowerCase().includes(empSearch.toLowerCase())) return false
        return true
      })
      .filter(({ a }) => {
        if (statusFilter !== 'All' && a.status !== statusFilter) return false
        return true
      })
      .sort((x, y) => {
        if (sortBy === 'name') return x.emp.name.localeCompare(y.emp.name)
        if (sortBy === 'status') return x.a.status.localeCompare(y.a.status)
        return y.a.date.localeCompare(x.a.date)
      })
  }, [data, dateFrom, dateTo, deptFilter, empSearch, statusFilter, sortBy])

  /* KPI summary */
  const kpi = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, leave: 0, halfDay: 0, total: rows.length }
    for (const { a } of rows) {
      if (a.status === 'Present') counts.present++
      else if (a.status === 'Absent') counts.absent++
      else if (a.status === 'Late') { counts.late++; counts.present++ }
      else if (a.status === 'On Leave') counts.leave++
      else if (a.status === 'Half-Day') counts.halfDay++
    }
    return counts
  }, [rows])

  type ChartRow = { label: string; Present: number; Absent: number; Leave: number }

  /* Chart: daily attendance trend */
  const chartData = useMemo((): ChartRow[] => {
    if (!data) return []
    if (chartMode === 'daily') {
      const from = parseISO(dateFrom)
      const to = parseISO(dateTo)
      const days = eachDayOfInterval({ start: from, end: to }).slice(0, 31)
      return days.map((d) => {
        const key = format(d, 'yyyy-MM-dd')
        const dayRecs = rows.filter(({ a }) => a.date === key)
        return {
          label: format(d, 'dd MMM'),
          Present: dayRecs.filter(({ a }) => ['Present', 'Late'].includes(a.status)).length,
          Absent: dayRecs.filter(({ a }) => a.status === 'Absent').length,
          Leave: dayRecs.filter(({ a }) => a.status === 'On Leave').length,
        }
      })
    } else {
      const empMap = new Map<string, ChartRow>()
      for (const { a, emp } of rows) {
        if (!empMap.has(emp.id)) empMap.set(emp.id, { label: emp.name.split(' ')[0], Present: 0, Absent: 0, Leave: 0 })
        const e = empMap.get(emp.id)!
        if (['Present', 'Late'].includes(a.status)) e.Present++
        else if (a.status === 'Absent') e.Absent++
        else if (a.status === 'On Leave') e.Leave++
      }
      return Array.from(empMap.values()).sort((a, b) => b.Present - a.Present)
    }
  }, [rows, data, dateFrom, dateTo, chartMode])

  function exportCSV() {
    if (!rows.length) { toast.error('No data to export'); return }
    const headers = ['Employee', 'Employee Code', 'Department', 'Date', 'Clock In', 'Clock Out', 'Duration (mins)', 'Status', 'Mode']
    const csvRows = rows.map(({ a, emp }) => [
      emp.name,
      emp.employeeCode,
      emp.department,
      a.date,
      a.clockIn ? format(parseISO(a.clockIn), 'HH:mm') : '',
      a.clockOut ? format(parseISO(a.clockOut), 'HH:mm') : '',
      String(a.totalWorkMinutes),
      a.status,
      a.workMode ?? '',
    ])
    const csv = [headers, ...csvRows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileSlug(data?.settings.name ?? '')}-attendance_${dateFrom}_to_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} records`)
  }

  if (!data) return null

  return (
    <div className="space-y-5">
      {/* ── Filters ── */}
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Department</Label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['All', 'Present', 'Absent', 'Late', 'On Leave', 'Half-Day', 'Holiday'].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-teal"
                placeholder="Search employee name…"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" className="gap-2" onClick={exportCSV}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Total Records', val: kpi.total, icon: Users, color: 'from-slate-500 to-slate-600', text: 'text-slate-700' },
          { label: 'Present', val: kpi.present, icon: UserCheck, color: 'from-emerald-500 to-teal-600', text: 'text-emerald-700' },
          { label: 'Absent', val: kpi.absent, icon: UserX, color: 'from-red-500 to-rose-600', text: 'text-red-700' },
          { label: 'Late', val: kpi.late, icon: Clock, color: 'from-orange-500 to-amber-500', text: 'text-orange-700' },
          { label: 'On Leave', val: kpi.leave, icon: CalendarDays, color: 'from-sky-500 to-blue-600', text: 'text-sky-700' },
        ].map(({ label, val, icon: Icon, color, text }) => (
          <div
            key={label}
            className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm"
          >
            <div className={cn('absolute -right-4 -top-4 h-16 w-16 rounded-full bg-gradient-to-br opacity-10', color)} />
            <Icon className={cn('mb-2 h-5 w-5', text)} />
            <div className={cn('font-display text-3xl font-black tabular-nums', text)}>{val}</div>
            <div className="mt-0.5 text-xs font-medium text-ink-muted">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Chart ── */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-teal" /> Attendance Trend
          </CardTitle>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {(['daily', 'employee'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setChartMode(m)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  chartMode === m ? 'bg-teal text-white shadow-sm' : 'text-ink-muted hover:text-ink'
                )}
              >
                {m === 'daily' ? 'Daily' : 'By Employee'}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {chartData.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-ink-muted">No data in range</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Present" fill="#059669" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Absent" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Leave" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BarChart2 className="h-4 w-4 text-teal" />
            {rows.length} record{rows.length !== 1 ? 's' : ''} found
          </CardTitle>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Latest first</SelectItem>
              <SelectItem value="name">By name</SelectItem>
              <SelectItem value="status">By status</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-muted">
              No attendance records match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Dept</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">In</th>
                    <th className="px-4 py-3">Out</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows.slice(0, 200).map(({ a, emp }) => (
                    <tr key={a.id} className="hover:bg-surface/60 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal/10 text-[11px] font-bold text-teal">
                            {emp.avatarInitials}
                          </div>
                          <div>
                            <div className="font-medium text-ink">{emp.name}</div>
                            <div className="text-[10px] text-ink-muted">{emp.employeeCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">{emp.department}</td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">
                        {format(parseISO(a.date), 'dd MMM yy')}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                        {a.clockIn ? format(parseISO(a.clockIn), 'HH:mm') : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                        {a.clockOut ? format(parseISO(a.clockOut), 'HH:mm') : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {a.totalWorkMinutes > 0 ? formatMinutes(a.totalWorkMinutes) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', statusBadge(a.status))}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">{a.workMode ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 200 && (
                <p className="border-t border-border px-4 py-3 text-xs text-ink-muted">
                  Showing first 200 of {rows.length} records — export CSV to get full data.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ─── Main page ─────────────────────────────────────────────── */
export function MyAttendancePage() {
  const { session } = useAuth()
  const { data, bump } = useData()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabKey) || 'summary'
  const setTab = (t: TabKey) => {
    const next = new URLSearchParams(params)
    if (t === 'summary') next.delete('tab')
    else next.set('tab', t)
    setParams(next, { replace: true })
  }

  const [scope, setScope] = useState<Scope>('mine')
  const [month, setMonth] = useState(new Date())
  const [weekAnchor, setWeekAnchor] = useState(new Date())
  const [view, setView] = useState<ViewMode>('list')
  const [requestOpen, setRequestOpen] = useState(false)
  const [prefillDate] = useState(format(subDaysSafe(new Date(), 1), 'yyyy-MM-dd'))
  const [regForm, setRegForm] = useState({
    workDate: format(subDaysSafe(new Date(), 1), 'yyyy-MM-dd'),
    requestType: 'missed_punch' as RegularizationType,
    clockIn: '09:15',
    clockOut: '18:00',
    workMode: 'Field' as WorkMode,
    reason: '',
  })
  const [reviewComment, setReviewComment] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')

  const monthMap = useMemo(() => {
    if (!data || !session) return new Map<string, AttendanceRecord>()
    const prefix = format(month, 'yyyy-MM')
    const map = new Map<string, AttendanceRecord>()
    data.attendance
      .filter((a) => a.employeeId === session.employeeId && a.date.startsWith(prefix))
      .forEach((a) => map.set(a.date, a))
    return map
  }, [data, session, month])

  const weekDays = useMemo(() => {
    return eachDayOfInterval({ start: startOfWeek(weekAnchor), end: endOfWeek(weekAnchor) })
  }, [weekAnchor])

  const calendarDays = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startPad = startOfMonth(month).getDay()

  const regs = useMemo(() => {
    if (!data || !session) return []
    let list = data.regularizationRequests ?? []
    if (session.role !== 'admin') list = list.filter((r) => r.employeeId === session.employeeId)
    if (filterStatus !== 'All') list = list.filter((r) => r.status === filterStatus)
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [data, session, filterStatus])

  const overtimeRows = useMemo(() => {
    if (!data || !session) return []
    const threshold = data.settings.overtimeAfterHours * 60
    return data.attendance
      .filter((a) => a.employeeId === session.employeeId && a.totalWorkMinutes > threshold)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30)
      .map((a) => ({ ...a, otMinutes: a.totalWorkMinutes - threshold }))
  }, [data, session])

  const onDuty = useMemo(() => {
    if (!data || !session) return []
    let list = data.onDutyRequests ?? []
    if (session.role !== 'admin') list = list.filter((r) => r.employeeId === session.employeeId)
    return list
  }, [data, session])

  if (!session || !data) return null

  const canApprove = session.role === 'admin'
  const isAdmin = session.role === 'admin'
  const empName = (id: string) => data.employees.find((e) => e.id === id)?.name ?? '—'

  function openRegForDate(dateStr: string) {
    setRegForm((f) => ({ ...f, workDate: dateStr, reason: 'Forgot to mark attendance for this day.' }))
    setRequestOpen(true)
    setTab('regularization')
  }

  async function submitReg() {
    if (!session) return
    try {
      const inIso = `${regForm.workDate}T${regForm.clockIn}:00`
      const outIso = `${regForm.workDate}T${regForm.clockOut}:00`
      await regularizationService.applyRegularization({
        employeeId: session.employeeId,
        workDate: regForm.workDate,
        requestType: regForm.requestType,
        proposedClockIn: new Date(inIso).toISOString(),
        proposedClockOut: new Date(outIso).toISOString(),
        proposedWorkMode: regForm.workMode,
        reason: regForm.reason,
      })
      toast.success('Regularization submitted — awaiting approval')
      setRequestOpen(false)
      setRegForm((f) => ({ ...f, reason: '' }))
      bump()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div className="animate-page space-y-4">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Attendance</h1>
          <p className="text-sm text-ink-muted">
            {scope === 'company' ? `Company overview · ${data?.settings.name ?? ''}` : 'My data'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Admin scope toggle */}
          {isAdmin && (
            <div className="flex rounded-xl border border-border bg-surface-elevated p-0.5 shadow-sm">
              {(['mine', 'company'] as Scope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                    scope === s
                      ? 'bg-navy text-white shadow'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {s === 'mine' ? (
                    <><Clock className="h-3.5 w-3.5" /> My Attendance</>
                  ) : (
                    <><Users className="h-3.5 w-3.5" /> Company Overview</>
                  )}
                </button>
              ))}
            </div>
          )}

          {scope === 'mine' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1">
                  Request <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRegForm((f) => ({ ...f, workDate: prefillDate, reason: 'Forgot to mark attendance.' }))
                    setRequestOpen(true)
                    setTab('regularization')
                  }}
                >
                  <FileWarning className="h-4 w-4" /> Regularization (forgot punch)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => (window.location.href = '/leaves')}>
                  Leave request
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ── Company Overview (admin) ── */}
      {scope === 'company' && isAdmin && <CompanyOverview />}

      {/* ── My Attendance (all users) ── */}
      {scope === 'mine' && (
        <>
          {/* Sub tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'border-teal text-teal'
                    : 'border-transparent text-ink-muted hover:text-ink'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Attendance Summary ── */}
          {tab === 'summary' && (
            <>
              <div className="relative flex flex-wrap items-center justify-between gap-3 py-1">
                <div className="hidden w-24 sm:block" />
                <div className="mx-auto flex items-center gap-1 rounded-lg border border-border bg-surface-elevated px-2 py-1 shadow-sm">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      view === 'list'
                        ? setWeekAnchor((d) => subWeeks(d, 1))
                        : setMonth((m) => subMonths(m, 1))
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex min-w-[200px] items-center justify-center gap-2 px-2 text-sm font-semibold text-ink">
                    <CalendarDays className="h-4 w-4 text-teal" />
                    {view === 'list'
                      ? `${format(startOfWeek(weekAnchor), 'dd MMM yyyy')} – ${format(endOfWeek(weekAnchor), 'dd MMM yyyy')}`
                      : format(month, 'MMM yyyy')}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      view === 'list'
                        ? setWeekAnchor((d) => addWeeks(d, 1))
                        : setMonth((m) => addMonths(m, 1))
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="flex rounded-lg border border-border bg-surface-elevated p-0.5 shadow-sm">
                    <button
                      type="button"
                      className={cn('rounded-md p-2 text-ink-muted transition', view === 'list' && 'bg-teal text-white shadow-sm')}
                      onClick={() => setView('list')}
                      title="List view"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={cn('rounded-md p-2 text-ink-muted transition', view === 'calendar' && 'bg-teal text-white shadow-sm')}
                      onClick={() => setView('calendar')}
                      title="Calendar view"
                    >
                      <CalendarDays className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {view === 'calendar' ? (
                <Card className="overflow-hidden border-border/80 shadow-sm">
                  <CardContent className="p-4 sm:p-5">
                    <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-ink-muted">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                      {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} className="min-h-[72px] sm:min-h-[88px]" />)}
                      {calendarDays.map((day) => {
                        const key = format(day, 'yyyy-MM-dd')
                        const rec = monthMap.get(key)
                        const weekend = isSunday(day)
                        const label = statusLabel(rec, day)
                        const hours =
                          rec && rec.totalWorkMinutes > 0
                            ? `${Math.floor(rec.totalWorkMinutes / 60)}:${String(rec.totalWorkMinutes % 60).padStart(2, '0')} Hrs`
                            : null
                        const showAbsentHint = !weekend && !rec && day < new Date() && !isSameDay(day, new Date())
                        const displayLabel = showAbsentHint ? 'Absent' : label === '—' && weekend ? 'Weekend' : label

                        return (
                          <button
                            type="button"
                            key={key}
                            onClick={() => { if (showAbsentHint || rec?.status === 'Absent') openRegForDate(key) }}
                            className={cn(
                              'flex min-h-[72px] flex-col rounded-lg border border-border p-1.5 text-left transition hover:border-teal sm:min-h-[88px] sm:p-2',
                              weekend && 'bg-amber-50/80 dark:bg-amber-950/20',
                              isSameDay(day, new Date()) && 'ring-2 ring-teal',
                              !isSameMonth(day, month) && 'opacity-40'
                            )}
                          >
                            <span className="text-xs font-semibold text-ink-muted">{format(day, 'd')}</span>
                            {displayLabel !== '—' && (
                              <span
                                className={cn(
                                  'mt-auto rounded border px-1 py-0.5 text-center text-[10px] font-semibold leading-tight sm:text-[11px]',
                                  displayLabel === 'Absent' ? 'bg-red-50 text-red-600 border-red-100' :
                                  displayLabel === 'Weekend' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                  'bg-emerald-50 text-emerald-700 border-emerald-100'
                                )}
                              >
                                {displayLabel}
                                {hours && <><br /><span className="font-medium opacity-90">{hours}</span></>}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-3 text-xs text-ink-muted">Tip: tap an Absent day to raise a regularization concern.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="overflow-hidden border-border/80 shadow-sm">
                  <CardContent className="divide-y divide-border/70 p-0">
                    {weekDays.map((day) => {
                      const key = format(day, 'yyyy-MM-dd')
                      const rec = data.attendance.find(
                        (a) => a.employeeId === session.employeeId && a.date === key
                      )
                      const weekend = isSunday(day)
                      const holiday = data.holidays.some((h) => h.date === key)
                      const showAbsent = !weekend && !holiday && !rec && day < new Date() && !isSameDay(day, new Date())
                      const label = holiday ? 'Holiday' : showAbsent ? 'Absent' : statusLabel(rec, day)
                      const inTime = rec?.clockIn ? format(parseISO(rec.clockIn), 'hh:mm a') : '00:00'
                      const outTime = rec?.clockOut ? format(parseISO(rec.clockOut), 'hh:mm a') : '00:00'
                      const worked =
                        rec && rec.totalWorkMinutes > 0
                          ? `${Math.floor(rec.totalWorkMinutes / 60).toString().padStart(2, '0')}:${String(rec.totalWorkMinutes % 60).padStart(2, '0')} Hrs Worked`
                          : '00:00 Hrs Worked'

                      return (
                        <div
                          key={key}
                          className={cn(
                            'flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:gap-4 sm:px-6',
                            weekend && 'bg-amber-50/40 dark:bg-amber-950/10',
                            showAbsent && 'bg-red-50/30 dark:bg-red-950/10'
                          )}
                        >
                          <div className="flex w-14 shrink-0 flex-col sm:w-16">
                            <span className="font-display text-2xl font-bold leading-none tracking-tight text-navy dark:text-white">
                              {format(day, 'dd')}
                            </span>
                            <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                              {format(day, 'EEE')}
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
                            <span className="w-[4.5rem] shrink-0 text-sm tabular-nums text-ink-muted sm:w-20">{inTime}</span>
                            <div className="relative flex h-10 min-w-0 flex-1 items-center px-1">
                              <div className={cn('absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full', lineTone(label))} />
                              <span className={cn('relative z-[1] mx-auto rounded-full border px-3.5 py-1.5 text-xs font-semibold', statusPill(label))}>
                                {label}
                              </span>
                            </div>
                            <span className="w-[4.5rem] shrink-0 text-right text-sm tabular-nums text-ink-muted sm:w-20">{outTime}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 sm:w-44 sm:flex-col sm:items-end sm:justify-center">
                            <span className="text-sm font-semibold tabular-nums text-ink">{worked}</span>
                            {(showAbsent || rec?.status === 'Absent') && (
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openRegForDate(key)}>
                                Raise concern
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ── Regularization ── */}
          {tab === 'regularization' && (
            <div className="space-y-4">
              <Card className="border-amber/30 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="flex flex-wrap items-start gap-3 p-4">
                  <FileWarning className="mt-0.5 h-5 w-5 text-amber" />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-ink">Forgot to mark attendance?</p>
                    <p className="text-ink-muted">
                      Raise a regularization concern with the correct in/out times. Admin will approve — we do not auto-mark absent overnight.
                    </p>
                  </div>
                  <Button onClick={() => { setRegForm((f) => ({ ...f, reason: 'Forgot to mark attendance.' })); setRequestOpen(true) }}>
                    New request
                  </Button>
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                {regs.length === 0 && (
                  <Card>
                    <CardContent className="py-10 text-center text-sm text-ink-muted">
                      No regularization requests yet.
                      <div className="mt-3"><Button onClick={() => setRequestOpen(true)}>Raise a concern</Button></div>
                    </CardContent>
                  </Card>
                )}
                {regs.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          {canApprove && <div className="text-sm font-medium">{empName(r.employeeId)}</div>}
                          <div className="font-display font-semibold">
                            {format(parseISO(r.workDate), 'dd MMM yyyy')} · {r.requestType.replace(/_/g, ' ')}
                          </div>
                          <div className="mt-1 text-sm text-ink-muted">
                            Proposed: {r.proposedClockIn ? format(parseISO(r.proposedClockIn), 'hh:mm a') : '—'} – {r.proposedClockOut ? format(parseISO(r.proposedClockOut), 'hh:mm a') : '—'}
                            {r.proposedWorkMode && ` · ${r.proposedWorkMode}`}
                          </div>
                          <p className="mt-2 text-sm">{r.reason}</p>
                          {r.approverComment && <p className="mt-1 text-xs text-ink-muted">Comment: {r.approverComment}</p>}
                        </div>
                        <Badge variant={r.status === 'Approved' ? 'success' : r.status === 'Rejected' ? 'danger' : r.status === 'Pending' ? 'warning' : 'muted'}>
                          {r.status}
                        </Badge>
                      </div>
                      {canApprove && r.status === 'Pending' && (
                        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                          <div className="min-w-[180px] flex-1 space-y-1">
                            <Label className="text-xs">Comment</Label>
                            <Input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Optional" />
                          </div>
                          <Button size="sm" onClick={async () => {
                            await regularizationService.reviewRegularization({ requestId: r.id, approverId: session.userId, status: 'Approved', comment: reviewComment || undefined })
                            setReviewComment(''); bump(); toast.success('Regularization approved — attendance updated')
                          }}>Approve</Button>
                          <Button size="sm" variant="danger" onClick={async () => {
                            await regularizationService.reviewRegularization({ requestId: r.id, approverId: session.userId, status: 'Rejected', comment: reviewComment || undefined })
                            setReviewComment(''); bump(); toast.success('Regularization rejected')
                          }}>Reject</Button>
                        </div>
                      )}
                      {session.role !== 'admin' && r.status === 'Pending' && r.employeeId === session.employeeId && (
                        <Button size="sm" variant="outline" onClick={async () => {
                          await regularizationService.cancelRegularization(r.id, session.employeeId)
                          bump(); toast.success('Request cancelled')
                        }}>Cancel</Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ── Overtime ── */}
          {tab === 'overtime' && (
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm text-ink-muted">
                  <Timer className="h-4 w-4" />
                  Hours beyond {data.settings.overtimeAfterHours}h/day (from your punches)
                </div>
                {overtimeRows.length === 0 && <p className="py-8 text-center text-sm text-ink-muted">No overtime recorded in history.</p>}
                {overtimeRows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
                    <span className="font-medium">{format(parseISO(r.date), 'dd MMM yyyy')}</span>
                    <span className="text-ink-muted">Worked {formatMinutes(r.totalWorkMinutes)} · OT {formatMinutes(r.otMinutes)}</span>
                    <Badge variant="teal">{r.workMode ?? '—'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── On Duty ── */}
          {tab === 'onduty' && (
            <div className="space-y-3">
              {onDuty.length === 0 && (
                <Card><CardContent className="py-10 text-center text-sm text-ink-muted">No on-duty requests. Field visits can be logged here once submitted.</CardContent></Card>
              )}
              {onDuty.map((o) => (
                <Card key={o.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div>
                      {canApprove && <div className="text-sm font-medium">{empName(o.employeeId)}</div>}
                      <div className="font-display font-semibold">
                        {format(parseISO(o.from), 'dd MMM')}{o.from !== o.to && ` – ${format(parseISO(o.to), 'dd MMM')}`}
                      </div>
                      {o.locationLabel && <div className="mt-1 flex items-center gap-1 text-sm text-ink-muted"><MapPin className="h-3.5 w-3.5" /> {o.locationLabel}</div>}
                      <p className="mt-1 text-sm">{o.purpose}</p>
                    </div>
                    <Badge variant={o.status === 'Pending' ? 'warning' : o.status === 'Approved' ? 'success' : 'muted'}>{o.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Regularization dialog ── */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise regularization concern</DialogTitle>
            <DialogDescription>Use this when you forgot to clock in/out. Admin approval updates your attendance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={regForm.workDate} onChange={(e) => setRegForm({ ...regForm, workDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={regForm.requestType} onValueChange={(v) => setRegForm({ ...regForm, requestType: v as RegularizationType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="missed_punch">Forgot entire day / missed punch</SelectItem>
                  <SelectItem value="missing_clock_in">Missing clock-in</SelectItem>
                  <SelectItem value="missing_clock_out">Missing clock-out</SelectItem>
                  <SelectItem value="wrong_time">Wrong time recorded</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Proposed in</Label>
                <Input type="time" value={regForm.clockIn} onChange={(e) => setRegForm({ ...regForm, clockIn: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Proposed out</Label>
                <Input type="time" value={regForm.clockOut} onChange={(e) => setRegForm({ ...regForm, clockOut: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Work mode</Label>
              <Select value={regForm.workMode} onValueChange={(v) => setRegForm({ ...regForm, workMode: v as WorkMode })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Office">Office</SelectItem>
                  <SelectItem value="Field">Field</SelectItem>
                  <SelectItem value="WFH">WFH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason / concern</Label>
              <Textarea value={regForm.reason} onChange={(e) => setRegForm({ ...regForm, reason: e.target.value })} placeholder="I forgot to mark attendance because…" />
            </div>
            <Button className="w-full" onClick={() => void submitReg()} disabled={!regForm.reason.trim()}>
              Submit for approval
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
