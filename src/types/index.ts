export type Role = 'admin' | 'manager' | 'employee'
/** Branch names are defined per company in Settings. */
export type Branch = string
/** Departments are free text per company; these are suggestions for new ones. */
export type Department = string
export const SUGGESTED_DEPARTMENTS = ['Sales', 'Operations', 'Service/Engineering', 'Warehouse', 'Admin/Desk', 'Accounts', 'Management']
export type EmployeeStatus = 'Active' | 'Inactive'
export type WorkMode = 'Office' | 'Field' | 'WFH'
export type AttendanceStatus = 'Present' | 'Late' | 'Absent' | 'Half-Day' | 'On Leave' | 'Holiday'
export type LeaveType = 'Casual' | 'Sick' | 'Earned' | 'Comp-Off' | 'Unpaid'
export type LeaveRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
export type NotificationType =
  | 'leave_pending'
  | 'leave_result'
  | 'clock_reminder'
  | 'system'
  | 'regularization_pending'
  | 'regularization_result'

export type RegularizationType =
  | 'missed_punch'
  | 'missing_clock_in'
  | 'missing_clock_out'
  | 'wrong_time'
  | 'other'

export interface RegularizationRequest {
  id: string
  employeeId: string
  workDate: string
  requestType: RegularizationType
  proposedClockIn?: string
  proposedClockOut?: string
  proposedWorkMode?: WorkMode
  reason: string
  status: LeaveRequestStatus
  approverId?: string
  approverComment?: string
  attendanceId?: string
  createdAt: string
  updatedAt: string
}

export interface OnDutyRequest {
  id: string
  employeeId: string
  from: string
  to: string
  locationLabel?: string
  purpose: string
  status: LeaveRequestStatus
  approverId?: string
  approverComment?: string
  createdAt: string
  updatedAt: string
}

export interface Tenant {
  id: string
  slug: string
  name: string
  timezone: string
  logoUrl?: string
  primaryColor?: string
}

export interface SessionAuth {
  userId: string
  email: string
  role: Role
  employeeId: string
  name: string
  branch: Branch
  loggedInAt: string
}

export interface User {
  id: string
  email: string
  password: string
  role: Role
  employeeId: string
}

export interface Employee {
  id: string
  employeeCode: string
  name: string
  email: string
  phone: string
  role: Role
  department: Department
  branch: Branch
  shiftId: string
  joinDate: string
  status: EmployeeStatus
  avatarInitials: string
  managerId?: string
}

export interface BreakEntry {
  id: string
  start: string
  end?: string
}

export interface GeoLocation {
  lat: number
  lng: number
  capturedAt: string
}

export interface AttendanceRecord {
  id: string
  date: string
  employeeId: string
  clockIn?: string
  clockOut?: string
  breaks: BreakEntry[]
  totalWorkMinutes: number
  totalBreakMinutes: number
  status: AttendanceStatus
  workMode?: WorkMode
  activity?: string
  location?: GeoLocation
  notes?: string
  earlyLeaveNote?: string
  branch: Branch
  isOnBreak?: boolean
}

export interface LeaveBalance {
  employeeId: string
  Casual: number
  Sick: number
  Earned: number
  'Comp-Off': number
  Unpaid: number
}

export interface LeaveRequest {
  id: string
  employeeId: string
  type: LeaveType
  from: string
  to: string
  halfDay: boolean
  halfDayPeriod?: 'AM' | 'PM'
  reason: string
  attachmentNote?: string
  status: LeaveRequestStatus
  approverId?: string
  approverComment?: string
  createdAt: string
  updatedAt: string
  days: number
}

export interface Shift {
  id: string
  name: string
  start: string
  end: string
  graceMinutes: number
  weeklyOff: number[]
}

export interface Holiday {
  id: string
  name: string
  date: string
  branches: Branch[] | 'All'
  recurring?: boolean
}

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  createdAt: string
  link?: string
}

export interface CompanySettings {
  name: string
  tagline: string
  address: string
  phone: string
  email: string
  website: string
  branches: Branch[]
  gracePeriodMinutes: number
  halfDayThresholdHours: number
  overtimeAfterHours: number
  requireNoteForEarlyLeave: boolean
  geofenceEnabled?: boolean
  geofenceLat?: number | null
  geofenceLng?: number | null
  geofenceRadiusM?: number
  activities?: string[]
  timezone?: string
  logoUrl?: string
  /** #RRGGBB brand colour for buttons, links and highlights. */
  primaryColor?: string
  /** Auto-generated employee codes look like PREFIX-0001. */
  employeeCodePrefix?: string
  /** False until a new client's admin finishes the setup checklist. Absent in demo data. */
  setupCompleted?: boolean
  seatLimit?: number
}

export const DEFAULT_ACTIVITIES = [
  'Field Service',
  'Installation',
  'AMC Visit',
  'Sales Visit',
  'Office Work',
  'Meeting',
  'Travel',
]

export interface AppTheme {
  mode: 'light' | 'dark'
}

export interface AppData {
  users: User[]
  employees: Employee[]
  attendance: AttendanceRecord[]
  leaveBalances: LeaveBalance[]
  leaveRequests: LeaveRequest[]
  regularizationRequests: RegularizationRequest[]
  onDutyRequests: OnDutyRequest[]
  shifts: Shift[]
  holidays: Holiday[]
  notifications: Notification[]
  settings: CompanySettings
  seededAt: string
}

export const DEMO_PASSWORD = 'Demo@12345'

export const STORAGE_KEYS = {
  DATA: 'attendance_data',
  SESSION: 'attendance_session',
  THEME: 'attendance_theme',
} as const
