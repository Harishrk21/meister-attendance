import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'
import {
  Clock,
  MapPin,
  UserCheck,
  UserX,
  Palmtree,
  Timer,
  Users,
  UserPlus,
  FileBarChart,
  CalendarDays,
  LogIn,
  Activity,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Skeleton } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DayTimeline } from '@/components/attendance/DayTimeline'
import { SetupChecklist } from '@/components/SetupChecklist'
import { useBranding } from '@/hooks/useBranding'
import { formatMinutes, cn } from '@/lib/utils'
import { getLeaveBalance, listLeaveRequests } from '@/lib/services/leaves'
import { listHolidays } from '@/lib/services/shifts'

function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let start: number | null = null
    let raf = 0
    const step = (ts: number) => {
      if (start === null) start = ts
      const p = Math.min(1, (ts - start) / duration)
      setValue(Math.round(target * p))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function PctKpi({
  label,
  value,
  pct,
  icon: Icon,
  gradient,
}: {
  label: string
  value: number
  pct?: string
  icon: React.ComponentType<{ className?: string }>
  gradient: string
}) {
  const n = useCountUp(value)
  return (
    <Card className="animate-kpi overflow-hidden border-border/70 shadow-sm">
      <CardContent className="relative p-5">
        <div className={cn('absolute -right-3 -top-3 h-16 w-16 rounded-full bg-gradient-to-br opacity-15', gradient)} />
        <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow', gradient)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="font-display text-3xl font-black tabular-nums text-navy dark:text-white">{n}</div>
        <div className="mt-0.5 text-xs font-medium text-ink-muted">{label}</div>
        {pct && <div className="mt-1 text-[11px] font-semibold text-teal">{pct}</div>}
      </CardContent>
    </Card>
  )
}

const DONUT_COLORS = ['#059669', '#dc2626', '#0ea5e9', '#d97706']

export function DashboardPage() {
  const { session } = useAuth()
  const { data, loading, bump } = useData()
  const brand = useBranding()
  const [leaveBal, setLeaveBal] = useState<{ Casual: number; Sick: number; Earned: number } | null>(null)
  const [pendingLeaves, setPendingLeaves] = useState(0)
  const [upcomingHolidays, setUpcomingHolidays] = useState<{ name: string; date: string }[]>([])
  const [myPending, setMyPending] = useState(0)

  useEffect(() => {
    if (!session) return
    void getLeaveBalance(session.employeeId).then((b) => {
      if (b) setLeaveBal({ Casual: b.Casual, Sick: b.Sick, Earned: b.Earned })
    })
    void listLeaveRequests({
      status: 'Pending',
      employeeId: session.role !== 'admin' ? session.employeeId : undefined,
    }).then((list) => setPendingLeaves(list.length))
    void listLeaveRequests({ employeeId: session.employeeId, status: 'Pending' }).then((list) =>
      setMyPending(list.length)
    )
    void listHolidays().then((h) => {
      const today = format(new Date(), 'yyyy-MM-dd')
      setUpcomingHolidays(
        h.filter((x) => x.date >= today).slice(0, 4).map((x) => ({ name: x.name, date: x.date }))
      )
    })
  }, [session, data])

  const today = format(new Date(), 'yyyy-MM-dd')

  const stats = useMemo(() => {
    if (!data || !session) return null
    const emps = data.employees.filter((e) => {
      if (e.status !== 'Active') return false
      if (session.role !== 'admin') return e.id === session.employeeId
      return true
    })
    const empIds = new Set(emps.map((e) => e.id))
    const todays = data.attendance.filter((a) => a.date === today && empIds.has(a.employeeId))
    const present = todays.filter((a) => ['Present', 'Late', 'Half-Day'].includes(a.status) && a.clockIn).length
    const late = todays.filter((a) => a.status === 'Late').length
    const absent = todays.filter((a) => a.status === 'Absent').length
    const onLeave = todays.filter((a) => a.status === 'On Leave').length
    const notMarked = Math.max(0, emps.length - present - absent - onLeave)
    const rate = emps.length ? Math.round((present / emps.length) * 1000) / 10 : 0

    const whosIn = todays
      .filter((a) => a.clockIn && !a.clockOut && !['Absent', 'On Leave', 'Holiday'].includes(a.status))
      .map((a) => {
        const emp = data.employees.find((e) => e.id === a.employeeId)
        return { ...a, name: emp?.name ?? '—', dept: emp?.department ?? '' }
      })

    const trend = Array.from({ length: 7 }, (_, i) => {
      const d = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')
      const dayRecs = data.attendance.filter((a) => a.date === d && empIds.has(a.employeeId))
      return {
        day: format(parseISO(d), 'EEE'),
        Present: dayRecs.filter((a) => ['Present', 'Late', 'Half-Day'].includes(a.status)).length,
        Absent: dayRecs.filter((a) => a.status === 'Absent').length,
        Leave: dayRecs.filter((a) => a.status === 'On Leave').length,
      }
    })

    const weekStart = format(subDays(new Date(), 6), 'yyyy-MM-dd')
    const otMinutes = data.attendance
      .filter((a) => a.date >= weekStart && empIds.has(a.employeeId))
      .reduce((sum, a) => sum + Math.max(0, a.totalWorkMinutes - data.settings.overtimeAfterHours * 60), 0)

    const myToday = data.attendance.find((a) => a.employeeId === session.employeeId && a.date === today)
    const monthPrefix = format(new Date(), 'yyyy-MM')
    const myMonthPresent = data.attendance.filter(
      (a) =>
        a.employeeId === session.employeeId &&
        a.date.startsWith(monthPrefix) &&
        ['Present', 'Late', 'Half-Day'].includes(a.status)
    ).length

    const leavesTaken =
      (leaveBal ? 0 : 0) +
      data.leaveRequests
        .filter((l) => l.employeeId === session.employeeId && l.status === 'Approved')
        .reduce((s, l) => s + l.days, 0)

    /* Recent activity from notifications + today's punches */
    const activity: Array<{ id: string; text: string; time: string; tone: string }> = []
    for (const n of data.notifications
      .filter((x) => session.role === 'admin' || x.userId === session.userId)
      .slice(0, 8)) {
      activity.push({
        id: n.id,
        text: n.message || n.title,
        time: format(parseISO(n.createdAt), 'hh:mm a'),
        tone:
          n.type.includes('leave') ? 'bg-sky-100 text-sky-700' :
          n.type.includes('regularization') ? 'bg-amber-100 text-amber-700' :
          'bg-slate-100 text-slate-600',
      })
    }
    for (const a of todays.filter((x) => x.clockIn).slice(0, 5)) {
      const emp = data.employees.find((e) => e.id === a.employeeId)
      activity.unshift({
        id: `punch-${a.id}`,
        text: `${emp?.name ?? 'Employee'} checked in`,
        time: a.clockIn ? format(parseISO(a.clockIn), 'hh:mm a') : '',
        tone: 'bg-emerald-100 text-emerald-700',
      })
    }

    const donut = [
      { name: 'Present', value: present },
      { name: 'Absent', value: absent + notMarked },
      { name: 'On Leave', value: onLeave },
      { name: 'Late', value: late },
    ].filter((x) => x.value > 0)

    return {
      present,
      late,
      absent: absent + notMarked,
      onLeave,
      rate,
      whosIn,
      trend,
      otMinutes,
      myToday,
      myMonthPresent,
      empCount: emps.length,
      leavesTaken,
      activity: activity.slice(0, 10),
      donut,
    }
  }, [data, session, today, leaveBal])

  if (loading || !session || !stats) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    )
  }

  const isAdmin = session.role === 'admin'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  return (
    <div className="animate-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy dark:text-white">
            Good {greeting}, {session.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-ink-muted">
            {[format(new Date(), 'EEEE, d MMMM yyyy'), brand.name, brand.primaryBranch].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {isAdmin && data?.settings.setupCompleted === false && <SetupChecklist data={data} onDone={bump} />}

      {/* ═══════════ EMPLOYEE DASHBOARD ═══════════ */}
      {!isAdmin && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  <LogIn className="h-3.5 w-3.5" /> Today&apos;s Status
                </div>
                <div className="mt-2 font-display text-xl font-bold text-navy dark:text-white">
                  {stats.myToday?.clockIn && !stats.myToday.clockOut
                    ? stats.myToday.isOnBreak
                      ? 'On Break'
                      : 'Present'
                    : stats.myToday?.clockOut
                      ? 'Day Complete'
                      : 'Not clocked in'}
                </div>
                {stats.myToday?.clockIn && (
                  <p className="mt-1 text-xs text-ink-muted">
                    In {format(parseISO(stats.myToday.clockIn), 'hh:mm a')}
                    {stats.myToday.clockOut && ` · Out ${format(parseISO(stats.myToday.clockOut), 'hh:mm a')}`}
                  </p>
                )}
              </CardContent>
            </Card>
            <PctKpi
              label="Hours today"
              value={Math.round((stats.myToday?.totalWorkMinutes ?? 0) / 60)}
              pct={stats.myToday ? formatMinutes(stats.myToday.totalWorkMinutes) : undefined}
              icon={Timer}
              gradient="from-teal-500 to-emerald-600"
            />
            <PctKpi
              label="Present this month"
              value={stats.myMonthPresent}
              icon={UserCheck}
              gradient="from-emerald-500 to-green-600"
            />
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Leave balance</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="muted">CL {leaveBal?.Casual ?? '—'}</Badge>
                  <Badge variant="muted">SL {leaveBal?.Sick ?? '—'}</Badge>
                  <Badge variant="muted">EL {leaveBal?.Earned ?? '—'}</Badge>
                </div>
                <p className="mt-2 text-[11px] text-ink-muted">
                  {stats.leavesTaken} days taken · {myPending} pending
                </p>
              </CardContent>
            </Card>
          </div>

          <DayTimeline record={stats.myToday} />

          {/* Quick actions — colorful grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: '/clock', label: 'Mark Attendance', icon: Clock, grad: 'from-emerald-500 to-teal-600' },
              { to: '/leaves', label: 'Apply Leave', icon: Palmtree, grad: 'from-sky-500 to-blue-600' },
              { to: '/my-attendance', label: 'My Attendance', icon: CalendarDays, grad: 'from-amber-500 to-orange-500' },
              { to: '/profile', label: 'My Profile', icon: Users, grad: 'from-violet-500 to-purple-600' },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]',
                  a.grad
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  <a.icon className="h-5 w-5" />
                </div>
                <span className="font-display text-sm font-bold">{a.label}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* ═══════════ ADMIN DASHBOARD ═══════════ */}
      {isAdmin && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PctKpi
              label="Total Employees"
              value={stats.empCount}
              icon={Users}
              gradient="from-slate-600 to-navy"
            />
            <PctKpi
              label="Present Today"
              value={stats.present}
              pct={`${stats.rate}% attendance`}
              icon={UserCheck}
              gradient="from-emerald-500 to-teal-600"
            />
            <PctKpi
              label="On Leave"
              value={stats.onLeave}
              pct={stats.empCount ? `${Math.round((stats.onLeave / stats.empCount) * 100)}% of team` : undefined}
              icon={Palmtree}
              gradient="from-sky-500 to-blue-600"
            />
            <PctKpi
              label="Absent / Not marked"
              value={stats.absent}
              pct={stats.late ? `${stats.late} late` : undefined}
              icon={UserX}
              gradient="from-red-500 to-rose-600"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Trend chart */}
            <Card className="border-border/70 shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle>Attendance Overview</CardTitle>
                <CardDescription>Present · Absent · Leave · last 7 days</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.trend}>
                    <defs>
                      <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="Present" stroke="#059669" fill="url(#pGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Absent" stroke="#dc2626" fill="transparent" strokeWidth={2} />
                    <Area type="monotone" dataKey="Leave" stroke="#0ea5e9" fill="transparent" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Donut — attendance rate */}
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Attendance Rate</CardTitle>
                <CardDescription>Today&apos;s distribution</CardDescription>
              </CardHeader>
              <CardContent className="relative flex h-56 flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.donut}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {stats.donut.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
                  <div className="font-display text-2xl font-black text-navy dark:text-white">{stats.rate}%</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Present</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Who's in */}
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Who&apos;s in now</CardTitle>
                <CardDescription>Live clocked-in roster</CardDescription>
              </CardHeader>
              <CardContent className="max-h-56 space-y-2 overflow-y-auto">
                {stats.whosIn.length === 0 && <p className="text-sm text-ink-muted">No one clocked in yet.</p>}
                {stats.whosIn.map((w) => (
                  <div key={w.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-ink-muted">{w.dept}</div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-teal">
                      {w.location && <MapPin className="h-3 w-3" />}
                      <Clock className="h-3 w-3" />
                      {w.clockIn ? format(parseISO(w.clockIn), 'HH:mm') : '—'}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recent activity */}
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-teal" /> Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-56 space-y-2.5 overflow-y-auto">
                {stats.activity.length === 0 && <p className="text-sm text-ink-muted">No recent activity.</p>}
                {stats.activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5 text-sm">
                    <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', a.tone)}>
                      {a.time}
                    </span>
                    <span className="text-ink leading-snug">{a.text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Pending + OT */}
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Approvals & OT</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2.5 dark:bg-amber-950/20">
                  <span className="text-sm text-ink-muted">Pending leaves</span>
                  <Badge variant="warning">{pendingLeaves}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
                  <span className="text-sm text-ink-muted">OT this week</span>
                  <span className="font-semibold tabular-nums">{formatMinutes(stats.otMinutes)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
                  <span className="text-sm text-ink-muted">Late today</span>
                  <Badge variant="warning">{stats.late}</Badge>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/leaves">Review leaves</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Admin quick actions */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: '/clock', label: 'Mark Attendance', icon: Clock, grad: 'from-emerald-500 to-teal-600' },
              { to: '/employees', label: 'Add Employee', icon: UserPlus, grad: 'from-blue-500 to-indigo-600' },
              { to: '/leaves', label: 'Leave Requests', icon: Palmtree, grad: 'from-amber-500 to-orange-500' },
              { to: '/reports', label: 'View Reports', icon: FileBarChart, grad: 'from-violet-500 to-purple-600' },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]',
                  a.grad
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  <a.icon className="h-5 w-5" />
                </div>
                <span className="font-display text-sm font-bold">{a.label}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Holidays — both roles */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Upcoming Holidays</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {upcomingHolidays.length === 0 && <p className="text-sm text-ink-muted">No upcoming holidays seeded.</p>}
          {upcomingHolidays.map((h) => (
            <Badge key={h.date + h.name} variant="muted" className="px-3 py-1.5">
              {format(parseISO(h.date), 'dd MMM')} · {h.name}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
