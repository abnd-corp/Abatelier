import { expect, test } from './fixtures'

test.describe('Modèles de pièces', () => {
  test('la direction crée un modèle, il est proposé à la saisie des commandes, puis retiré une fois désactivé', async ({ adminPage, baseURL, uid }) => {
    const nom = `Faîtière ${uid.slice(-6)}`
    await adminPage.goto('/catalogue')
    await adminPage.getByRole('tab', { name: /Modèles/ }).click()
    await expect(adminPage).toHaveURL(/onglet=modeles/)
    const panel = adminPage.getByRole('tabpanel', { name: /Modèles/ })
    await expect(panel.getByText('Couvertine', { exact: true })).toBeVisible()

    // Nouveau modèle : deux pans et deux retours
    await panel.getByRole('button', { name: 'Ajouter un modèle' }).click()
    const form = panel.getByRole('form', { name: 'Formulaire de modèle' })
    await form.getByLabel('Modèle', { exact: true }).fill(nom)
    await form.getByRole('button', { name: 'Ajouter un pli' }).click()
    await form.getByRole('button', { name: 'Ajouter un pli' }).click()
    const cotes = [
      ['Retour', '30'],
      ['Pan', '150'],
      ['Pan', '150'],
      ['Retour', '30'],
    ]
    for (const [i, [label, v]] of cotes.entries()) {
      await form.getByLabel(`Nom de la cote ${'ABCD'[i]}`).fill(label!)
      await form.getByLabel(`Cote ${'ABCD'[i]}`, { exact: true }).fill(v!)
    }
    await form.getByLabel('Pli 1', { exact: true }).fill('120')
    await form.getByRole('button', { name: 'Inverser le sens du pli 1' }).click()
    await form.getByLabel('Pli 2', { exact: true }).fill('100')
    await form.getByLabel('Pli 3', { exact: true }).fill('120')
    await form.getByRole('button', { name: 'Inverser le sens du pli 3' }).click()
    await form.getByRole('button', { name: 'Tourner le dessin de 15° à droite' }).click()
    await form.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(panel.getByText(`${nom} ajouté.`)).toBeVisible()
    const card = panel.getByRole('listitem').filter({ hasText: nom })
    await expect(card).toContainText('3 plis · développé 360 mm')

    // Proposé à la saisie d'une commande, avec le nom de ses cotes
    const created = await adminPage.request.post('/api/clients', { data: { type: 'particulier', prenom: 'Noé', nom: `Modèle ${uid}` }, headers: { Origin: baseURL! } })
    const clientId = (await created.json()).id as string
    await adminPage.goto(`/commandes/nouvelle?client=${clientId}`)
    const piece = adminPage.getByRole('region', { name: 'Pièce 1' })
    await piece.getByLabel('Modèle').selectOption({ label: nom })
    await expect(piece.getByText('Pan').first()).toBeVisible()
    await expect(piece.locator('#l0-cote1')).toHaveValue('150')
    await expect(piece.locator('.line-price')).toContainText('HT')

    // Désactivé : il n'est plus proposé
    await adminPage.goto('/catalogue?onglet=modeles')
    await panel.getByRole('button', { name: `Désactiver ${nom}` }).click()
    await expect(panel.getByText(`${nom} désactivé`)).toBeVisible()
    await adminPage.goto(`/commandes/nouvelle?client=${clientId}`)
    await expect(piece.getByLabel('Modèle').locator('option', { hasText: nom })).toHaveCount(0)

    // Au journal
    await adminPage.goto('/journal')
    await adminPage.getByRole('button', { name: 'Catalogue et prix' }).click()
    await expect(adminPage.getByRole('cell', { name: new RegExp(`A ajouté le modèle de pièce ${nom}`) })).toBeVisible()
    await expect(adminPage.getByRole('cell', { name: `A modifié le modèle de pièce ${nom} : statut actif → désactivé` })).toBeVisible()
  })
})
