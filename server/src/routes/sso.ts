import type { FastifyInstance } from 'fastify'
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify, type JWTPayload } from 'jose'
import { z } from 'zod'
import { getConfig } from '../config.js'
import { exec, getPool, isDuplicateKey, one, withTx } from '../db.js'
import { forbidden, HttpError, parse, unauthorized } from '../errors.js'
import { ROLES, type Role } from '../dto.js'
import { createEmployeeWithUser } from '../domain/employees.js'
import { assertSeatAvailable } from '../domain/tenants.js'
import { audit } from '../domain/notify.js'
import { issueLogin } from '../domain/session.js'
import { localDate } from '../time.js'

const ExchangeBody = z.object({ ticket: z.string().min(20) })

interface SsoConfigRow {
  id: string
  tenant_id: string
  issuer: string
  shared_secret: string | null
  public_key_pem: string | null
  auto_provision: number
  sync_role: number
  default_role: Role
  tenant_status: 'trial' | 'active' | 'suspended'
  timezone: string
}

interface TicketClaims extends JWTPayload {
  email?: unknown
  name?: unknown
  role?: unknown
  employee_code?: unknown
  department?: unknown
}

const MAX_TICKET_AGE = '5m'

async function verifyTicket(ticket: string, cfg: SsoConfigRow): Promise<TicketClaims> {
  const options = {
    issuer: cfg.issuer,
    audience: getConfig().ssoAudience,
    maxTokenAge: MAX_TICKET_AGE,
    requiredClaims: ['jti', 'exp', 'iat', 'sub'],
  }
  if (cfg.public_key_pem) {
    const { alg } = decodeProtectedHeader(ticket)
    if (alg !== 'RS256' && alg !== 'ES256') throw unauthorized('Unsupported ticket algorithm', 'SSO_INVALID')
    const key = await importSPKI(cfg.public_key_pem, alg)
    return (await jwtVerify(ticket, key, { ...options, algorithms: [alg] })).payload
  }
  if (!cfg.shared_secret) throw unauthorized('SSO is not configured for this organization', 'SSO_NOT_CONFIGURED')
  const key = new TextEncoder().encode(cfg.shared_secret)
  return (await jwtVerify(ticket, key, { ...options, algorithms: ['HS256'] })).payload
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Host dashboards (ERP, portal) mint a short-lived signed ticket for their logged-in user;
 * the SPA exchanges it here for an access token, so the user never sees a second login.
 */
export async function ssoRoutes(app: FastifyInstance) {
  app.post(
    '/v1/auth/sso/exchange',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const { ticket } = parse(ExchangeBody, req.body)

      let issuer: string | undefined
      try {
        issuer = decodeJwt(ticket).iss
      } catch {
        throw unauthorized('Malformed SSO ticket', 'SSO_INVALID')
      }
      if (!issuer) throw unauthorized('SSO ticket has no issuer', 'SSO_INVALID')

      const db = getPool()
      const cfg = await one<SsoConfigRow>(
        db,
        `SELECT c.*, t.status AS tenant_status, t.timezone
           FROM sso_configs c JOIN tenants t ON t.id = c.tenant_id
          WHERE c.issuer = ? AND c.is_enabled = 1 AND c.provider = 'jwt_ticket'`,
        [issuer]
      )
      if (!cfg) throw unauthorized('Unknown SSO issuer', 'SSO_UNKNOWN_ISSUER')
      if (cfg.tenant_status === 'suspended') throw forbidden('This organization is suspended', 'TENANT_SUSPENDED')

      let claims: TicketClaims
      try {
        claims = await verifyTicket(ticket, cfg)
      } catch (err) {
        if (err instanceof HttpError) throw err
        throw unauthorized('SSO ticket is invalid or expired', 'SSO_INVALID')
      }

      const email = str(claims.email)?.toLowerCase()
      if (!email) throw unauthorized('SSO ticket must include an email claim', 'SSO_INVALID')
      const claimedRole = cfg.sync_role && ROLES.includes(claims.role as Role) ? (claims.role as Role) : undefined

      const userId = await withTx(async (conn) => {
        try {
          await exec(conn, 'INSERT INTO sso_ticket_uses (tenant_id, jti, expires_at) VALUES (?, ?, ?)', [
            cfg.tenant_id,
            claims.jti,
            new Date((claims.exp ?? 0) * 1000),
          ])
        } catch (err) {
          if (isDuplicateKey(err)) throw unauthorized('SSO ticket was already used', 'SSO_REPLAY')
          throw err
        }

        const existing = await one<{
          id: string
          employee_id: string
          role: Role
          is_active: number
          employee_status: string
          external_ref: string | null
        }>(
          conn,
          `SELECT u.id, u.employee_id, u.role, u.is_active, e.status AS employee_status, e.external_ref
             FROM users u JOIN employees e ON e.id = u.employee_id
            WHERE u.tenant_id = ? AND u.email = ?`,
          [cfg.tenant_id, email]
        )

        if (existing) {
          if (!existing.is_active || existing.employee_status !== 'Active') {
            throw forbidden('Your attendance account is inactive. Contact your admin.', 'ACCOUNT_INACTIVE')
          }
          if (claimedRole && claimedRole !== existing.role) {
            await exec(conn, 'UPDATE users SET role = ? WHERE id = ?', [claimedRole, existing.id])
            await exec(conn, 'UPDATE employees SET role = ? WHERE id = ?', [claimedRole, existing.employee_id])
          }
          if (!existing.external_ref && claims.sub) {
            await exec(conn, 'UPDATE employees SET external_ref = ? WHERE id = ?', [claims.sub, existing.employee_id])
          }
          return existing.id
        }

        if (!cfg.auto_provision) {
          throw forbidden('No attendance account exists for this user. Ask your admin to add you.', 'SSO_NO_ACCOUNT')
        }
        await assertSeatAvailable(conn, cfg.tenant_id)
        const created = await createEmployeeWithUser(
          conn,
          cfg.tenant_id,
          {
            name: str(claims.name) ?? email.split('@')[0]!,
            email,
            role: claimedRole ?? cfg.default_role,
            employeeCode: str(claims.employee_code),
            department: str(claims.department),
            externalRef: claims.sub,
            passwordHash: null,
          },
          localDate(new Date(), cfg.timezone)
        )
        return created.userId
      })

      await exec(db, 'DELETE FROM sso_ticket_uses WHERE expires_at < ? LIMIT 500', [new Date()])
      const result = await issueLogin(db, cfg.tenant_id, userId)
      await audit(db, {
        tenantId: cfg.tenant_id,
        actorUserId: userId,
        action: 'auth.sso_login',
        entityType: 'user',
        entityId: userId,
        payload: { issuer: cfg.issuer, sub: claims.sub },
        ip: req.ip,
      })
      return result
    }
  )
}
