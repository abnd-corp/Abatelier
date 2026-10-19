import { env } from './env.js'
import { buildApp } from './app.js'
import { pool, runMigrations } from './db/index.js'
import { deleteExpiredSessions } from './auth/session.js'
import { deleteOldAttempts } from './auth/throttle.js'
import { deleteOldAuditEntries } from './audit.js'
import { seedAdmin } from './seed.js'
import { applyDepartures } from './departures.js'

const app = await buildApp()

await runMigrations()
await seedAdmin(app.log)

async function cleanup() {
  await applyDepartures()
  await deleteExpiredSessions()
  await deleteOldAttempts()
  await deleteOldAuditEntries()
}
await cleanup()
// Toutes les heures : les départs du jour sont appliqués peu après minuit
const timer = setInterval(() => cleanup().catch((e) => app.log.error(e)), 3600 * 1000)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    clearInterval(timer)
    await app.close()
    await pool.end()
    process.exit(0)
  })
}

await app.listen({ host: '0.0.0.0', port: env.PORT })
