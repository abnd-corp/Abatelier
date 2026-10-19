import { crc32, deflateSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'
import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

/** PNG de bruit aléatoire : il ne se compresse pas, donc il pèse plus de 200 Ko (limite générale de nginx). */
function noisyPng(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), randomBytes(width * 3)])))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

test.describe('Modèles de documents', () => {
  test('la direction complète l’identité, voit l’aperçu se mettre à jour et règle le modèle', async ({ adminPage, uid }) => {
    await adminPage.goto('/')
    await adminPage.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Modèles de documents' }).click()
    await expect(adminPage.getByRole('heading', { level: 1 })).toHaveText('Modèles de documents')

    // L'aperçu PDF s'affiche (pdf.js, avec la politique de sécurité de production)
    const preview = adminPage.getByRole('region', { name: 'Aperçu' })
    await expect(preview.getByRole('img', { name: 'Aperçu du devis, page 1 sur 1' })).toBeVisible()
    await preview.getByRole('button', { name: 'Facture' }).click()
    await expect(preview.getByRole('img', { name: 'Aperçu de la facture, page 1 sur 1' })).toBeVisible()
    await expect(preview.getByRole('link', { name: 'Télécharger le PDF' })).toHaveAttribute('download', 'apercu-facture.pdf')

    // SIRET faux : refusé sous le champ ; juste : mis en forme
    const form = adminPage.getByRole('form', { name: 'Modèles de documents' })
    const save = form.getByRole('button', { name: 'Enregistrer', exact: true })
    await form.getByLabel('SIRET').fill('73282932000075')
    await save.click()
    await expect(form.getByLabel('SIRET')).toHaveAttribute('aria-invalid', 'true')
    await expect(form.getByText('SIRET invalide : vérifiez les chiffres.')).toBeVisible()
    await form.getByLabel('SIRET').fill('73282932000074')
    await form.getByLabel('IBAN').fill('fr7630006000011234567890189')
    await save.click()
    await expect(form.getByText('Modèles enregistrés')).toBeVisible()
    await expect(form.getByLabel('SIRET')).toHaveValue('732 829 320 00074')
    await expect(form.getByLabel('IBAN')).toHaveValue('FR76 3000 6000 0112 3456 7890 189')

    // Un réglage invalide n'efface pas l'aperçu
    await form.getByRole('tab', { name: 'Modèle' }).click()
    await expect(adminPage).toHaveURL(/onglet=modele/)
    await form.getByLabel('Couleur des titres', { exact: true }).fill('violet')
    await expect(preview.getByRole('alert')).toContainText('Couleur invalide')
    await expect(preview.getByRole('img', { name: /page 1 sur 1/ })).toBeVisible()
    await form.getByLabel('Couleur des titres', { exact: true }).fill('#7b2fa3')
    await form.getByLabel('Délai de paiement').fill('90')
    await save.click()
    await expect(form.getByText('Délai de paiement : 60 jours maximum.')).toBeVisible()
    await form.getByLabel('Délai de paiement').fill('30')
    // Texte propre à ce test : Chromium et Firefox tournent en même temps sur la même base
    await form.getByLabel('Mentions légales').fill(`Pénalités de retard : trois fois le taux d’intérêt légal. (${uid})`)
    await save.click()
    await expect(form.getByText('Modèles enregistrés')).toBeVisible()

    // Au journal, avec son filtre
    await adminPage.goto('/journal')
    await adminPage.getByRole('button', { name: 'Devis et factures' }).click()
    await expect(adminPage.getByRole('cell', { name: /A modifié l’identité de l’entreprise : .*SIRET/ }).first()).toBeVisible()
    await expect(adminPage.getByRole('cell', { name: /A modifié le modèle des devis et factures : .*mentions légales/ }).first()).toBeVisible()
  })

  test('la direction reprend la numérotation de son ancien logiciel', async ({ adminPage }) => {
    await adminPage.goto('/modeles-documents?onglet=numerotation')
    const form = adminPage.getByRole('form', { name: 'Modèles de documents' })
    const year = new Date().getFullYear()
    // Les autres tests (devis et factures) créent des documents sur la même base : la numérotation est alors verrouillée
    const field = form.getByLabel('Prochain numéro').nth(1)
    await expect(field).toBeVisible()
    if (await field.isDisabled()) {
      await expect(form.getByLabel('Prochain numéro').first()).toBeDisabled()
      return
    }
    // On avance à partir du numéro actuel : l'autre navigateur a pu le changer
    const next = Number(await field.inputValue()) + 50
    await form.getByLabel('Prochain numéro').nth(1).fill(String(next))
    await expect(form.getByText(`Prochaine facture : F-${year}-${String(next).padStart(4, '0')}`)).toBeVisible()
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(form.getByText('Modèles enregistrés')).toBeVisible()
    // Préfixes fixes : seul le numéro se saisit
    await expect(form.getByLabel('Préfixe')).toHaveCount(0)
    await expect(form.getByLabel('Prochain numéro').nth(1)).toBeEnabled()
  })

  test('la direction envoie son logo (plus de 200 Ko), le voit, puis revient au logo de l’appli', async ({ adminPage }) => {
    await adminPage.goto('/modeles-documents')
    const form = adminPage.getByRole('form', { name: 'Modèles de documents' })
    await form.getByLabel('Envoyer un logo (PNG ou JPEG)').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: noisyPng(320, 240) })
    await expect(form.getByRole('img', { name: 'Logo envoyé' })).toBeVisible()
    await expect(form.getByText('Logo envoyé, utilisé sur les documents.')).toBeVisible()
    await form.getByLabel('Envoyer un logo (PNG ou JPEG)').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
    await expect(form.getByText('Format non pris en charge')).toBeVisible()
    await form.getByRole('button', { name: 'Revenir au logo de l’appli' }).click()
    await expect(form.getByText('Logo de l’appli, utilisé par défaut.')).toBeVisible()
  })

  test('la RH et l’atelier n’y ont pas accès', async ({ adminPage, browser, baseURL, uid }) => {
    for (const role of ['rh', 'atelier'] as const) {
      const id = `${uid}-${role}`
      const temp = await createUser(adminPage.request, baseURL!, { identifiant: id, nom: `Test ${role}`, role })
      const page = await (await browser.newContext()).newPage()
      await apiLogin(page.request, baseURL!, id, temp)
      await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
      await page.goto('/modeles-documents')
      await expect(page).toHaveURL('/')
      await expect(page.getByRole('link', { name: 'Modèles de documents' })).toHaveCount(0)
      expect((await page.request.get('/api/documents/settings')).status()).toBe(403)
      await page.context().close()
    }
  })
})
