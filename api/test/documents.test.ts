import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deflateSync, crc32 } from 'node:zlib'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, documentCounters } from '../src/db/schema.js'
import { allocateNumber, formatNumber, yearOf } from '../src/documents.js'
import { clean, inspectImage, renderDocument, sampleDocument, totals } from '../src/pdf.js'
import { buildApp, createUser, loginAs, resetDb, type App, type Client } from './helpers.js'

let app: App
let direction: Client
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
})

const YEAR = yearOf(new Date())
const settings = async () => (await direction.get('/api/documents/settings')).json()
const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))

/** Image PNG unie de la taille voulue, fabriquée à la main (en-tête, données compressées, fin). */
function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8) // 8 bits, RVB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7b)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const isPdf = (b: Buffer) => b.subarray(0, 5).toString() === '%PDF-'

describe('Accès', () => {
  it('est réservé à la direction', async () => {
    await createUser({ identifiant: 'rh', role: 'rh' })
    await createUser({ identifiant: 'atelier', role: 'atelier' })
    for (const who of ['rh', 'atelier']) {
      const c = await loginAs(app, who)
      for (const res of await Promise.all([
        c.get('/api/documents/settings'),
        c.patch('/api/documents/company', { raisonSociale: 'X' }),
        c.patch('/api/documents/template', { couleur: '#000000' }),
        c.patch('/api/documents/numbering', { devis: 5 }),
        c.post('/api/documents/preview', { type: 'devis' }),
        c.get('/api/documents/logo'),
        c.put('/api/documents/logo', png(100, 50), { 'content-type': 'image/png' }),
        c.delete('/api/documents/logo'),
      ]))
        expect(res.statusCode, `${who} ${res.raw.req.url}`).toBe(403)
    }
  })
})

describe('Entreprise', () => {
  it('renvoie les valeurs de départ, sans le contenu du logo', async () => {
    const { company } = await settings()
    expect(company).toMatchObject({ raisonSociale: 'Alu Pliage Service', adresse: '42490 Fraisses', siret: '', logo: false })
  })

  it('enregistre l’identité et met en forme SIRET, TVA et IBAN', async () => {
    const res = await direction.patch('/api/documents/company', {
      formeJuridique: 'SARL',
      capital: '10 000 €',
      adresse: '  ZA du Parc  \r\n42490 Fraisses\n',
      siret: '73282932000074',
      tvaIntra: 'fr 44 732829320',
      iban: 'fr7630006000011234567890189',
      bic: 'agri fr pp',
      email: 'contact@exemple.fr',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().company).toMatchObject({
      adresse: 'ZA du Parc\n42490 Fraisses',
      siret: '732 829 320 00074',
      tvaIntra: 'FR44732829320',
      iban: 'FR76 3000 6000 0112 3456 7890 189',
      bic: 'AGRIFRPP',
    })
    const [entry] = await entries('documents.company_updated')
    expect((entry!.details as { changements: Record<string, unknown> }).changements).toHaveProperty('siret', { avant: '', apres: '732 829 320 00074' })
  })

  it('accepte de vider un champ facultatif', async () => {
    await direction.patch('/api/documents/company', { siret: '73282932000074' })
    expect((await direction.patch('/api/documents/company', { siret: '' })).json().company.siret).toBe('')
  })

  it.each([
    [{ raisonSociale: ' ' }, 'raisonSociale', /requise/],
    [{ siret: '1234' }, 'siret', /14 chiffres/],
    [{ siret: '73282932000075' }, 'siret', /vérifiez les chiffres/],
    [{ tvaIntra: 'DE123' }, 'tvaIntra', /format FR/],
    [{ iban: 'FR7630006000011234567890188' }, 'iban', /vérifiez/],
    [{ bic: 'AGR' }, 'bic', /8 ou 11/],
    [{ email: 'pas-un-mail' }, 'email', /e-mail invalide/],
    [{ adresse: 'x'.repeat(301) }, 'adresse', /300 caractères/],
  ])('refuse %o et désigne le champ', async (body, field, msg) => {
    const res = await direction.patch('/api/documents/company', body)
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('ne note rien si rien ne change', async () => {
    await direction.patch('/api/documents/company', { raisonSociale: 'Alu Pliage Service' })
    expect(await entries('documents.company_updated')).toHaveLength(0)
  })

  it('refuse de rendre une entreprise déjà conforme pour la facturation électronique non conforme', async () => {
    // Rendre l'entreprise entièrement conforme (SIRET, TVA, adresse complète)
    const ok = await direction.patch('/api/documents/company', { siret: '73282932000074', tvaIntra: 'FR44732829320', adresse: 'ZA du Parc\n42490 Fraisses' })
    expect(ok.statusCode).toBe(200)

    const res = await direction.patch('/api/documents/company', { siret: '' })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ field: 'siret', error: expect.stringMatching(/romprait la conformité Factur-X/) })
    // Rien n'a été enregistré : toujours conforme
    expect((await settings()).company.siret).toBe('732 829 320 00074')
    expect(await entries('documents.company_updated')).toHaveLength(1)
  })

  it('autorise encore de corriger un champ tant que l’entreprise n’est pas entièrement conforme', async () => {
    // Seul le SIRET est renseigné : l'entreprise n'est pas encore conforme, on peut le vider sans blocage
    await direction.patch('/api/documents/company', { siret: '73282932000074' })
    expect((await direction.patch('/api/documents/company', { siret: '' })).statusCode).toBe(200)
  })
})

describe('Modèle', () => {
  it('enregistre couleur, textes et délais', async () => {
    const res = await direction.patch('/api/documents/template', {
      couleur: '#7B2FA3',
      conditionsPaiement: '30 % à la commande.\nSolde à la livraison.',
      validiteDevis: '45',
      echeanceFacture: 30,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().template).toMatchObject({ couleur: '#7b2fa3', validiteDevis: 45 })
    expect(await entries('documents.template_updated')).toHaveLength(1)
  })

  it.each([
    [{ couleur: 'violet' }, 'couleur', /#rrggbb/],
    [{ echeanceFacture: 90 }, 'echeanceFacture', /60 jours maximum/],
    [{ validiteDevis: 0 }, 'validiteDevis', /1 jours minimum/],
    [{ mentionsLegales: 'x'.repeat(2001) }, 'mentionsLegales', /2000 caractères/],
  ])('refuse %o et désigne le champ', async (body, field, msg) => {
    const res = await direction.patch('/api/documents/template', body)
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('active le QR code par défaut, et accepte de le désactiver', async () => {
    expect((await settings()).template.qrCode).toBe(true)
    const res = await direction.patch('/api/documents/template', { qrCode: 'false' })
    expect(res.statusCode).toBe(200)
    expect(res.json().template.qrCode).toBe(false)
    const [entry] = await entries('documents.template_updated')
    expect(entry!.details).toEqual({ changements: { qrCode: { avant: true, apres: false } } })
  })
})

describe('Numérotation', () => {
  it('formate les numéros sur 4 chiffres', () => {
    expect(formatNumber('devis', 2026, 1)).toBe('D-2026-0001')
    expect(formatNumber('facture', 2026, 12345)).toBe('F-2026-12345')
  })

  it('compte l’année à l’heure de Paris', () => {
    expect(yearOf(new Date('2026-12-31T23:30:00+01:00'))).toBe(2026)
    expect(yearOf(new Date('2026-12-31T23:30:00Z'))).toBe(2027)
  })

  it('attribue des numéros qui se suivent, sans doublon même en parallèle', async () => {
    const got = await Promise.all(Array.from({ length: 15 }, () => db.transaction((tx) => allocateNumber(tx, 'facture'))))
    expect(got.map((g) => g.numero).sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
    expect(new Set(got.map((g) => g.label)).size).toBe(15)
    // Les devis ont leur propre compteur
    expect((await db.transaction((tx) => allocateNumber(tx, 'devis'))).label).toBe(`D-${YEAR}-0001`)
  })

  it('ne consomme pas de numéro quand la création est annulée', async () => {
    await db.transaction((tx) => allocateNumber(tx, 'facture'))
    await expect(
      db.transaction(async (tx) => {
        await allocateNumber(tx, 'facture')
        throw new Error('enregistrement du document impossible')
      }),
    ).rejects.toThrow()
    expect((await db.transaction((tx) => allocateNumber(tx, 'facture'))).numero).toBe(2)
  })

  it('repart à 1 chaque année', async () => {
    await db.transaction((tx) => allocateNumber(tx, 'devis', new Date('2025-06-01T12:00:00Z')))
    await db.transaction((tx) => allocateNumber(tx, 'devis', new Date('2025-06-02T12:00:00Z')))
    expect((await db.transaction((tx) => allocateNumber(tx, 'devis', new Date('2026-01-02T12:00:00Z')))).label).toBe('D-2026-0001')
  })

  it('reprend une numérotation existante, puis la verrouille au premier document créé', async () => {
    const res = await direction.patch('/api/documents/numbering', { facture: '128' })
    expect(res.json().numbering.facture).toEqual({ numero: 128, label: `F-${YEAR}-0128`, verrouille: false })
    const [entry] = await entries('documents.numbering_updated')
    expect(entry!.details).toEqual({ type: 'facture', annee: YEAR, avant: 1, apres: 128 })
    // Tant qu'aucune facture n'existe, on peut corriger dans les deux sens
    expect((await direction.patch('/api/documents/numbering', { facture: 120 })).json().numbering.facture.numero).toBe(120)
    expect((await db.transaction((tx) => allocateNumber(tx, 'facture'))).numero).toBe(120)
    expect((await settings()).numbering.facture).toMatchObject({ numero: 121, verrouille: true })
    const locked = await direction.patch('/api/documents/numbering', { facture: 200 })
    expect(locked.statusCode).toBe(409)
    expect(locked.json()).toMatchObject({ field: 'facture', error: expect.stringMatching(/ne se modifie plus/) })
    // Les devis gardent leur propre verrou
    expect((await direction.patch('/api/documents/numbering', { devis: 40 })).json().numbering.devis).toMatchObject({ numero: 40, verrouille: false })
  })

  it('reste verrouillée l’année suivante', async () => {
    await db.transaction((tx) => allocateNumber(tx, 'devis', new Date('2025-06-01T12:00:00Z')))
    expect((await direction.patch('/api/documents/numbering', { devis: 10 })).statusCode).toBe(409)
  })

  it('refuse un numéro invalide et ne note rien si le numéro ne change pas', async () => {
    expect((await direction.patch('/api/documents/numbering', { devis: 0 })).json()).toMatchObject({ field: 'devis', error: expect.stringMatching(/1 au minimum/) })
    expect((await direction.patch('/api/documents/numbering', { devis: 'abc' })).json().field).toBe('devis')
    await direction.patch('/api/documents/numbering', { devis: 1 })
    expect(await entries('documents.numbering_updated')).toHaveLength(0)
    const [counter] = await db.select().from(documentCounters)
    expect(counter).toBeUndefined()
  })
})

describe('Aperçu PDF', () => {
  it('renvoie un PDF d’exemple, y compris avec des réglages pas encore enregistrés', async () => {
    const res = await direction.post('/api/documents/preview', { type: 'facture', template: { couleur: '#123456' }, company: { iban: 'FR7630006000011234567890189' } })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(isPdf(res.rawPayload)).toBe(true)
    // Rien n'est enregistré
    expect((await settings()).template.couleur).toBe('#5b34c4')
  })

  it('refuse un réglage invalide dans l’aperçu', async () => {
    const res = await direction.post('/api/documents/preview', { type: 'devis', template: { couleur: 'rouge' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe('couleur')
    expect((await direction.post('/api/documents/preview', { type: 'avoir' })).json().field).toBe('type')
  })

  it('passe à la page suivante quand il y a beaucoup de lignes, et calcule les totaux au centime', async () => {
    const data = sampleDocument('devis', 'D-2026-0001', 20)
    data.lignes = Array.from({ length: 40 }, (_, i) => ({ designation: `Pièce ${i + 1}`, detail: 'RAL 7016', quantite: 3, prixUnitaire: 10.335 }))
    const tpl = { couleur: '#5b34c4', entete: '', conditionsPaiement: '', validiteDevis: 30, echeanceFacture: 30, noteDevis: '', noteFacture: '', mentionsLegales: '', piedDePage: '', qrCode: false }
    const company = { raisonSociale: 'Alu Pliage Service', formeJuridique: '', capital: '', adresse: '', telephone: '', email: '', siteWeb: '', siret: '', rcs: '', tvaIntra: '', iban: '', bic: '' }
    const pdf = await renderDocument(company, tpl, null, data)
    expect(isPdf(pdf)).toBe(true)
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1)
    // 3 × 10,335 € = 31,005 € : arrondi à 31,01 € par ligne
    expect(totals(data.lignes, 20)).toEqual({ ht: 1240.4, tva: 248.08, ttc: 1488.48 })
  })

  it('remplace les caractères que les polices du PDF ne savent pas écrire', () => {
    expect(clean('1 234,50 € — « œuvre » −5 ✓')).toBe('1 234,50 € — « œuvre » -5 ?')
  })

  it('imprime un QR code vers le site web, sauf si desactive ou sans site renseigne', async () => {
    const data = sampleDocument('devis', 'D-2026-0001', 20)
    const tpl = { couleur: '#5b34c4', entete: '', conditionsPaiement: '', validiteDevis: 30, echeanceFacture: 30, noteDevis: '', noteFacture: '', mentionsLegales: '', piedDePage: '', qrCode: true }
    const company = {
      raisonSociale: 'Alu Pliage Service',
      formeJuridique: '',
      capital: '',
      adresse: '',
      telephone: '',
      email: '',
      siteWeb: 'alupliageservice.fr',
      siret: '',
      rcs: '',
      tvaIntra: '',
      iban: '',
      bic: '',
    }
    const nbImages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length

    expect(nbImages(await renderDocument(company, tpl, null, data))).toBeGreaterThan(0)
    expect(nbImages(await renderDocument(company, { ...tpl, qrCode: false }, null, data))).toBe(0)
    expect(nbImages(await renderDocument({ ...company, siteWeb: '' }, tpl, null, data))).toBe(0)
  })
})

describe('Logo', () => {
  it('accepte un PNG, le renvoie, l’utilise dans l’aperçu, puis revient au logo de l’appli', async () => {
    const img = png(200, 80)
    const res = await direction.put('/api/documents/logo', img, { 'content-type': 'image/png' })
    expect(res.statusCode).toBe(200)
    expect(res.json().company.logo).toBe(true)
    expect(res.json().company).not.toHaveProperty('logoType')
    const [entry] = await entries('documents.logo_updated')
    expect(entry!.details).toMatchObject({ type: 'image/png', largeur: 200, hauteur: 80 })

    const got = await direction.get('/api/documents/logo')
    expect(got.headers['content-type']).toBe('image/png')
    expect(got.headers['x-content-type-options']).toBe('nosniff')
    expect(got.rawPayload.equals(img)).toBe(true)
    expect((await direction.post('/api/documents/preview', { type: 'devis' })).statusCode).toBe(200)

    expect((await direction.delete('/api/documents/logo')).json().company.logo).toBe(false)
    expect((await direction.get('/api/documents/logo')).statusCode).toBe(404)
    expect(await entries('documents.logo_removed')).toHaveLength(1)
  })

  it('refuse un faux PNG, un SVG, une image trop petite ou trop lourde', async () => {
    const fake = Buffer.concat([png(100, 50).subarray(0, 30), Buffer.from('pas une image')])
    expect((await direction.put('/api/documents/logo', fake, { 'content-type': 'image/png' })).json()).toMatchObject({ field: 'logo', error: expect.stringMatching(/illisible/) })
    const svg = await direction.put('/api/documents/logo', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', { 'content-type': 'image/svg+xml' })
    expect(svg.statusCode).toBe(415)
    expect((await direction.put('/api/documents/logo', png(20, 20), { 'content-type': 'image/png' })).json().error).toMatch(/trop petite/)
    // Un PNG présenté comme JPEG est refusé aussi
    expect((await direction.put('/api/documents/logo', png(100, 50), { 'content-type': 'image/jpeg' })).statusCode).toBe(400)
    const big = await direction.put('/api/documents/logo', Buffer.alloc(1024 * 1024 + 2048, 1), { 'content-type': 'image/png' })
    expect(big.statusCode).toBe(413)
    expect(big.json().error).toMatch(/trop lourd/i)
    expect((await settings()).company.logo).toBe(false)
  })

  it('vérifie aussi l’image avant de l’intégrer', async () => {
    expect(await inspectImage(png(64, 32))).toEqual({ type: 'image/png', width: 64, height: 32 })
    expect(await inspectImage(Buffer.from('GIF89a'))).toBeNull()
  })
})

describe('Journal', () => {
  it('le filtre « documents » ne montre que les changements des modèles', async () => {
    await direction.patch('/api/documents/template', { couleur: '#000000' })
    const list = (await direction.get('/api/audit?type=documents')).json().entries
    expect(list.map((e: { action: string }) => e.action)).toEqual(['documents.template_updated'])
  })
})
