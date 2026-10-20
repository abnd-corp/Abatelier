import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { env } from './env.js'
import { authPlugin } from './auth/plugin.js'
import { clientAuthPlugin } from './auth/client-session.js'
import { authRoutes } from './routes/auth.js'
import { userRoutes } from './routes/users.js'
import { auditRoutes } from './routes/audit.js'
import { employeeRoutes } from './routes/employees.js'
import { catalogRoutes } from './routes/catalog.js'
import { deliveryRoutes } from './routes/delivery.js'
import { documentRoutes } from './routes/documents.js'
import { clientRoutes } from './routes/clients.js'
import { orderRoutes } from './routes/orders.js'
import { productionRoutes } from './routes/production.js'
import { billingRoutes } from './routes/billing.js'
import { publicRoutes } from './routes/public.js'
import { siteRoutes } from './routes/site.js'
import { mailRoutes } from './routes/mail.js'
import { espaceRoutes } from './routes/espace.js'
import { boutiqueRoutes } from './routes/boutique.js'
import { paiementRoutes } from './routes/paiement.js'

declare module 'fastify' {
  interface FastifyInstance {
    // Liste des routes, utilisée par les tests de sécurité (toutes doivent être protégées)
    routeList: { method: string; url: string }[]
  }
}

/** Construit l'application sans la démarrer : utilisé par server.ts et par les tests. */
export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
    // L'API n'est joignable qu'à travers nginx, qui transmet la vraie IP du client
    trustProxy: true,
    bodyLimit: 100 * 1024,
  })

  app.decorate('routeList', [])
  app.addHook('onRoute', (r) => {
    for (const method of [r.method].flat()) if (method !== 'HEAD') app.routeList.push({ method, url: r.url })
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
    if (status === 413) return reply.code(413).send({ error: 'Envoi trop lourd.' })
    if (status === 415) return reply.code(415).send({ error: 'Format de fichier non pris en charge.' })
    return reply.code(status).send({ error: status >= 500 ? 'Le serveur a rencontré un problème. Réessayez.' : 'Requête invalide.' })
  })

  // Protection CSRF : toute requête qui modifie des données doit venir du site lui-même.
  // Les navigateurs envoient toujours l'en-tête Origin sur ces requêtes.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return
    // Notifications du prestataire de paiement : pas de navigateur, la signature du message fait foi
    if (req.routeOptions.config.webhook) return
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
    // Sauf les routes publiques (photos, textes du site) qui fixent elles-mêmes leur durée de cache
    if (!reply.hasHeader('cache-control')) reply.header('Cache-Control', 'no-store')
  })

  await app.register(authPlugin)
  await app.register(clientAuthPlugin)

  app.get('/api/health', async () => ({ ok: true }))
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(userRoutes, { prefix: '/api/users' })
  await app.register(auditRoutes, { prefix: '/api/audit' })
  await app.register(employeeRoutes, { prefix: '/api/employees' })
  await app.register(catalogRoutes, { prefix: '/api/catalog' })
  await app.register(deliveryRoutes, { prefix: '/api/catalog' })
  await app.register(documentRoutes, { prefix: '/api/documents' })
  await app.register(clientRoutes, { prefix: '/api/clients' })
  await app.register(orderRoutes, { prefix: '/api/orders' })
  await app.register(productionRoutes, { prefix: '/api/production' })
  await app.register(billingRoutes, { prefix: '/api/billing' })
  await app.register(publicRoutes, { prefix: '/api/public' })
  await app.register(siteRoutes, { prefix: '/api/site' })
  await app.register(mailRoutes, { prefix: '/api/mail' })
  await app.register(espaceRoutes, { prefix: '/api/espace' })
  await app.register(boutiqueRoutes, { prefix: '/api/boutique' })
  await app.register(paiementRoutes, { prefix: '/api/paiement' })

  return app
}
