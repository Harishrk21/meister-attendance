/**
 * Creates (or resets the password of) a platform owner account for the client console.
 *
 *   npm run platform:admin -- you@meistersolutions.com "Your Name"
 *   PLATFORM_ADMIN_PASSWORD='…' npm run platform:admin -- you@meistersolutions.com "Your Name"
 *
 * Without PLATFORM_ADMIN_PASSWORD a strong password is generated and printed once.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { closePool, exec, getPool, one } from '../src/db.ts'

async function main() {
  const [emailArg, ...nameParts] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const email = emailArg?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run platform:admin -- <email> "<full name>"')
  }
  const name = nameParts.join(' ').trim() || email.split('@')[0]!
  const password = process.env.PLATFORM_ADMIN_PASSWORD || randomBytes(12).toString('base64url')
  if (password.length < 10) throw new Error('PLATFORM_ADMIN_PASSWORD must be at least 10 characters')
  const hash = await bcrypt.hash(password, 12)

  const db = getPool()
  const existing = await one<{ id: string }>(db, 'SELECT id FROM platform_admins WHERE email = ?', [email])
  if (existing) {
    await exec(db, 'UPDATE platform_admins SET password_hash = ?, full_name = ?, is_active = 1 WHERE id = ?', [hash, name, existing.id])
    console.log(`Updated platform admin ${email}.`)
  } else {
    await exec(db, 'INSERT INTO platform_admins (id, email, full_name, password_hash) VALUES (?, ?, ?, ?)', [
      randomUUID(),
      email,
      name,
      hash,
    ])
    console.log(`Created platform admin ${email}.`)
  }
  if (!process.env.PLATFORM_ADMIN_PASSWORD) console.log(`Password (shown once): ${password}`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(closePool)
