import { useMemo, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, Printer, Search } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Label } from '@/components/ui/card'
import { downloadCsv, formatMinutes, cn } from '@/lib/utils'
import { fileSlug } from '@/lib/brand'

const PIE_COLORS = ['#0F766E', '#D97706', '#DC2626', '#0B1F3A', '#0284C7']

type EmpTab = 'all' | 'high' | 'low' | 'leave'

export function ReportsPage() {
  const { session } = useAuth()
  const { data } = useData()
  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [search, setSearch] = useState('')
  const [empTab, setEmpTab] = useState<EmpTab>('all')

  const report = useMemo(() => {
    if (!data || !session) return null
    const emps = data.employees.filter((e) => e.status === 'Active')
    const ids = new Set(emps.map((e) => e.id))
    const att = data.attendance.filter((a) => ids.has(a.employeeId) && a.date >= from && a.date <= to)

    const present = att.filter((a) => ['Present', 'Late', 'Half-Day'].includes(a.status)).length
    const late = att.filter((a) => a.status === 'Late').length
    const absent = att.filter((a) => a.status === 'Absent').length
    const leave = att.filter((a) => a.status === 'On Leave').length
    const total = present + absent + leave || 1
    const absenteeism = Math.round((absent / total) * 100)
    const ot = att.reduce((s, a) => s + Math.max(0, a.totalWorkMinutes - data.settings.overtimeAfterHours * 60), 0)

    const byDept = Object.entries(
      emps.reduce<Record<string, number>>((acc, e) => {
        const taken = data.leaveRequests
          .filter((l) => l.employeeId === e.id && l.status === 'Approved' && l.from >= from && l.from <= to)
          .reduce((s, l) => s + l.days, 0)
        acc[e.department] = (acc[e.department] ?? 0) + taken
        return acc
      }, {})
    ).map(([name, value]) => ({ name, value }))

    const latecomers = att
      .filter((a) => a.status === 'Late')
      .map((a) => {
        const emp = data.employees.find((e) => e.id === a.employeeId)
        return { name: emp?.name ?? '—', date: a.date, in: a.clockIn }
      })
      .slice(0, 20)

    const statusPie = [
      { name: 'Present', value: Math.max(0, present - late) },
      { name: 'Late', value: late },
      { name: 'Absent', value: absent },
      { name: 'On Leave', value: leave },
    ].filter((x) => x.value > 0)

    const byDeptAttendance = Object.entries(
      emps.reduce<Record<string, { present: number; absent: number }>>((acc, e) => {
        if (!acc[e.department]) acc[e.department] = { present: 0, absent: 0 }
        const empAtt = att.filter((a) => a.employeeId === e.id)
        acc[e.department].present += empAtt.filter((a) =>
          ['Present', 'Late', 'Half-Day'].includes(a.status)
        ).length
        acc[e.department].absent += empAtt.filter((a) => a.status === 'Absent').length
        return acc
      }, {})
    ).map(([name, v]) => ({ name, present: v.present, absent: v.absent }))

    const empSummary = emps
      .map((e) => {
        const empAtt = att.filter((a) => a.employeeId === e.id)
        const p = empAtt.filter((a) => ['Present', 'Late', 'Half-Day'].includes(a.status)).length
        const aCount = empAtt.filter((x) => x.status === 'Absent').length
        const l = empAtt.filter((x) => x.status === 'On Leave').length
        const denom = p + aCount + l || 1
        const rate = Math.round((p / denom) * 100)
        return {
          id: e.id,
          name: e.name,
          code: e.employeeCode,
          dept: e.department,
          initials: e.avatarInitials,
          present: p,
          absent: aCount,
          leave: l,
          rate,
        }
      })
      .sort((x, y) => y.rate - x.rate)

    return {
      present,
      late,
      absent,
      leave,
      absenteeism,
      ot,
      byDept,
      latecomers,
      statusPie,
      byDeptAttendance,
      att,
      emps,
      empSummary,
    }
  }, [data, session, from, to])

  const filteredEmps = useMemo(() => {
    if (!report) return []
    let list = report.empSummary
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((e) => e.name.toLowerCase().includes(q) || e.dept.toLowerCase().includes(q))
    }
    if (empTab === 'high') list = list.filter((e) => e.rate >= 90)
    if (empTab === 'low') list = list.filter((e) => e.rate < 80 && e.present + e.absent + e.leave > 0)
    if (empTab === 'leave') list = list.filter((e) => e.leave > 0)
    return list
  }, [report, search, empTab])

  if (!session || !data || !report) return null

  const reportData = report
  const appData = data
  const company = data.settings
  const stem = fileSlug(company.name)

  function exportAttendance() {
    downloadCsv(`${stem}-attendance.csv`, [
      ['Date', 'Employee', 'In', 'Out', 'Minutes', 'Status', 'Mode'],
      ...reportData.att.map((a) => {
        const emp = appData.employees.find((e) => e.id === a.employeeId)
        return [
          a.date,
          emp?.name ?? '',
          a.clockIn ?? '',
          a.clockOut ?? '',
          String(a.totalWorkMinutes),
          a.status,
          a.workMode ?? '',
        ]
      }),
    ])
  }

  function exportLeaves() {
    const leaves = appData.leaveRequests.filter((l) => l.from >= from && l.from <= to)
    downloadCsv(`${stem}-leaves.csv`, [
      ['Employee', 'Type', 'From', 'To', 'Days', 'Status', 'Reason'],
      ...leaves.map((l) => {
        const emp = appData.employees.find((e) => e.id === l.employeeId)
        return [emp?.name ?? '', l.type, l.from, l.to, String(l.days), l.status, l.reason]
      }),
    ])
  }

  function exportEmployees() {
    downloadCsv(`${stem}-employees.csv`, [
      ['Code', 'Name', 'Email', 'Phone', 'Role', 'Department', 'Status'],
      ...reportData.emps.map((e) => [e.employeeCode, e.name, e.email, e.phone, e.role, e.department, e.status]),
    ])
  }

  function exportEmpRates() {
    downloadCsv(`${stem}-attendance-rates.csv`, [
      ['Employee', 'Code', 'Department', 'Present', 'Absent', 'Leave', 'Rate %'],
      ...reportData.empSummary.map((e) => [
        e.name,
        e.code,
        e.dept,
        String(e.present),
        String(e.absent),
        String(e.leave),
        String(e.rate),
      ]),
    ])
  }

  function rateBarColor(rate: number) {
    if (rate >= 90) return 'bg-emerald-500'
    if (rate >= 80) return 'bg-amber-400'
    return 'bg-red-500'
  }

  return (
    <div className="animate-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Reports & analytics</h1>
          <p className="text-sm text-ink-muted">Attendance, leave utilization and exports · {company.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportAttendance}>
            <Download className="h-4 w-4" /> Attendance CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportLeaves}>
            <Download className="h-4 w-4" /> Leaves CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportEmployees}>
            <Download className="h-4 w-4" /> Employees CSV
          </Button>
          <Button variant="navy" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print sheet
          </Button>
        </div>
      </div>

      <Card className="no-print">
        <CardContent className="flex flex-wrap gap-3 p-4">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 hidden border-b border-black pb-4 print-only print:block">
        <h1 className="text-xl font-bold">Daily Attendance Sheet — {company.name}</h1>
        {company.address && <p className="text-sm">{company.address}</p>}
        <p className="text-sm">
          {company.phone && `Ph: ${company.phone} · `}
          {from} to {to}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { l: 'Working days (records)', v: report.present + report.absent + report.leave },
          { l: 'Present', v: report.present },
          { l: 'Absent', v: report.absent },
          { l: 'On Leave', v: report.leave },
          { l: 'Absenteeism', v: `${report.absenteeism}%` },
        ].map(({ l, v }) => (
          <Card key={l} className="border-border/70 shadow-sm">
            <CardContent className="p-4">
              <div className="text-xs text-ink-muted">{l}</div>
              <div className="font-display text-xl font-bold tabular-nums">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="no-print border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Employee Attendance Rates</CardTitle>
            <CardDescription>Present / Absent / Leave with visual rate bars</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportEmpRates}>
            <Download className="h-4 w-4" /> Export rates
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['all', 'All Employees'],
                ['high', '≥90% Present'],
                ['low', '<80% Rate'],
                ['leave', 'Took Leave'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setEmpTab(key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  empTab === key
                    ? 'bg-navy text-white shadow'
                    : 'border border-border bg-surface text-ink-muted hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
            <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                placeholder="Search employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-center">Present</th>
                  <th className="px-4 py-3 text-center">Absent</th>
                  <th className="px-4 py-3 text-center">Leave</th>
                  <th className="min-w-[160px] px-4 py-3">Attendance Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredEmps.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                      No employees match filters.
                    </td>
                  </tr>
                )}
                {filteredEmps.map((e, i) => (
                  <tr key={e.id} className="transition-colors hover:bg-surface/50">
                    <td className="px-4 py-3 text-ink-muted">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal/10 text-[11px] font-bold text-teal">
                          {e.initials}
                        </div>
                        <div>
                          <div className="font-medium text-ink">{e.name}</div>
                          <div className="text-[10px] text-ink-muted">{e.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{e.dept}</td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-emerald-600">{e.present}</td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-red-600">{e.absent}</td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-sky-600">{e.leave}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={cn('h-full rounded-full transition-all', rateBarColor(e.rate))}
                            style={{ width: `${e.rate}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            'w-10 text-right text-xs font-bold tabular-nums',
                            e.rate >= 90 ? 'text-emerald-600' : e.rate >= 80 ? 'text-amber-600' : 'text-red-600'
                          )}
                        >
                          {e.rate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="no-print grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Department attendance</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.byDeptAttendance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="present" fill="#0F766E" name="Present" />
                <Bar dataKey="absent" fill="#DC2626" name="Absent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status mix</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={report.statusPie} dataKey="value" nameKey="name" outerRadius={90} label>
                  {report.statusPie.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Leave utilization by department</CardTitle>
            <CardDescription>Approved leave days in range</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.byDept} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0B1F3A" name="Days" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latecomers</CardTitle>
            <CardDescription>OT this period: {formatMinutes(report.ot)}</CardDescription>
          </CardHeader>
          <CardContent className="max-h-64 space-y-2 overflow-y-auto">
            {report.latecomers.length === 0 && <p className="text-sm text-ink-muted">No late punches in range.</p>}
            {report.latecomers.map((l, i) => (
              <div key={i} className="flex justify-between border-b border-border py-1.5 text-sm">
                <span>{l.name}</span>
                <span className="tabular-nums text-ink-muted">
                  {format(parseISO(l.date), 'dd MMM')} {l.in ? format(parseISO(l.in), 'HH:mm') : ''}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
