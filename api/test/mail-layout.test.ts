import { describe, expect, it } from 'vitest'
import { esc, LOGO_CID, renderMail, textOn } from '../src/mail-layout.js'

const company = { raisonSociale: 'Alu <Pliage> & Cie', adresse: '12 rue du Four\n42490 Fraisses', telephone: '04 77 00 00 00', email: 'contact@aps.test' }
const base = { company, couleur: '#5b34c4', logo: false, subject: 'Votre commande', text: 'Bonjour,\n\nMerci.\n\n--\nAlu Pliage Service' }

describe('Mise en page des e-mails', () => {
  it('échappe tout ce qui vient d’une saisie : nom, motif, message', () => {
    const { html } = renderMail({ ...base, text: 'Bonjour <b>Jean</b>,\n\nMotif : <script>alert(1)</script> "x" & y' })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>Jean</b>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot;x&quot; &amp; y')
    // Le nom de l'entreprise aussi
    expect(html).toContain('Alu &lt;Pliage&gt; &amp; Cie')
    expect(esc('<>&"')).toBe('&lt;&gt;&amp;&quot;')
  })

  it('met les paragraphes et les listes en forme, sans la signature du texte', () => {
    const { html } = renderMail({ ...base, text: 'Bonjour Camille,\n\nVotre commande :\n  - 4 × Couvertine\n  - 2 × Bavette\n\nÀ bientôt.\n\n--\nAlu Pliage Service\n12 rue du Four' })
    expect(html.match(/<li /g)).toHaveLength(2)
    expect(html).toContain('4 × Couvertine')
    expect(html).toContain('Votre commande :')
    expect(html).toContain('À bientôt.')
    // La signature de la version texte est remplacée par le pied de page
    expect(html).not.toContain('Alu Pliage Service\n12 rue du Four')
    expect(html).toContain('12 rue du Four, 42490 Fraisses')
    expect(html).toContain('Tél. : 04 77 00 00 00')
  })

  it('transforme les adresses web en liens, sans la ponctuation qui les suit, et ignore les autres schémas', () => {
    const { html } = renderMail({ ...base, text: 'Suivez-la ici : https://atelier.test/espace/commandes/1?a=1&b=2.\n\njavascript:alert(1) et ftp://x.test' })
    expect(html).toContain('<a href="https://atelier.test/espace/commandes/1?a=1&amp;b=2" ')
    expect(html).toContain('</a>.')
    expect(html).not.toContain('href="javascript')
    expect(html).not.toContain('href="ftp')
  })

  it('affiche le bouton d’action avec une couleur lisible, et le titre', () => {
    const clair = renderMail({ ...base, couleur: '#ffe066', titre: 'Votre commande est confirmée', action: { label: 'Suivre ma commande', url: 'https://atelier.test/x' } }).html
    expect(clair).toContain('>Suivre ma commande</a>')
    expect(clair).toContain('href="https://atelier.test/x"')
    expect(clair).toContain('Votre commande est confirmée')
    // Texte sombre sur une couleur claire, blanc sur une couleur foncée
    expect(textOn('#ffe066')).toBe('#1d1f24')
    expect(textOn('#5b34c4')).toBe('#ffffff')
    expect(clair).toMatch(/background:#ffe066;border-radius:8px;"><a [^>]*color:#1d1f24/)
  })

  it('retombe sur la couleur par défaut quand la couleur saisie est invalide, sans rien laisser passer', () => {
    const { html } = renderMail({ ...base, couleur: 'red;background:url(javascript:alert(1))' })
    expect(html).toContain('#5b34c4')
    expect(html).not.toContain('javascript:alert')
  })

  it('met le logo ou, sans logo, le nom de l’entreprise', () => {
    expect(renderMail({ ...base, logo: true }).html).toContain(`src="cid:${LOGO_CID}"`)
    const sans = renderMail(base).html
    expect(sans).not.toContain('cid:')
    // Sans logo : le nom, en blanc sur le bandeau de couleur
    expect(sans).toContain('font-size:20px;font-weight:bold;letter-spacing:0.2px;color:#ffffff;')
  })

  it('met le récapitulatif en tableau, et le lien vers l’espace client sous le bouton', () => {
    const { html } = renderMail({
      ...base,
      faits: [
        { label: 'Commande', value: 'C-2026-0042' },
        { label: 'Montant payé', value: '126,00 € TTC' },
      ],
      action: { label: 'Suivre ma commande', url: 'https://atelier.test/espace/commandes/1' },
      espace: 'https://atelier.test/espace',
    })
    expect(html).toContain('>Commande</td>')
    expect(html).toContain('>C-2026-0042</td>')
    expect(html).toContain('Accéder à mon espace client')
    expect(html).toContain('href="https://atelier.test/espace"')
    // Le rappel de sécurité cite l'espace client seulement quand le message y renvoie
    expect(html).toContain('se consultent dans votre espace client')
    expect(renderMail(base).html).not.toContain('se consultent dans votre espace client')
    expect(renderMail({ ...base, audience: 'equipe', espace: 'https://atelier.test/espace' }).html).not.toContain('Pour votre sécurité')
  })

  it('met le logo sur une pastille, avec le nom à côté quand c’est une marque carrée, sans le nom quand le logo est large', () => {
    const carre = renderMail({ ...base, logo: true, logoLarge: false }).html
    expect(carre).toContain('src="cid:logo-entreprise"')
    expect(carre).toContain('max-width:60px')
    expect(carre).toContain('>Alu &lt;Pliage&gt; &amp; Cie</td>')
    const large = renderMail({ ...base, logo: true, logoLarge: true }).html
    expect(large).toContain('max-width:200px')
    expect(large).not.toContain('letter-spacing:0.2px')
  })

  it('dit au client qu’il ne reçoit jamais de publicité, et à l’équipe que le message est automatique', () => {
    expect(renderMail(base).html).toContain('Nous n’envoyons jamais de publicité')
    const equipe = renderMail({ ...base, audience: 'equipe' }).html
    expect(equipe).toContain('Message automatique de l’application, destiné à l’équipe.')
    expect(equipe).not.toContain('publicité')
  })
})
