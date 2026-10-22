import type { Page } from '@playwright/test'
import { ADMIN, apiLogin, createUser, expect, makePng, NEW_PASSWORD, test, waitForMail } from './fixtures'

const PASSWORD = 'Plieuse-numerique-2026'

// Site vitrine : parcours des visiteurs (sans connexion) et de la direction qui le gère.
// Les tests tournent en parallèle sur la même base : chaque navigateur modifie son propre champ de texte.
const FIELD = { chromium: { key: 'pliage.intro', label: 'Introduction' }, firefox: { key: 'contact.intro', label: 'Introduction de la page Contact' } } as const

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n')
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

test.describe('Site vitrine : visiteurs', () => {
  test('parcourt l’accueil, le pliage, les pages légales, sans cookie ni connexion', async ({ page, context }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('sur mesure')
    await expect(page).toHaveTitle(/Alu Pliage Service/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{40,}/)
    await expect(page.getByRole('heading', { name: 'Comment ça marche ?' })).toBeVisible()
    // Les étapes d'une commande sont sous le texte explicatif, chacune de sa couleur
    const etapes = page.getByRole('list', { name: 'Étapes d’une commande' }).locator('li')
    await expect(etapes).toHaveCount(5)
    const texte = await page.getByRole('heading', { name: 'Ensuite, tout se suit en ligne' }).boundingBox()
    expect((await etapes.first().boundingBox())!.y).toBeGreaterThan(texte!.y)
    const fonds = await etapes.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))
    expect(new Set(fonds).size).toBe(5)
    await expect(page.locator('script#ld-entreprise')).toHaveCount(1)

    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Pliage aluminium' }).click()
    await expect(page).toHaveURL('/pliage-aluminium')
    await expect(page.getByRole('heading', { level: 1, name: 'Pliage aluminium sur mesure' })).toBeVisible()
    await expect(page.locator('#couvertine')).toBeVisible()

    for (const [lien, titre] of [
      ['Mentions légales', 'Mentions légales'],
      ['Confidentialité', 'Politique de confidentialité'],
      ['Cookies', 'Cookies'],
      ['Conditions générales de vente', 'Conditions générales de vente'],
    ] as const) {
      await page.getByRole('contentinfo').getByRole('link', { name: lien }).click()
      await expect(page.getByRole('heading', { level: 1, name: titre })).toBeVisible()
    }
    // Aucun cookie déposé chez un visiteur, et aucun appel à la session
    expect(await context.cookies()).toEqual([])
  })

  test('l’accueil mène droit au configurateur : section dédiée et bouton principal', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('section[aria-labelledby="configurateur"]')
    await expect(section.getByRole('heading', { name: 'Configurez votre pièce en ligne' })).toBeVisible()
    await expect(section.getByRole('listitem')).toHaveCount(3)
    await section.getByRole('link', { name: 'Ouvrir le configurateur' }).click()
    await expect(page).toHaveURL('/configurateur')
    await expect(page.getByRole('heading', { level: 1, name: 'Dessinez votre pièce, voyez le prix' })).toBeVisible()
    // Le bouton du haut de l'accueil y mène aussi
    await page.goto('/')
    await page.locator('.hero').getByRole('link', { name: 'Configurer ma pièce' }).click()
    await expect(page).toHaveURL('/configurateur')
  })

  test('affiche une page 404 propre, non indexée', async ({ page }) => {
    await page.goto('/une-page-qui-nexiste-pas')
    await expect(page.getByRole('heading', { name: 'Cette page n’existe pas' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow')
    await page.getByRole('link', { name: 'Retour à l’accueil' }).click()
    await expect(page).toHaveURL('/')
  })

  test('donne robots.txt et le plan du site, qui cachent l’atelier', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain('Disallow: /clients')
    expect(robots).toMatch(/Sitemap: https?:\/\/[^/]+\/sitemap\.xml/)
    const map = await (await request.get('/sitemap.xml')).text()
    expect(map).toContain('/pliage-aluminium</loc>')
    expect(map).not.toContain('/clients')
  })

  test('envoie une demande avec un plan, qui arrive chez la direction', async ({ page, browser, baseURL, uid }) => {
    // La direction : contexte à part, pour que le visiteur reste anonyme
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)

    await page.goto('/contact')
    await expect(page.getByRole('heading', { level: 1, name: 'Contactez-nous' })).toBeVisible()
    await page.getByLabel('Votre nom').fill(`Jean ${uid}`)
    await page.getByLabel('Votre e-mail').fill(`${uid}@exemple.fr`)
    await page.getByLabel('Votre téléphone').fill('06 12 34 56 78')
    await page.getByLabel('Objet').fill(`12 couvertines ${uid}`)
    await page.getByLabel('Votre message').fill('Bonjour, je voudrais un devis pour 12 couvertines blanches de 3 m.')
    await page.getByLabel('Votre plan (facultatif)').setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: PDF })
    await expect(page.getByText('plan.pdf ·')).toBeVisible()
    await page.getByLabel(/J’accepte que mes données/).check()
    await page.getByRole('button', { name: 'Envoyer' }).click()
    await expect(page.getByRole('heading', { name: 'Message envoyé' })).toBeVisible()

    // La direction est prévenue par e-mail, avec la réponse directe au visiteur
    const alerte = await waitForMail(page.request, `12 couvertines ${uid}`)
    expect(alerte.To.map((a) => a.Address)).toEqual(['direction@aps.test'])
    expect(alerte.ReplyTo.map((a) => a.Address)).toEqual([`${uid}@exemple.fr`])
    expect(alerte.Text).toContain('Bonjour, je voudrais un devis pour 12 couvertines')
    expect(alerte.Text).toContain('Plan joint : plan.pdf')
    expect(alerte.Attachments).toHaveLength(0)

    // Côté direction : la demande est là, avec son plan
    await admin.goto('/site-vitrine')
    await admin.getByRole('button', { name: new RegExp(`12 couvertines ${uid}`) }).click()
    await expect(admin.getByText('Bonjour, je voudrais un devis')).toBeVisible()
    const href = await admin.getByRole('link', { name: 'plan.pdf' }).getAttribute('href')
    const file = await admin.request.get(href!)
    expect(file.headers()['content-disposition']).toMatch(/^attachment/)
    expect(Buffer.from(await file.body()).equals(PDF)).toBe(true)

    await admin.getByRole('button', { name: 'Marquer comme traitée' }).click()
    await expect(admin.getByText(`12 couvertines ${uid}`)).toHaveCount(0)
    await admin.getByRole('button', { name: /^Traitées/ }).click()
    await admin.getByRole('button', { name: new RegExp(`12 couvertines ${uid}`) }).click()
    await admin.getByRole('button', { name: 'Supprimer' }).click()
    await admin.getByRole('button', { name: 'Oui, supprimer' }).click()
    await expect(admin.getByText(`12 couvertines ${uid}`)).toHaveCount(0)
  })

  test('refuse un envoi incomplet et un plan interdit, sans perdre la saisie', async ({ page }) => {
    await page.goto('/contact')
    await page.getByLabel('Votre nom').fill('Marie Test')
    await page.getByLabel('Votre e-mail').fill('pas-un-mail')
    await page.getByLabel('Objet').fill('Test')
    await page.getByLabel('Votre message').fill('Bonjour')
    await page.getByRole('button', { name: 'Envoyer' }).click()
    await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible()
    await expect(page.getByLabel('Votre nom')).toHaveValue('Marie Test')

    await page.getByLabel('Votre e-mail').fill('marie@exemple.fr')
    await page.getByRole('button', { name: 'Envoyer' }).click()
    await expect(page.getByText('Cochez la case pour accepter')).toBeVisible()

    await page.getByLabel('Votre plan (facultatif)').setInputFiles({ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') })
    await expect(page.getByText('Format non accepté')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Message envoyé' })).toHaveCount(0)
  })

  test('les avis Google ne sont jamais inventés : sans clé, aucun avis affiché', async ({ page, request }) => {
    const res = await (await request.get('/api/public/avis')).json()
    expect(res).toMatchObject({ configure: false, avis: [], note: null })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Comment ça marche ?' })).toBeVisible()
    await expect(page.locator('.review')).toHaveCount(0)
  })
})

test.describe('Configurateur : du visiteur à la commande', () => {
  test('le visiteur choisit une taille standard en un clic et le prix suit', async ({ page }) => {
    await page.goto('/configurateur')
    const piece = page.getByRole('region', { name: 'Pièce 1' })
    const total = async () => (await page.getByRole('complementary', { name: 'Montant de la commande' }).locator('dd.big').innerText()).replace(/\s/g, '')
    await expect(piece.getByLabel('Largeur du dessus (taille standard)')).toBeVisible()
    await piece.getByLabel('Largeur du dessus (taille standard)').selectOption('320')
    await piece.getByLabel('Longueur (taille standard)').selectOption('1000')
    await expect(piece.locator('#l0-cote2')).toHaveValue('320')
    await expect(piece.getByLabel('Longueur', { exact: true })).toHaveValue('1000')
    const un = await total()
    await piece.getByLabel('Longueur (taille standard)').selectOption('3000')
    await expect.poll(total).not.toBe(un)
    // Un autre modèle propose ses propres tailles
    await piece.getByLabel('Modèle').selectOption({ label: 'Bavette d’appui' })
    await expect(piece.getByLabel('Profondeur (taille standard)')).toBeVisible()
  })

  test('le visiteur télécharge son devis en PDF sans compte, la page ne parle pas de données ni de contact', async ({ page, context }) => {
    await page.goto('/configurateur')
    await expect(page.getByRole('region', { name: 'Pièce 1' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Montant de la commande' })).toBeVisible()
    await expect(page.locator('main').getByRole('link', { name: /contact|plan/i })).toHaveCount(0)
    await expect(page.getByText('comme avant')).toHaveCount(0)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger le devis' }).click()])
    expect(download.suggestedFilename()).toBe('devis.pdf')
    const path = await download.path()
    expect((await import('node:fs')).readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-')
    // Aucun compte ni cookie créé
    expect(await context.cookies()).toEqual([])
  })

  test('le visiteur dessine sa pièce, crée son espace client et a son devis tout de suite, suit sa commande', async ({ page, browser, baseURL, uid, context }) => {
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const nom = `Visiteur ${uid.slice(-6)}`
    const email = `${uid}@exemple.fr`

    await page.goto('/configurateur')
    await expect(page.getByRole('heading', { level: 1, name: 'Dessinez votre pièce, voyez le prix' })).toBeVisible()
    const piece = page.getByRole('region', { name: 'Pièce 1' })
    const summary = page.getByRole('complementary', { name: 'Montant de la commande' })
    await expect(summary).toContainText('Total TTC')
    await expect(piece.locator('.line-price')).toContainText('HT')
    // Pas de notes internes ni de remise pro pour un visiteur
    await expect(page.getByText('Notes internes')).toHaveCount(0)
    await expect(summary).not.toContainText('Remise pro')

    // Le prix suit la quantité
    const total = async () => (await summary.locator('dd.big').innerText()).replace(/\s/g, '')
    const before = await total()
    await piece.getByLabel('Quantité').fill('9')
    await expect.poll(total).not.toBe(before)

    // Cote hors limites : signalée tout de suite, télécharger est bloqué aussi
    await piece.locator('#l0-cote0').fill('3')
    await expect(piece.getByRole('alert')).toContainText('Cote A')
    await expect(page.getByRole('button', { name: 'Télécharger le devis' })).toBeDisabled()
    await expect(page.locator('#cfg-why')).toContainText('Corrigez d’abord les pièces signalées')
    await piece.locator('#l0-cote0').fill('20')
    await expect(piece.getByRole('alert')).toHaveCount(0)
    await piece.getByLabel('Repère').fill(`Muret ${uid.slice(-4)}`)

    // Une pièce se réduit en gardant un résumé, et se rouvre
    await piece.getByRole('button', { name: 'Réduire la pièce 1' }).click()
    await expect(piece.locator('.resume')).toContainText('Couvertine')
    await expect(piece.getByLabel('Longueur', { exact: true })).toBeHidden()
    await piece.getByRole('button', { name: 'Développer la pièce 1' }).click()
    await expect(piece.getByLabel('Longueur', { exact: true })).toBeVisible()

    // Le visiteur n'a toujours aucun cookie : le prix s'affiche sans compte
    expect(await context.cookies()).toEqual([])

    // Sans espace client : on peut seulement télécharger, le reste est grisé et la raison est dite
    await expect(page.getByRole('button', { name: 'Télécharger le devis' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Enregistrer le devis' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Passer la commande' })).toBeDisabled()
    await expect(page.locator('#cfg-why')).toContainText('il faut être connecté à votre espace client')
    await expect(page.getByRole('heading', { name: 'Obtenir mon devis' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Ce que nous faisons de vos données/ })).toHaveCount(0)

    // Création de l'espace client à côté de « Pourquoi un espace client ? », erreurs claires, puis retour au configurateur avec la saisie
    await page.locator('#cfg-why').getByRole('link', { name: 'Créer mon espace' }).click()
    await expect(page).toHaveURL(/\/espace\/inscription\?redirect=/)
    await expect(page.getByRole('heading', { name: 'Pourquoi un espace client ?' })).toBeVisible()
    await page.getByLabel('Nom *').fill(nom)
    await page.getByLabel('Adresse e-mail *').fill('pas-un-mail')
    await page.getByLabel('Mot de passe *').fill('court')
    await page.getByLabel(/J’accepte que mes données/).check()
    await page.getByRole('button', { name: 'Créer mon espace', exact: true }).click()
    await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible()
    await page.getByLabel('Adresse e-mail *').fill(email)
    await page.getByRole('button', { name: 'Créer mon espace', exact: true }).click()
    await expect(page.getByText(/au moins 12 caractères/)).toBeVisible()
    await page.getByLabel('Mot de passe *').fill(PASSWORD)
    await page.getByRole('button', { name: 'Créer mon espace', exact: true }).click()
    await expect(page).toHaveURL('/configurateur')
    await expect(page.getByRole('region', { name: 'Pièce 1' }).getByLabel('Repère')).toHaveValue(`Muret ${uid.slice(-4)}`)
    await expect(page.getByRole('button', { name: 'Enregistrer le devis' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Passer la commande' })).toBeEnabled()
    await page.getByLabel('Une précision pour l’atelier').fill('Pose prévue en mars.')
    await page.getByRole('button', { name: 'Enregistrer le devis' }).click()

    // Le devis est tout de suite dans l'espace du client, avec le suivi de la commande
    await expect(page).toHaveURL(/\/espace\/commandes\/[0-9a-f-]{36}$/)
    const numero = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    expect(numero).toMatch(/^C-\d{4}-\d{4}$/)
    await expect(page.getByRole('heading', { name: /^Votre devis D-\d{4}-\d{4}$/ })).toBeVisible()
    await expect(page.locator('#devis')).toContainText('Devis à valider')
    await expect(page.getByRole('region', { name: 'Suivi de la commande' })).toContainText('Demande reçue')
    await expect(page.getByText(`Muret ${uid.slice(-4)}`)).toBeVisible()
    const pdfHref = await page.getByRole('link', { name: /Télécharger le devis/ }).getAttribute('href')
    const pdf = await page.request.get(pdfHref!)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
    // Seul cookie du site : celui de la session, jamais lisible par un script
    const cookies = await context.cookies()
    expect(cookies.map((c) => c.name.replace('__Host-', ''))).toEqual(['aps_client'])
    expect(cookies[0]!.httpOnly).toBe(true)

    // La direction est prévenue par e-mail, et retrouve la commande dans l'atelier
    const mail = await waitForMail(page.request, nom)
    expect(mail.Subject).toContain('Nouveau devis depuis l’espace client')
    expect(mail.Text).toContain(numero)
    expect(mail.ReplyTo.map((a) => a.Address)).toEqual([email])
    const found = await (await admin.request.get(`/api/orders?q=${numero}&filtre=toutes`)).json()
    const order = found.orders[0] as { id: string }
    await admin.goto(`/commandes/${order.id}`)
    await expect(admin.getByRole('heading', { level: 1 })).toContainText(numero)
    await expect(admin.getByText(nom).first()).toBeVisible()
    await expect(admin.getByText('Pose prévue en mars.').first()).toBeVisible()

    // Le client accepte le devis : l'atelier est prévenu, la commande attend sa validation
    await page.getByRole('button', { name: 'Accepter le devis' }).click()
    await expect(page.locator('#devis')).toContainText('Devis accepté')
    await expect(page.getByRole('button', { name: 'Accepter le devis' })).toHaveCount(0)
    await waitForMail(page.request, `par ${nom}`)

    // L'atelier valide, puis lance la fabrication : le client suit chaque étape
    expect((await admin.request.post(`/api/orders/${order.id}/status`, { data: { statut: 'validee' }, headers: { Origin: baseURL! } })).status()).toBe(200)
    expect((await admin.request.post(`/api/orders/${order.id}/status`, { data: { statut: 'fabrication' }, headers: { Origin: baseURL! } })).status()).toBe(200)
    await page.reload()
    const suivi = page.getByRole('region', { name: 'Suivi de la commande' })
    await expect(suivi.locator('li[aria-current="step"]')).toContainText('En fabrication')
    await expect(suivi).toContainText('Vos pièces sont en cours de pliage')

    // La liste de ses commandes, puis déconnexion : l'espace est fermé, la connexion le rouvre
    await page.getByRole('link', { name: 'Mes commandes' }).click()
    await expect(page.getByRole('list', { name: 'Vos commandes' })).toContainText(numero)
    await page.getByRole('button', { name: 'Me déconnecter' }).click()
    await expect(page).toHaveURL('/')
    await page.goto(`/espace/commandes/${order.id}`)
    await expect(page).toHaveURL(/\/espace\/connexion\?redirect=/)
    await page.getByLabel('Adresse e-mail *').fill(email)
    await page.getByLabel('Mot de passe *').fill('mauvais-mot-de-passe-12')
    await page.getByRole('button', { name: 'Me connecter' }).click()
    await expect(page.getByRole('alert')).toContainText('incorrect')
    await page.getByLabel('Mot de passe *').fill(PASSWORD)
    await page.getByRole('button', { name: 'Me connecter' }).click()
    await expect(page).toHaveURL(`/espace/commandes/${order.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(numero)

    // Le client existe, venu du site
    const clients = await (await admin.request.get(`/api/clients?q=${encodeURIComponent(email)}`)).json()
    expect(clients.clients[0]).toMatchObject({ origine: 'site', email })
  })

  test('la connexion et la création de l’espace client montrent « Pourquoi un espace client ? » à côté du formulaire, sans texte sur les données', async ({ page }) => {
    for (const path of ['/espace/inscription', '/espace/connexion']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: 'Pourquoi un espace client ?' })).toBeVisible()
      await expect(page.getByRole('heading', { name: /Ce que nous faisons de vos données/ })).toHaveCount(0)
      // Quatre raisons en quadrillage 2 × 2
      const cartes = await page
        .getByRole('complementary')
        .locator('li')
        .evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect()
            return { x: Math.round(r.x), y: Math.round(r.y) }
          }),
        )
      expect(cartes).toHaveLength(4)
      if ((page.viewportSize()?.width ?? 0) > 420) {
        expect(cartes[1]!.y).toBe(cartes[0]!.y)
        expect(cartes[1]!.x).toBeGreaterThan(cartes[0]!.x)
        expect(cartes[2]!.y).toBeGreaterThan(cartes[0]!.y)
        expect(cartes[3]!.y).toBe(cartes[2]!.y)
      }
      const [form, why] = [await page.locator('section.box').boundingBox(), await page.getByRole('complementary').boundingBox()]
      if ((page.viewportSize()?.width ?? 0) > 900) expect(why!.x).toBeGreaterThan(form!.x + form!.width - 1)
      else expect(why!.y).toBeGreaterThan(form!.y)
    }
  })

  test('le client ferme son espace : mot de passe exigé, fiche anonymisée, adresse libérée', async ({ page, baseURL, uid }) => {
    const email = `${uid}@exemple.fr`
    const res = await page.request.post('/api/espace/inscription', { data: { nom: `Ferme ${uid.slice(-6)}`, email, password: PASSWORD, consentement: true }, headers: { Origin: baseURL! } })
    expect(res.status(), await res.text()).toBe(201)
    await page.goto('/espace')
    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Fermer mon espace' })).toBeVisible()
    await page.getByRole('button', { name: 'Fermer mon espace…' }).click()
    // Mauvais mot de passe : refus, l'espace reste ouvert
    await page.getByLabel('Mot de passe pour confirmer').fill('Mauvais-mot-de-passe-1')
    await page.getByRole('button', { name: 'Fermer définitivement mon espace' }).click()
    await expect(page.getByRole('alert')).toContainText('Mot de passe incorrect')
    await expect(page).toHaveURL(/\/espace$/)
    // Bon mot de passe : retour à l'accueil, l'espace n'existe plus
    await page.getByLabel('Mot de passe pour confirmer').fill(PASSWORD)
    await page.getByRole('button', { name: 'Fermer définitivement mon espace' }).click()
    await expect(page).toHaveURL(/\/$/)
    expect((await page.request.get('/api/espace/commandes')).status()).toBe(401)
    const login = await page.request.post('/api/espace/connexion', { data: { email, password: PASSWORD }, headers: { Origin: baseURL! } })
    expect(login.status()).toBe(401)
    // L'adresse est libre : on peut recréer un espace
    const again = await page.request.post('/api/espace/inscription', { data: { nom: 'Retour', email, password: PASSWORD, consentement: true }, headers: { Origin: baseURL! } })
    expect(again.status(), await again.text()).toBe(201)
  })

  test('un client ne voit jamais la commande d’un autre, ni avec le cookie de l’atelier', async ({ browser, baseURL, uid }) => {
    const signup = async (suffix: string) => {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      const res = await page.request.post('/api/espace/inscription', {
        data: { nom: `Client ${uid.slice(-6)}${suffix}`, email: `${uid}${suffix}@exemple.fr`, password: PASSWORD, consentement: true },
        headers: { Origin: baseURL! },
      })
      expect(res.status(), await res.text()).toBe(201)
      return page
    }
    const config = (await (await (await browser.newContext()).request.get(`${baseURL}/api/public/configurateur`)).json()) as {
      models: { id: string; cotes: number[]; angles: number[]; longueur: number }[]
      materials: { id: string }[]
      colors: { id: string }[]
    }
    const m = config.models[0]!
    const a = await signup('a')
    const res = await a.request.post('/api/espace/devis', {
      data: {
        lignes: [{ modelId: m.id, materialId: config.materials[0]!.id, colorId: config.colors[0]!.id, cotes: m.cotes, angles: m.angles, longueur: m.longueur, quantite: 1, accessoires: [] }],
        livraison: { mode: 'retrait' },
      },
      headers: { Origin: baseURL! },
    })
    expect(res.status(), await res.text()).toBe(201)
    const { id } = await res.json()

    const b = await signup('b')
    await b.goto(`/espace/commandes/${id}`)
    await expect(b.getByRole('heading', { name: 'Commande introuvable' })).toBeVisible()
    expect((await b.request.get(`/api/espace/commandes/${id}`)).status()).toBe(404)

    // Un visiteur sans compte est renvoyé vers la connexion, et l'API le refuse
    const visitor = await (await browser.newContext()).newPage()
    await visitor.goto('/espace')
    await expect(visitor).toHaveURL(/\/espace\/connexion/)
    expect((await visitor.request.get('/api/espace/commandes')).status()).toBe(401)
    // Le cookie de l'espace client n'ouvre rien de l'atelier
    expect((await a.request.get('/api/orders')).status()).toBe(401)
    expect((await a.request.get('/api/clients')).status()).toBe(401)
  })
})

test.describe('Site vitrine : direction', () => {
  test('modifie un texte et une photo, visibles tout de suite sur le site, puis les rétablit', async ({ adminPage, browser, uid }, info) => {
    const field = FIELD[info.project.name as keyof typeof FIELD]
    const alt = `Chantier de test ${uid}`
    const visitor = await (await browser.newContext()).newPage()

    await adminPage.goto('/site-vitrine?onglet=textes')
    const box = adminPage.getByLabel(field.label, { exact: true })
    const original = await box.inputValue()
    await box.fill(`Texte de test ${uid}`)
    await adminPage.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(adminPage.getByText('Textes enregistrés')).toBeVisible()
    await visitor.goto(field.key === 'pliage.intro' ? '/pliage-aluminium' : '/contact')
    await expect(visitor.getByText(`Texte de test ${uid}`)).toBeVisible()

    // Photo : envoyée réduite, affichée sur l'accueil
    await adminPage.goto('/site-vitrine?onglet=photos')
    await adminPage.getByLabel('Où l’afficher ?').selectOption('realisation')
    await adminPage
      .getByLabel(/^Description/)
      .first()
      .fill(alt)
    await adminPage.locator('#p-file').setInputFiles({ name: 'chantier.png', mimeType: 'image/png', buffer: makePng(900, 600) })
    await adminPage.getByRole('button', { name: 'Envoyer' }).click()
    await expect(adminPage.getByText('1 photo ajoutée')).toBeVisible()
    await visitor.goto('/')
    const img = visitor.getByRole('img', { name: alt })
    await expect(img).toBeVisible()
    // Photo chargée « à la demande » : on la fait défiler dans l'écran, puis on attend qu'elle soit décodée
    await img.scrollIntoViewIfNeeded()
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)

    // Ménage : texte d'origine et photo supprimée
    await adminPage.goto('/site-vitrine?onglet=photos')
    const card = adminPage.locator('li.ph').filter({ has: adminPage.locator(`input[value="${alt}"]`) })
    await card.getByRole('button', { name: /^Supprimer la photo/ }).click()
    await card.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(adminPage.locator(`input[value="${alt}"]`)).toHaveCount(0)
    await visitor.goto('/')
    await expect(visitor.getByRole('img', { name: alt })).toHaveCount(0)

    await adminPage.goto('/site-vitrine?onglet=textes')
    await adminPage.getByLabel(field.label, { exact: true }).fill(original)
    await adminPage.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(adminPage.getByText('Textes enregistrés')).toBeVisible()
  })

  test('l’onglet E-mails vérifie la messagerie : essai reçu, historique, alerte de contact', async ({ adminPage, uid }) => {
    await adminPage.goto('/site-vitrine?onglet=emails')
    await expect(adminPage.getByText('Configuré : les messages partent de')).toBeVisible()
    await expect(adminPage.getByText('direction@aps.test').first()).toBeVisible()
    await adminPage.getByLabel('Adresse qui reçoit l’essai').fill(`${uid}@exemple.fr`)
    await adminPage.getByRole('button', { name: 'Envoyer l’essai' }).click()
    await expect(adminPage.getByText('Message d’essai envoyé')).toBeVisible()
    const essai = await waitForMail(adminPage.request, 'Essai d’envoi')
    expect(essai.Subject).toContain('Essai d’envoi')
    await expect(adminPage.getByRole('cell', { name: /Essai d’envoi/ }).first()).toBeVisible()
    await expect(adminPage.getByText('Envoyé', { exact: true }).first()).toBeVisible()

    // Adresse invalide : refus clair
    await adminPage.getByLabel('Adresse qui reçoit l’essai').fill('pas-un-mail')
    await adminPage.getByRole('button', { name: 'Envoyer l’essai' }).click()
    await expect(adminPage.getByRole('alert').filter({ hasText: 'Adresse e-mail invalide.' })).toBeVisible()
  })

  test('est réservé à la direction : la RH n’a ni le menu, ni la page, ni l’API', async ({ adminPage, browser, baseURL, uid }) => {
    const temp = await createUser(adminPage.request, baseURL!, { identifiant: uid, nom: `Claire ${uid.slice(-4)}`, role: 'rh' })
    const rh = await (await browser.newContext()).newPage()
    await apiLogin(rh.request, baseURL!, uid, temp)
    await rh.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
    await rh.goto('/tableau-de-bord')
    await expect(rh.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Site vitrine' })).toHaveCount(0)
    await rh.goto('/site-vitrine')
    await expect(rh).toHaveURL('/tableau-de-bord')
    expect((await rh.request.get('/api/site/contacts')).status()).toBe(403)

    // La direction, elle, a le lien dans son menu
    await adminPage.goto('/tableau-de-bord')
    await adminPage.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Site vitrine' }).click()
    await expect(adminPage.getByRole('heading', { level: 1, name: 'Site vitrine' })).toBeVisible()
  })
})

test.describe('Site vitrine : écrans @responsive', () => {
  for (const path of [
    '/',
    '/pliage-aluminium',
    '/configurateur',
    '/contact',
    '/mentions-legales',
    '/conditions-generales-de-vente',
    '/espace/connexion',
    '/espace/inscription',
    '/boutique',
    '/panier',
  ]) {
    test(`${path} : tient dans l’écran, sans défilement horizontal`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
      expect(await noHorizontalScroll(page)).toBe(true)
    })
  }

  test('l’en-tête a l’icône du profil et le panier à droite, le contact et les mentions sont dans le pied de page', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const burger = page.getByRole('button', { name: 'Ouvrir le menu' })
    if (await burger.isVisible()) await burger.click()
    const menu = page.getByRole('navigation', { name: 'Navigation principale' })
    await expect(menu.getByRole('link', { name: 'Contact' })).toHaveCount(0)
    await expect(menu.getByRole('link', { name: 'Mon espace' })).toHaveCount(0)
    // Pas de lien vers l'espace atelier sur le site public
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Espace atelier' })).toHaveCount(0)
    // Le profil est une icône, à côté du panier
    const profil = page.getByRole('banner').getByRole('link', { name: 'Mon espace client' })
    const panier = page.getByRole('banner').getByRole('link', { name: /^Mon panier/ })
    await expect(profil).toBeVisible()
    const [p, c] = [await profil.boundingBox(), await panier.boundingBox()]
    expect(p!.x).toBeLessThan(c!.x)
    expect(c!.x + c!.width).toBeGreaterThan(page.viewportSize()!.width - 130)
    // Un visiteur qui clique sur le profil arrive à la connexion
    await profil.click()
    await expect(page).toHaveURL(/\/espace\/connexion/)
    await page.goto('/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Contact' }).click()
    await expect(page).toHaveURL('/contact')
    // Champs en 16 px sur écran tactile : Safari ne zoomera pas
    const size = await page.getByLabel('Votre nom').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(size).toBeGreaterThanOrEqual(16)
  })

  test('/site-vitrine (direction) : onglets lisibles, sans défilement horizontal', async ({ adminPage }) => {
    for (const onglet of ['', '?onglet=textes', '?onglet=photos', '?onglet=emails']) {
      await adminPage.goto(`/site-vitrine${onglet}`)
      await expect(adminPage.getByRole('heading', { level: 1, name: 'Site vitrine' })).toBeInViewport()
      expect(await noHorizontalScroll(adminPage)).toBe(true)
    }
  })
})
