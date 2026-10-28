import nodemailer, { type Transporter } from 'nodemailer'
import { db } from './db/index.js'
import { emailLog, type CompanySettings } from './db/schema.js'
import { env } from './env.js'
import { getCompany, getTemplate } from './documents.js'
import { LOGO_CID, renderMail } from './mail-layout.js'

// Envoi d'e-mails par SMTP. En développement, Mailpit (http://localhost:8025) attrape tout : rien ne part pour de vrai.
// Sans SMTP_HOST et MAIL_FROM, l'envoi est désactivé et l'application continue de fonctionner.

export interface Attachment {
  filename: string
  content: Buffer
  contentType: string
  /** Image affichée dans le corps du message (cid:…) plutôt que jointe */
  cid?: string
}
export interface MailInput {
  kind: (typeof emailLog.$inferInsert)['kind']
  to: string[]
  subject: string
  text: string
  /** Texte de la version mise en page, quand il diffère du texte brut (par exemple sans le lien que remplace le bouton) */
  htmlText?: string
  /** Gros titre de la version mise en page */
  titre?: string
  /** Bouton d'action de la version mise en page */
  action?: { label: string; url: string }
  /** Client (par défaut) ou équipe : change le pied de page */
  audience?: 'client' | 'equipe'
  replyTo?: string
  attachments?: Attachment[]
  targetType?: string
  targetId?: string
  userId?: string
}
export type MailResult = { ok: true } | { ok: false; notConfigured: boolean; error: string }

/** Ce que fait nodemailer et rien de plus : permet de brancher un faux dans les tests. */
export interface Transport {
  sendMail(options: { from: string; to: string[]; subject: string; text: string; html?: string; replyTo?: string; attachments?: Attachment[] }): Promise<unknown>
}

let transport: Transport | null = null
/** Pour les tests : remplace l'envoi réel. */
export const setTransport = (t: Transport | null) => (transport = t)

export const isMailConfigured = () => Boolean(env.SMTP_HOST && env.MAIL_FROM)

function getTransport(): Transport {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    // Un mot de passe ne part jamais en clair : STARTTLS exigé dès qu'il y a un identifiant
    requireTLS: !env.SMTP_SECURE && Boolean(env.SMTP_USER),
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
  }) as Transporter
  return transport
}

/** Message d'erreur sans détail technique (ni adresse du serveur, ni identifiant). */
function reason(e: unknown) {
  const code = (e as { responseCode?: number; code?: string } | null)?.responseCode
  const name = (e as { code?: string } | null)?.code
  if (name === 'EAUTH' || code === 535) return 'identifiants refusés par le serveur de messagerie'
  if (name === 'ETIMEDOUT' || name === 'ECONNECTION' || name === 'ESOCKET' || name === 'ECONNREFUSED' || name === 'EDNS') return 'serveur de messagerie injoignable'
  if (code && code >= 500) return 'message refusé par le serveur de messagerie'
  return 'envoi impossible'
}

const addresses = (list: string | undefined) =>
  (list ?? '')
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean)

/** Destinataires des alertes internes : MAIL_ALERT_TO, sinon l'e-mail de l'entreprise. */
export async function alertRecipients() {
  const configured = addresses(env.MAIL_ALERT_TO)
  if (configured.length) return configured
  const email = (await getCompany()).email.trim()
  return email ? [email] : []
}

/** Envoie le message et le note dans le journal des e-mails. Ne lève jamais d'erreur : le résultat dit ce qui s'est passé. */
export async function sendMail(input: MailInput): Promise<MailResult> {
  if (!isMailConfigured()) return { ok: false, notConfigured: true, error: 'L’envoi d’e-mails n’est pas configuré sur ce serveur.' }
  let result: MailResult = { ok: true }
  // Version mise en page (HTML) en plus du texte : si elle ne peut pas se construire, le texte part seul
  let html: string | undefined
  let attachments = input.attachments
  try {
    const built = await buildHtml(input)
    html = built.html
    if (built.logo) attachments = [...(attachments ?? []), built.logo]
  } catch (e) {
    console.error('E-mail : mise en page impossible, envoi en texte seul', e instanceof Error ? e.message : e)
  }
  try {
    await getTransport().sendMail({ from: env.MAIL_FROM!, to: input.to, subject: input.subject, text: input.text, html, replyTo: input.replyTo, attachments })
  } catch (e) {
    result = { ok: false, notConfigured: false, error: reason(e) }
    console.error(`E-mail « ${input.subject} » non envoyé : ${reason(e)}`)
  }
  try {
    await db.insert(emailLog).values({
      kind: input.kind,
      destinataires: input.to.join(', '),
      objet: input.subject,
      statut: result.ok ? 'envoye' : 'echec',
      erreur: result.ok ? null : result.error,
      targetType: input.targetType,
      targetId: input.targetId,
      userId: input.userId,
    })
  } catch (e) {
    console.error('Journal des e-mails : écriture impossible', e instanceof Error ? e.message : e)
  }
  return result
}

/** Le message mis en page, avec le logo de l'entreprise s'il y en a un. */
export async function buildHtml(input: Pick<MailInput, 'subject' | 'text' | 'htmlText' | 'titre' | 'action' | 'audience'>): Promise<{ html: string; logo: Attachment | null }> {
  const [company, template] = await Promise.all([getCompany(), getTemplate()])
  const logo = company.logo && company.logoType ? { filename: 'logo', content: company.logo, contentType: company.logoType, cid: LOGO_CID } : null
  const { html } = renderMail({
    company,
    couleur: template.couleur,
    logo: logo !== null,
    subject: input.subject,
    text: input.htmlText ?? input.text,
    titre: input.titre,
    action: input.action,
    audience: input.audience,
  })
  return { html, logo }
}

/** Attend l'envoi, mais au plus `ms` millisecondes : une messagerie lente ne doit pas bloquer un visiteur. */
export const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])

/** Pied de message : nom et coordonnées de l'entreprise. */
export function signature(c: Pick<CompanySettings, 'raisonSociale' | 'adresse' | 'telephone' | 'email'>) {
  return ['--', c.raisonSociale, c.adresse.replace(/\n+/g, ', '), c.telephone && `Tél. : ${c.telephone}`, c.email && `E-mail : ${c.email}`].filter(Boolean).join('\n')
}
