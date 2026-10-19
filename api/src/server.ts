import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { env } from './env.js'
import { pool, runMigrations } from './db/index.js'
import { authPlugin } from './auth/plugin.js'
import { deleteExpiredSessions } from './auth/session.js'
import { deleteOldAttempts } from './auth/throttle.js'
import { deleteOldAuditEntries } from './audit.js'
import { authRoutes } from './routes/auth.js'
import { userRoutes } from './routes/users.js'
import { auditRoutes } from './routes/audit.js'
import { seedAdmin } from './seed.js'

const app = Fastify({
  logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
  // L'API n'est joignable qu'à travers nginx, qui transmet la vraie IP du client
  trustProxy: true,
  bodyLimit: 100 * 1024,
})

await app.register(cookie)
await app.register(rateLimit, {
  global: false,
  errorResponseBuilder: (_req, ctx) => ({
    statusCode: 429,
    error: `Trop de tentatives depuis cette adresse. Réessayez dans ${Math.ceil(ctx.ttl / 1000)} secondes.`,
  }),
})

// Erreurs non prévues : message en français, sans détail technique pour l'utilisateur
app.setErrorHandler((err: { statusCode?: number }, req, reply) => {
  const status = err.statusCode ?? 500
  if (status === 429) return reply.code(429).send(err)
  if (status >= 500) req.log.error(err)
  return reply.code(status).send({ error: status >= 500 ? 'Le serveur a rencontré un problème. Réessayez.' : 'Requête invalide.' })
})

// Protection CSRF : toute requête qui modifie des données doit venir du site lui-même.
// Les navigateurs envoient toujours l'en-tête Origin sur ces requêtes.
app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return
  let origin: string | undefined
  try {
    origin = new URL(req.headers.origin ?? req.headers.referer ?? '').host
  } catch {
    origin = undefined
  }
  if (!origin || origin !== req.headers.host) {
    return reply.code(403).send({ error: 'Requête refusée : elle ne provient pas du site.' })
  }
})

// Les réponses de l'API contiennent des données privées : jamais en cache
app.addHook('onSend', async (_req, reply) => {
  reply.header('Cache-Control', 'no-store')
})

await app.register(authPlugin)

app.get('/api/health', async () => ({ ok: true }))
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(userRoutes, { prefix: '/api/users' })
await app.register(auditRoutes, { prefix: '/api/audit' })

await runMigrations()
await seedAdmin(app.log)

async function cleanup() {
  await deleteExpiredSessions()
  await deleteOldAttempts()
  await deleteOldAuditEntries()
}
await cleanup()
const timer = setInterval(() => cleanup().catch((e) => app.log.error(e)), 6 * 3600 * 1000)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    clearInterval(timer)
    await app.close()
    await pool.end()
    process.exit(0)
  })
}

await app.listen({ host: '0.0.0.0', port: env.PORT })
