import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, count, desc, eq, gt, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { auditLog, CONTRATS, employees, ROLES, sessions, users, type Employee } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { audit, describeDevice } from '../audit.js'
import { createAccount, IdentifiantTaken, identifiantSchema } from '../accounts.js'
import { applyDepartures, todayParis } from '../departures.js'

// Champ texte facultatif : vide ou espaces → null
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum.`)
    .nullish()
    .transform((v) => (v ? v : null))

const optDate = z
  .union([z.literal(''), z.iso.date('Date invalide.')])
  .nullish()
  .transform((v) => (v ? v : null))

const fields = {
  prenom: z.string().trim().min(1, 'Le prénom est requis.').max(60),
  nom: z.string().trim().min(1, 'Le nom est requis.').max(60),
  poste: optText(80),
  contrat: z.preprocess((v) => (v === '' ? null : v), z.enum(CONTRATS, { error: 'Type de contrat inconnu.' }).nullish()).transform((v) => v ?? null),
  dateEntree: optDate,
  dateSortie: optDate,
  telephone: optText(30).refine((v) => v === null || /^\+?[0-9 .()-]{6,25}$/.test(v), 'Numéro de téléphone invalide.'),
  email: optText(120).refine((v) => v === null || z.email().safeParse(v).success, 'Adresse e-mail invalide.'),
  notes: optText(5000),
}

const accountBody = z.object({ identifiant: identifiantSchema, role: z.enum(ROLES) })

const datesOk = (d: { dateEntree?: string | null; dateSortie?: string | null }) => !d.dateEntree || !d.dateSortie || d.dateSortie >= d.dateEntree
const DATES_MSG = { message: 'La date de sortie doit être après la date d’entrée.', path: ['dateSortie'] }

const createBody = z.object({ ...fields, compte: accountBody.nullish() }).refine(datesOk, DATES_MSG)
const updateBody = z.object(fields).partial().refine(datesOk, DATES_MSG)

const listQuery = z.object({
  statut: z.enum(['actifs', 'partis', 'tous']).default('actifs'),
  q: z.string().trim().max(80).optional(),
})

/** Erreur de validation : premier message, et le champ concerné pour l'afficher sous le bon input. */
function invalid(reply: FastifyReply, e: z.ZodError) {
  const issue = e.issues[0]
  const path = issue?.path ?? []
  const field = path[0] === 'compte' ? String(path[1] ?? 'identifiant') : path[0] !== undefined ? String(path[0]) : undefined
  return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field })
}

const fullName = (e: Pick<Employee, 'prenom' | 'nom'>) => `${e.prenom} ${e.nom}`

// Libellés des champs pour le journal ; le contenu des notes n'y est jamais copié
const LABELS: Record<string, string> = {
  prenom: 'prénom',
  nom: 'nom',
  poste: 'poste',
  contrat: 'contrat',
  dateEntree: 'date d’entrée',
  dateSortie: 'date de sortie',
  telephone: 'téléphone',
  email: 'e-mail',
  notes: 'notes',
}

const accountColumns = {
  accountId: users.id,
  identifiant: users.identifiant,
  role: users.role,
  disabledAt: users.disabledAt,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
}

const accountOf = (r: { accountId: string | null; identifiant: string | null; role: string | null; disabledAt: Date | null; mustChangePassword: boolean | null; lastLoginAt: Date | null }) =>
  r.accountId
    ? { id: r.accountId, identifiant: r.identifiant, role: r.role, disabledAt: r.disabledAt, mustChangePassword: r.mustChangePassword, lastLoginAt: r.lastLoginAt }
    : null

async function findEmployee(id: string, reply: FastifyReply) {
  if (!z.uuid().safeParse(id).success) {
    reply.code(404).send({ error: 'Salarié introuvable.' })
    return null
  }
  const [e] = await db.select().from(employees).where(eq(employees.id, id))
  if (!e) reply.code(404).send({ error: 'Salarié introuvable.' })
  return e ?? null
}

export async function employeeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('employees.manage'))

  app.get('/', async (req, reply) => {
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Filtre invalide.' })
    const { statut, q } = parsed.data
    const today = todayParis()

    const filters: (SQL | undefined)[] = [
      statut === 'actifs' ? or(isNull(employees.dateSortie), gt(employees.dateSortie, today)) : undefined,
      statut === 'partis' ? lte(employees.dateSortie, today) : undefined,
    ]
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
      filters.push(
        or(
          ilike(employees.prenom, like),
          ilike(employees.nom, like),
          ilike(employees.poste, like),
          ilike(sql`${employees.prenom} || ' ' || ${employees.nom}`, like),
          ilike(users.identifiant, like),
        ),
      )
    }

    const rows = await db
      .select({
        id: employees.id,
        prenom: employees.prenom,
        nom: employees.nom,
        poste: employees.poste,
        contrat: employees.contrat,
        dateEntree: employees.dateEntree,
        dateSortie: employees.dateSortie,
        telephone: employees.telephone,
        email: employees.email,
        ...accountColumns,
      })
      .from(employees)
      .leftJoin(users, eq(users.id, employees.userId))
      .where(and(...filters))
      .orderBy(asc(employees.nom), asc(employees.prenom))

    const [totals] = await db
      .select({
        actifs: count(sql`case when ${employees.dateSortie} is null or ${employees.dateSortie} > ${today} then 1 end`),
        partis: count(sql`case when ${employees.dateSortie} <= ${today} then 1 end`),
      })
      .from(employees)

    return {
      employees: rows.map(({ accountId, identifiant, role, disabledAt, mustChangePassword, lastLoginAt, ...e }) => ({
        ...e,
        account: accountOf({ accountId, identifiant, role, disabledAt, mustChangePassword, lastLoginAt }),
      })),
      totals: { actifs: Number(totals?.actifs ?? 0), partis: Number(totals?.partis ?? 0) },
    }
  })

  app.post('/', async (req, reply) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const { compte, ...data } = parsed.data

    try {
      const result = await db.transaction(async (tx) => {
        let account: { id: string; tempPassword: string } | null = null
        if (compte) account = await createAccount(tx, { identifiant: compte.identifiant, nom: fullName(data), role: compte.role })
        const [e] = await tx
          .insert(employees)
          .values({ ...data, userId: account?.id ?? null })
          .returning({ id: employees.id })
        return { id: e!.id, account }
      })

      await audit(req, 'employee.created', {
        targetType: 'employee',
        targetId: result.id,
        details: { nom: fullName(data), poste: data.poste, compte: compte?.identifiant ?? null },
      })
      if (result.account) {
        await audit(req, 'user.created', {
          targetType: 'user',
          targetId: result.account.id,
          details: { identifiant: compte!.identifiant, nom: fullName(data), role: compte!.role, salarie: result.id },
        })
      }
      // Salarié saisi avec une date de sortie déjà passée : son compte est désactivé tout de suite
      await applyDepartures()
      return reply.code(201).send({ id: result.id, tempPassword: result.account?.tempPassword ?? null })
    } catch (e) {
      if (e instanceof IdentifiantTaken) return reply.code(409).send({ error: e.message, field: 'identifiant' })
      throw e
    }
  })

  app.get('/:id', async (req, reply) => {
    const e = await findEmployee((req.params as { id: string }).id, reply)
    if (!e) return

    let account = null
    let activity: unknown[] = []
    if (e.userId) {
      const [u] = await db
        .select({ ...accountColumns, activeSessions: count(sessions.id) })
        .from(users)
        .leftJoin(sessions, and(eq(sessions.userId, users.id), gt(sessions.expiresAt, new Date())))
        .where(eq(users.id, e.userId))
        .groupBy(users.id)
      if (u) account = { ...accountOf(u), activeSessions: Number(u.activeSessions) }
    }

    // Activité récente : ce que la personne a fait, et ce qui a été fait sur sa fiche ou son compte
    const conditions = [and(eq(auditLog.targetType, 'employee'), eq(auditLog.targetId, e.id))]
    if (e.userId) conditions.push(eq(auditLog.userId, e.userId), and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, e.userId)))
    const rows = await db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        action: auditLog.action,
        identifiant: auditLog.identifiant,
        userId: auditLog.userId,
        nom: users.nom,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        ip: auditLog.ip,
        userAgent: auditLog.userAgent,
        details: auditLog.details,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(or(...conditions))
      .orderBy(desc(auditLog.id))
      .limit(15)
    activity = rows.map(({ userAgent, ...r }) => ({ ...r, device: describeDevice(userAgent), targetName: fullName(e) }))

    const { userId, ...employee } = e
    return { employee: { ...employee, hasAccount: userId !== null, account }, activity }
  })

  app.patch('/:id', async (req, reply) => {
    const e = await findEmployee((req.params as { id: string }).id, reply)
    if (!e) return
    const parsed = updateBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const changes = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as Partial<Employee>

    const merged = { ...e, ...changes }
    if (!datesOk(merged)) return reply.code(400).send({ error: DATES_MSG.message, field: 'dateSortie' })

    const changed = Object.keys(changes).filter((k) => changes[k as keyof Employee] !== e[k as keyof Employee])
    if (!changed.length) return { ok: true }

    await db
      .update(employees)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(employees.id, e.id))

    // Le nom affiché du compte suit celui de la fiche
    if (e.userId && (changed.includes('prenom') || changed.includes('nom'))) {
      await db.update(users).set({ nom: fullName(merged) }).where(eq(users.id, e.userId))
    }

    await audit(req, 'employee.updated', {
      targetType: 'employee',
      targetId: e.id,
      details: { nom: fullName(merged), champs: changed.map((k) => LABELS[k] ?? k) },
    })
    const disabled = await applyDepartures()
    return { ok: true, accountDisabled: disabled > 0 }
  })

  // Créer un compte de connexion pour un salarié qui n'en a pas
  app.post('/:id/account', async (req, reply) => {
    const e = await findEmployee((req.params as { id: string }).id, reply)
    if (!e) return
    if (e.userId) return reply.code(409).send({ error: 'Ce salarié a déjà un compte.' })
    const parsed = accountBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)

    try {
      const account = await db.transaction(async (tx) => {
        const a = await createAccount(tx, { identifiant: parsed.data.identifiant, nom: fullName(e), role: parsed.data.role })
        await tx.update(employees).set({ userId: a.id, updatedAt: new Date() }).where(eq(employees.id, e.id))
        return a
      })
      await audit(req, 'user.created', {
        targetType: 'user',
        targetId: account.id,
        details: { identifiant: parsed.data.identifiant, nom: fullName(e), role: parsed.data.role, salarie: e.id },
      })
      await applyDepartures()
      return reply.code(201).send({ id: account.id, tempPassword: account.tempPassword })
    } catch (err) {
      if (err instanceof IdentifiantTaken) return reply.code(409).send({ error: err.message, field: 'identifiant' })
      throw err
    }
  })
}
