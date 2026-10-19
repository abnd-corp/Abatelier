import type { FastifyReply } from 'fastify'
import { z } from 'zod'

// Les nombres arrivent du formulaire en texte français (« 62,50 ») ou en nombre
export const decimal = (min: number, max: number, label: string, unit: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(',', '.')) : v),
    z
      .number({ error: `${label} : nombre attendu.` })
      .min(min, `${label} : ${min} ${unit} minimum.`)
      .max(max, `${label} : ${max} ${unit} maximum.`)
      .transform((n) => Math.round(n * 100) / 100),
  )
export const integer = (min: number, max: number, label: string, unit: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? Number(v.trim()) : v),
    z
      .number({ error: `${label} : nombre attendu.` })
      .int(`${label} : nombre entier attendu.`)
      .min(min, `${label} : ${min} ${unit} minimum.`)
      .max(max, `${label} : ${max} ${unit} maximum.`),
  )

export const digits = (s: string) => s.replace(/\D/g, '')
/** Clé de Luhn, utilisée par les numéros SIREN et SIRET. */
export const luhn = (n: string) =>
  n
    .split('')
    .reverse()
    .reduce((sum, c, i) => {
      let d = Number(c)
      if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2
      return sum + d
    }, 0) %
    10 ===
  0
/** 73282932000074 → « 732 829 320 00074 » */
export const formatSiret = (s: string) => `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`

export function invalid(reply: FastifyReply, e: z.ZodError) {
  const issue = e.issues[0]
  return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: issue?.path[0] !== undefined ? String(issue.path[0]) : undefined })
}

export const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === '23505' || err?.cause?.code === '23505'
}

// Texte canonique d'une valeur : clés triées, car Postgres réordonne celles des colonnes jsonb
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x))

/** Différences avant / après, pour le journal (utile pour suivre l'historique des prix). Tableaux et objets sont comparés par leur contenu. */
export function diff<T extends Record<string, unknown>>(before: T, changes: Partial<T>) {
  const out: Record<string, { avant: unknown; apres: unknown }> = {}
  for (const [k, v] of Object.entries(changes)) if (v !== undefined && canonical(v) !== canonical(before[k])) out[k] = { avant: before[k], apres: v }
  return out
}
