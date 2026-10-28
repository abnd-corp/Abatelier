import type { Browser } from '@playwright/test'
import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// Les droits d'un compte : des sections cumulables (Ventes, Atelier, Direction) et l'administration à part
test.describe('Droits des comptes', () => {
  const connecte = async (browser: Browser, baseURL: string, identifiant: string, temp: string) => {
    const page = await (await browser.newContext()).newPage()
    await apiLogin(page.request, baseURL, identifiant, temp)
    await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL } })
    return page
  }

  test('l’administration seule gère les salariés et les comptes, sans voir clients ni commandes', async ({ adminPage, browser, baseURL, uid }) => {
    const temp = await createUser(adminPage.request, baseURL!, { identifiant: uid, nom: `Claire ${uid.slice(-4)}`, sections: [], admin: true })
    const admin = await connecte(browser, baseURL!, uid, temp)
    await admin.goto('/tableau-de-bord')
    const nav = admin.getByRole('navigation', { name: 'Navigation principale' })
    await expect(nav.getByRole('link')).toHaveText(['Tableau de bord', 'Salariés', 'Comptes', 'Journal d’activité'])

    // Pas de clients, même en tapant l'adresse
    await admin.goto('/clients')
    await expect(admin).toHaveURL('/tableau-de-bord')

    // Un salarié avec son compte : les cases de droits sont proposées
    await admin.goto('/salaries/nouveau')
    await expect(admin.getByLabel(/^Atelier/)).toBeVisible()
    await admin.getByRole('textbox', { name: 'Prénom', exact: true }).fill('Nina')
    await admin.getByRole('textbox', { name: 'Nom', exact: true }).fill(`Adm${uid.slice(-5)}`)
    await admin.getByRole('button', { name: 'Enregistrer le salarié' }).click()
    await expect(admin.getByRole('heading', { level: 1 })).toHaveText(`Nina Adm${uid.slice(-5)}`)

    // Le journal est consultable
    await nav.getByRole('link', { name: 'Journal d’activité' }).click()
    await expect(admin.getByRole('cell', { name: new RegExp(`A ajouté Nina Adm${uid.slice(-5)}`) })).toBeVisible()
    await admin.context().close()
  })

  test('les sections se cumulent, et chaque menu ne montre que ce qu’elles donnent', async ({ adminPage, browser, baseURL, uid }) => {
    const temp = await createUser(adminPage.request, baseURL!, { identifiant: uid, nom: `Marc ${uid.slice(-4)}`, sections: ['ventes', 'direction'], admin: false })
    const page = await connecte(browser, baseURL!, uid, temp)
    await page.goto('/tableau-de-bord')
    const nav = page.getByRole('navigation', { name: 'Navigation principale' })
    await expect(nav.getByRole('link')).toHaveText([
      'Tableau de bord',
      'Commandes',
      'Devis et factures',
      'Clients',
      'Tarifs et catalogue',
      'Matériaux',
      'Modèles de documents',
      'Boutique',
      'Site vitrine',
      'Salariés',
    ])
    // Les fiches salariés viennent de la section direction ; ni l'atelier, ni les comptes, ni le journal
    await page.goto('/salaries')
    await expect(page).toHaveURL('/salaries')
    for (const url of ['/fabrication', '/stock', '/utilisateurs', '/journal']) {
      await page.goto(url)
      await expect(page, url).toHaveURL('/tableau-de-bord')
    }
    await page.context().close()
  })
})
