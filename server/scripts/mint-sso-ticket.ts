// Simulates what the host dashboard's backend does when a user clicks "Attendance":
// sign a short-lived, single-use ticket for the logged-in user and redirect/iframe to /sso.
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { SignJWT } from 'jose'
import { requiredEnv } from '../src/config.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    role: { type: 'string' },
    sub: { type: 'string' },
    redirect: { type: 'string' },
  },
})

const email = positionals[0]
if (!email) {
  console.error('Usage: npm run sso:ticket -- <email> [--name "Full Name"] [--role employee] [--redirect /clock]')
  process.exit(1)
}

const issuer = requiredEnv('SEED_SSO_ISSUER')
const secret = new TextEncoder().encode(requiredEnv('SEED_SSO_SECRET'))
const appUrl = process.env.APP_URL ?? 'http://localhost:5173'

const ticket = await new SignJWT({
  email,
  ...(values.name ? { name: values.name } : {}),
  ...(values.role ? { role: values.role } : {}),
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer(issuer)
  .setAudience(process.env.SSO_AUDIENCE ?? 'attendance-platform')
  .setSubject(values.sub ?? email)
  .setJti(randomUUID())
  .setIssuedAt()
  .setExpirationTime('2m')
  .sign(secret)

const url = new URL('/sso', appUrl)
url.searchParams.set('ticket', ticket)
if (values.redirect) url.searchParams.set('redirect', values.redirect)

console.log(`Ticket for ${email} (valid 2 minutes, single use):\n`)
console.log(url.toString())
