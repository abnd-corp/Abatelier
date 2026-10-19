import { apiLogin, expect, NEW_PASSWORD, test, uiLogin } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())

async function addEmployee(request: APIRequestContext, baseURL: string, data: Record<string, unknown>) {
  const res = await request.post('/api/employees', { data, headers: { Origin: baseURL } })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()) as { id: string; tempPassword: string | null }
}

test.describe('Salariés', () => {
  test('ajouter un salarié avec son compte, puis il active son accès', async ({ adminPage, browser, uid }) => {
    const prenom = `Léa${uid.slice(-4)}`
    await adminPage.goto('/')
    await adminPage.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Salariés' }).click()
    await adminPage.getByRole('link', { name: 'Ajouter un salarié' }).click()
    await expect(adminPage).toHaveURL('/salaries/nouveau')

    await adminPage.getByRole('textbox', { name: 'Prénom', exact: true }).fill(prenom)
    await adminPage.getByRole('textbox', { name: 'Nom', exact: true }).fill('Durand')
    // L'identifiant est proposé à partir du prénom ; on le remplace par un identifiant unique au test
    await expect(adminPage.getByLabel('Identifiant de connexion')).toHaveValue(prenom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
    await adminPage.getByLabel('Identifiant de connexion').fill(uid)
    await adminPage.getByLabel('Poste').fill('Plieuse')
    await adminPage.getByLabel('Contrat').selectOption('cdi')
    await adminPage.getByLabel('Date d’entrée').fill('2024-03-01')
    await adminPage.getByLabel('Téléphone').fill('06 12 34 56 78')
    await adminPage.getByRole('button', { name: 'Enregistrer le salarié' }).click()

    // La fiche s'ouvre avec le mot de passe temporaire, une seule fois
    await expect(adminPage).toHaveURL(/\/salaries\/[0-9a-f-]{36}$/)
    await expect(adminPage.getByRole('heading', { level: 1 })).toHaveText(`${prenom} Durand`)
    await expect(adminPage.getByRole('navigation', { name: 'Fil d’Ariane' }).getByRole('listitem')).toHaveText(['Équipe', 'Salariés', `${prenom} Durand`])
    await expect(adminPage.getByText('1er mars 2024')).toBeVisible()
    const temp = await adminPage.locator('.temp-pw code').innerText()
    await adminPage.getByRole('button', { name: 'J’ai noté' }).click()
    await adminPage.reload()
    await expect(adminPage.locator('.temp-pw')).toHaveCount(0)

    // La personne se connecte, choisit son mot de passe, et n'a pas accès à l'équipe
    const lea = await (await browser.newContext()).newPage()
    await uiLogin(lea, uid, temp)
    await expect(lea).toHaveURL('/mon-compte')
    await lea.locator('#pw-current').fill(temp)
    await lea.locator('#pw-next').fill(NEW_PASSWORD)
    await lea.locator('#pw-confirm').fill(NEW_PASSWORD)
    await lea.getByRole('button', { name: 'Changer le mot de passe' }).click()
    await expect(lea).toHaveURL('/')
    await expect(lea.getByRole('heading', { name: `Bonjour ${prenom}` })).toBeVisible()
    await expect(lea.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link')).toHaveText(['Tableau de bord'])
    await lea.goto('/salaries')
    await expect(lea).toHaveURL('/')
    await lea.context().close()

    // Côté admin, la fiche montre maintenant un compte actif et l'activité de la personne
    await adminPage.reload()
    await expect(adminPage.getByRole('region', { name: 'Compte de connexion' })).toContainText('Actif')
    await expect(adminPage.getByText('A changé son mot de passe')).toBeVisible()
  })

  test('rechercher, filtrer et ouvrir une fiche depuis la liste', async ({ adminPage, baseURL, uid }) => {
    const nom = `Zed${uid.slice(-6)}`
    await addEmployee(adminPage.request, baseURL!, { prenom: 'Karim', nom, poste: 'Plieur', contrat: 'apprentissage' })
    await addEmployee(adminPage.request, baseURL!, { prenom: 'Jean', nom, dateEntree: '2020-01-01', dateSortie: '2023-06-30' })

    await adminPage.goto('/salaries')
    await adminPage.getByPlaceholder('Nom, poste, identifiant…').fill(nom)
    const rows = adminPage.locator('tbody tr')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(`Karim ${nom}`)
    await expect(rows.first()).toContainText('Pas de compte')

    await adminPage.getByRole('button', { name: /^Partis/ }).click()
    await expect(adminPage).toHaveURL(/statut=partis/)
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(`Jean ${nom}`)

    await adminPage.getByRole('button', { name: /^Tous/ }).click()
    await expect(rows).toHaveCount(2)
    await rows.filter({ hasText: 'Karim' }).click()
    await expect(adminPage.getByRole('heading', { level: 1 })).toHaveText(`Karim ${nom}`)
    await expect(adminPage.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Salariés' })).toHaveAttribute('aria-current', 'page')
  })

  test('modifier une fiche et créer un compte après coup', async ({ adminPage, browser, baseURL, uid }) => {
    const { id } = await addEmployee(adminPage.request, baseURL!, { prenom: 'Marie', nom: `Roux${uid.slice(-5)}`, poste: 'Secrétariat' })
    await adminPage.goto(`/salaries/${id}`)

    await adminPage.getByRole('button', { name: 'Modifier la fiche' }).click()
    await adminPage.getByLabel('Poste').fill('Commerciale')
    await adminPage.getByLabel('E-mail').fill('pas-un-mail')
    await adminPage.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(adminPage.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true')
    await adminPage.getByLabel('E-mail').fill('marie@exemple.fr')
    await adminPage.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(adminPage.getByText('Fiche enregistrée.')).toBeVisible()
    await expect(adminPage.getByText('Commerciale').first()).toBeVisible()
    await expect(adminPage.getByRole('link', { name: 'marie@exemple.fr' })).toHaveAttribute('href', 'mailto:marie@exemple.fr')

    const account = adminPage.getByRole('region', { name: 'Compte de connexion' })
    await expect(account).toContainText('n’a pas de compte')
    await account.getByRole('button', { name: 'Créer un compte de connexion' }).click()
    await account.getByLabel('Identifiant de connexion').fill(uid)
    await account.getByRole('button', { name: 'Créer le compte' }).click()
    const temp = await adminPage.locator('.temp-pw code').innerText()
    await expect(account).toContainText(uid)

    const marie = await (await browser.newContext()).newPage()
    await apiLogin(marie.request, baseURL!, uid, temp)
    await marie.context().close()
  })

  test('la date de sortie désactive le compte et déconnecte la personne', async ({ adminPage, browser, baseURL, uid }) => {
    const { id, tempPassword } = await addEmployee(adminPage.request, baseURL!, {
      prenom: 'Sophie',
      nom: `Depart${uid.slice(-5)}`,
      compte: { identifiant: uid, role: 'atelier' },
    })
    const sophie = await (await browser.newContext()).newPage()
    await apiLogin(sophie.request, baseURL!, uid, tempPassword!)
    await sophie.goto('/mon-compte')
    await expect(sophie.getByRole('heading', { name: 'Mon compte' })).toBeVisible()

    await adminPage.goto(`/salaries/${id}`)
    await adminPage.getByRole('button', { name: 'Modifier la fiche' }).click()
    await adminPage.getByLabel('Date de sortie').fill(todayParis())
    await adminPage.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(adminPage.getByText('son compte a été désactivé')).toBeVisible()
    await expect(adminPage.getByText(/^Parti le/)).toBeVisible()
    await expect(adminPage.getByText('désactivé automatiquement : date de sortie atteinte')).toBeVisible()

    // Sa session est coupée : au prochain chargement, elle revient à la page de connexion
    await sophie.reload()
    await expect(sophie).toHaveURL(/\/connexion/)
    await sophie.context().close()
  })
})

test.describe('Menu latéral', () => {
  test('se réduit en icônes, s’en souvient, et garde des libellés accessibles', async ({ adminPage }) => {
    await adminPage.goto('/salaries')
    const nav = adminPage.getByRole('navigation', { name: 'Navigation principale' })
    const salaries = nav.getByRole('link', { name: 'Salariés' })
    const width = async () => (await adminPage.locator('aside').boundingBox())!.width

    expect(await width()).toBeGreaterThan(200)
    await adminPage.getByRole('button', { name: 'Réduire le menu' }).click()
    await expect.poll(width).toBeLessThan(80)
    await expect(salaries).toBeVisible()
    await expect(salaries).toHaveAttribute('title', 'Salariés')

    await adminPage.reload()
    await expect.poll(width).toBeLessThan(80)
    await adminPage.getByRole('button', { name: 'Agrandir le menu' }).click()
    await expect.poll(width).toBeGreaterThan(200)
  })

  test('sur téléphone, le menu s’ouvre en tiroir et la page ne déborde pas', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 })
    await adminPage.goto('/salaries')
    const nav = adminPage.getByRole('navigation', { name: 'Navigation principale' })
    await expect(nav).not.toBeInViewport()
    await expect(adminPage.getByRole('link', { name: 'Ajouter un salarié' })).toBeInViewport()
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await adminPage.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await expect(nav).toBeInViewport()
    await nav.getByRole('link', { name: 'Comptes' }).click()
    await expect(adminPage).toHaveURL('/utilisateurs')
    await expect(nav).not.toBeInViewport()
  })
})
