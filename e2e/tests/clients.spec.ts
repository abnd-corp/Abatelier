import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

test.describe('Clients', () => {
  test('la direction ajoute un professionnel, ses chantiers, modifie sa fiche puis l’archive', async ({ adminPage, uid }) => {
    const raison = `Toitures ${uid}`
    await adminPage.goto('/tableau-de-bord')
    await adminPage.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Clients' }).click()
    await expect(adminPage.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible()
    await adminPage.getByRole('link', { name: 'Ajouter un client' }).click()
    await expect(adminPage).toHaveURL('/clients/nouveau')

    await adminPage.getByLabel('Professionnel').check()
    await adminPage.getByLabel('Raison sociale').fill(raison)
    // SIRET faux : refusé sous le champ
    await adminPage.getByLabel('SIRET').fill('73282932000075')
    await adminPage.getByRole('textbox', { name: 'Prénom', exact: true }).fill('Luc')
    await adminPage.getByRole('textbox', { name: 'Nom', exact: true }).fill('Morel')
    await adminPage.getByLabel('E-mail').fill(`${uid}@exemple.fr`)
    await adminPage.getByLabel('Code postal').fill('42700')
    await adminPage.getByLabel('Ville').fill('Firminy')
    await adminPage.getByLabel('Premier contact').selectOption('telephone')
    const save = adminPage.getByRole('button', { name: 'Enregistrer le client' })
    await save.click()
    await expect(adminPage.getByLabel('SIRET')).toHaveAttribute('aria-invalid', 'true')
    await adminPage.getByLabel('SIRET').fill('73282932000074')
    await save.click()

    // La fiche s'ouvre
    await expect(adminPage).toHaveURL(/\/clients\/[0-9a-f-]{36}$/)
    await expect(adminPage.getByRole('heading', { level: 1 })).toHaveText(raison)
    await expect(adminPage.getByRole('navigation', { name: 'Fil d’Ariane' }).getByRole('listitem')).toHaveText(['Ventes', 'Clients', raison])
    await expect(adminPage.getByText('732 829 320 00074')).toBeVisible()
    await expect(adminPage.getByText('Par téléphone')).toBeVisible()

    // Adresse de chantier : ajoutée, modifiée, puis une seconde retirée
    const sites = adminPage.getByRole('region', { name: 'Adresses de chantier' })
    await sites.getByRole('button', { name: 'Ajouter' }).click()
    const siteForm = adminPage.getByRole('form', { name: 'Nouvelle adresse de chantier' })
    await siteForm.getByLabel('Nom du chantier').fill('Maison Rivière')
    await siteForm.getByLabel('Adresse').fill('12 chemin du Bois')
    await siteForm.getByLabel('Code postal').fill('4224')
    await siteForm.getByLabel('Ville').fill('Unieux')
    await siteForm.getByRole('button', { name: 'Enregistrer l’adresse' }).click()
    await expect(siteForm.getByText('Code postal : 5 chiffres.')).toBeVisible()
    await siteForm.getByLabel('Code postal').fill('42240')
    await siteForm.getByRole('button', { name: 'Enregistrer l’adresse' }).click()
    await expect(sites.getByText('12 chemin du Bois, 42240 Unieux')).toBeVisible()
    await sites.getByRole('button', { name: 'Modifier Maison Rivière' }).click()
    await adminPage.getByRole('form', { name: 'Modifier l’adresse de chantier' }).getByLabel('Adresse').fill('14 chemin du Bois')
    await adminPage.getByRole('button', { name: 'Enregistrer l’adresse' }).click()
    await expect(sites.getByText('14 chemin du Bois, 42240 Unieux')).toBeVisible()
    await sites.getByRole('button', { name: 'Retirer Maison Rivière' }).click()
    await sites.getByRole('button', { name: 'Retirer', exact: true }).click()
    await expect(sites.getByText('Aucune adresse de chantier')).toBeVisible()

    // Modification de la fiche
    await adminPage.getByRole('button', { name: 'Modifier la fiche' }).click()
    await adminPage.getByLabel('Téléphone').fill('04 77 12 34 56')
    await adminPage.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(adminPage.getByText('Fiche enregistrée.')).toBeVisible()
    await expect(adminPage.getByRole('link', { name: '04 77 12 34 56' })).toHaveAttribute('href', 'tel:0477123456')
    await expect(adminPage.getByText('A modifié la fiche de')).toBeVisible()

    // Recherche dans la liste, par téléphone sans espaces
    await adminPage.getByRole('link', { name: 'Clients', exact: true }).first().click()
    await adminPage.getByLabel('Rechercher un client').fill('0477123456')
    await expect(adminPage.getByRole('link', { name: raison })).toBeVisible()
    await adminPage.getByRole('link', { name: raison }).click()

    // Archivage : sort de la liste, reste dans « Archivés »
    await adminPage.getByRole('button', { name: 'Archiver le client' }).click()
    await adminPage.getByRole('button', { name: 'Confirmer' }).click()
    await expect(adminPage.getByText('Client archivé')).toBeVisible()
    await adminPage.goto(`/clients?q=${encodeURIComponent(raison)}`)
    await expect(adminPage.getByText(`Aucun client ne correspond à « ${raison} ».`)).toBeVisible()
    await adminPage.getByRole('button', { name: /^Archivés/ }).click()
    await expect(adminPage.getByRole('link', { name: raison })).toBeVisible()

    // Au journal, avec son filtre
    await adminPage.goto('/journal')
    await adminPage.getByRole('button', { name: 'Clients', exact: true }).click()
    await expect(adminPage.getByRole('cell', { name: `A archivé le client ${raison}` })).toBeVisible()
    await expect(adminPage.getByRole('cell', { name: `A ajouté le client ${raison} (professionnel)` })).toBeVisible()
  })

  test('une adresse e-mail déjà connue renvoie vers la fiche existante', async ({ adminPage, baseURL, uid }) => {
    const res = await adminPage.request.post('/api/clients', {
      data: { type: 'particulier', prenom: 'Jean', nom: `Dupont${uid.slice(-4)}`, email: `${uid}@exemple.fr` },
      headers: { Origin: baseURL! },
    })
    const { id } = await res.json()
    await adminPage.goto('/clients/nouveau')
    await adminPage.getByRole('textbox', { name: 'Nom', exact: true }).fill('Autre')
    await adminPage.getByLabel('E-mail').fill(`${uid.toUpperCase()}@exemple.fr`)
    await adminPage.getByRole('button', { name: 'Enregistrer le client' }).click()
    await expect(adminPage.getByRole('alert')).toContainText('Un client existe déjà avec cette adresse e-mail.')
    await adminPage.getByRole('link', { name: 'Ouvrir sa fiche' }).click()
    await expect(adminPage).toHaveURL(`/clients/${id}`)
    await expect(adminPage.getByRole('heading', { level: 1 })).toHaveText(`Jean Dupont${uid.slice(-4)}`)
  })

  test('la RH consulte les clients sans les modifier, l’atelier n’y a pas accès', async ({ adminPage, browser, baseURL, uid }) => {
    const res = await adminPage.request.post('/api/clients', { data: { type: 'particulier', nom: `Lecture${uid.slice(-4)}` }, headers: { Origin: baseURL! } })
    const { id } = await res.json()
    for (const role of ['rh', 'atelier'] as const) {
      const identifiant = `${uid}-${role}`
      const temp = await createUser(adminPage.request, baseURL!, { identifiant, nom: `Test ${role}`, role })
      const page = await (await browser.newContext()).newPage()
      await apiLogin(page.request, baseURL!, identifiant, temp)
      await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
      await page.goto(`/clients/${id}`)
      if (role === 'rh') {
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Lecture${uid.slice(-4)}`)
        await expect(page.getByRole('button', { name: 'Modifier la fiche' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Archiver le client' })).toHaveCount(0)
        await page.goto('/clients/nouveau')
        await expect(page).toHaveURL('/tableau-de-bord')
      } else {
        await expect(page).toHaveURL('/tableau-de-bord')
        await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Clients' })).toHaveCount(0)
      }
      await page.context().close()
    }
  })
})
