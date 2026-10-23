// Fabrique des factures et avoirs Factur-X d'exemple, pour les faire contrôler par le validateur officiel (Mustang).
//   cd api && npx tsx ../scripts/facturx/exemples.mts ../chemin/dossier-de-sortie
// Voir scripts/facturx/valider.sh.
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildFacturxXml, type FacturxInput } from '../../api/src/facturx.js'
import { renderDocument, totals, type DocLine } from '../../api/src/pdf.js'

const out = process.argv[2]
if (!out) throw new Error('Indiquez le dossier de sortie.')
mkdirSync(out, { recursive: true })

const company = {
  raisonSociale: 'Entreprise de Démonstration',
  formeJuridique: 'SARL',
  capital: '10 000 €',
  adresse: '12 rue de l’Atelier\n42000 Saint-Étienne',
  telephone: '04 77 00 00 00',
  email: 'contact@demo.example',
  siteWeb: '',
  siret: '732 829 320 00074',
  rcs: 'Saint-Étienne B 732 829 320',
  tvaIntra: 'FR44732829320',
  iban: 'FR76 3000 6000 0112 3456 7890 189',
  bic: 'AGRIFRPP',
}
const template = { couleur: '#5b34c4', entete: '', conditionsPaiement: 'Paiement à 30 jours par virement.', validiteDevis: 30, echeanceFacture: 30, noteDevis: '', noteFacture: '', mentionsLegales: 'Pénalités de retard : 3 fois le taux d’intérêt légal. Indemnité forfaitaire de recouvrement : 40 €.', piedDePage: '' }

const lignes: DocLine[] = [
  { designation: 'Couvertine · Mur sud', detail: 'Aluminium 1,5 mm · Gris anthracite (RAL 7016) · développé 300 mm · 4 plis · longueur 3000 mm', quantite: 12, prixUnitaire: 41.5 },
  { designation: 'Bouchon de couvertine', detail: 'Pour : Couvertine · Mur sud', quantite: 24, prixUnitaire: 6.9 },
  { designation: 'Mise en route', detail: 'Réglage de la plieuse, une par pièce différente', quantite: 1, prixUnitaire: 18 },
  { designation: 'Remise professionnelle', detail: '10 % sur les pièces et accessoires', quantite: 1, prixUnitaire: -66.4 },
  { designation: 'Livraison offerte', detail: 'Firminy · 12 km', quantite: 1, prixUnitaire: 0 },
]

async function fabrique(nom: string, o: { type: 'facture' | 'avoir'; taux: number; pro: boolean; adresseClient: boolean }) {
  const t = totals(lignes, o.taux)
  const date = new Date('2026-10-20T10:00:00+02:00')
  const sign = o.type === 'avoir' ? -1 : 1
  const acheteur = o.pro
    ? { nom: 'Toitures du Forez', adresse: o.adresseClient ? '8 avenue de la Gare\n42700 Firminy' : '', siret: '732 829 320 00074', email: 'compta@toitures-forez.example' }
    : { nom: 'Jean Dupont', adresse: o.adresseClient ? '3 rue des Lilas\n42490 Fraisses' : '', siret: null, email: 'jean@example.com' }
  const input: FacturxInput = {
    type: o.type,
    numero: o.type === 'avoir' ? 'A-2026-0001' : 'F-2026-0001',
    date,
    echeance: o.type === 'facture' ? new Date('2026-11-19T10:00:00+02:00') : null,
    commande: 'C-2026-0001',
    livraison: o.type === 'facture' ? new Date('2026-10-18T10:00:00+02:00') : null,
    vendeur: { ...company, nom: company.raisonSociale },
    acheteur,
    lignes,
    taux: o.taux,
    totaux: t,
    facture: o.type === 'avoir' ? { numero: 'F-2026-0001', date: new Date('2026-10-01T10:00:00+02:00') } : undefined,
    conditions: template.conditionsPaiement,
  }
  const xml = buildFacturxXml(input)
  const shown = lignes.map((l) => ({ ...l, prixUnitaire: l.prixUnitaire * sign }))
  const pdf = await renderDocument(company, template, null, {
    type: o.type,
    numero: input.numero,
    date,
    echeance: input.echeance ?? undefined,
    references: ['Commande : C-2026-0001', 'Retrait à l’atelier'],
    client: { nom: acheteur.nom, adresse: acheteur.adresse },
    lignes: shown,
    tva: o.taux,
    totaux: { ht: t.ht * sign, tva: t.tva * sign, ttc: t.ttc * sign },
    avoir: o.type === 'avoir' ? { facture: 'F-2026-0001', factureDate: new Date('2026-10-01T10:00:00+02:00'), motif: 'Erreur de coloris' } : undefined,
  }, { xml })
  writeFileSync(`${out}/${nom}.pdf`, pdf)
  writeFileSync(`${out}/${nom}.xml`, xml)
  console.log(`${nom}.pdf (${Math.round(pdf.length / 1024)} Ko)`)
}

await fabrique('facture-pro', { type: 'facture', taux: 20, pro: true, adresseClient: true })
await fabrique('facture-particulier', { type: 'facture', taux: 20, pro: false, adresseClient: false })
await fabrique('facture-tva-reduite', { type: 'facture', taux: 10, pro: true, adresseClient: true })
await fabrique('facture-sans-tva', { type: 'facture', taux: 0, pro: true, adresseClient: true })
await fabrique('avoir-pro', { type: 'avoir', taux: 20, pro: true, adresseClient: true })
