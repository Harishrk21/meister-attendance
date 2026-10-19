// Response contracts. Field names match the SPA's src/types so the UI consumes them unchanged.

export type Role = 'admin' | 'manager' | 'employee'
export type WorkMode = 'Office' | 'Field' | 'WFH'
export type AttendanceStatus = 'Present' | 'Late' | 'Absent' | 'Half-Day' | 'On Leave' | 'Holiday'
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
export type RegularizationType = 'missed_punch' | 'missing_clock_in' | 'missing_clock_out' | 'wrong_time' | 'other'

export const ROLES = ['admin', 'manager', 'employee'] as const satisfies readonly Role[]
export const WORK_MODES = ['Office', 'Field', 'WFH'] as const satisfies readonly WorkMode[]
export const ATTENDANCE_STATUSES = [
  'Present',
  'Late',
  'Absent',
  'Half-Day',
  'On Leave',
  'Holiday',
] as const satisfies readonly AttendanceStatus[]
export const REQUEST_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'] as const satisfies readonly RequestStatus[]
export const REGULARIZATION_TYPES = [
  'missed_punch',
  'missing_clock_in',
  'missing_clock_out',
  'wrong_time',
  'other',
] as const satisfies readonly RegularizationType[]

export interface TenantDto {
  id: string
  slug: string
  name: string
  timezone: string
  logoUrl?: string
  primaryColor?: string
}

export interface SessionDto {
  userId: string
  email: string
  role: Role
  employeeId: string
  name: string
  branch: string
  loggedInAt: string
}

export interface AuthResponse {
  token: string
  session: SessionDto
  tenant: TenantDto
}

export interface EmployeeDto {
  id: string
  employeeCode: string
  externalRef?: string
  name: string
  email: string
  phone: string
  role: Role
  department: string
  branch: string
  shiftId: string
  joinDate: string
  status: 'Active' | 'Inactive'
  avatarInitials: string
  managerId?: string
}

export interface BreakDto {
  id: string
  start: string
  end?: string
}

export interface AttendanceDto {
  id: string
  date: string
  employeeId: string
  clockIn?: string
  clockOut?: string
  breaks: BreakDto[]
  totalWorkMinutes: number
  totalBreakMinutes: number
  status: AttendanceStatus
  workMode?: WorkMode
  activity?: string
  location?: { lat: number; lng: number; capturedAt: string }
  notes?: string
  earlyLeaveNote?: string
  branch: string
  isOnBreak?: boolean
}

export type LeaveBalanceDto = { employeeId: string } & Record<string, number | string>

export interface LeaveRequestDto {
  id: string
  employeeId: string
  type: string
  from: string
  to: string
  halfDay: boolean
  halfDayPeriod?: 'AM' | 'PM'
  reason: string
  attachmentNote?: string
  status: RequestStatus
  approverId?: string
  approverComment?: string
  createdAt: string
  updatedAt: string
  days: number
}

export interface RegularizationDto {
  id: string
  employeeId: string
  workDate: string
  requestType: RegularizationType
  proposedClockIn?: string
  proposedClockOut?: string
  proposedWorkMode?: WorkMode
  reason: string
  status: RequestStatus
  approverId?: string
  approverComment?: string
  attendanceId?: string
  createdAt: string
  updatedAt: string
}

export interface OnDutyDto {
  id: string
  employeeId: string
  from: string
  to: string
  locationLabel?: string
  purpose: string
  status: RequestStatus
  approverId?: string
  approverComment?: string
  createdAt: string
  updatedAt: string
}

export interface ShiftDto {
  id: string
  name: string
  start: string
  end: string
  graceMinutes: number
  weeklyOff: number[]
}

export interface HolidayDto {
  id: string
  name: string
  date: string
  branches: string[] | 'All'
  recurring?: boolean
}

export interface NotificationDto {
  id: string
  userId: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
  link?: string
}

export interface SettingsDto {
  name: string
  tagline: string
  address: string
  phone: string
  email: string
  website: string
  branches: string[]
  gracePeriodMinutes: number
  halfDayThresholdHours: number
  overtimeAfterHours: number
  requireNoteForEarlyLeave: boolean
  timezone: string
  logoUrl?: string
  primaryColor?: string
  activities?: string[]
  employeeCodePrefix?: string
  setupCompleted: boolean
  seatLimit?: number
}

export function iso(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString() : undefined
}

export function opt<T>(v: T | null | undefined): T | undefined {
  return v ?? undefined
}
