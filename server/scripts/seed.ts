import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createSeedData } from '@/data/seed.ts'
import { DEMO_PASSWORD } from '@/types/index.ts'
import { closePool, exec, getPool, one, withTx, type Db } from '../src/db.ts'

const TENANT_SLUG = process.env.SEED_TENANT_SLUG ?? 'hms'
const TIMEZONE = 'Asia/Kolkata'
const RESET = process.argv.includes('--reset')

const LEAVE_TYPES = [
  { code: 'Casual', name: 'Casual Leave', quota: 8, paid: true },
  { code: 'Sick', name: 'Sick Leave', quota: 6, paid: true },
  { code: 'Earned', name: 'Earned Leave', quota: 12, paid: true },
  { code: 'Comp-Off', name: 'Compensatory Off', quota: 2, paid: true },
  { code: 'Unpaid', name: 'Unpaid Leave', quota: 0, paid: false },
] as const

const CHUNK = 500

async function insertMany(db: Db, table: string, columns: string[], values: unknown[][]) {
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK)
    if (chunk.length) await exec(db, `INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`, [chunk])
  }
}

const dt = (iso?: string) => (iso ? new Date(iso) : null)

async function removeTenant(db: Db, tenantId: string) {
  // Employees first: their cascade clears users, attendance, requests and balances before
  // the tenant cascade removes departments, branches, shifts and leave types they reference.
  await exec(db, 'UPDATE employees SET manager_id = NULL WHERE tenant_id = ?', [tenantId])
  await exec(db, 'DELETE FROM employees WHERE tenant_id = ?', [tenantId])
  await exec(db, 'DELETE FROM tenants WHERE id = ?', [tenantId])
}

async function main() {
  const pool = getPool()
  const existing = await one<{ id: string }>(pool, 'SELECT id FROM tenants WHERE slug = ?', [TENANT_SLUG])
  if (existing && !RESET) {
    console.log(`Tenant "${TENANT_SLUG}" already exists. Re-run with --reset to wipe and reseed it.`)
    return
  }

  const data = createSeedData()
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const tenantId = randomUUID()

  await withTx(async (db) => {
    if (existing) await removeTenant(db, existing.id)

    await exec(db, "INSERT INTO tenants (id, slug, name, status, timezone) VALUES (?, ?, ?, 'active', ?)", [
      tenantId,
      TENANT_SLUG,
      data.settings.name,
      TIMEZONE,
    ])
    const s = data.settings
    await exec(
      db,
      `INSERT INTO tenant_settings
         (tenant_id, display_name, tagline, address, phone, email, website, logo_url, primary_color,
          employee_code_prefix, setup_completed_at, grace_period_minutes,
          half_day_threshold_hours, overtime_after_hours, require_note_for_early_leave)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), ?, ?, ?, ?)`,
      [
        tenantId, s.name, s.tagline, s.address, s.phone, s.email, s.website,
        s.logoUrl ?? null, s.primaryColor ?? null, s.employeeCodePrefix ?? null,
        s.gracePeriodMinutes, s.halfDayThresholdHours, s.overtimeAfterHours, s.requireNoteForEarlyLeave ? 1 : 0,
      ]
    )

    const branchIds = new Map(s.branches.map((name) => [name as string, randomUUID()]))
    await insertMany(db, 'branches', ['id', 'tenant_id', 'name', 'address'], [...branchIds].map(([name, id]) => [id, tenantId, name, s.address]))

    const departmentIds = new Map([...new Set(data.employees.map((e) => e.department))].map((d) => [d as string, randomUUID()]))
    await insertMany(db, 'departments', ['id', 'tenant_id', 'name'], [...departmentIds].map(([name, id]) => [id, tenantId, name]))

    await insertMany(
      db,
      'shifts',
      ['id', 'tenant_id', 'name', 'start_time', 'end_time', 'grace_minutes', 'weekly_off_json'],
      data.shifts.map((sh) => [sh.id, tenantId, sh.name, sh.start, sh.end, sh.graceMinutes, JSON.stringify(sh.weeklyOff)])
    )

    await insertMany(
      db,
      'holidays',
      ['id', 'tenant_id', 'name', 'holiday_date', 'applies_to_all', 'is_recurring'],
      data.holidays.map((h) => [h.id, tenantId, h.name, h.date, h.branches === 'All' ? 1 : 0, h.recurring ? 1 : 0])
    )
    await insertMany(
      db,
      'holiday_branches',
      ['holiday_id', 'branch_id'],
      data.holidays.flatMap((h) => (h.branches === 'All' ? [] : h.branches.map((b) => [h.id, branchIds.get(b)])))
    )

    await insertMany(
      db,
      'leave_types',
      ['tenant_id', 'code', 'name', 'annual_quota', 'is_paid'],
      LEAVE_TYPES.map((t) => [tenantId, t.code, t.name, t.quota, t.paid ? 1 : 0])
    )

    await insertMany(
      db,
      'employees',
      ['id', 'tenant_id', 'employee_code', 'full_name', 'email', 'phone', 'role', 'department_id', 'branch_id', 'shift_id', 'join_date', 'status', 'avatar_initials'],
      data.employees.map((e) => [
        e.id, tenantId, e.employeeCode, e.name, e.email.toLowerCase(), e.phone || null, e.role,
        departmentIds.get(e.department), branchIds.get(e.branch), e.shiftId || null, e.joinDate, e.status, e.avatarInitials,
      ])
    )
    for (const e of data.employees.filter((x) => x.managerId)) {
      await exec(db, 'UPDATE employees SET manager_id = ? WHERE id = ?', [e.managerId, e.id])
    }

    await insertMany(
      db,
      'users',
      ['id', 'tenant_id', 'employee_id', 'email', 'password_hash', 'role', 'is_active'],
      data.users.map((u) => {
        const emp = data.employees.find((e) => e.id === u.employeeId)
        return [u.id, tenantId, u.employeeId, u.email.toLowerCase(), passwordHash, u.role, emp?.status === 'Inactive' ? 0 : 1]
      })
    )

    await insertMany(
      db,
      'leave_balances',
      ['tenant_id', 'employee_id', 'leave_type_code', 'balance_days'],
      data.leaveBalances.flatMap((b) => LEAVE_TYPES.map((t) => [tenantId, b.employeeId, t.code, b[t.code]]))
    )

    const sourceFor = (status: string, clockIn?: string) =>
      clockIn ? 'punch' : status === 'On Leave' ? 'leave' : status === 'Holiday' ? 'holiday' : 'admin'
    await insertMany(
      db,
      'attendance_records',
      ['id', 'tenant_id', 'employee_id', 'work_date', 'branch_id', 'clock_in_at', 'clock_out_at', 'total_work_minutes', 'total_break_minutes', 'status', 'work_mode', 'activity', 'location_lat', 'location_lng', 'location_captured_at', 'notes', 'early_leave_note', 'is_on_break', 'source'],
      data.attendance.map((a) => [
        a.id, tenantId, a.employeeId, a.date, branchIds.get(a.branch) ?? null, dt(a.clockIn), dt(a.clockOut),
        a.totalWorkMinutes, a.totalBreakMinutes, a.status, a.workMode ?? null, a.activity ?? null,
        a.location?.lat ?? null, a.location?.lng ?? null, dt(a.location?.capturedAt),
        a.notes ?? null, a.earlyLeaveNote ?? null, a.isOnBreak ? 1 : 0, sourceFor(a.status, a.clockIn),
      ])
    )
    await insertMany(
      db,
      'attendance_breaks',
      ['id', 'tenant_id', 'attendance_id', 'start_at', 'end_at'],
      data.attendance.flatMap((a) => a.breaks.map((b) => [b.id, tenantId, a.id, dt(b.start), dt(b.end)]))
    )

    await insertMany(
      db,
      'leave_requests',
      ['id', 'tenant_id', 'employee_id', 'leave_type_code', 'from_date', 'to_date', 'half_day', 'half_day_period', 'days', 'reason', 'attachment_note', 'status', 'approver_id', 'approver_comment', 'created_at', 'updated_at'],
      data.leaveRequests.map((l) => [
        l.id, tenantId, l.employeeId, l.type, l.from, l.to, l.halfDay ? 1 : 0, l.halfDayPeriod ?? null, l.days,
        l.reason, l.attachmentNote ?? null, l.status, l.approverId ?? null, l.approverComment ?? null, dt(l.createdAt), dt(l.updatedAt),
      ])
    )

    const attendanceIds = new Set(data.attendance.map((a) => a.id))
    await insertMany(
      db,
      'regularization_requests',
      ['id', 'tenant_id', 'employee_id', 'work_date', 'request_type', 'proposed_clock_in', 'proposed_clock_out', 'proposed_work_mode', 'reason', 'status', 'approver_id', 'approver_comment', 'attendance_id', 'created_at', 'updated_at'],
      data.regularizationRequests.map((r) => [
        r.id, tenantId, r.employeeId, r.workDate, r.requestType, dt(r.proposedClockIn), dt(r.proposedClockOut),
        r.proposedWorkMode ?? null, r.reason, r.status, r.approverId ?? null, r.approverComment ?? null,
        r.attendanceId && attendanceIds.has(r.attendanceId) ? r.attendanceId : null, dt(r.createdAt), dt(r.updatedAt),
      ])
    )

    await insertMany(
      db,
      'on_duty_requests',
      ['id', 'tenant_id', 'employee_id', 'from_date', 'to_date', 'location_label', 'purpose', 'status', 'approver_id', 'approver_comment', 'created_at', 'updated_at'],
      data.onDutyRequests.map((o) => [
        o.id, tenantId, o.employeeId, o.from, o.to, o.locationLabel ?? null, o.purpose, o.status,
        o.approverId ?? null, o.approverComment ?? null, dt(o.createdAt), dt(o.updatedAt),
      ])
    )

    await insertMany(
      db,
      'notifications',
      ['id', 'tenant_id', 'user_id', 'type', 'title', 'message', 'link', 'is_read', 'created_at'],
      data.notifications.map((n) => [n.id, tenantId, n.userId, n.type, n.title, n.message, n.link ?? null, n.read ? 1 : 0, dt(n.createdAt)])
    )

    const issuer = process.env.SEED_SSO_ISSUER
    const secret = process.env.SEED_SSO_SECRET
    if (issuer && secret) {
      await exec(db, 'DELETE FROM sso_configs WHERE issuer = ?', [issuer])
      const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)
      await exec(
        db,
        `INSERT INTO sso_configs (id, tenant_id, provider, issuer, shared_secret, auto_provision, sync_role, default_role, allowed_origins)
         VALUES (?, ?, 'jwt_ticket', ?, ?, 1, 0, 'employee', ?)`,
        [randomUUID(), tenantId, issuer, secret, JSON.stringify(origins)]
      )
    }
  })

  console.log(`Seeded tenant "${TENANT_SLUG}" (${data.settings.name}):`)
  console.log(`  ${data.employees.length} employees, ${data.attendance.length} attendance records, ${data.leaveRequests.length} leave requests`)
  console.log(`  Sign in with any demo account, e.g. admin@hmsenterprises.in / ${DEMO_PASSWORD}`)
  if (process.env.SEED_SSO_ISSUER) console.log(`  SSO issuer "${process.env.SEED_SSO_ISSUER}" enabled for this tenant`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(closePool)
