import { addDays, format, subDays, setHours, setMinutes, getDay, isSunday, differenceInCalendarDays } from 'date-fns'
import { v4 as uuid } from 'uuid'
import type {
  AppData,
  AttendanceRecord,
  AttendanceStatus,
  Branch,
  BreakEntry,
  Employee,
  Holiday,
  LeaveBalance,
  LeaveRequest,
  Notification,
  OnDutyRequest,
  RegularizationRequest,
  Shift,
  User,
  WorkMode,
} from '@/types'
import { DEMO_PASSWORD } from '@/types'
import { initials, parseTimeToMinutes } from '@/lib/utils'

const year = new Date().getFullYear()

export const DEFAULT_SHIFTS: Shift[] = [
  { id: 'shift-office', name: 'Office', start: '09:30', end: '18:30', graceMinutes: 15, weeklyOff: [0] },
  { id: 'shift-field', name: 'Field', start: '09:00', end: '18:00', graceMinutes: 15, weeklyOff: [0] },
  { id: 'shift-warehouse', name: 'Warehouse', start: '09:00', end: '17:30', graceMinutes: 15, weeklyOff: [0] },
]

const employeeDefs: Array<Omit<Employee, 'id' | 'avatarInitials'> & { password?: string }> = [
  {
    employeeCode: 'HMS-CHN-001',
    name: 'Arun Kumar',
    email: 'admin@hmsenterprises.in',
    phone: '9952959595',
    role: 'admin',
    department: 'Admin/Desk',
    branch: 'Chennai',
    shiftId: 'shift-office',
    joinDate: `${year - 8}-04-12`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-002',
    name: 'Priya Subramaniam',
    email: 'manager.chennai@hmsenterprises.in',
    phone: '9840011223',
    role: 'manager',
    department: 'Service/Engineering',
    branch: 'Chennai',
    shiftId: 'shift-office',
    joinDate: `${year - 5}-06-01`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-003',
    name: 'Suresh Babu',
    email: 'engineer1@hmsenterprises.in',
    phone: '9003112233',
    role: 'employee',
    department: 'Service/Engineering',
    branch: 'Chennai',
    shiftId: 'shift-field',
    joinDate: `${year - 3}-08-20`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-004',
    name: 'Vignesh M',
    email: 'engineer2@hmsenterprises.in',
    phone: '9003445566',
    role: 'employee',
    department: 'Service/Engineering',
    branch: 'Chennai',
    shiftId: 'shift-field',
    joinDate: `${year - 2}-11-05`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-005',
    name: 'Lakshmi Narayanan',
    email: 'desk@hmsenterprises.in',
    phone: '9884012345',
    role: 'employee',
    department: 'Admin/Desk',
    branch: 'Chennai',
    shiftId: 'shift-office',
    joinDate: `${year - 6}-01-10`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-006',
    name: 'Murugan Selvam',
    email: 'warehouse@hmsenterprises.in',
    phone: '9790011122',
    role: 'employee',
    department: 'Warehouse',
    branch: 'Chennai',
    shiftId: 'shift-warehouse',
    joinDate: `${year - 4}-09-18`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-007',
    name: 'Deepa Krishnan',
    email: 'deepa.accounts@hmsenterprises.in',
    phone: '9884477110',
    role: 'employee',
    department: 'Accounts',
    branch: 'Chennai',
    shiftId: 'shift-office',
    joinDate: `${year - 3}-03-22`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-008',
    name: 'Rahul Menon',
    email: 'rahul.sales@hmsenterprises.in',
    phone: '9003789456',
    role: 'employee',
    department: 'Sales',
    branch: 'Chennai',
    shiftId: 'shift-field',
    joinDate: `${year - 2}-05-14`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-009',
    name: 'Anitha R',
    email: 'anitha.service@hmsenterprises.in',
    phone: '9840123456',
    role: 'employee',
    department: 'Service/Engineering',
    branch: 'Chennai',
    shiftId: 'shift-field',
    joinDate: `${year - 1}-07-01`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-010',
    name: 'Mohammed Irfan',
    email: 'irfan.sales@hmsenterprises.in',
    phone: '9677012345',
    role: 'employee',
    department: 'Sales',
    branch: 'Chennai',
    shiftId: 'shift-field',
    joinDate: `${year - 2}-01-20`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-011',
    name: 'Shalini Devi',
    email: 'shalini.desk@hmsenterprises.in',
    phone: '9789012345',
    role: 'employee',
    department: 'Admin/Desk',
    branch: 'Chennai',
    shiftId: 'shift-office',
    joinDate: `${year - 3}-10-08`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-012',
    name: 'Ganesh Kumar',
    email: 'ganesh.eng@hmsenterprises.in',
    phone: '9092012345',
    role: 'employee',
    department: 'Service/Engineering',
    branch: 'Chennai',
    shiftId: 'shift-field',
    joinDate: `${year - 1}-04-12`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-013',
    name: 'Nithya S',
    email: 'nithya.warehouse@hmsenterprises.in',
    phone: '9444012345',
    role: 'employee',
    department: 'Warehouse',
    branch: 'Chennai',
    shiftId: 'shift-warehouse',
    joinDate: `${year - 2}-12-01`,
    status: 'Active',
  },
  {
    employeeCode: 'HMS-CHN-014',
    name: 'Karthik Rajan',
    email: 'karthik.sales@hmsenterprises.in',
    phone: '9840099887',
    role: 'employee',
    department: 'Sales',
    branch: 'Chennai',
    shiftId: 'shift-field',
    joinDate: `${year - 4}-02-15`,
    status: 'Active',
  },
]

function buildHolidays(): Holiday[] {
  return [
    { id: uuid(), name: 'Republic Day', date: `${year}-01-26`, branches: 'All' },
    { id: uuid(), name: 'Pongal', date: `${year}-01-15`, branches: 'All' },
    { id: uuid(), name: 'Thiruvalluvar Day', date: `${year}-01-16`, branches: 'All' },
    { id: uuid(), name: 'Good Friday', date: `${year}-04-18`, branches: 'All' },
    { id: uuid(), name: 'May Day', date: `${year}-05-01`, branches: 'All' },
    { id: uuid(), name: 'Independence Day', date: `${year}-08-15`, branches: 'All' },
    { id: uuid(), name: 'Vinayagar Chaturthi', date: `${year}-08-27`, branches: 'All' },
    { id: uuid(), name: 'Gandhi Jayanti', date: `${year}-10-02`, branches: 'All' },
    { id: uuid(), name: 'Diwali', date: `${year}-10-20`, branches: 'All' },
    { id: uuid(), name: 'Christmas', date: `${year}-12-25`, branches: 'All' },
    { id: uuid(), name: 'HMS Founding Day', date: `${year}-06-10`, branches: 'All' },
  ]
}

function isHolidayDate(dateStr: string, branch: Branch, holidays: Holiday[]): boolean {
  return holidays.some((h) => {
    if (h.date !== dateStr) return false
    if (h.branches === 'All') return true
    return h.branches.includes(branch)
  })
}

function hashSeed(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

function pickWorkMode(emp: Employee, n: number): WorkMode {
  if (emp.department === 'Warehouse' || emp.department === 'Admin/Desk' || emp.department === 'Accounts') return 'Office'
  if (emp.department === 'Service/Engineering') return n % 5 === 0 ? 'WFH' : 'Field'
  return n % 4 === 0 ? 'Office' : 'Field'
}

const ACTIVITIES_BY_DEPT: Record<string, string[]> = {
  'Service/Engineering': ['Field Service', 'Installation', 'AMC Visit'],
  Sales: ['Sales Visit', 'Meeting', 'Travel'],
  Warehouse: ['Office Work'],
  'Admin/Desk': ['Office Work', 'Meeting'],
  Accounts: ['Office Work'],
}

function pickActivity(emp: Employee, n: number): string {
  const list = ACTIVITIES_BY_DEPT[emp.department] ?? ['Office Work']
  return list[n % list.length]!
}

function buildAttendance(
  employees: Employee[],
  shifts: Shift[],
  holidays: Holiday[],
  leaveDays: Map<string, Set<string>>
): AttendanceRecord[] {
  const records: AttendanceRecord[] = []
  const today = new Date()
  const days = 40

  for (let d = days; d >= 0; d--) {
    const date = subDays(today, d)
    const dateStr = format(date, 'yyyy-MM-dd')
    const sunday = isSunday(date)

    for (const emp of employees) {
      if (emp.status !== 'Active') continue
      const shift = shifts.find((s) => s.id === emp.shiftId) ?? shifts[0]
      const holiday = isHolidayDate(dateStr, emp.branch, holidays)
      const onLeave = leaveDays.get(emp.id)?.has(dateStr)

      if (sunday || holiday) {
        if (holiday) {
          records.push({
            id: uuid(),
            date: dateStr,
            employeeId: emp.id,
            breaks: [],
            totalWorkMinutes: 0,
            totalBreakMinutes: 0,
            status: 'Holiday',
            branch: emp.branch,
          })
        }
        continue
      }

      if (onLeave) {
        records.push({
          id: uuid(),
          date: dateStr,
          employeeId: emp.id,
          breaks: [],
          totalWorkMinutes: 0,
          totalBreakMinutes: 0,
          status: 'On Leave',
          branch: emp.branch,
          notes: 'Approved leave',
        })
        continue
      }

      // Skip generating "today" open punches randomly for variety — some present, some not
      const seed = hashSeed(`${emp.id}-${dateStr}`)
      const roll = seed % 100

      // ~6% absent
      if (roll < 6 && d > 0) {
        records.push({
          id: uuid(),
          date: dateStr,
          employeeId: emp.id,
          breaks: [],
          totalWorkMinutes: 0,
          totalBreakMinutes: 0,
          status: 'Absent',
          branch: emp.branch,
        })
        continue
      }

      const late = roll >= 6 && roll < 22
      const halfDay = roll >= 22 && roll < 28
      const startMin = parseTimeToMinutes(shift.start)
      const grace = shift.graceMinutes
      const clockInOffset = late ? grace + 5 + (seed % 40) : -(seed % 12)
      const clockInMin = startMin + clockInOffset
      const inH = Math.floor(clockInMin / 60)
      const inM = clockInMin % 60
      let clockIn = setMinutes(setHours(date, inH), inM)

      const breakLen = 30 + (seed % 20)
      const breakStartMin = clockInMin + 180 + (seed % 40)
      const breaks: BreakEntry[] = [
        {
          id: uuid(),
          start: setMinutes(setHours(date, Math.floor(breakStartMin / 60)), breakStartMin % 60).toISOString(),
          end: setMinutes(
            setHours(date, Math.floor((breakStartMin + breakLen) / 60)),
            (breakStartMin + breakLen) % 60
          ).toISOString(),
        },
      ]

      let clockOut: Date | undefined
      let workMins = 0
      let status: AttendanceStatus = late ? 'Late' : 'Present'

      if (d === 0 && roll % 3 === 0) {
        // still clocked in today
        workMins = Math.max(0, Math.floor((Date.now() - clockIn.getTime()) / 60000) - breakLen)
        records.push({
          id: uuid(),
          date: dateStr,
          employeeId: emp.id,
          clockIn: clockIn.toISOString(),
          breaks,
          totalWorkMinutes: workMins,
          totalBreakMinutes: breakLen,
          status,
          workMode: pickWorkMode(emp, seed),
          activity: pickActivity(emp, seed),
          branch: emp.branch,
          location:
            seed % 4 === 0
              ? { lat: 13.005 + (seed % 100) / 10000, lng: 80.22 + (seed % 80) / 10000, capturedAt: clockIn.toISOString() }
              : undefined,
          isOnBreak: false,
        })
        continue
      }

      const endMin = parseTimeToMinutes(shift.end)
      let outOffset = halfDay ? -(180 + (seed % 60)) : 5 + (seed % 45)
      if (halfDay) status = 'Half-Day'
      const clockOutMin = endMin + outOffset
      clockOut = setMinutes(setHours(date, Math.floor(clockOutMin / 60)), clockOutMin % 60)
      workMins = Math.max(0, Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000) - breakLen)

      records.push({
        id: uuid(),
        date: dateStr,
        employeeId: emp.id,
        clockIn: clockIn.toISOString(),
        clockOut: clockOut.toISOString(),
        breaks,
        totalWorkMinutes: workMins,
        totalBreakMinutes: breakLen,
        status,
        workMode: pickWorkMode(emp, seed),
        activity: pickActivity(emp, seed),
        branch: emp.branch,
        notes: late && seed % 3 === 0 ? 'Traffic on GST road' : undefined,
        location:
          seed % 5 === 0
            ? {
                lat: 13.01,
                lng: 80.23,
                capturedAt: clockIn.toISOString(),
              }
            : undefined,
      })
    }
  }

  return records
}

function buildLeaves(employees: Employee[]): { requests: LeaveRequest[]; leaveDays: Map<string, Set<string>> } {
  const leaveDays = new Map<string, Set<string>>()
  const requests: LeaveRequest[] = []
  const today = new Date()
  const byEmail = Object.fromEntries(employees.map((e) => [e.email, e]))

  const specs: Array<{
    email: string
    type: LeaveRequest['type']
    fromOffset: number
    days: number
    status: LeaveRequest['status']
    reason: string
    halfDay?: boolean
  }> = [
    { email: 'engineer1@hmsenterprises.in', type: 'Casual', fromOffset: -12, days: 1, status: 'Approved', reason: 'Family function' },
    { email: 'engineer2@hmsenterprises.in', type: 'Sick', fromOffset: -8, days: 2, status: 'Approved', reason: 'Fever' },
    { email: 'desk@hmsenterprises.in', type: 'Earned', fromOffset: -20, days: 3, status: 'Approved', reason: 'Personal travel' },
    { email: 'warehouse@hmsenterprises.in', type: 'Casual', fromOffset: 2, days: 1, status: 'Pending', reason: 'Bank work' },
    { email: 'rahul.sales@hmsenterprises.in', type: 'Comp-Off', fromOffset: 5, days: 1, status: 'Pending', reason: 'Worked Sunday service call' },
    { email: 'shalini.desk@hmsenterprises.in', type: 'Casual', fromOffset: 1, days: 1, status: 'Pending', reason: 'Medical checkup', halfDay: true },
    { email: 'ganesh.eng@hmsenterprises.in', type: 'Sick', fromOffset: -3, days: 1, status: 'Rejected', reason: 'Stomach pain' },
    { email: 'anitha.service@hmsenterprises.in', type: 'Unpaid', fromOffset: -15, days: 1, status: 'Approved', reason: 'Extended leave need' },
    { email: 'deepa.accounts@hmsenterprises.in', type: 'Earned', fromOffset: 10, days: 2, status: 'Pending', reason: 'Wedding in family' },
    { email: 'irfan.sales@hmsenterprises.in', type: 'Casual', fromOffset: -5, days: 1, status: 'Approved', reason: 'Temple visit' },
  ]

  for (const s of specs) {
    const emp = byEmail[s.email]
    if (!emp) continue
    const from = format(addDays(today, s.fromOffset), 'yyyy-MM-dd')
    const to = format(addDays(today, s.fromOffset + s.days - 1), 'yyyy-MM-dd')
    const days = s.halfDay ? 0.5 : differenceInCalendarDays(new Date(to), new Date(from)) + 1
    const req: LeaveRequest = {
      id: uuid(),
      employeeId: emp.id,
      type: s.type,
      from,
      to,
      halfDay: !!s.halfDay,
      halfDayPeriod: s.halfDay ? 'AM' : undefined,
      reason: s.reason,
      status: s.status,
      createdAt: addDays(today, s.fromOffset - 3).toISOString(),
      updatedAt: addDays(today, Math.min(s.fromOffset - 1, 0)).toISOString(),
      days,
      approverComment: s.status === 'Rejected' ? 'Insufficient documentation — please reapply' : s.status === 'Approved' ? 'Approved' : undefined,
    }
    requests.push(req)

    if (s.status === 'Approved') {
      if (!leaveDays.has(emp.id)) leaveDays.set(emp.id, new Set())
      for (let i = 0; i < s.days; i++) {
        const ds = format(addDays(new Date(from), i), 'yyyy-MM-dd')
        if (getDay(new Date(ds)) !== 0) leaveDays.get(emp.id)!.add(ds)
      }
    }
  }

  return { requests, leaveDays }
}

function buildBalances(employees: Employee[]): LeaveBalance[] {
  return employees.map((e) => ({
    employeeId: e.id,
    Casual: 8,
    Sick: 6,
    Earned: 12,
    'Comp-Off': 2,
    Unpaid: 0,
  }))
}

function buildNotifications(users: User[], leaveRequests: LeaveRequest[], employees: Employee[]): Notification[] {
  const notifications: Notification[] = []
  const empMap = Object.fromEntries(employees.map((e) => [e.id, e]))
  const pending = leaveRequests.filter((l) => l.status === 'Pending')

  for (const user of users.filter((u) => u.role === 'admin')) {
    for (const lr of pending) {
      const emp = empMap[lr.employeeId]
      if (!emp) continue
      notifications.push({
        id: uuid(),
        userId: user.id,
        type: 'leave_pending',
        title: 'Leave approval pending',
        message: `${emp.name} requested ${lr.type} leave (${lr.from} → ${lr.to})`,
        read: false,
        createdAt: lr.createdAt,
        link: '/leaves',
      })
    }
  }

  for (const lr of leaveRequests.filter((l) => l.status === 'Approved' || l.status === 'Rejected')) {
    const user = users.find((u) => u.employeeId === lr.employeeId)
    if (!user) continue
    notifications.push({
      id: uuid(),
      userId: user.id,
      type: 'leave_result',
      title: `Leave ${lr.status.toLowerCase()}`,
      message: `Your ${lr.type} leave from ${lr.from} was ${lr.status.toLowerCase()}.`,
      read: false,
      createdAt: lr.updatedAt,
      link: '/leaves',
    })
  }

  const engUser = users.find((u) => u.email === 'engineer1@hmsenterprises.in')
  if (engUser) {
    notifications.push({
      id: uuid(),
      userId: engUser.id,
      type: 'clock_reminder',
      title: 'Clock-in reminder',
      message: 'Remember to clock in when you reach the first service call.',
      read: false,
      createdAt: new Date().toISOString(),
      link: '/clock',
    })
  }

  return notifications
}

export function createSeedData(): AppData {
  const shifts = DEFAULT_SHIFTS
  const holidays = buildHolidays()

  const managerId = uuid()

  const employees: Employee[] = employeeDefs.map((def) => {
    const id = def.email === 'manager.chennai@hmsenterprises.in' ? managerId : uuid()
    return {
      ...def,
      id,
      avatarInitials: initials(def.name),
      managerId:
        def.role === 'admin' || def.email === 'manager.chennai@hmsenterprises.in' ? undefined : managerId,
    }
  })

  const users: User[] = employees.map((e) => ({
    id: uuid(),
    email: e.email,
    password: DEMO_PASSWORD,
    role: e.role,
    employeeId: e.id,
  }))

  const { requests, leaveDays } = buildLeaves(employees)
  const attendance = buildAttendance(employees, shifts, holidays, leaveDays)
  const leaveBalances = buildBalances(employees)

  // Deduct approved leave from balances roughly
  for (const lr of requests.filter((r) => r.status === 'Approved' && r.type !== 'Unpaid')) {
    const bal = leaveBalances.find((b) => b.employeeId === lr.employeeId)
    if (!bal) continue
    bal[lr.type] = Math.max(0, bal[lr.type] - lr.days)
  }

  const notifications = buildNotifications(users, requests, employees)

  // Sample regularization: forgotten punch concern
  const eng1 = employees.find((e) => e.email === 'engineer1@hmsenterprises.in')
  const eng2 = employees.find((e) => e.email === 'engineer2@hmsenterprises.in')
  const regularizationRequests: RegularizationRequest[] = []
  if (eng1) {
    const forgotDate = format(subDays(new Date(), 2), 'yyyy-MM-dd')
    regularizationRequests.push({
      id: uuid(),
      employeeId: eng1.id,
      workDate: forgotDate,
      requestType: 'missed_punch',
      proposedClockIn: `${forgotDate}T09:15:00.000Z`,
      proposedClockOut: `${forgotDate}T18:05:00.000Z`,
      proposedWorkMode: 'Field',
      reason: 'Forgot to clock in — was on AMC call at customer site from morning.',
      status: 'Pending',
      createdAt: subDays(new Date(), 1).toISOString(),
      updatedAt: subDays(new Date(), 1).toISOString(),
    })
  }
  if (eng2) {
    const fixedDate = format(subDays(new Date(), 6), 'yyyy-MM-dd')
    regularizationRequests.push({
      id: uuid(),
      employeeId: eng2.id,
      workDate: fixedDate,
      requestType: 'missing_clock_out',
      proposedClockIn: `${fixedDate}T09:05:00.000Z`,
      proposedClockOut: `${fixedDate}T18:20:00.000Z`,
      proposedWorkMode: 'Field',
      reason: 'Phone battery died before clock-out.',
      status: 'Approved',
      approverComment: 'Approved — verified with manager call log',
      createdAt: subDays(new Date(), 5).toISOString(),
      updatedAt: subDays(new Date(), 5).toISOString(),
    })
  }

  const onDutyRequests: OnDutyRequest[] = eng1
    ? [
        {
          id: uuid(),
          employeeId: eng1.id,
          from: format(addDays(new Date(), 3), 'yyyy-MM-dd'),
          to: format(addDays(new Date(), 3), 'yyyy-MM-dd'),
          locationLabel: 'Customer site — Guindy',
          purpose: 'Weighing scale installation & calibration',
          status: 'Pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]
    : []

  // Notify managers of pending regularization
  for (const user of users.filter((u) => u.role === 'admin')) {
    for (const r of regularizationRequests.filter((x) => x.status === 'Pending')) {
      const emp = employees.find((e) => e.id === r.employeeId)
      notifications.push({
        id: uuid(),
        userId: user.id,
        type: 'regularization_pending',
        title: 'Regularization pending',
        message: `${emp?.name ?? 'Employee'} forgot to mark attendance on ${r.workDate}`,
        read: false,
        createdAt: r.createdAt,
        link: '/my-attendance?tab=regularization',
      })
    }
  }

  return {
    users,
    employees,
    attendance,
    leaveBalances,
    leaveRequests: requests,
    regularizationRequests,
    onDutyRequests,
    shifts,
    holidays,
    notifications,
    settings: {
      name: 'HMS Enterprises',
      tagline: 'Attendance Portal',
      address: '93/4, Jeenis Road, Saidapet, Chennai - 600 015',
      phone: '99529 59595 / 99529 49494',
      email: 'sales@hmsenterprises.in',
      website: 'https://www.hmsenterprises.in',
      branches: ['Chennai'],
      logoUrl: '/hms-logo.png',
      primaryColor: '#0f766e',
      employeeCodePrefix: 'HMS-CHN',
      gracePeriodMinutes: 15,
      halfDayThresholdHours: 4.5,
      overtimeAfterHours: 9,
      requireNoteForEarlyLeave: true,
    },
    seededAt: new Date().toISOString(),
  }
}

export const DEMO_ACCOUNTS = [
  { email: 'admin@hmsenterprises.in', role: 'Admin', branch: 'Chennai HO' },
  { email: 'manager.chennai@hmsenterprises.in', role: 'Manager', branch: 'Service' },
  { email: 'engineer1@hmsenterprises.in', role: 'Employee', branch: 'Field Engineer' },
  { email: 'engineer2@hmsenterprises.in', role: 'Employee', branch: 'Field Engineer' },
  { email: 'desk@hmsenterprises.in', role: 'Employee', branch: 'Front Desk' },
  { email: 'warehouse@hmsenterprises.in', role: 'Employee', branch: 'Warehouse' },
] as const
