import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { exec, getPool, isDuplicateKey, one, rows, withTx, type Db } from '../db.js'
import { badRequest, conflict, notFound, parse, unauthorized } from '../errors.js'
import { iso, ROLES } from '../dto.js'
import { authenticatePlatform } from '../auth/guard.js'
import { signPlatformToken } from '../auth/tokens.js'
import { createEmployeeWithUser } from '../domain/employees.js'
import { createInvite } from '../domain/invites.js'
import { audit } from '../domain/notify.js'
import { applyTenantGeofence, loadTenantGeofenceSummary } from '../domain/geofence.js'
import { assertSeatAvailable, provisionTenant, RESERVED_SLUGS } from '../domain/tenants.js'
import { isValidTimeZone, localDate } from '../time.js'
import { CodePrefix, HexColor, LogoUrl } from './settings.js'

const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10)
const TRIAL_DAYS = 14

const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'Lowercase letters, numbers and dashes (2–40 characters)')
  .refine((s) => !RESERVED_SLUGS.has(s), 'This workspace name is reserved')
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-MM-dd')
const Person = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().toLowerCase().email().max(160) })
const Status = z.enum(['trial', 'active', 'suspended'])

const CreateTenant = z.object({
  name: z.string().trim().min(2).max(160),
  slug: Slug,
  timezone: z.string().trim().max(64).default('Asia/Kolkata'),
  status: z.enum(['trial', 'active']).default('trial'),
  plan: z.string().trim().min(1).max(32).default('starter'),
  seatLimit: z.number().int().min(1).max(100_000).nullable().default(null),
  trialEndsOn: DateStr.nullable().optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(160).or(z.literal('')).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  branchName: z.string().trim().min(1).max(120).default('Head Office'),
  employeeCodePrefix: CodePrefix.optional(),
  logoUrl: LogoUrl.optional(),
  primaryColor: HexColor.optional(),
  admin: Person,
  geofenceEnabled: z.boolean().optional(),
  geofenceLat: z.number().min(-90).max(90).nullable().optional(),
  geofenceLng: z.number().min(-180).max(180).nullable().optional(),
  geofenceRadiusM: z.number().int().min(5).max(5000).optional(),
})

const GeofenceBody = z.object({
  enabled: z.boolean(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  radiusM: z.number().int().min(5).max(5000).optional(),
})

const PatchTenant = z
  .object({
    name: z.string().trim().min(2).max(160),
    status: Status,
    plan: z.string().trim().min(1).max(32),
    seatLimit: z.number().int().min(1).max(100_000).nullable(),
    trialEndsOn: DateStr.nullable(),
    timezone: z.string().trim().max(64),
    contactName: z.string().trim().max(120),
    contactEmail: z.string().trim().toLowerCase().email().max(160).or(z.literal('')),
    contactPhone: z.string().trim().max(40),
    notes: z.string().trim().max(1000),
    logoUrl: LogoUrl,
    primaryColor: HexColor,
  })
  .partial()

const SsoBody = z.object({
  issuer: z.string().trim().min(3).max(200),
  allowedOrigins: z.array(z.string().trim().url().max(200)).max(20).default([]),
  defaultRole: z.enum(ROLES).default('employee'),
  autoProvision: z.boolean().default(true),
  syncRole: z.boolean().default(false),
})

interface TenantRow {
  id: string
  slug: string
  name: string
  display_name: string
  status: 'trial' | 'active' | 'suspended'
  plan: string
  seat_limit: number | null
  trial_ends_on: string | null
  timezone: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  logo_url: string | null
  primary_color: string | null
  employee_code_prefix: string | null
  setup_completed_at: Date | null
  created_at: Date
  active_employees: number
  last_activity_at: Date | null
}

const SELECT_TENANT = `
  SELECT t.*, s.display_name, s.logo_url, s.primary_color, s.employee_code_prefix, s.setup_completed_at,
         (SELECT COUNT(*) FROM employees e WHERE e.tenant_id = t.id AND e.status = 'Active') AS active_employees,
         (SELECT MAX(u.last_login_at) FROM users u WHERE u.tenant_id = t.id) AS last_activity_at
    FROM tenants t JOIN tenant_settings s ON s.tenant_id = t.id`

function toTenantSummary(r: TenantRow) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    displayName: r.display_name,
    status: r.status,
    plan: r.plan,
    seatLimit: r.seat_limit,
    activeEmployees: r.active_employees,
    trialEndsOn: r.trial_ends_on,
    timezone: r.timezone,
    contactName: r.contact_name ?? '',
    contactEmail: r.contact_email ?? '',
    contactPhone: r.contact_phone ?? '',
    notes: r.notes ?? '',
    logoUrl: r.logo_url ?? '',
    primaryColor: r.primary_color ?? '',
    employeeCodePrefix: r.employee_code_prefix ?? '',
    setupCompleted: r.setup_completed_at !== null,
    createdAt: r.created_at.toISOString(),
    lastActivityAt: iso(r.last_activity_at) ?? null,
  }
}

async function loadTenantDetail(db: Db, id: string) {
  const row = await one<TenantRow>(db, `${SELECT_TENANT} WHERE t.id = ?`, [id])
  if (!row) throw notFound('Client not found')
  const admins = await rows<{
    user_id: string
    full_name: string
    email: string
    last_login_at: Date | null
    has_password: number
    invite_expires_at: Date | null
  }>(
    db,
    `SELECT u.id AS user_id, e.full_name, u.email, u.last_login_at, u.password_hash IS NOT NULL AS has_password,
            (SELECT MAX(i.expires_at) FROM user_invites i
              WHERE i.user_id = u.id AND i.used_at IS NULL AND i.expires_at > UTC_TIMESTAMP(3)) AS invite_expires_at
       FROM users u JOIN employees e ON e.id = u.employee_id
      WHERE u.tenant_id = ? AND u.role = 'admin' AND u.is_active = 1
      ORDER BY u.created_at`,
    [id]
  )
  const sso = await rows<{
    id: string
    issuer: string
    auto_provision: number
    sync_role: number
    default_role: string
    allowed_origins: string[] | null
    is_enabled: number
    created_at: Date
  }>(
    db,
    'SELECT id, issuer, auto_provision, sync_role, default_role, allowed_origins, is_enabled, created_at FROM sso_configs WHERE tenant_id = ? ORDER BY created_at',
    [id]
  )
  const geofence = await loadTenantGeofenceSummary(db, id)
  return {
    ...toTenantSummary(row),
    geofence,
    admins: admins.map((a) => ({
      userId: a.user_id,
      name: a.full_name,
      email: a.email,
      lastLoginAt: iso(a.last_login_at) ?? null,
      hasPassword: !!a.has_password,
      inviteExpiresAt: iso(a.invite_expires_at) ?? null,
    })),
    sso: sso.map((s) => ({
      id: s.id,
      issuer: s.issuer,
      autoProvision: !!s.auto_provision,
      syncRole: !!s.sync_role,
      defaultRole: s.default_role,
      allowedOrigins: s.allowed_origins ?? [],
      isEnabled: !!s.is_enabled,
      createdAt: s.created_at.toISOString(),
    })),
  }
}

function platformAudit(db: Db, req: FastifyRequest, tenantId: string | null, action: string, payload?: unknown) {
  return audit(db, {
    tenantId,
    actorUserId: null,
    action: `platform.${action}`,
    entityType: 'tenant',
    entityId: tenantId,
    payload: { by: req.platform.email, ...(payload && typeof payload === 'object' ? payload : {}) },
    ip: req.ip,
  })
}

const newSecret = () => randomBytes(32).toString('base64url')

export async function publicPlatformRoutes(app: FastifyInstance) {
  app.post(
    '/v1/platform/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const body = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }), req.body)
      const admin = await one<{ id: string; full_name: string; email: string; password_hash: string; is_active: number }>(
        getPool(),
        'SELECT id, full_name, email, password_hash, is_active FROM platform_admins WHERE email = ?',
        [body.email]
      )
      const valid = await bcrypt.compare(body.password, admin?.password_hash ?? DUMMY_HASH)
      if (!admin || !valid || !admin.is_active) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')
      await exec(getPool(), 'UPDATE platform_admins SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?', [admin.id])
      return { token: await signPlatformToken(admin.id), admin: { id: admin.id, name: admin.full_name, email: admin.email } }
    }
  )
}

export async function platformRoutes(app: FastifyInstance) {
  app.decorateRequest('platform', null as never)
  app.addHook('preHandler', authenticatePlatform)

  app.get('/v1/platform/me', async (req) => {
    const admin = await one<{ id: string; full_name: string; email: string }>(
      getPool(),
      'SELECT id, full_name, email FROM platform_admins WHERE id = ?',
      [req.platform.platformAdminId]
    )
    return { id: admin!.id, name: admin!.full_name, email: admin!.email }
  })

  app.get('/v1/platform/overview', async () => {
    const db = getPool()
    const counts = await rows<{ status: string; n: number }>(db, 'SELECT status, COUNT(*) AS n FROM tenants GROUP BY status')
    const people = await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM employees WHERE status = 'Active'")
    const punches = await one<{ n: number }>(
      db,
      'SELECT COUNT(*) AS n FROM attendance_records WHERE clock_in_at >= UTC_TIMESTAMP(3) - INTERVAL 1 DAY'
    )
    const by = Object.fromEntries(counts.map((c) => [c.status, c.n]))
    return {
      tenants: { total: counts.reduce((s, c) => s + c.n, 0), trial: by.trial ?? 0, active: by.active ?? 0, suspended: by.suspended ?? 0 },
      activeEmployees: people?.n ?? 0,
      clockInsLast24h: punches?.n ?? 0,
    }
  })

  app.get('/v1/platform/tenants', async () => {
    const list = await rows<TenantRow>(getPool(), `${SELECT_TENANT} ORDER BY t.created_at DESC`)
    return list.map(toTenantSummary)
  })

  app.get('/v1/platform/tenants/:id', async (req) => loadTenantDetail(getPool(), (req.params as { id: string }).id))

  app.post('/v1/platform/tenants', async (req) => {
    const body = parse(CreateTenant, req.body)
    if (!isValidTimeZone(body.timezone)) throw badRequest('Unknown timezone')
    const taken = await one(getPool(), 'SELECT 1 FROM tenants WHERE slug = ?', [body.slug])
    if (taken) throw conflict('That workspace name is already taken', 'SLUG_TAKEN')

    const today = localDate(new Date(), body.timezone)
    const trialEndsOn =
      body.status === 'trial'
        ? (body.trialEndsOn ?? localDate(new Date(Date.now() + TRIAL_DAYS * 86_400_000), body.timezone))
        : null

    const { tenantId, invite } = await withTx(async (conn) => {
      const created = await provisionTenant(conn, { ...body, trialEndsOn }, today).catch((err) => {
        if (isDuplicateKey(err)) throw conflict('That workspace name is already taken', 'SLUG_TAKEN')
        throw err
      })
      if (body.geofenceEnabled || (body.geofenceLat != null && body.geofenceLng != null)) {
        await applyTenantGeofence(conn, created.tenantId, {
          enabled: !!body.geofenceEnabled,
          lat: body.geofenceLat,
          lng: body.geofenceLng,
          radiusM: body.geofenceRadiusM ?? 10,
        })
      }
      const link = await createInvite(conn, {
        tenantId: created.tenantId,
        userId: created.adminUserId,
        createdByPlatformId: req.platform.platformAdminId,
      })
      await platformAudit(conn, req, created.tenantId, 'tenant.create', { slug: body.slug, plan: body.plan, admin: body.admin.email })
      return { tenantId: created.tenantId, invite: link }
    })
    return { tenant: await loadTenantDetail(getPool(), tenantId), invite }
  })

  app.put('/v1/platform/tenants/:id/geofence', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(GeofenceBody, req.body)
    await withTx(async (conn) => {
      const exists = await one(conn, 'SELECT 1 FROM tenants WHERE id = ? FOR UPDATE', [id])
      if (!exists) throw notFound('Client not found')
      await applyTenantGeofence(conn, id, {
        enabled: body.enabled,
        lat: body.lat,
        lng: body.lng,
        radiusM: body.radiusM,
      })
      await platformAudit(conn, req, id, 'tenant.geofence', body)
    })
    return {
      tenant: await loadTenantDetail(getPool(), id),
      geofence: await loadTenantGeofenceSummary(getPool(), id),
    }
  })

  app.patch('/v1/platform/tenants/:id', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(PatchTenant, req.body)
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) throw badRequest('Unknown timezone')

    await withTx(async (conn) => {
      const exists = await one(conn, 'SELECT 1 FROM tenants WHERE id = ? FOR UPDATE', [id])
      if (!exists) throw notFound('Client not found')

      const tenantCols = {
        name: 'name', status: 'status', plan: 'plan', seatLimit: 'seat_limit', trialEndsOn: 'trial_ends_on',
        timezone: 'timezone', contactName: 'contact_name', contactEmail: 'contact_email',
        contactPhone: 'contact_phone', notes: 'notes',
      } as const
      const sets: string[] = []
      const params: unknown[] = []
      for (const [key, col] of Object.entries(tenantCols) as [keyof typeof tenantCols, string][]) {
        if (body[key] === undefined) continue
        sets.push(`${col} = ?`)
        params.push(body[key] === '' ? null : body[key])
      }
      if (sets.length) await exec(conn, `UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, [...params, id])

      const brandSets: string[] = []
      const brandParams: unknown[] = []
      if (body.logoUrl !== undefined) (brandSets.push('logo_url = ?'), brandParams.push(body.logoUrl || null))
      if (body.primaryColor !== undefined) (brandSets.push('primary_color = ?'), brandParams.push(body.primaryColor || null))
      if (brandSets.length) {
        await exec(conn, `UPDATE tenant_settings SET ${brandSets.join(', ')} WHERE tenant_id = ?`, [...brandParams, id])
      }
      await platformAudit(conn, req, id, 'tenant.update', body)
    })
    return loadTenantDetail(getPool(), id)
  })

  app.post('/v1/platform/tenants/:id/admins', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(Person, req.body)
    const invite = await withTx(async (conn) => {
      const tenant = await one<{ timezone: string }>(conn, 'SELECT timezone FROM tenants WHERE id = ?', [id])
      if (!tenant) throw notFound('Client not found')
      await assertSeatAvailable(conn, id)
      const { userId } = await createEmployeeWithUser(
        conn,
        id,
        { name: body.name, email: body.email, role: 'admin', department: 'Management', passwordHash: null },
        localDate(new Date(), tenant.timezone)
      ).catch((err) => {
        if (isDuplicateKey(err)) throw conflict('Someone with this email already exists in this company')
        throw err
      })
      const link = await createInvite(conn, { tenantId: id, userId, createdByPlatformId: req.platform.platformAdminId })
      await platformAudit(conn, req, id, 'admin.add', { email: body.email })
      return link
    })
    return { tenant: await loadTenantDetail(getPool(), id), invite }
  })

  app.post('/v1/platform/tenants/:id/admins/:userId/invite', async (req) => {
    const { id, userId } = req.params as { id: string; userId: string }
    const invite = await withTx(async (conn) => {
      const user = await one(conn, "SELECT 1 FROM users WHERE id = ? AND tenant_id = ? AND role = 'admin'", [userId, id])
      if (!user) throw notFound('Admin not found')
      const link = await createInvite(conn, { tenantId: id, userId, createdByPlatformId: req.platform.platformAdminId })
      await platformAudit(conn, req, id, 'admin.invite', { userId })
      return link
    })
    return { tenant: await loadTenantDetail(getPool(), id), invite }
  })

  app.post('/v1/platform/tenants/:id/sso', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(SsoBody, req.body)
    const sharedSecret = newSecret()
    await withTx(async (conn) => {
      const exists = await one(conn, 'SELECT 1 FROM tenants WHERE id = ?', [id])
      if (!exists) throw notFound('Client not found')
      await exec(
        conn,
        `INSERT INTO sso_configs (id, tenant_id, provider, issuer, shared_secret, auto_provision, sync_role, default_role, allowed_origins)
         VALUES (?, ?, 'jwt_ticket', ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), id, body.issuer, sharedSecret, body.autoProvision ? 1 : 0, body.syncRole ? 1 : 0, body.defaultRole, JSON.stringify(body.allowedOrigins)]
      ).catch((err) => {
        if (isDuplicateKey(err)) throw conflict('That issuer name is already used by another connection', 'ISSUER_TAKEN')
        throw err
      })
      await platformAudit(conn, req, id, 'sso.create', { issuer: body.issuer })
    })
    return { tenant: await loadTenantDetail(getPool(), id), sharedSecret }
  })

  app.post('/v1/platform/tenants/:id/sso/:ssoId/rotate', async (req) => {
    const { id, ssoId } = req.params as { id: string; ssoId: string }
    const sharedSecret = newSecret()
    const res = await exec(getPool(), 'UPDATE sso_configs SET shared_secret = ?, public_key_pem = NULL WHERE id = ? AND tenant_id = ?', [
      sharedSecret,
      ssoId,
      id,
    ])
    if (!res.affectedRows) throw notFound('Connection not found')
    await platformAudit(getPool(), req, id, 'sso.rotate', { ssoId })
    return { tenant: await loadTenantDetail(getPool(), id), sharedSecret }
  })

  app.patch('/v1/platform/tenants/:id/sso/:ssoId', async (req) => {
    const { id, ssoId } = req.params as { id: string; ssoId: string }
    const body = parse(z.object({ isEnabled: z.boolean() }), req.body)
    const res = await exec(getPool(), 'UPDATE sso_configs SET is_enabled = ? WHERE id = ? AND tenant_id = ?', [
      body.isEnabled ? 1 : 0,
      ssoId,
      id,
    ])
    if (!res.affectedRows) throw notFound('Connection not found')
    await platformAudit(getPool(), req, id, body.isEnabled ? 'sso.enable' : 'sso.disable', { ssoId })
    return loadTenantDetail(getPool(), id)
  })

  app.delete('/v1/platform/tenants/:id/sso/:ssoId', async (req) => {
    const { id, ssoId } = req.params as { id: string; ssoId: string }
    const res = await exec(getPool(), 'DELETE FROM sso_configs WHERE id = ? AND tenant_id = ?', [ssoId, id])
    if (!res.affectedRows) throw notFound('Connection not found')
    await platformAudit(getPool(), req, id, 'sso.delete', { ssoId })
    return loadTenantDetail(getPool(), id)
  })
}