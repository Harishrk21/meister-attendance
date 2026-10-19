import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { exec, one, type Db } from '../db.js'
import { getConfig } from '../config.js'

const INVITE_DAYS = 7

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export interface InviteLink {
  url: string
  expiresAt: string
}

/** Issues a fresh single-use link; any earlier unused link for the same user stops working. */
export async function createInvite(
  db: Db,
  input: { tenantId: string; userId: string; createdByUserId?: string; createdByPlatformId?: string }
): Promise<InviteLink> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000)
  await exec(db, 'DELETE FROM user_invites WHERE tenant_id = ? AND user_id = ? AND used_at IS NULL', [
    input.tenantId,
    input.userId,
  ])
  await exec(
    db,
    `INSERT INTO user_invites (id, tenant_id, user_id, token_hash, expires_at, created_by_user_id, created_by_platform_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.tenantId,
      input.userId,
      hashToken(token),
      expiresAt,
      input.createdByUserId ?? null,
      input.createdByPlatformId ?? null,
    ]
  )
  return { url: `${getConfig().appUrl}/invite/${token}`, expiresAt: expiresAt.toISOString() }
}

export interface OpenInvite {
  id: string
  tenant_id: string
  user_id: string
  email: string
  full_name: string
  tenant_name: string
  logo_url: string | null
  primary_color: string | null
}

export async function findOpenInvite(db: Db, token: string, forUpdate = false): Promise<OpenInvite | undefined> {
  return one<OpenInvite>(
    db,
    `SELECT i.id, i.tenant_id, i.user_id, u.email, e.full_name, s.display_name AS tenant_name, s.logo_url, s.primary_color
       FROM user_invites i
       JOIN users u ON u.id = i.user_id
       JOIN employees e ON e.id = u.employee_id
       JOIN tenants t ON t.id = i.tenant_id
       JOIN tenant_settings s ON s.tenant_id = i.tenant_id
      WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > UTC_TIMESTAMP(3)
        AND t.status <> 'suspended' AND e.status = 'Active'
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    [hashToken(token)]
  )
}
