import { SignJWT, jwtVerify } from 'jose'
import { getConfig } from '../config.js'
import type { Role } from '../dto.js'

const ISSUER = 'attendance-platform'
const AUDIENCE = 'attendance-platform:api'

export interface AccessClaims {
  userId: string
  tenantId: string
  employeeId: string
  role: Role
  issuedAt: Date
}

function key(): Uint8Array {
  return new TextEncoder().encode(getConfig().jwtSecret)
}

export async function signAccessToken(c: Omit<AccessClaims, 'issuedAt'>): Promise<string> {
  return new SignJWT({ tid: c.tenantId, eid: c.employeeId, role: c.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(getConfig().accessTokenTtl)
    .sign(key())
}

const PLATFORM_AUDIENCE = 'attendance-platform:console'

export async function signPlatformToken(platformAdminId: string): Promise<string> {
  return new SignJWT({ scope: 'platform' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(platformAdminId)
    .setIssuer(ISSUER)
    .setAudience(PLATFORM_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(key())
}

export async function verifyPlatformToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, key(), {
    issuer: ISSUER,
    audience: PLATFORM_AUDIENCE,
    algorithms: ['HS256'],
  })
  if (!payload.sub || payload.scope !== 'platform') throw new Error('Malformed token')
  return payload.sub
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key(), {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  })
  if (!payload.sub || typeof payload.tid !== 'string' || typeof payload.eid !== 'string') {
    throw new Error('Malformed token')
  }
  return {
    userId: payload.sub,
    tenantId: payload.tid,
    employeeId: payload.eid,
    role: payload.role as Role,
    issuedAt: new Date((payload.iat ?? 0) * 1000),
  }
}
