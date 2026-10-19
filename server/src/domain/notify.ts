import { randomUUID } from 'node:crypto'
import { exec, type Db } from '../db.js'

interface NotificationInput {
  type: string
  title: string
  message: string
  link?: string
}

export async function notifyUser(db: Db, tenantId: string, userId: string, n: NotificationInput): Promise<void> {
  await exec(
    db,
    `INSERT INTO notifications (id, tenant_id, user_id, type, title, message, link)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), tenantId, userId, n.type, n.title, n.message, n.link ?? null]
  )
}

export async function notifyEmployee(db: Db, tenantId: string, employeeId: string, n: NotificationInput): Promise<void> {
  await exec(
    db,
    `INSERT INTO notifications (id, tenant_id, user_id, type, title, message, link)
     SELECT UUID(), tenant_id, id, ?, ?, ?, ? FROM users WHERE tenant_id = ? AND employee_id = ?`,
    [n.type, n.title, n.message, n.link ?? null, tenantId, employeeId]
  )
}

export async function notifyAdmins(db: Db, tenantId: string, n: NotificationInput): Promise<void> {
  await exec(
    db,
    `INSERT INTO notifications (id, tenant_id, user_id, type, title, message, link)
     SELECT UUID(), tenant_id, id, ?, ?, ?, ? FROM users
      WHERE tenant_id = ? AND role = 'admin' AND is_active = 1`,
    [n.type, n.title, n.message, n.link ?? null, tenantId]
  )
}

export async function audit(
  db: Db,
  e: {
    tenantId: string | null
    actorUserId: string | null
    action: string
    entityType: string
    entityId?: string | null
    payload?: unknown
    ip?: string
  }
): Promise<void> {
  await exec(
    db,
    `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, payload_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      e.tenantId,
      e.actorUserId,
      e.action,
      e.entityType,
      e.entityId ?? null,
      e.payload === undefined ? null : JSON.stringify(e.payload),
      e.ip ?? null,
    ]
  )
}
