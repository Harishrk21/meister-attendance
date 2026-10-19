export function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

export interface AppConfig {
  port: number
  host: string
  jwtSecret: string
  accessTokenTtl: string
  corsOrigins: string[]
  ssoAudience: string
  /** Public URL of the web app, used to build invite links. */
  appUrl: string
}

let cached: AppConfig | undefined

export function getConfig(): AppConfig {
  if (cached) return cached
  const jwtSecret = requiredEnv('JWT_SECRET')
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')
  cached = {
    port: Number(process.env.PORT ?? 4000),
    host: process.env.HOST ?? '0.0.0.0',
    jwtSecret,
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '12h',
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    ssoAudience: process.env.SSO_AUDIENCE ?? 'attendance-platform',
    appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  }
  return cached
}
