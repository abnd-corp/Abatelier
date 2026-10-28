import type { CompanySettings } from './db/schema.js'

// Mise en page des e-mails : un en-tête à la couleur de l'entreprise, le message, un bouton d'action facultatif et un pied de page.
// Le texte reste la source : il est converti en paragraphes, listes et liens, et reste l'alternative texte du message.
// Tout ce qui s'affiche est échappé (nom d'un client, motif saisi, message de la direction) : jamais de HTML venu de l'extérieur.

export const DEFAULT_COLOR = '#5b34c4'
export const LOGO_CID = 'logo-entreprise'

export interface MailLayoutInput {
  company: Pick<CompanySettings, 'raisonSociale' | 'adresse' | 'telephone' | 'email'>
  couleur: string
  /** Le logo est joint au message (cid:logo-entreprise) */
  logo: boolean
  subject: string
  /** Texte du message, en paragraphes séparés par une ligne vide ; une ligne « -- » ouvre la signature, qui est remplacée par le pied de page */
  text: string
  /** Gros titre au-dessus du message */
  titre?: string
  action?: { label: string; url: string }
  /** Client : le message le concerne. Équipe : alerte interne de l'application. */
  audience?: 'client' | 'equipe'
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Une couleur #rrggbb, sinon la couleur par défaut (la valeur vient d'une saisie de la direction). */
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : DEFAULT_COLOR)

/** Noir ou blanc, selon ce qui se lit le mieux sur cette couleur. */
export function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return luminance > 0.5 ? '#1d1f24' : '#ffffff'
}

/** Seuls http(s) sont des liens ; la ponctuation qui suit une adresse n'en fait pas partie. */
function linkify(escaped: string, color: string) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (raw) => {
    const m = raw.match(/[.,;:!?)]+$/)
    const trail = m ? m[0] : ''
    const url = trail ? raw.slice(0, -trail.length) : raw
    return `<a href="${url}" style="color:${color};word-break:break-all;">${url}</a>${trail}`
  })
}

/** Sépare le corps de la signature (« -- » seule sur une ligne). */
function splitSignature(text: string) {
  const i = text.search(/(^|\n)--\s*\n/)
  return i === -1 ? text.trim() : text.slice(0, i).trim()
}

function bodyHtml(text: string, color: string) {
  const blocks = splitSignature(text.replace(/\r\n?/g, '\n'))
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+$/g, ''))
    .filter(Boolean)
  const p = 'margin:0 0 16px;'
  return blocks
    .map((block) => {
      const lines = block.split('\n')
      const items = lines.filter((l) => /^\s*-\s+/.test(l))
      // Une liste : « - article » sur chaque ligne (une phrase d'introduction peut la précéder)
      if (items.length && items.length >= lines.length - 1 && /^\s*-\s+/.test(lines[lines.length - 1]!)) {
        const intro = lines.filter((l) => !/^\s*-\s+/.test(l)).join('<br>')
        const li = items.map((l) => `<li style="margin:0 0 6px;">${linkify(esc(l.replace(/^\s*-\s+/, '')), color)}</li>`).join('')
        return `${intro ? `<p style="${p}">${linkify(esc(intro), color)}</p>` : ''}<ul style="margin:0 0 16px;padding-left:22px;">${li}</ul>`
      }
      return `<p style="${p}">${lines.map((l) => linkify(esc(l), color)).join('<br>')}</p>`
    })
    .join('')
}

export function renderMail(i: MailLayoutInput): { html: string } {
  const color = safeColor(i.couleur)
  const on = textOn(color)
  const font = 'font-family:Arial,Helvetica,sans-serif;'
  const body = bodyHtml(i.text, color)
  const coord = [i.company.adresse.replace(/\n+/g, ', '), i.company.telephone && `Tél. : ${i.company.telephone}`, i.company.email].filter(Boolean) as string[]
  const header = i.logo
    ? `<img src="cid:${LOGO_CID}" alt="${esc(i.company.raisonSociale)}" height="40" style="display:block;border:0;height:40px;max-width:200px;width:auto;">`
    : `<span style="${font}font-size:20px;font-weight:bold;color:${color};">${esc(i.company.raisonSociale)}</span>`
  const preheader = splitSignature(i.text).replace(/\s+/g, ' ').slice(0, 110)
  const notice =
    i.audience === 'equipe'
      ? 'Message automatique de l’application, destiné à l’équipe.'
      : `Vous recevez ce message au sujet de votre commande, de votre devis ou de votre espace client chez ${esc(i.company.raisonSociale)}. Nous n’envoyons jamais de publicité.`
  const button = i.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="background:${color};border-radius:8px;"><a href="${esc(i.action.url)}" style="display:inline-block;padding:12px 24px;${font}font-size:16px;font-weight:bold;color:${on};text-decoration:none;">${esc(i.action.label)}</a></td></tr></table>`
    : ''
  const titre = i.titre ? `<h1 style="margin:0 0 18px;${font}font-size:22px;line-height:1.3;color:#1d1f24;">${esc(i.titre)}</h1>` : ''

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(i.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f3f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 4px 14px;">${header}</td></tr>
<tr><td style="background:#ffffff;border-top:4px solid ${color};border-radius:10px;padding:28px 28px 12px;${font}font-size:16px;line-height:1.55;color:#1d1f24;">
${titre}${body}${button}
</td></tr>
<tr><td style="padding:16px 4px 0;${font}font-size:12px;line-height:1.5;color:#6b7280;">
<strong style="color:#374151;">${esc(i.company.raisonSociale)}</strong><br>${coord.map(esc).join('<br>')}
<p style="margin:12px 0 0;">${notice}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  return { html }
}
