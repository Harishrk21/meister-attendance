import { one, rows, type Db } from '../db.js'
import { notFound } from '../errors.js'
import { opt, type SettingsDto, type TenantDto } from '../dto.js'

export interface TenantRules {
  timezone: string
  graceMinutes: number
  halfDayThresholdMinutes: number
  overtimeAfterMinutes: number
  requireNoteForEarlyLeave: boolean
}

interface SettingsRow {
  id: string
  slug: string
  timezone: string
  display_name: string
  tagline: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  primary_color: string | null
  grace_period_minutes: number
  half_day_threshold_hours: number
  overtime_after_hours: number
  require_note_for_early_leave: number
  geofence_enabled: number
  activities_json: string[] | null
  employee_code_prefix: string | null
  setup_completed_at: Date | null
  seat_limit: number | null
}

async function loadRow(db: Db, tenantId: string): Promise<SettingsRow> {
  const row = await one<SettingsRow>(
    db,
    `SELECT t.id, t.slug, t.timezone, t.seat_limit, s.*
       FROM tenants t JOIN tenant_settings s ON s.tenant_id = t.id
      WHERE t.id = ?`,
    [tenantId]
  )
  if (!row) throw notFound('Organization not found')
  return row
}

export async function loadRules(db: Db, tenantId: string): Promise<TenantRules> {
  const s = await loadRow(db, tenantId)
  return {
    timezone: s.timezone,
    graceMinutes: s.grace_period_minutes,
    halfDayThresholdMinutes: Math.round(s.half_day_threshold_hours * 60),
    overtimeAfterMinutes: Math.round(s.overtime_after_hours * 60),
    requireNoteForEarlyLeave: !!s.require_note_for_early_leave,
  }
}

export async function loadSettingsDto(db: Db, tenantId: string): Promise<SettingsDto> {
  const s = await loadRow(db, tenantId)
  const branches = await rows<{ name: string }>(
    db,
    'SELECT name FROM branches WHERE tenant_id = ? AND is_active = 1 ORDER BY name',
    [tenantId]
  )
  const geoBranch = await one<{
    geofence_lat: number | null
    geofence_lng: number | null
    geofence_radius_m: number | null
  }>(
    db,
    `SELECT geofence_lat, geofence_lng, geofence_radius_m
       FROM branches WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at LIMIT 1`,
    [tenantId]
  )
  return {
    name: s.display_name,
    tagline: s.tagline ?? '',
    address: s.address ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    website: s.website ?? '',
    branches: branches.map((b) => b.name),
    gracePeriodMinutes: s.grace_period_minutes,
    halfDayThresholdHours: s.half_day_threshold_hours,
    overtimeAfterHours: s.overtime_after_hours,
    requireNoteForEarlyLeave: !!s.require_note_for_early_leave,
    geofenceEnabled: !!s.geofence_enabled,
    geofenceLat: geoBranch?.geofence_lat != null ? Number(geoBranch.geofence_lat) : null,
    geofenceLng: geoBranch?.geofence_lng != null ? Number(geoBranch.geofence_lng) : null,
    geofenceRadiusM: geoBranch?.geofence_radius_m ?? 10,
    timezone: s.timezone,
    logoUrl: opt(s.logo_url),
    primaryColor: opt(s.primary_color),
    activities: opt(s.activities_json),
    employeeCodePrefix: opt(s.employee_code_prefix),
    setupCompleted: s.setup_completed_at !== null,
    seatLimit: opt(s.seat_limit),
  }
}

export async function loadTenantDto(db: Db, tenantId: string): Promise<TenantDto> {
  const s = await loadRow(db, tenantId)
  return {
    id: s.id,
    slug: s.slug,
    name: s.display_name,
    timezone: s.timezone,
    logoUrl: opt(s.logo_url),
    primaryColor: opt(s.primary_color),
  }
}
