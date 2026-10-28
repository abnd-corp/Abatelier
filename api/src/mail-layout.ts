import type { CompanySettings } from './db/schema.js'

// Mise en page des e-mails : un bandeau à la couleur de l'entreprise, le message, un récapitulatif, des boutons d'action et un pied de page.
// Le texte reste la source : il est converti en paragraphes, listes et liens, et reste l'alternative texte du message.
// Tout ce qui s'affiche est échappé (nom d'un client, motif saisi, message de la direction) : jamais de HTML venu de l'extérieur.

export const DEFAULT_COLOR = '#5b34c4'
export const LOGO_CID = 'logo-entreprise'

export interface MailLayoutInput {
  company: Pick<CompanySettings, 'raisonSociale' | 'adresse' | 'telephone' | 'email'>
  couleur: string
  /** Le logo est joint au message (cid:logo-entreprise) */
  logo: boolean
  /** Logo plus large que haut : il porte déjà le nom de l'entreprise */
  logoLarge?: boolean
  subject: string
  /** Texte du message, en paragraphes séparés par une ligne vide ; une ligne « -- » ouvre la signature, qui est remplacée par le pied de page */
  text: string
  /** Gros titre au-dessus du message */
  titre?: string
  /** Récapitulatif sous forme de tableau (numéro, montant, date…) */
  faits?: { label: string; value: string }[]
  /** Bouton principal */
  action?: { label: string; url: string }
  /** Lien vers l'espace client, sous le bouton */
  espace?: string
  /** Client : le message le concerne. Équipe : alerte interne de l'application. */
  audience?: 'client' | 'equipe'
}

/** Rappel de sécurité, au pied des messages envoyés aux clients. Voir aussi la politique de confidentialité. */
export const SECURITE_CLIENT = 'Nous ne vous demanderons jamais votre mot de passe, vos coordonnées bancaires ni votre numéro de carte par e-mail.'
/** Ajouté quand le message renvoie vers l'espace client : c'est là que se trouvent les documents. */
export const SECURITE_ESPACE = ' Vos documents et le suivi de vos commandes se consultent dans votre espace client, après connexion.'

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
        return `${intro ? `<p style="${p}">${linkify(esc(intro), color)}</p>` : ''}<ul style="margin:0 0 18px;padding:12px 16px 12px 36px;background:#f6f7f9;border-radius:8px;">${li}</ul>`
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
  const nom = esc(i.company.raisonSociale)
  // La marque est posée sur une pastille blanche : un logo foncé ou à fond transparent reste lisible sur n'importe quelle couleur.
  // Un logo large contient déjà le nom de l'entreprise ; une marque carrée est accompagnée de ce nom.
  const pastille = i.logo
    ? `<td style="padding-right:14px;"><span style="display:block;background:#ffffff;border-radius:10px;padding:8px 10px;"><img src="cid:${LOGO_CID}" alt="${nom}" height="36" style="display:block;border:0;height:36px;max-width:${i.logoLarge ? 200 : 60}px;width:auto;"></span></td>`
    : ''
  const nomEntete = !i.logo || !i.logoLarge ? `<td style="${font}font-size:20px;font-weight:bold;letter-spacing:0.2px;color:${on};">${nom}</td>` : ''
  const header = `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${pastille}${nomEntete}</tr></table>`
  const preheader = splitSignature(i.text).replace(/\s+/g, ' ').slice(0, 110)
  const titre = i.titre ? `<h1 style="margin:0 0 18px;${font}font-size:24px;line-height:1.3;color:#1d1f24;">${esc(i.titre)}</h1>` : ''
  const faits = i.faits?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e3e6ea;border-radius:8px;border-collapse:separate;">${i.faits
        .map(
          (f, n) =>
            `<tr><td style="padding:10px 14px;${font}font-size:14px;color:#6b7280;${n ? 'border-top:1px solid #e3e6ea;' : ''}width:42%;">${esc(f.label)}</td><td style="padding:10px 14px;${font}font-size:15px;font-weight:bold;color:#1d1f24;${n ? 'border-top:1px solid #e3e6ea;' : ''}">${esc(f.value)}</td></tr>`,
        )
        .join('')}</table>`
    : ''
  const button = i.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;"><tr><td style="background:${color};border-radius:8px;"><a href="${esc(i.action.url)}" style="display:inline-block;padding:13px 28px;${font}font-size:16px;font-weight:bold;color:${on};text-decoration:none;">${esc(i.action.label)}</a></td></tr></table>`
    : ''
  const espace = i.espace ? `<p style="margin:0 0 20px;${font}font-size:14px;"><a href="${esc(i.espace)}" style="color:${color};font-weight:bold;">Accéder à mon espace client →</a></p>` : ''
  const securite =
    i.audience === 'equipe'
      ? ''
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td style="background:#f6f7f9;border-left:4px solid ${color};border-radius:6px;padding:12px 16px;${font}font-size:13px;line-height:1.5;color:#374151;"><strong>Pour votre sécurité.</strong> ${esc(SECURITE_CLIENT + (i.espace ? SECURITE_ESPACE : ''))}</td></tr></table>`
  const notice =
    i.audience === 'equipe'
      ? 'Message automatique de l’application, destiné à l’équipe.'
      : `Vous recevez ce message au sujet de votre commande, de votre devis ou de votre espace client chez ${nom}. Nous n’envoyons jamais de publicité.`

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(i.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef0f3;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td bgcolor="${color}" style="background:${color};border-radius:12px 12px 0 0;padding:20px 28px;">${header}</td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 12px;${font}font-size:16px;line-height:1.55;color:#1d1f24;">
${titre}${body}${faits}${button}${espace}${securite}
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 12px 12px;height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:18px 6px 0;${font}font-size:12px;line-height:1.6;color:#6b7280;">
<strong style="color:#374151;">${nom}</strong><br>${coord.map(esc).join('<br>')}
<p style="margin:12px 0 0;">${notice}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  return { html }
}
