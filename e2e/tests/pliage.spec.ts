import { expect, test } from './fixtures'

test.describe('Limites de pliage et vue 3D', () => {
  test('la saisie refuse un angle impossible et un profil refermé, accepte une pince et montre la pièce en 3D', async ({ adminPage, baseURL, uid }) => {
    // L'atelier fait les pinces (réglage partagé : on ne fait que l'activer)
    const res = await adminPage.request.patch('/api/catalog/settings', { data: { pinceAutorisee: true }, headers: { Origin: baseURL! } })
    expect(res.status(), await res.text()).toBe(200)
    const created = await adminPage.request.post('/api/clients', { data: { type: 'particulier', prenom: 'Léa', nom: `Pli ${uid}` }, headers: { Origin: baseURL! } })
    const clientId = (await created.json()).id as string

    await adminPage.goto(`/commandes/nouvelle?client=${clientId}`)
    const piece = adminPage.getByRole('region', { name: 'Pièce 1' })
    await expect(piece).toContainText('0° pour une pince')
    const save = adminPage.getByRole('button', { name: 'Enregistrer la commande' })

    // Angle trop fermé pour la plieuse
    await piece.getByLabel('Pli 2', { exact: true }).fill('10')
    await expect(piece.getByRole('alert')).toContainText('Pli 2 : angle entre')
    await expect(save).toBeDisabled()
    await piece.getByLabel('Pli 2', { exact: true }).fill('90')
    await expect(piece.getByRole('alert')).toHaveCount(0)

    // Pince sur le premier pli
    await piece.getByLabel('Pli 1', { exact: true }).fill('0')
    await expect(piece).toContainText('° pince')
    await expect(piece.getByRole('img', { name: 'Profil de la pièce 1' })).toContainText('pince')
    await expect(piece.locator('.line-price')).toContainText('HT')

    // Profil qui se referme : un caisson dont la dernière aile revient sur la première
    await piece.getByLabel('Modèle').selectOption({ label: 'Autre profil' })
    await piece.getByRole('button', { name: 'Ajouter un pli' }).click()
    await piece.getByRole('button', { name: 'Ajouter un pli' }).click()
    for (let j = 0; j < 4; j++) await piece.locator(`#l0-cote${j}`).fill('100')
    await piece.getByLabel('Pli 1', { exact: true }).fill('90')
    await piece.getByLabel('Pli 2', { exact: true }).fill('90')
    await piece.getByLabel('Pli 3', { exact: true }).fill('90')
    await expect(piece.getByRole('alert')).toContainText('Le profil se referme sur lui-même')
    await expect(save).toBeDisabled()
    await piece.getByRole('button', { name: 'Inverser le sens du pli 2' }).click()
    await expect(piece.getByRole('alert')).toHaveCount(0)

    // Vue 3D, chargée à la demande
    await piece.getByRole('button', { name: '3D' }).click()
    // Sans WebGL (Firefox sans carte graphique, comme sur la CI), la vue le dit au lieu de planter
    const webgl = await adminPage.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
    if (webgl) {
      await expect(piece.getByRole('img', { name: 'Pièce 1 en 3D' })).toBeVisible()
      await expect(piece).toContainText('Glissez pour tourner')
    } else {
      await expect(piece).toContainText('La vue 3D n’est pas disponible sur cet appareil.')
    }
    await piece.getByRole('button', { name: 'Profil' }).click()
    await expect(piece.getByRole('img', { name: 'Profil de la pièce 1' })).toBeVisible()
  })
})
