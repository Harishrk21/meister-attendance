import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyError } from 'fastify'
import { getConfig } from './config.js'
import { getPool } from './db.js'
import { HttpError } from './errors.js'
import { authenticate } from './auth/guard.js'
import { attendanceRoutes } from './routes/attendance.js'
import { authRoutes, publicAuthRoutes } from './routes/auth.js'
import { bootstrapRoutes } from './routes/bootstrap.js'
import { employeeRoutes } from './routes/employees.js'
import { leaveRoutes } from './routes/leaves.js'
import { regularizationRoutes } from './routes/regularizations.js'
import { settingsRoutes } from './routes/settings.js'
import { shiftRoutes } from './routes/shifts.js'
import { ssoRoutes } from './routes/sso.js'
import { publicInviteRoutes } from './routes/invites.js'
import { platformRoutes, publicPlatformRoutes } from './routes/platform.js'

export async function buildApp() {
  const config = getConfig()
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.authorization'] },
    trustProxy: true,
    bodyLimit: 1_048_576,
  })

  await app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  })
  await app.register(rateLimit, { global: false })

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } })
    }
    const status = err.statusCode ?? 500
    if (status >= 500) req.log.error(err)
    return reply.status(status).send({
      error: {
        code: status === 429 ? 'RATE_LIMITED' : (err.code ?? 'ERROR'),
        message: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
      },
    })
  })
  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
  )

  app.get('/health', async () => {
    await getPool().query('SELECT 1')
    return { ok: true }
  })

  await app.register(publicAuthRoutes)
  await app.register(ssoRoutes)
  await app.register(publicInviteRoutes)
  await app.register(publicPlatformRoutes)
  await app.register(platformRoutes)

  await app.register(async (secured) => {
    secured.decorateRequest('auth', null as never)
    secured.addHook('preHandler', authenticate)
    await secured.register(authRoutes)
    await secured.register(bootstrapRoutes)
    await secured.register(attendanceRoutes)
    await secured.register(leaveRoutes)
    await secured.register(regularizationRoutes)
    await secured.register(employeeRoutes)
    await secured.register(shiftRoutes)
    await secured.register(settingsRoutes)
  })

  return app
}
