import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { accessories, billingDocuments, colors, materials } from '../src/db/schema.js'
import { buildFacturxXml, facturxMissing, facturxMissingFor, MENTIONS_FACTURE, siren, splitAddress, type FacturxInput } from '../src/facturx.js'
import { totals } from '../src/pdf.js'
import { buildApp, createUser, loginAs, M, pdfAttachments, pdfTextEmbedded, resetDb, seedModels, type App, type Client } from './helpers.js'

const lignes = [
  { designation: 'Couvertine · Mur sud', detail: 'Aluminium 1,5 mm', quantite: 12, prixUnitaire: 41.5 },
  { designation: 'Bouchon & éclisse <lot>', quantite: 24, prixUnitaire: 6.9 },
  { designation: 'Remise professionnelle', quantite: 1, prixUnitaire: -66.4 },
  { designation: 'Livraison offerte', quantite: 1, prixUnitaire: 0 },
]
const base = (over: Partial<FacturxInput> = {}): FacturxInput => ({
  type: 'facture',
  numero: 'F-2026-0001',
  date: new Date('2026-10-20T10:00:00+02:00'),
  echeance: new Date('2026-11-19T10:00:00+02:00'),
  commande: 'C-2026-0001',
  livraison: null,
  vendeur: { nom: 'Atelier Test', adresse: '12 rue de l’Atelier\n42000 Saint-Étienne', siret: '732 829 320 00074', tvaIntra: 'FR44 732829320', email: 'contact@aps.test', iban: 'FR76 3000 6000 0112 3456 7890 189', bic: 'AGRIFRPP' },
  acheteur: { nom: 'Toitures du Forez', adresse: '8 avenue de la Gare\n42700 Firminy', siret: '732 829 320 00074', email: 'compta@forez.test' },
  lignes,
  taux: 20,
  totaux: totals(lignes, 20),
  ...over,
})
const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<ram:${name}[^>]*>([^<]*)</ram:${name}>`, 'g'))].map((m) => m[1])

describe('XML Factur-X', () => {
  it('reprend les montants de la facture : HT, remise sur le document, TVA, TTC', () => {
    const t = totals(lignes, 20)
    const xml = buildFacturxXml(base())
    expect(xml).toContain('urn:cen.eu:en16931:2017')
    expect(tag(xml, 'TypeCode').slice(0, 1)).toEqual(['380'])
    expect(tag(xml, 'LineTotalAmount').pop()).toBe((498 + 165.6).toFixed(2))
    expect(tag(xml, 'AllowanceTotalAmount')).toEqual(['66.40'])
    expect(tag(xml, 'TaxBasisTotalAmount')).toEqual([t.ht.toFixed(2)])
    expect(tag(xml, 'TaxTotalAmount')).toEqual([t.tva.toFixed(2)])
    expect(tag(xml, 'GrandTotalAmount')).toEqual([t.ttc.toFixed(2)])
    expect(tag(xml, 'DuePayableAmount')).toEqual([t.ttc.toFixed(2)])
    // La remise n'est pas une ligne à prix négatif (interdit) : elle est au niveau du document
    expect(tag(xml, 'LineID')).toEqual(['1', '2', '3'])
    expect(tag(xml, 'ChargeAmount')).toEqual(['41.50', '6.90', '0.00'])
    expect(xml).toContain('<ram:Reason>Remise professionnelle</ram:Reason>')
  })

  it('identifie le vendeur et l’acheteur : SIREN, TVA, adresse, e-mail, paiement par virement', () => {
    const xml = buildFacturxXml(base())
    expect(xml).toContain('<ram:ID schemeID="0002">732829320</ram:ID>')
    expect(xml).toContain('<ram:ID schemeID="VA">FR44732829320</ram:ID>')
    expect(xml).toContain('<ram:PostcodeCode>42000</ram:PostcodeCode>')
    expect(xml).toContain('<ram:CityName>Saint-Étienne</ram:CityName>')
    expect(xml).toContain('<ram:URIID schemeID="EM">compta@forez.test</ram:URIID>')
    expect(xml).toContain('<ram:IBANID>FR7630006000011234567890189</ram:IBANID>')
    expect(xml).toContain('<ram:BICID>AGRIFRPP</ram:BICID>')
    expect(xml).toContain('<ram:IssuerAssignedID>C-2026-0001</ram:IssuerAssignedID>')
    expect(xml).toContain('format="102">20261119')
  })

  it('porte les trois mentions légales obligatoires, avec leur code', () => {
    const xml = buildFacturxXml(base())
    for (const m of MENTIONS_FACTURE) expect(xml).toContain(`<ram:SubjectCode>${m.code}</ram:SubjectCode>`)
    expect(MENTIONS_FACTURE.map((m) => m.code)).toEqual(['PMD', 'PMT', 'AAB'])
  })

  it('échappe les caractères spéciaux des noms et désignations', () => {
    const xml = buildFacturxXml(base())
    expect(xml).toContain('Bouchon &amp; éclisse &lt;lot&gt;')
    expect(xml).not.toContain('<lot>')
  })

  it('refuse de produire un XML dont le total diffère de celui de la facture', () => {
    expect(() => buildFacturxXml(base({ totaux: { ht: 999, tva: 199.8, ttc: 1198.8 } }))).toThrow(/total HT/)
  })

  it('fait un avoir : type 381, montants positifs, référence de la facture annulée, sans échéance', () => {
    const xml = buildFacturxXml(base({ type: 'avoir', numero: 'A-2026-0001', echeance: null, facture: { numero: 'F-2026-0001', date: new Date('2026-10-01T10:00:00+02:00') } }))
    expect(tag(xml, 'TypeCode').slice(0, 1)).toEqual(['381'])
    expect(tag(xml, 'GrandTotalAmount')).toEqual([totals(lignes, 20).ttc.toFixed(2)])
    expect(xml).toContain('<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>F-2026-0001</ram:IssuerAssignedID>')
    expect(xml).not.toContain('DueDateDateTime')
  })

  it('traite une vente sans TVA en catégorie « exonérée »', () => {
    const l = [{ designation: 'Pièce', quantite: 1, prixUnitaire: 100 }]
    const xml = buildFacturxXml(base({ lignes: l, taux: 0, totaux: totals(l, 0) }))
    expect(tag(xml, 'CategoryCode').every((c) => c === 'E')).toBe(true)
    expect(xml).toContain('<ram:ExemptionReason>TVA non applicable</ram:ExemptionReason>')
  })

  it('ne déclare un SIREN que pour un professionnel muni d’un SIRET valide, et indique le lieu de livraison', () => {
    const xml = buildFacturxXml(base({ acheteur: { nom: 'Jean Dupont', adresse: '', siret: null }, livraisonAdresse: 'Rue du Stade\n42600 Savigneux' }))
    expect(xml.match(/schemeID="0002"/g)).toHaveLength(1)
    expect(xml).toContain('<ram:ShipToTradeParty>')
    expect(xml).toContain('<ram:CityName>Savigneux</ram:CityName>')
  })

  it('aides : SIREN, adresse et ce qui manque à l’entreprise', () => {
    expect(siren('732 829 320 00074')).toBe('732829320')
    expect(splitAddress('ZA du Parc\nRue de l’Ondaine\n42490 Fraisses')).toEqual({ rue: 'ZA du Parc, Rue de l’Ondaine', codePostal: '42490', ville: 'Fraisses' })
    expect(facturxMissing({ siret: '', tvaIntra: '', adresse: '42490 Fraisses' })).toEqual(['le SIRET', 'le numéro de TVA intracommunautaire', 'l’adresse complète (rue, code postal et ville)'])
    const ok = { siret: '732 829 320 00074', tvaIntra: 'FR44732829320', adresse: '12 rue X\n42000 St-Étienne' }
    expect(facturxMissing(ok)).toEqual([])
    expect(facturxMissingFor(ok, { type: 'professionnel', siret: null, email: null })).toEqual(['le SIRET du client', 'l’adresse e-mail du client'])
    expect(facturxMissingFor(ok, { type: 'particulier', siret: null, email: 'jean@example.com' })).toEqual([])
  })
})

describe('Factures émises par l’application', () => {
  let app: App
  let direction: Client
  let ids: { alu: string; anthracite: string; dupont: string; toitures: string }
  beforeEach(async () => {
    app = await buildApp()
    await resetDb()
    await seedModels()
    await createUser({ identifiant: 'chef', role: 'direction' })
    direction = await loginAs(app, 'chef')
    const [alu] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
    const [anthracite] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
    await db.insert(accessories).values({ nom: 'Bouchon', prix: 6.9, modeles: [M.couvertine] })
    await direction.patch('/api/documents/company', { raisonSociale: 'Atelier Test', formeJuridique: '', capital: '', adresse: '12 rue de l’Atelier\n42000 Saint-Étienne', telephone: '', email: 'contact@aps.test', siteWeb: '', siret: '732 829 320 00074', rcs: '', tvaIntra: 'FR44732829320', iban: 'FR76 3000 6000 0112 3456 7890 189', bic: 'AGRIFRPP' })
    const dupont = (await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont', adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses' })).json().id
    const toitures = (await direction.post('/api/clients', { type: 'professionnel', raisonSociale: 'Toitures du Forez', siret: '732 829 320 00074', adresse: '8 avenue de la Gare', codePostal: '42700', ville: 'Firminy' })).json().id
    ids = { alu: alu!.id, anthracite: anthracite!.id, dupont, toitures }
  })
  afterEach(() => app.close())

  const issue = async (kind: 'devis' | 'facture', clientId = ids.toitures) => {
    const o = (await direction.post('/api/orders', { clientId, lignes: [{ modelId: M.couvertine, materialId: ids.alu, colorId: ids.anthracite, cotes: [20, 70, 300, 70, 20], angles: [135, 90, 90, 135], longueur: 3000, quantite: 4, accessoires: [] }], livraison: { mode: 'retrait' } })).json()
    await direction.post(`/api/orders/${o.id}/status`, { statut: 'validee' })
    const res = await direction.post(`/api/billing/orders/${o.id}/${kind}`)
    expect(res.statusCode, res.body).toBe(201)
    return res.json() as { id: string; numero: string }
  }

  it('une facture est un PDF/A-3 qui embarque son XML Factur-X, identique à celui gardé en base', async () => {
    const f = await issue('facture')
    const pdf = (await direction.get(`/api/billing/${f.id}/pdf`)).rawPayload
    expect(pdf.subarray(0, 8).toString()).toContain('%PDF-1.7')
    const files = await pdfAttachments(pdf)
    expect(Object.keys(files)).toEqual(['factur-x.xml'])
    const [row] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, f.id))
    expect(files['factur-x.xml']).toBe(row!.facturxXml)
    const d = (await direction.get(`/api/billing/${f.id}`)).json().document
    expect(tag(files['factur-x.xml']!, 'GrandTotalAmount')).toEqual([d.ttc.toFixed(2)])
    expect(tag(files['factur-x.xml']!, 'TaxBasisTotalAmount')).toEqual([d.ht.toFixed(2)])
    expect(files['factur-x.xml']).toContain(`<ram:ID>${f.numero}</ram:ID>`)
    expect(files['factur-x.xml']).toContain('<ram:ID schemeID="0002">732829320</ram:ID>')
    expect(d.facturx).toBe(true)
    // Le texte lisible dit la même chose que le XML, mentions obligatoires comprises
    const txt = await pdfTextEmbedded(pdf)
    for (const m of MENTIONS_FACTURE) expect(txt.replace(/\s+/g, ' ')).toContain(m.texte)
  })

  // FACTURX_DUMP=dossier : garde les vrais PDF émis, pour les passer au validateur officiel (voir scripts/facturx/valider.sh)
  it.skipIf(!process.env.FACTURX_DUMP)('écrit les factures et avoirs réellement émis pour le validateur', async () => {
    const dir = process.env.FACTURX_DUMP!
    mkdirSync(dir, { recursive: true })
    for (const [nom, clientId] of [['reel-pro', ids.toitures], ['reel-particulier', ids.dupont]] as const) {
      const f = await issue('facture', clientId)
      writeFileSync(`${dir}/${nom}-facture.pdf`, (await direction.get(`/api/billing/${f.id}/pdf`)).rawPayload)
      const a = (await direction.post(`/api/billing/${f.id}/avoir`, { motif: 'Essai' })).json()
      writeFileSync(`${dir}/${nom}-avoir.pdf`, (await direction.get(`/api/billing/${a.id}/pdf`)).rawPayload)
    }
  })

  it('un devis reste un PDF ordinaire, sans XML', async () => {
    const d = await issue('devis')
    const pdf = (await direction.get(`/api/billing/${d.id}/pdf`)).rawPayload
    expect(await pdfAttachments(pdf)).toEqual({})
    expect((await direction.get(`/api/billing/${d.id}`)).json().document.facturx).toBe(false)
    expect((await direction.get(`/api/billing/${d.id}/facturx.xml`)).statusCode).toBe(404)
  })

  it('un avoir est lui aussi électronique, et référence la facture annulée', async () => {
    const f = await issue('facture')
    const a = (await direction.post(`/api/billing/${f.id}/avoir`, { motif: 'Erreur de coloris' })).json() as { id: string; numero: string }
    const pdf = (await direction.get(`/api/billing/${a.id}/pdf`)).rawPayload
    const xml = (await pdfAttachments(pdf))['factur-x.xml']!
    expect(tag(xml, 'TypeCode').slice(0, 1)).toEqual(['381'])
    expect(xml).toContain(`<ram:IssuerAssignedID>${f.numero}</ram:IssuerAssignedID>`)
    const fd = (await direction.get(`/api/billing/${f.id}`)).json().document
    // Montants positifs dans le XML, même si l'avoir s'affiche en négatif
    expect(tag(xml, 'GrandTotalAmount')).toEqual([fd.ttc.toFixed(2)])
    expect((await direction.get(`/api/billing/${a.id}`)).json().document.ttc).toBeLessThan(0)
  })

  it('télécharge le XML tel qu’émis, en pièce jointe', async () => {
    const f = await issue('facture')
    const res = await direction.get(`/api/billing/${f.id}/facturx.xml`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/xml; charset=utf-8')
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${f.numero}.xml"`)
    expect(res.body.startsWith('<?xml')).toBe(true)
    expect(res.body).toContain(`<ram:ID>${f.numero}</ram:ID>`)
  })

  it('met le client particulier sans SIREN, et le professionnel avec', async () => {
    const pro = (await pdfAttachments((await direction.get(`/api/billing/${(await issue('facture')).id}/pdf`)).rawPayload))['factur-x.xml']!
    const part = (await pdfAttachments((await direction.get(`/api/billing/${(await issue('facture', ids.dupont)).id}/pdf`)).rawPayload))['factur-x.xml']!
    expect(pro.match(/schemeID="0002"/g)).toHaveLength(2)
    expect(part.match(/schemeID="0002"/g)).toHaveLength(1)
  })

  it('la base fige aussi le XML : il ne se modifie plus', async () => {
    const f = await issue('facture')
    await expect(db.update(billingDocuments).set({ facturxXml: '<x/>' }).where(eq(billingDocuments.id, f.id))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/ne se modifie plus/) } })
  })

  it('dit ce qui manque à l’entreprise pour émettre des factures électroniques conformes', async () => {
    expect((await direction.get('/api/documents/settings')).json().facturx).toEqual({ manque: [] })
    await direction.patch('/api/documents/company', { siret: '', tvaIntra: '', iban: '' })
    expect((await direction.get('/api/documents/settings')).json().facturx.manque).toEqual(['le SIRET', 'le numéro de TVA intracommunautaire'])
  })

  it('prévient sur la commande de ce qui manque avant de facturer : entreprise et client', async () => {
    const o = (await direction.post('/api/orders', { clientId: ids.toitures, lignes: [{ modelId: M.couvertine, materialId: ids.alu, colorId: ids.anthracite, cotes: [20, 70, 300, 70, 20], angles: [135, 90, 90, 135], longueur: 3000, quantite: 1, accessoires: [] }], livraison: { mode: 'retrait' } })).json()
    // Le client pro n'a pas d'e-mail ; l'entreprise est complète
    expect((await direction.get(`/api/orders/${o.id}`)).json().facturx).toEqual({ manque: ['l’adresse e-mail du client'] })
    await direction.patch(`/api/clients/${ids.toitures}`, { email: 'compta@forez.test' })
    expect((await direction.get(`/api/orders/${o.id}`)).json().facturx).toEqual({ manque: [] })
    await direction.patch('/api/documents/company', { siret: '', tvaIntra: '' })
    expect((await direction.get(`/api/orders/${o.id}`)).json().facturx.manque).toEqual(['le SIRET', 'le numéro de TVA intracommunautaire'])
  })

  it('réserve le fichier XML à la direction', async () => {
    const f = await issue('facture')
    await createUser({ identifiant: 'paul', role: 'atelier' })
    expect((await (await loginAs(app, 'paul')).get(`/api/billing/${f.id}/facturx.xml`)).statusCode).toBe(403)
  })
})
