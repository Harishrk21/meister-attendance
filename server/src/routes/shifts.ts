import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exec, getPool, one, rows, withTx, type Db } from '../db.js'
import { badRequest, conflict, notFound, parse } from '../errors.js'
import { requireAdmin } from '../auth/guard.js'
import { audit } from '../domain/notify.js'
import { listHolidayDtos, listShiftDtos } from '../domain/records.js'

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm')
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-MM-dd')

const ShiftBody = z.object({
  name: z.string().trim().min(1).max(80),
  start: HHMM,
  end: HHMM,
  graceMinutes: z.number().int().min(0).max(240),
  weeklyOff: z.array(z.number().int().min(0).max(6)).max(7),
})

const HolidayBody = z.object({
  name: z.string().trim().min(1).max(120),
  date: DateStr,
  branches: z.union([z.literal('All'), z.array(z.string().trim().min(1)).min(1)]),
  recurring: z.boolean().optional(),
})

async function setHolidayBranches(db: Db, tenantId: string, holidayId: string, branches: string[] | 'All') {
  await exec(db, 'DELETE FROM holiday_branches WHERE holiday_id = ?', [holidayId])
  if (branches === 'All') return
  const found = await rows<{ id: string; name: string }>(
    db,
    'SELECT id, name FROM branches WHERE tenant_id = ? AND name IN (?)',
    [tenantId, branches]
  )
  const missing = branches.filter((b) => !found.some((f) => f.name === b))
  if (missing.length) throw badRequest(`Unknown branch: ${missing.join(', ')}`)
  for (const b of found) {
    await exec(db, 'INSERT INTO holiday_branches (holiday_id, branch_id) VALUES (?, ?)', [holidayId, b.id])
  }
}

export async function shiftRoutes(app: FastifyInstance) {
  app.get('/v1/shifts', async (req) => listShiftDtos(getPool(), req.auth.tenantId))
  app.get('/v1/holidays', async (req) => listHolidayDtos(getPool(), req.auth.tenantId))

  app.post('/v1/shifts', async (req) => {
    requireAdmin(req.auth)
    const body = parse(ShiftBody, req.body)
    const id = randomUUID()
    const db = getPool()
    await exec(
      db,
      `INSERT INTO shifts (id, tenant_id, name, start_time, end_time, grace_minutes, weekly_off_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.auth.tenantId, body.name, body.start, body.end, body.graceMinutes, JSON.stringify(body.weeklyOff)]
    )
    await audit(db, { tenantId: req.auth.tenantId, actorUserId: req.auth.userId, action: 'shift.create', entityType: 'shift', entityId: id, ip: req.ip })
    return { id, ...body }
  })

  app.put('/v1/shifts/:id', async (req) => {
    requireAdmin(req.auth)
    const { id } = req.params as { id: string }
    const body = parse(ShiftBody, req.body)
    const db = getPool()
    const result = await exec(
      db,
      `UPDATE shifts SET name = ?, start_time = ?, end_time = ?, grace_minutes = ?, weekly_off_json = ?
        WHERE tenant_id = ? AND id = ?`,
      [body.name, body.start, body.end, body.graceMinutes, JSON.stringify(body.weeklyOff), req.auth.tenantId, id]
    )
    if (result.affectedRows === 0) throw notFound('Shift not found')
    await audit(db, { tenantId: req.auth.tenantId, actorUserId: req.auth.userId, action: 'shift.update', entityType: 'shift', entityId: id, ip: req.ip })
    return { id, ...body }
  })

  app.delete('/v1/shifts/:id', async (req) => {
    requireAdmin(req.auth)
    const { id } = req.params as { id: string }
    const db = getPool()
    const assigned = await one(db, 'SELECT 1 FROM employees WHERE tenant_id = ? AND shift_id = ? LIMIT 1', [
      req.auth.tenantId,
      id,
    ])
    if (assigned) throw conflict('Shift is assigned to employees')
    const result = await exec(db, 'DELETE FROM shifts WHERE tenant_id = ? AND id = ?', [req.auth.tenantId, id])
    if (result.affectedRows === 0) throw notFound('Shift not found')
    await audit(db, { tenantId: req.auth.tenantId, actorUserId: req.auth.userId, action: 'shift.delete', entityType: 'shift', entityId: id, ip: req.ip })
    return { ok: true }
  })

  app.post('/v1/holidays', async (req) => {
    requireAdmin(req.auth)
    const body = parse(HolidayBody, req.body)
    const { tenantId, userId } = req.auth
    const id = randomUUID()
    await withTx(async (conn) => {
      await exec(
        conn,
        `INSERT INTO holidays (id, tenant_id, name, holiday_date, applies_to_all, is_recurring)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, tenantId, body.name, body.date, body.branches === 'All' ? 1 : 0, body.recurring ? 1 : 0]
      )
      await setHolidayBranches(conn, tenantId, id, body.branches)
      await audit(conn, { tenantId, actorUserId: userId, action: 'holiday.create', entityType: 'holiday', entityId: id, ip: req.ip })
    })
    return { id, ...body }
  })

  app.put('/v1/holidays/:id', async (req) => {
    requireAdmin(req.auth)
    const { id } = req.params as { id: string }
    const body = parse(HolidayBody, req.body)
    const { tenantId, userId } = req.auth
    await withTx(async (conn) => {
      const result = await exec(
        conn,
        `UPDATE holidays SET name = ?, holiday_date = ?, applies_to_all = ?, is_recurring = ?
          WHERE tenant_id = ? AND id = ?`,
        [body.name, body.date, body.branches === 'All' ? 1 : 0, body.recurring ? 1 : 0, tenantId, id]
      )
      if (result.affectedRows === 0) throw notFound('Holiday not found')
      await setHolidayBranches(conn, tenantId, id, body.branches)
      await audit(conn, { tenantId, actorUserId: userId, action: 'holiday.update', entityType: 'holiday', entityId: id, ip: req.ip })
    })
    return { id, ...body }
  })

  app.delete('/v1/holidays/:id', async (req) => {
    requireAdmin(req.auth)
    const { id } = req.params as { id: string }
    const db = getPool()
    const result = await exec(db, 'DELETE FROM holidays WHERE tenant_id = ? AND id = ?', [req.auth.tenantId, id])
    if (result.affectedRows === 0) throw notFound('Holiday not found')
    await audit(db, { tenantId: req.auth.tenantId, actorUserId: req.auth.userId, action: 'holiday.delete', entityType: 'holiday', entityId: id, ip: req.ip })
    return { ok: true }
  })
}
