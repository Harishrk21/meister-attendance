import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getPool, rows } from '../db.js'
import { conflict, forbidden, parse, unauthorized } from '../errors.js'
import { audit } from '../domain/notify.js'
import { buildSession, issueLogin } from '../domain/session.js'
import { loadTenantDto } from '../domain/settings.js'

const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  tenant: z.string().trim().toLowerCase().optional(),
})

// Compared against when no account matches, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10)

interface LoginCandidate {
  id: string
  tenant_id: string
  password_hash: string | null
  is_active: number
  employee_status: 'Active' | 'Inactive'
  tenant_status: 'trial' | 'active' | 'suspended'
}

export async function publicAuthRoutes(app: FastifyInstance) {
  app.post(
    '/v1/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const body = parse(LoginBody, req.body)
      const db = getPool()
      const candidates = await rows<LoginCandidate>(
        db,
        `SELECT u.id, u.tenant_id, u.password_hash, u.is_active,
                e.status AS employee_status, t.status AS tenant_status
           FROM users u
           JOIN employees e ON e.id = u.employee_id
           JOIN tenants t ON t.id = u.tenant_id
          WHERE u.email = ? ${body.tenant ? 'AND t.slug = ?' : ''}`,
        body.tenant ? [body.email, body.tenant] : [body.email]
      )

      const matches: LoginCandidate[] = []
      if (candidates.length === 0) await bcrypt.compare(body.password, DUMMY_HASH)
      for (const c of candidates) {
        if (c.password_hash && (await bcrypt.compare(body.password, c.password_hash))) matches.push(c)
      }
      if (matches.length === 0) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')
      if (matches.length > 1) {
        throw conflict('This email belongs to more than one organization. Specify the organization.', 'TENANT_REQUIRED')
      }

      const user = matches[0]!
      if (user.tenant_status === 'suspended') throw forbidden('This organization is suspended', 'TENANT_SUSPENDED')
      if (!user.is_active || user.employee_status !== 'Active') {
        throw forbidden('Account is inactive. Contact your admin.', 'ACCOUNT_INACTIVE')
      }

      const result = await issueLogin(db, user.tenant_id, user.id)
      await audit(db, {
        tenantId: user.tenant_id,
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        ip: req.ip,
      })
      return result
    }
  )
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/v1/auth/me', async (req) => {
    const db = getPool()
    return {
      session: await buildSession(db, req.auth.tenantId, req.auth.userId, req.auth.issuedAt),
      tenant: await loadTenantDto(db, req.auth.tenantId),
    }
  })
}
