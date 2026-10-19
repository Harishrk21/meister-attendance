import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exec, getPool, rows, withTx } from '../db.js'
import { badRequest, parse } from '../errors.js'
import { requireAdmin } from '../auth/guard.js'
import { audit } from '../domain/notify.js'
import { toNotificationDto, type NotificationRow } from '../domain/records.js'
import { loadSettingsDto } from '../domain/settings.js'
import { isValidTimeZone } from '../time.js'

/** https URL, or a path on this app (e.g. /logos/acme.png). */
export const LogoUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^\/(?!\/)/.test(v) || /^https?:\/\/[^\s]+$/i.test(v), 'Must be an https link or /path')
export const HexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour').or(z.literal(''))
export const CodePrefix = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,16}$/, 'Letters, numbers and dashes').or(z.literal(''))

const SettingsPatch = z
  .object({
    name: z.string().trim().min(1).max(160),
    tagline: z.string().trim().max(160),
    address: z.string().trim().max(255),
    phone: z.string().trim().max(80),
    email: z.string().trim().max(160),
    website: z.string().trim().max(200),
    gracePeriodMinutes: z.number().int().min(0).max(240),
    halfDayThresholdHours: z.number().min(0).max(24),
    overtimeAfterHours: z.number().min(0).max(24),
    requireNoteForEarlyLeave: z.boolean(),
    maxBreakMinutes: z.number().int().min(5).max(180),
    maxLunchMinutes: z.number().int().min(10).max(180),
    timezone: z.string().trim().max(64),
    logoUrl: LogoUrl,
    primaryColor: HexColor,
    activities: z.array(z.string().trim().min(1).max(80)).max(50),
    employeeCodePrefix: CodePrefix,
  })
  .partial()

const SETTINGS_COLUMNS = {
  name: 'display_name',
  tagline: 'tagline',
  address: 'address',
  phone: 'phone',
  email: 'email',
  website: 'website',
  gracePeriodMinutes: 'grace_period_minutes',
  halfDayThresholdHours: 'half_day_threshold_hours',
  overtimeAfterHours: 'overtime_after_hours',
  requireNoteForEarlyLeave: 'require_note_for_early_leave',
  maxBreakMinutes: 'max_break_minutes',
  maxLunchMinutes: 'max_lunch_minutes',
  logoUrl: 'logo_url',
  primaryColor: 'primary_color',
  employeeCodePrefix: 'employee_code_prefix',
} as const

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/v1/settings', async (req) => loadSettingsDto(getPool(), req.auth.tenantId))

  app.patch('/v1/settings', async (req) => {
    requireAdmin(req.auth)
    const body = parse(SettingsPatch, req.body)
    const { tenantId, userId } = req.auth
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) throw badRequest('Unknown timezone')

    await withTx(async (conn) => {
      const sets: string[] = []
      const params: unknown[] = []
      for (const [key, column] of Object.entries(SETTINGS_COLUMNS) as [keyof typeof SETTINGS_COLUMNS, string][]) {
        const value = body[key]
        if (value === undefined) continue
        sets.push(`${column} = ?`)
        params.push(typeof value === 'boolean' ? Number(value) : value === '' && key !== 'name' ? null : value)
      }
      if (body.activities !== undefined) {
        sets.push('activities_json = ?')
        params.push(body.activities.length ? JSON.stringify([...new Set(body.activities)]) : null)
      }
      if (sets.length) {
        await exec(conn, `UPDATE tenant_settings SET ${sets.join(', ')} WHERE tenant_id = ?`, [...params, tenantId])
      }
      if (body.name !== undefined || body.timezone !== undefined) {
        await exec(conn, 'UPDATE tenants SET name = COALESCE(?, name), timezone = COALESCE(?, timezone) WHERE id = ?', [
          body.name ?? null,
          body.timezone ?? null,
          tenantId,
        ])
      }
      await audit(conn, { tenantId, actorUserId: userId, action: 'settings.update', entityType: 'tenant', entityId: tenantId, payload: body, ip: req.ip })
    })
    return loadSettingsDto(getPool(), tenantId)
  })

  app.post('/v1/settings/setup-complete', async (req) => {
    requireAdmin(req.auth)
    await exec(
      getPool(),
      'UPDATE tenant_settings SET setup_completed_at = COALESCE(setup_completed_at, UTC_TIMESTAMP(3)) WHERE tenant_id = ?',
      [req.auth.tenantId]
    )
    return loadSettingsDto(getPool(), req.auth.tenantId)
  })

  app.get('/v1/notifications', async (req) => {
    const list = await rows<NotificationRow>(
      getPool(),
      'SELECT * FROM notifications WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 200',
      [req.auth.tenantId, req.auth.userId]
    )
    return list.map(toNotificationDto)
  })

  app.post('/v1/notifications/:id/read', async (req) => {
    const { id } = req.params as { id: string }
    await exec(getPool(), 'UPDATE notifications SET is_read = 1 WHERE tenant_id = ? AND user_id = ? AND id = ?', [
      req.auth.tenantId,
      req.auth.userId,
      id,
    ])
    return { ok: true }
  })

  app.post('/v1/notifications/read-all', async (req) => {
    await exec(getPool(), 'UPDATE notifications SET is_read = 1 WHERE tenant_id = ? AND user_id = ? AND is_read = 0', [
      req.auth.tenantId,
      req.auth.userId,
    ])
    return { ok: true }
  })
}
