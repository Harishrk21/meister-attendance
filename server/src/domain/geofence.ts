import { exec, one, type Db } from '../db.js'
import { badRequest } from '../errors.js'

export interface GeofenceConfig {
  enabled: boolean
  lat: number
  lng: number
  radiusM: number
  branchName: string
}

/** Great-circle distance in metres (WGS84). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Resolve geofence for an employee: tenant toggle + their branch coords
 * (falls back to the first active branch with coordinates).
 */
export async function loadGeofenceForEmployee(
  db: Db,
  tenantId: string,
  employeeId: string
): Promise<GeofenceConfig | null> {
  const settings = await one<{ geofence_enabled: number }>(
    db,
    'SELECT geofence_enabled FROM tenant_settings WHERE tenant_id = ?',
    [tenantId]
  )
  if (!settings?.geofence_enabled) return null

  const branch = await one<{
    name: string
    geofence_lat: number | null
    geofence_lng: number | null
    geofence_radius_m: number | null
  }>(
    db,
    `SELECT b.name, b.geofence_lat, b.geofence_lng, b.geofence_radius_m
       FROM employees e
       JOIN branches b ON b.id = e.branch_id
      WHERE e.id = ? AND e.tenant_id = ? AND b.is_active = 1`,
    [employeeId, tenantId]
  )

  const fallback = branch?.geofence_lat != null && branch.geofence_lng != null
    ? branch
    : await one<{
        name: string
        geofence_lat: number | null
        geofence_lng: number | null
        geofence_radius_m: number | null
      }>(
        db,
        `SELECT name, geofence_lat, geofence_lng, geofence_radius_m
           FROM branches
          WHERE tenant_id = ? AND is_active = 1
            AND geofence_lat IS NOT NULL AND geofence_lng IS NOT NULL
          ORDER BY created_at
          LIMIT 1`,
        [tenantId]
      )

  if (fallback?.geofence_lat == null || fallback.geofence_lng == null) return null

  return {
    enabled: true,
    lat: Number(fallback.geofence_lat),
    lng: Number(fallback.geofence_lng),
    radiusM: fallback.geofence_radius_m && fallback.geofence_radius_m > 0 ? fallback.geofence_radius_m : 10,
    branchName: fallback.name,
  }
}

export function assertWithinGeofence(
  fence: GeofenceConfig,
  location: { lat: number; lng: number } | undefined
): void {
  if (!location) {
    throw badRequest(
      'Location is required to mark attendance. Enable GPS and try again.',
      'GEO_REQUIRED'
    )
  }
  const metres = distanceMeters(fence.lat, fence.lng, location.lat, location.lng)
  if (metres > fence.radiusM) {
    throw badRequest(
      `You are about ${Math.round(metres)} m from ${fence.branchName}. Move within ${fence.radiusM} m of the office to mark attendance.`,
      'GEO_OUTSIDE'
    )
  }
}

/** Apply company office pin + toggle (primary / first branch). */
export async function applyTenantGeofence(
  db: Db,
  tenantId: string,
  input: {
    enabled: boolean
    lat?: number | null
    lng?: number | null
    radiusM?: number | null
  }
): Promise<void> {
  const enabled = !!input.enabled
  if (enabled && (input.lat == null || input.lng == null)) {
    throw badRequest('Latitude and longitude are required when geofence is enabled', 'GEO_CONFIG')
  }
  const radius = input.radiusM && input.radiusM > 0 ? Math.min(Math.floor(input.radiusM), 5000) : 10

  await exec(db, 'UPDATE tenant_settings SET geofence_enabled = ? WHERE tenant_id = ?', [
    enabled ? 1 : 0,
    tenantId,
  ])

  const branch = await one<{ id: string }>(
    db,
    'SELECT id FROM branches WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at LIMIT 1',
    [tenantId]
  )
  if (!branch) return

  if (input.lat != null && input.lng != null) {
    await exec(
      db,
      `UPDATE branches
          SET geofence_lat = ?, geofence_lng = ?, geofence_radius_m = ?
        WHERE id = ?`,
      [input.lat, input.lng, radius, branch.id]
    )
  } else if (!enabled) {
    await exec(
      db,
      `UPDATE branches
          SET geofence_lat = NULL, geofence_lng = NULL, geofence_radius_m = NULL
        WHERE id = ?`,
      [branch.id]
    )
  }
}

export async function loadTenantGeofenceSummary(db: Db, tenantId: string) {
  const settings = await one<{ geofence_enabled: number }>(
    db,
    'SELECT geofence_enabled FROM tenant_settings WHERE tenant_id = ?',
    [tenantId]
  )
  const branch = await one<{
    name: string
    geofence_lat: number | null
    geofence_lng: number | null
    geofence_radius_m: number | null
  }>(
    db,
    `SELECT name, geofence_lat, geofence_lng, geofence_radius_m
       FROM branches WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at LIMIT 1`,
    [tenantId]
  )
  return {
    enabled: !!settings?.geofence_enabled,
    lat: branch?.geofence_lat != null ? Number(branch.geofence_lat) : null,
    lng: branch?.geofence_lng != null ? Number(branch.geofence_lng) : null,
    radiusM: branch?.geofence_radius_m ?? 10,
    branchName: branch?.name ?? 'Head Office',
  }
}
