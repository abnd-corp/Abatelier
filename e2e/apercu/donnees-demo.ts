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

const CLIENTS = [
  {
    client: { type: 'professionnel', raisonSociale: 'Toitures du Forez', siret: '73282932000074', prenom: 'Luc', nom: 'Morel', telephone: '04 77 12 34 56', email: 'contact@toitures-forez.exemple', adresse: '8 avenue de la Gare', codePostal: '42700', ville: 'Firminy', notes: 'Paie à 30 jours.\nPréfère être livré le matin.' },
    sites: [
      { libelle: 'Maison Rivière', adresse: '12 chemin du Bois', codePostal: '42240', ville: 'Unieux' },
      { libelle: 'Lotissement des Pins', adresse: 'Rue des Pins, lot 4', codePostal: '42490', ville: 'Fraisses' },
    ],
  },
  { client: { type: 'particulier', prenom: 'Jean', nom: 'Dupont', telephone: '06 11 22 33 44', email: 'jean.dupont@exemple.fr', adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses', origine: 'telephone' }, sites: [] },
  { client: { type: 'particulier', prenom: 'Martine', nom: 'Bernard', telephone: '06 55 44 33 22', codePostal: '42000', ville: 'Saint-Étienne', origine: 'email' }, sites: [] },
  { client: { type: 'professionnel', raisonSociale: 'Zinguerie Ondaine', prenom: 'Ali', nom: 'Haddad', codePostal: '42500', ville: 'Le Chambon-Feugerolles' }, sites: [] },
]

export default async function seed(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  const login = await api.post('/api/auth/login', { data: { identifiant: ADMIN.identifiant, password: ADMIN.password } })
  if (!login.ok()) throw new Error(`Connexion admin impossible : ${await login.text()}`)
  for (const e of DEMO) await api.post('/api/employees', { data: e })
  for (const c of CLIENTS) {
    const res = await api.post('/api/clients', { data: c.client })
    if (!res.ok()) continue
    const { id } = await res.json()
    for (const s of c.sites) await api.post(`/api/clients/${id}/sites`, { data: s })
  }
  // Un échec de connexion, pour que le journal et le tableau de bord ne soient pas vides
  await api.post('/api/auth/login', { data: { identifiant: 'inconnu', password: 'faux' } })
  await api.dispose()
}
