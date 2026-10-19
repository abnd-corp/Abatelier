import { request, type FullConfig } from '@playwright/test'
import { ADMIN } from '../tests/fixtures'

// Données fictives ajoutées une seule fois, avant toutes les captures
const DEMO = [
  { prenom: 'Paul', nom: 'Martin', poste: 'Chef d’atelier', contrat: 'cdi', dateEntree: '2019-04-01', telephone: '06 12 34 56 78', email: 'paul.martin@exemple.fr', notes: 'Permis cariste.\nRéférent sécurité.', compte: { identifiant: 'paul.demo', role: 'atelier' } },
  { prenom: 'Léa', nom: 'Durand', poste: 'Plieuse', contrat: 'cdi', dateEntree: '2022-09-12', telephone: '06 98 76 54 32', compte: { identifiant: 'lea.demo', role: 'atelier' } },
  { prenom: 'Karim', nom: 'Benali', poste: 'Plieur', contrat: 'apprentissage', dateEntree: '2025-09-01', dateSortie: '2027-08-31' },
  { prenom: 'Sophie', nom: 'Roux', poste: 'Secrétariat', contrat: 'cdd', dateEntree: '2026-01-05', dateSortie: '2026-12-18', email: 'sophie.roux@exemple.fr' },
  { prenom: 'Jean', nom: 'Ancien', poste: 'Plieur', contrat: 'cdi', dateEntree: '2015-02-01', dateSortie: '2024-06-30' },
]

export default async function seed(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  const login = await api.post('/api/auth/login', { data: { identifiant: ADMIN.identifiant, password: ADMIN.password } })
  if (!login.ok()) throw new Error(`Connexion admin impossible : ${await login.text()}`)
  for (const e of DEMO) await api.post('/api/employees', { data: e })
  // Un échec de connexion, pour que le journal et le tableau de bord ne soient pas vides
  await api.post('/api/auth/login', { data: { identifiant: 'inconnu', password: 'faux' } })
  await api.dispose()
}
