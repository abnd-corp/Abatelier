import type { Page } from '@playwright/test'
import { ADMIN, apiLogin, createUser, expect, makePng, NEW_PASSWORD, test, waitForMail } from './fixtures'

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
    await expect(page.locator('script#ld-entreprise')).toHaveCount(1)

    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Pliage aluminium' }).click()
    await expect(page).toHaveURL('/pliage-aluminium')
    await expect(page.getByRole('heading', { level: 1, name: 'Pliage aluminium sur mesure' })).toBeVisible()
    await expect(page.locator('#couvertine')).toBeVisible()

    for (const [lien, titre] of [['Mentions légales', 'Mentions légales'], ['Confidentialité', 'Politique de confidentialité'], ['Cookies', 'Cookies'], ['Conditions générales de vente', 'Conditions générales de vente']] as const) {
      await page.getByRole('contentinfo').getByRole('link', { name: lien }).click()
      await expect(page.getByRole('heading', { level: 1, name: titre })).toBeVisible()
    }
    // Aucun cookie déposé chez un visiteur, et aucun appel à la session
    expect(await context.cookies()).toEqual([])
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
    await adminPage.getByLabel(/^Description/).first().fill(alt)
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
  for (const path of ['/', '/pliage-aluminium', '/contact', '/mentions-legales', '/conditions-generales-de-vente']) {
    test(`${path} : tient dans l’écran, sans défilement horizontal`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
      expect(await noHorizontalScroll(page)).toBe(true)
    })
  }

  test('le menu du site s’ouvre sur téléphone et mène au formulaire', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const burger = page.getByRole('button', { name: 'Ouvrir le menu' })
    if (await burger.isVisible()) {
      await burger.click()
      await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Contact' }).click()
    } else {
      await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Contact' }).click()
    }
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
