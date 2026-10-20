// Données de démonstration : « make demo ».
// Remplit une base de DÉVELOPPEMENT vide avec une activité vraisemblable (clients, commandes à toutes les étapes,
// devis, factures, avoir, équipe) pour présenter l'application. Tout passe par les vraies routes de l'API :
// mêmes calculs de prix, mêmes numéros, mêmes PDF, même journal. Personnes, sociétés et adresses sont inventées.
import { count, eq, inArray, sql } from 'drizzle-orm'
import { buildApp } from './app.js'
import { db, pool, runMigrations } from './db/index.js'
import { auditLog, clients, orderEvents, orders, users } from './db/schema.js'
import { hashPassword } from './auth/password.js'
import { env } from './env.js'

const PASSWORD = 'Demo-Alu-Pliage-2026!'
const HOST = 'localhost'
const ORIGIN = `http://${HOST}`
const GAP = 2 // jours entre deux étapes d'une commande

await runMigrations()
if (env.NODE_ENV === 'production') throw new Error('Données de démonstration refusées en production.')
const [existing] = await db.select({ n: count() }).from(clients)
if (existing && existing.n > 0) {
  console.error('La base contient déjà des clients : « make demo » ne s’utilise que sur une base vide (docker compose down -v pour repartir de zéro).')
  process.exit(1)
}

const app = await buildApp()

type Json = Record<string, any>
function session() {
  let cookie = ''
  async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
    const res = await app.inject({
      method,
      url,
      headers: { host: HOST, ...(method !== 'GET' ? { origin: ORIGIN } : {}), ...(cookie ? { cookie } : {}) },
      ...(body !== undefined ? { payload: body as object } : {}),
    })
    const set = res.cookies.find((c) => c.name.endsWith('aps_session'))
    if (set?.value) cookie = `${set.name}=${set.value}`
    const json: Json = res.headers['content-type']?.toString().includes('json') ? res.json() : {}
    if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${json.error ?? ''}`)
    return json
  }
  return { get: (u: string) => call('GET', u), post: (u: string, b?: unknown) => call('POST', u, b ?? {}), patch: (u: string, b: unknown) => call('PATCH', u, b) }
}

// --- Équipe : trois comptes de démonstration, un par rôle ---

const direction = session()
const rh = session()
const atelier = session()
{
  const equipe = [
    { prenom: 'Camille', nom: 'Rousset', poste: 'Gérante', contrat: 'cdi', dateEntree: '2012-03-01', compte: { identifiant: 'demo-direction', role: 'direction' } },
    { prenom: 'Sophie', nom: 'Blanchard', poste: 'Assistante administrative et RH', contrat: 'cdi', dateEntree: '2019-09-02', compte: { identifiant: 'demo-rh', role: 'rh' } },
    { prenom: 'Lucas', nom: 'Martinon', poste: 'Plieur sur presse numérique', contrat: 'cdi', dateEntree: '2021-01-11', compte: { identifiant: 'demo-atelier', role: 'atelier' } },
    { prenom: 'Hugo', nom: 'Faure', poste: 'Opérateur cisaille', contrat: 'apprentissage', dateEntree: '2025-09-01', compte: null },
  ]
  // Les comptes se créent avec un mot de passe provisoire : on le remplace par celui de la démo
  const [admin] = await db.insert(users).values({ identifiant: 'demo-bootstrap', nom: 'Démo', role: 'direction', passwordHash: await hashPassword(PASSWORD) }).returning()
  const boot = session()
  await boot.post('/api/auth/login', { identifiant: 'demo-bootstrap', password: PASSWORD })
  for (const e of equipe) await boot.post('/api/employees', e)
  await db.update(users).set({ passwordHash: await hashPassword(PASSWORD), mustChangePassword: false }).where(inArray(users.identifiant, ['demo-direction', 'demo-rh', 'demo-atelier']))
  await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, admin!.id))
  await boot.post('/api/auth/logout')
  await direction.post('/api/auth/login', { identifiant: 'demo-direction', password: PASSWORD })
  await rh.post('/api/auth/login', { identifiant: 'demo-rh', password: PASSWORD })
  await atelier.post('/api/auth/login', { identifiant: 'demo-atelier', password: PASSWORD })
}

// --- Clients (inventés ; SIRET valides pour passer le contrôle) ---

function siret(n: number) {
  const base = String(500000000 + n * 7919).padStart(9, '0') + '0001'
  let sum = 0
  for (let i = 0; i < 13; i++) {
    let d = Number(base[i])
    if (i % 2 === 0) d *= 2
    sum += d > 9 ? d - 9 : d
  }
  return base + String((10 - (sum % 10)) % 10)
}

const CLIENTS = [
  { key: 'bonnet', type: 'professionnel', origine: 'telephone', raisonSociale: 'Façades Bonnet & Fils', siret: siret(1), prenom: 'Thierry', nom: 'Bonnet', email: 'contact@facades-bonnet.example.com', telephone: '04 77 00 10 01', adresse: '14 rue des Tisserands', codePostal: '42700', ville: 'Firminy', notes: 'Façadier, 3 équipes. Commande surtout des bandeaux et des couvertines blanc 9010.',
    sites: [{ libelle: 'Résidence Les Terrasses', adresse: '8 allée des Cerisiers', codePostal: '42700', ville: 'Firminy' }, { libelle: 'Chantier mairie', adresse: '1 place de la République', codePostal: '42290', ville: 'Sorbiers' }] },
  { key: 'forez', type: 'professionnel', origine: 'atelier', raisonSociale: 'Toitures du Forez', siret: siret(2), prenom: 'Laurent', nom: 'Chambon', email: 'devis@toitures-forez.example.com', telephone: '04 77 00 10 02', adresse: '3 chemin du Plan', codePostal: '42600', ville: 'Montbrison', notes: 'Couvreur. Veut toujours la livraison sur chantier.',
    sites: [{ libelle: 'Maison Vernay', adresse: '22 rue du Stade', codePostal: '42600', ville: 'Savigneux' }] },
  { key: 'gier', type: 'professionnel', origine: 'email', raisonSociale: 'Étanchéité du Gier', siret: siret(3), prenom: 'Mehdi', nom: 'Kaddour', email: 'm.kaddour@etancheite-gier.example.com', telephone: '04 77 00 10 03', adresse: 'ZI de la Varizelle', codePostal: '42800', ville: 'Rive-de-Gier', notes: null, sites: [] },
  { key: 'perrin', type: 'professionnel', origine: 'telephone', raisonSociale: 'Maçonnerie Perrin', siret: siret(4), prenom: 'Alain', nom: 'Perrin', email: 'perrin.maconnerie@example.com', telephone: '04 77 00 10 04', adresse: '27 avenue Jean Jaurès', codePostal: '42400', ville: 'Saint-Chamond', notes: 'Paye toujours par chèque, à 30 jours.', sites: [] },
  { key: 'vial', type: 'professionnel', origine: 'email', raisonSociale: 'Atelier d’architecture Vial', siret: siret(5), prenom: 'Élodie', nom: 'Vial', email: 'e.vial@architecture-vial.example.com', telephone: '04 77 00 10 05', adresse: '9 rue Gambetta', codePostal: '42000', ville: 'Saint-Étienne', notes: 'Architecte. Pièces sur plan, souvent en noir sablé.',
    sites: [{ libelle: 'Médiathèque', adresse: '4 rue de la Bourse', codePostal: '42000', ville: 'Saint-Étienne' }] },
  { key: 'dupin', type: 'professionnel', origine: 'atelier', raisonSociale: 'Charpentes Dupin', siret: siret(6), prenom: 'Bruno', nom: 'Dupin', email: 'bruno@charpentes-dupin.example.com', telephone: '04 77 00 10 06', adresse: '5 impasse des Forges', codePostal: '42230', ville: 'Roche-la-Molière', notes: null, sites: [] },
  { key: 'chavanne', type: 'particulier', origine: 'email', prenom: 'Marie', nom: 'Chavanne', email: 'marie.chavanne@example.com', telephone: '06 00 00 20 01', adresse: '18 rue des Lilas', codePostal: '42160', ville: 'Andrézieux-Bouthéon', notes: null, sites: [] },
  { key: 'moulin', type: 'particulier', origine: 'telephone', prenom: 'Julien', nom: 'Moulin', email: 'julien.moulin@example.com', telephone: '06 00 00 20 02', adresse: '42 cours Fauriel', codePostal: '42100', ville: 'Saint-Étienne', notes: 'Rénove sa maison, couvertine sur muret.', sites: [] },
  { key: 'benali', type: 'particulier', origine: 'email', prenom: 'Nadia', nom: 'Benali', email: 'nadia.benali@example.com', telephone: '06 00 00 20 03', adresse: '7 rue du Pré', codePostal: '42500', ville: 'Le Chambon-Feugerolles', notes: null, sites: [] },
  { key: 'gonon', type: 'particulier', origine: 'email', prenom: 'Pierre', nom: 'Gonon', email: 'pierre.gonon@example.com', telephone: '06 00 00 20 04', adresse: '11 chemin des Vignes', codePostal: '42290', ville: 'Sorbiers', notes: null, sites: [] },
] as const

const clientId: Record<string, string> = {}
for (const { key, sites, ...c } of CLIENTS) {
  const { id } = await direction.post('/api/clients', c)
  clientId[key] = id
  for (const s of sites) await direction.post(`/api/clients/${id}/sites`, s)
}

// --- Catalogue ---

const cat = await direction.get('/api/orders/catalog')
const find = <T extends Json>(list: T[], pred: (x: T) => boolean, what: string) => {
  const x = list.find(pred)
  if (!x) throw new Error(`Catalogue : ${what} introuvable (le catalogue de départ a-t-il été modifié ?)`)
  return x
}
const model = (nom: string) => find(cat.models, (m: Json) => m.nom.toLowerCase().startsWith(nom), `modèle ${nom}`)
const material = (ep: number) => find(cat.materials, (m: Json) => m.epaisseur === ep && /alu/i.test(m.label), `aluminium ${ep} mm`)
const color = (ref: string) => find(cat.colors, (c: Json) => c.label.includes(ref), `coloris ${ref}`)
const accessory = (nom: string) => find(cat.accessories, (a: Json) => a.nom.toLowerCase().startsWith(nom), `accessoire ${nom}`)

type Piece = { modele: 'couvertine' | 'bavette' | 'bandeau'; ep: number; coloris: string; longueur: number; quantite: number; repere?: string; cotes?: number[]; acc?: [string, number][] }
const ligne = (p: Piece) => {
  const m = model(p.modele)
  return {
    repere: p.repere ?? null,
    modelId: m.id,
    materialId: material(p.ep).id,
    colorId: color(p.coloris).id,
    cotes: p.cotes ?? m.cotes,
    angles: m.angles,
    longueur: p.longueur,
    quantite: p.quantite,
    accessoires: (p.acc ?? []).map(([nom, quantite]) => ({ accessoryId: accessory(nom).id, quantite })),
  }
}

// --- Commandes : chaque scénario va jusqu'à l'étape voulue, avec le suivi de facturation correspondant ---

type Etape = 'recue' | 'validee' | 'fabrication' | 'prete' | 'livree' | 'annulee'
type Facturation = 'aucune' | 'devis-emis' | 'devis-envoye' | 'devis-accepte' | 'devis-refuse' | 'facture-emise' | 'facture-envoyee' | 'facture-payee' | 'facture-retard' | 'avoir'
type Scenario = { client: string; jours: number; etape: Etape; facturation: Facturation; retrait?: boolean; site?: string; notes?: string; pieces: Piece[] }

const SCENARIOS: Scenario[] = [
  // Terminées et réglées (historique)
  { client: 'bonnet', jours: 62, etape: 'livree', facturation: 'facture-payee', pieces: [{ modele: 'bandeau', ep: 1.5, coloris: 'RAL 9010', longueur: 3000, quantite: 24, repere: 'Bandeau façade nord', acc: [['angle', 6]] }, { modele: 'couvertine', ep: 1.5, coloris: 'RAL 9010', longueur: 3000, quantite: 12, acc: [['bouchon', 4], ['éclisse', 11]] }] },
  { client: 'forez', jours: 55, etape: 'livree', facturation: 'facture-payee', notes: 'Livraison sur chantier le matin avant 8 h.', pieces: [{ modele: 'couvertine', ep: 1, coloris: 'RAL 7016', longueur: 2500, quantite: 16, acc: [['bouchon', 2], ['éclisse', 15]] }] },
  { client: 'vial', jours: 48, etape: 'livree', facturation: 'facture-payee', pieces: [{ modele: 'bandeau', ep: 2, coloris: '2100', longueur: 3000, quantite: 18, repere: 'Bandeau médiathèque', acc: [['angle', 8]] }, { modele: 'bavette', ep: 1.5, coloris: '2100', longueur: 1400, quantite: 10, acc: [['embouts', 10]] }] },
  { client: 'moulin', jours: 41, etape: 'livree', facturation: 'facture-payee', pieces: [{ modele: 'couvertine', ep: 1, coloris: 'RAL 7016', longueur: 3000, quantite: 4, repere: 'Muret jardin', acc: [['bouchon', 2], ['éclisse', 3]] }] },
  // Facture payée plus tard, facture en retard
  { client: 'perrin', jours: 58, etape: 'livree', facturation: 'facture-retard', pieces: [{ modele: 'bavette', ep: 1, coloris: 'RAL 9010', longueur: 1200, quantite: 14, repere: 'Fenêtres R+1', acc: [['embouts', 14]] }] },
  { client: 'gier', jours: 35, etape: 'livree', facturation: 'facture-envoyee', pieces: [{ modele: 'couvertine', ep: 1.5, coloris: 'RAL 9006', longueur: 3000, quantite: 20, acc: [['bouchon', 4], ['éclisse', 18]] }] },
  { client: 'chavanne', jours: 20, etape: 'livree', facturation: 'facture-payee', pieces: [{ modele: 'bavette', ep: 1, coloris: 'RAL 9010', longueur: 1000, quantite: 6, repere: 'Fenêtres façade sud', acc: [['embouts', 6]] }] },
  // Une facture annulée par un avoir
  { client: 'dupin', jours: 30, etape: 'annulee', facturation: 'avoir', pieces: [{ modele: 'bandeau', ep: 1.5, coloris: 'Chêne', longueur: 3000, quantite: 8, acc: [['angle', 2]] }] },
  // En cours dans l'atelier
  { client: 'bonnet', jours: 9, etape: 'fabrication', facturation: 'facture-emise', site: 'Résidence Les Terrasses', pieces: [{ modele: 'couvertine', ep: 1.5, coloris: 'RAL 9010', longueur: 3000, quantite: 30, repere: 'Acrotère bâtiment B', acc: [['bouchon', 4], ['éclisse', 28]] }, { modele: 'bandeau', ep: 1.5, coloris: 'RAL 9010', longueur: 3000, quantite: 10, acc: [['angle', 4]] }] },
  { client: 'vial', jours: 6, etape: 'fabrication', facturation: 'devis-accepte', site: 'Médiathèque', pieces: [{ modele: 'couvertine', ep: 2, coloris: '2100', longueur: 3000, quantite: 14, acc: [['bouchon', 2], ['éclisse', 13]] }] },
  { client: 'forez', jours: 8, etape: 'prete', facturation: 'facture-emise', site: 'Maison Vernay', pieces: [{ modele: 'bandeau', ep: 1, coloris: 'RAL 7016', longueur: 3000, quantite: 12, repere: 'Rives toit', acc: [['angle', 4]] }] },
  { client: 'benali', jours: 5, etape: 'prete', facturation: 'devis-envoye', retrait: true, notes: 'Vient chercher en fin de semaine.', pieces: [{ modele: 'bavette', ep: 1, coloris: 'RAL 7016', longueur: 1100, quantite: 5, acc: [['embouts', 5]] }] },
  // À valider ou à chiffrer
  { client: 'perrin', jours: 3, etape: 'validee', facturation: 'devis-accepte', retrait: true, pieces: [{ modele: 'couvertine', ep: 1, coloris: 'RAL 9006', longueur: 2000, quantite: 8, acc: [['bouchon', 2], ['éclisse', 7]] }] },
  { client: 'gonon', jours: 2, etape: 'recue', facturation: 'devis-envoye', retrait: true, notes: 'Commande passée depuis le site.', pieces: [{ modele: 'couvertine', ep: 1, coloris: 'RAL 7016', longueur: 3000, quantite: 3, repere: 'Muret entrée', acc: [['bouchon', 2], ['éclisse', 2]] }] },
  { client: 'dupin', jours: 1, etape: 'recue', facturation: 'devis-emis', retrait: true, pieces: [{ modele: 'bandeau', ep: 1.5, coloris: 'RAL 9006', longueur: 3000, quantite: 16, acc: [['angle', 4]] }] },
  { client: 'gier', jours: 12, etape: 'recue', facturation: 'devis-refuse', retrait: true, notes: 'A trouvé moins cher ailleurs.', pieces: [{ modele: 'bavette', ep: 1.5, coloris: 'RAL 9010', longueur: 1400, quantite: 20, acc: [['embouts', 20]] }] },
]

const CHAIN: Etape[] = ['validee', 'fabrication', 'prete', 'livree']
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

for (const s of SCENARIOS) {
  const c = CLIENTS.find((x) => x.key === s.client)!
  const site = s.site ? c.sites.find((x) => x.libelle === s.site) : undefined
  const { id } = await direction.post('/api/orders', {
    clientId: clientId[s.client],
    lignes: s.pieces.map(ligne),
    livraison: s.retrait || !site ? { mode: 'retrait' } : { mode: 'livraison', adresse: site.adresse, codePostal: site.codePostal, ville: site.ville },
    notes: s.notes ?? null,
  }).catch((e: Error) => {
    // Calcul de la distance par l'IGN : sans réseau, on retombe sur un retrait à l'atelier
    if (!/localisation/.test(e.message)) throw e
    return direction.post('/api/orders', { clientId: clientId[s.client], lignes: s.pieces.map(ligne), livraison: { mode: 'retrait' }, notes: s.notes ?? null })
  })

  const billing = async (kind: 'devis' | 'facture') => (await direction.post(`/api/billing/orders/${id}/${kind}`)).id as string
  const docs: { id: string; kind: 'devis' | 'facture' | 'avoir'; apres: number }[] = [] // apres : nombre d'étapes déjà faites à l'émission
  const stop = s.etape === 'annulee' ? 'prete' : s.etape
  const steps = CHAIN.slice(0, CHAIN.indexOf(stop as (typeof CHAIN)[number]) + 1)

  const f = s.facturation
  if (f.startsWith('devis')) {
    const d = await billing('devis')
    docs.push({ id: d, kind: 'devis', apres: 0 })
    if (f !== 'devis-emis') await direction.post(`/api/billing/${d}/envoi`)
    if (f === 'devis-accepte') await direction.post(`/api/billing/${d}/reponse`, { reponse: 'accepte' })
    if (f === 'devis-refuse') await direction.post(`/api/billing/${d}/reponse`, { reponse: 'refuse' })
  }
  for (const [i, etape] of steps.entries()) {
    if (etape === 'validee') await direction.post(`/api/orders/${id}/status`, { statut: etape })
    else await atelier.post(`/api/production/${id}/status`, { statut: etape }).catch(() => direction.post(`/api/orders/${id}/status`, { statut: etape }))
    if (f.startsWith('facture') || f === 'avoir') {
      const quand = s.etape === 'livree' ? 'livree' : 'validee'
      if (!docs.some((d) => d.kind === 'facture') && etape === quand) {
        const d = await billing('facture')
        docs.push({ id: d, kind: 'facture', apres: i + 1 })
      }
    }
  }
  const facture = docs.find((d) => d.kind === 'facture')
  if (facture) {
    if (['facture-envoyee', 'facture-payee', 'facture-retard', 'avoir'].includes(f)) await direction.post(`/api/billing/${facture.id}/envoi`)
    if (f === 'facture-payee') await direction.post(`/api/billing/${facture.id}/paiement`, { date: today, mode: ['virement', 'cheque', 'carte'][docs.length % 3] })
    if (f === 'avoir') {
      const avoir = await direction.post(`/api/billing/${facture.id}/avoir`, { motif: 'Commande annulée par le client avant fabrication : couleur finalement changée.' })
      docs.push({ id: avoir.id, kind: 'avoir', apres: steps.length })
    }
  }
  if (s.etape === 'annulee') await direction.post(`/api/orders/${id}/status`, { statut: 'annulee', note: 'Annulée à la demande du client.' })

  // --- Antidatage : la commande a été passée il y a « jours » jours, une étape tous les GAP jours ---
  const age = (k: number) => Math.max(s.jours - k * GAP, 0)
  const events = await db.select({ id: orderEvents.id }).from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(orderEvents.id)
  for (const [k, e] of events.entries()) await db.execute(sql`update order_events set at = at - make_interval(days => ${age(k)}) where id = ${e.id}`)
  await db.execute(sql`update orders set created_at = created_at - make_interval(days => ${age(0)}), updated_at = updated_at - make_interval(days => ${age(events.length - 1)}), date_prevue = case when date_prevue is null then null else (date_prevue - ${age(1)}::int) end where id = ${id}`)
  const orderAudit = await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.targetId, id)).orderBy(auditLog.id)
  for (const [k, a] of orderAudit.entries()) await db.execute(sql`update audit_log set at = at - make_interval(days => ${age(k)}) where id = ${a.id}`)

  // Les documents émis sont figés par un déclencheur : on le lève le temps d'antidater la démo, puis on le remet
  await db.execute(sql`alter table billing_documents disable trigger billing_documents_fige`)
  try {
    for (const d of docs) {
      const jours = age(d.apres)
      await db.execute(sql`update billing_documents set emis_le = emis_le - make_interval(days => ${jours}), echeance = (echeance - ${jours}::int), envoye_le = envoye_le - make_interval(days => ${jours}), reponse_le = reponse_le - make_interval(days => ${jours}), updated_at = updated_at - make_interval(days => ${jours}) where id = ${d.id}`)
      if (f === 'facture-payee' && d.kind === 'facture') {
        const emis = addDays(today, -jours)
        const paye = addDays(emis, 12) > today ? today : addDays(emis, 12)
        await db.execute(sql`update billing_documents set paye_le = ${paye} where id = ${d.id}`)
      }
      const docAudit = await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.targetId, d.id))
      for (const a of docAudit) await db.execute(sql`update audit_log set at = at - make_interval(days => ${jours}) where id = ${a.id}`)
    }
  } finally {
    await db.execute(sql`alter table billing_documents enable trigger billing_documents_fige`)
  }
}

// Le compte technique du départ disparaît, avec ses traces dans le journal
await db.execute(sql`delete from audit_log where identifiant = 'demo-bootstrap' or user_id in (select id from users where identifiant = 'demo-bootstrap')`)
await db.delete(users).where(eq(users.identifiant, 'demo-bootstrap'))

const [orderCount] = await db.select({ n: count() }).from(orders)
const nOrders = orderCount?.n ?? 0
console.log(`Démo prête : ${CLIENTS.length} clients, ${nOrders} commandes, devis, factures et un avoir.`)
console.log('Comptes (mot de passe commun) :')
console.log(`  demo-direction  tout l'espace Direction`)
console.log(`  demo-rh         salariés et lecture des clients`)
console.log(`  demo-atelier    vue Fabrication, sans clients ni prix`)
console.log(`  mot de passe    ${PASSWORD}`)

await app.close()
await pool.end()
