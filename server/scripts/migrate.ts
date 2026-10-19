import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import mysql, { type RowDataPacket } from 'mysql2/promise'
import { requiredEnv } from '../src/config.ts'

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations')

async function main() {
  const url = new URL(requiredEnv('DATABASE_URL'))
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`Invalid database name "${database}"`)

  // Local/dev: create DB if missing. Managed RDS often forbids CREATE DATABASE — ignore and continue.
  try {
    const serverUrl = new URL(url)
    serverUrl.pathname = '/'
    const admin = await mysql.createConnection({ uri: serverUrl.toString() })
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    )
    await admin.end()
  } catch (err) {
    console.warn(
      `Skipping CREATE DATABASE (ok on managed MySQL): ${err instanceof Error ? err.message : err}`,
    )
  }

  const conn = await mysql.createConnection({ uri: url.toString(), multipleStatements: true })
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(200) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`)

  const [appliedRows] = await conn.query<RowDataPacket[]>('SELECT name FROM schema_migrations')
  const applied = new Set(appliedRows.map((r) => r.name as string))
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

  let count = 0
  for (const file of files) {
    if (applied.has(file)) continue
    console.log(`Applying ${file} …`)
    await conn.query(await readFile(join(MIGRATIONS_DIR, file), 'utf8'))
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file])
    count++
  }
  await conn.end()
  console.log(count ? `Applied ${count} migration(s) to ${database}.` : `${database} is up to date.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
