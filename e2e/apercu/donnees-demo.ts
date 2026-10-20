import { request, type FullConfig } from '@playwright/test'
import { ADMIN, makePng } from '../tests/fixtures'

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
  // Des commandes à différentes étapes, avec le catalogue de départ
  const catalog = await (await api.get('/api/orders/catalog')).json()
  const clientList = (await (await api.get('/api/clients')).json()).clients as { id: string; raisonSociale: string | null }[]
  const forez = clientList.find((c) => c.raisonSociale === 'Toitures du Forez')
  const others = clientList.filter((c) => c !== forez)
  const model = (nom: string) => (catalog.models as { id: string; nom: string }[]).find((m) => m.nom === nom)!.id
  const piece = (over: Record<string, unknown> = {}) => ({
    modelId: model('Couvertine'),
    materialId: catalog.materials[0].id,
    colorId: catalog.colors[0].id,
    cotes: [20, 70, 300, 70, 20],
    angles: [-135, 90, 90, -135],
    longueur: 3000,
    quantite: 6,
    accessoires: [],
    ...over,
  })
  const bandeau = piece({ modelId: model('Bandeau'), repere: 'Rive est', colorId: catalog.colors[1]?.id ?? catalog.colors[0].id, cotes: [40, 150], angles: [-90], quantite: 8 })
  const ORDERS = [
    { client: forez, lignes: [piece({ repere: 'Mur sud' }), bandeau], livraison: { mode: 'livraison', adresse: '8 avenue de la Gare', codePostal: '42700', ville: 'Firminy' }, etapes: ['validee', 'fabrication'] },
    { client: others[0], lignes: [piece({ modelId: model('Bavette d’appui'), cotes: [30, 220, 45, 15], angles: [-95, 95, 135], longueur: 1400, quantite: 2 })], livraison: { mode: 'retrait' }, etapes: [] },
    { client: forez, lignes: [bandeau], livraison: { mode: 'retrait' }, etapes: ['validee'] },
    { client: others[1] ?? others[0], lignes: [piece({ quantite: 2 })], livraison: { mode: 'retrait' }, etapes: ['validee', 'fabrication', 'prete'] },
  ]
  const ids: string[] = []
  for (const o of ORDERS) {
    if (!o.client) continue
    const res = await api.post('/api/orders', { data: { clientId: o.client.id, lignes: o.lignes, livraison: o.livraison } })
    if (!res.ok()) continue
    const { id } = await res.json()
    ids.push(id)
    for (const statut of o.etapes) await api.post(`/api/orders/${id}/status`, { data: { statut } })
  }
  // Devis et factures à différents stades : devis accepté puis facture envoyée, devis en attente,
  // facture payée, et une facture annulée par un avoir puis refaite
  const emit = async (orderId: string | undefined, type: 'devis' | 'facture') => (orderId ? ((await (await api.post(`/api/billing/orders/${orderId}/${type}`)).json()).id as string) : '')
  const [o1, o2, o3, o4] = ids
  const d1 = await emit(o1, 'devis')
  if (d1) await api.post(`/api/billing/${d1}/reponse`, { data: { reponse: 'accepte' } })
  const f1 = await emit(o1, 'facture')
  if (f1) await api.post(`/api/billing/${f1}/envoi`)
  const d2 = await emit(o2, 'devis')
  if (d2) await api.post(`/api/billing/${d2}/envoi`)
  const f4 = await emit(o4, 'facture')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
  if (f4) await api.post(`/api/billing/${f4}/paiement`, { data: { date: today, mode: 'virement' } })
  const f3 = await emit(o3, 'facture')
  if (f3) await api.post(`/api/billing/${f3}/avoir`, { data: { motif: 'Erreur sur le coloris du bandeau' } })
  await emit(o3, 'facture')
  // Site vitrine : quelques photos (unies, de teintes différentes) et deux demandes de contact
  const photos: [string, string, number][] = [['accueil', 'Atelier de pliage', 0x9a], ['realisation', 'Couvertine blanche', 0xc8], ['realisation', 'Bandeau gris anthracite', 0x58], ['realisation', 'Bavette d’appui', 0xb0], ['couvertine', 'Couvertine aluminium', 0xa0], ['bandeau', 'Bandeau en L', 0x70]]
  for (const [place, alt, grey] of photos) {
    await api.post(`/api/site/photos?emplacement=${place}&alt=${encodeURIComponent(alt)}`, { data: makePng(1200, 800, grey), headers: { 'Content-Type': 'image/png' } })
  }
  const contact = { consentement: true, objet: '12 couvertines blanches de 3 m', message: 'Bonjour, je voudrais un devis pour 12 couvertines blanches de 3 mètres, livrées à Firminy.', nom: 'Jean Dupont', email: 'jean.dupont@exemple.fr', telephone: '06 11 22 33 44', codePostal: '42700', ville: 'Firminy' }
  await api.post('/api/public/contact', { data: { ...contact, fichier: { nom: 'plan-couvertine.pdf', contenu: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n').toString('base64') } } })
  // Une demande de devis du configurateur : le visiteur a choisi une couvertine du catalogue de départ
  const m0 = catalog.models[0]
  await api.post('/api/public/devis', {
    data: {
      nom: 'Luc Morel', email: 'luc.morel@exemple.fr', telephone: '06 11 22 33 44', codePostal: '42700', message: 'Pose prévue en novembre.', consentement: true,
      lignes: [{ repere: 'Muret de clôture', modelId: m0.id, materialId: catalog.materials[0].id, colorId: catalog.colors[0].id, cotes: m0.cotes, angles: m0.angles, longueur: 3000, quantite: 6, accessoires: [] }],
      livraison: { mode: 'retrait' },
    },
  })
  await api.post('/api/public/contact', { data: { ...contact, nom: 'Martine Bernard', email: 'martine@exemple.fr', objet: 'Bavettes sur mesure', message: 'Pouvez-vous me rappeler ?' } })
  // Un échec de connexion, pour que le journal et le tableau de bord ne soient pas vides
  await api.post('/api/auth/login', { data: { identifiant: 'inconnu', password: 'faux' } })
  await api.dispose()
}
