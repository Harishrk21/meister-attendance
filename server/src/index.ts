import { buildApp } from './app.js'
import { getConfig } from './config.js'
import { closePool } from './db.js'

const app = await buildApp()
const { port, host } = getConfig()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close()
    await closePool()
    process.exit(0)
  })
}

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
