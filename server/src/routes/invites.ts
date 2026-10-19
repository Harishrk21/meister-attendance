import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exec, getPool, one, withTx } from '../db.js'
import { notFound, parse } from '../errors.js'
import { opt } from '../dto.js'
import { findOpenInvite } from '../domain/invites.js'
import { audit } from '../domain/notify.js'
import { issueLogin } from '../domain/session.js'

const Token = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, 'Invalid invite link')
const AcceptBody = z.object({
  token: Token,
  password: z.string().min(8, 'Use at least 8 characters').max(128),
})

const EXPIRED = 'This invite link has expired or was already used. Ask your admin for a new one.'

export async function publicInviteRoutes(app: FastifyInstance) {
  const limited = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }

  app.get('/v1/invites/:token', limited, async (req) => {
    const token = parse(Token, (req.params as { token: string }).token)
    const invite = await findOpenInvite(getPool(), token)
    if (!invite) throw notFound(EXPIRED, 'INVITE_INVALID')
    return {
      email: invite.email,
      name: invite.full_name,
      tenant: { name: invite.tenant_name, logoUrl: opt(invite.logo_url), primaryColor: opt(invite.primary_color) },
    }
  })

  app.post('/v1/invites/accept', limited, async (req) => {
    const body = parse(AcceptBody, req.body)
    const passwordHash = await bcrypt.hash(body.password, 10)
    const invite = await withTx(async (conn) => {
      const found = await findOpenInvite(conn, body.token, true)
      if (!found) throw notFound(EXPIRED, 'INVITE_INVALID')
      await exec(conn, 'UPDATE user_invites SET used_at = UTC_TIMESTAMP(3) WHERE id = ?', [found.id])
      await exec(conn, 'UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ? AND tenant_id = ?', [
        passwordHash,
        found.user_id,
        found.tenant_id,
      ])
      await audit(conn, {
        tenantId: found.tenant_id,
        actorUserId: found.user_id,
        action: 'invite.accept',
        entityType: 'user',
        entityId: found.user_id,
        ip: req.ip,
      })
      return found
    })
    return issueLogin(getPool(), invite.tenant_id, invite.user_id)
  })

  /** Lets a client's login page show their own logo: /login?workspace=acme */
  app.get('/v1/tenants/:slug/branding', limited, async (req) => {
    const slug = parse(z.string().trim().toLowerCase().max(64), (req.params as { slug: string }).slug)
    const row = await one<{ slug: string; display_name: string; logo_url: string | null; primary_color: string | null }>(
      getPool(),
      `SELECT t.slug, s.display_name, s.logo_url, s.primary_color
         FROM tenants t JOIN tenant_settings s ON s.tenant_id = t.id
        WHERE t.slug = ? AND t.status <> 'suspended'`,
      [slug]
    )
    if (!row) throw notFound('Workspace not found', 'TENANT_NOT_FOUND')
    return { slug: row.slug, name: row.display_name, logoUrl: opt(row.logo_url), primaryColor: opt(row.primary_color) }
  })
}
