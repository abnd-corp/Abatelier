import type { CompanySettings } from './db/schema.js'
import type { DocLine } from './pdf.js'

// Facture électronique au format Factur-X : un PDF/A-3 qui embarque ce fichier XML (norme européenne EN 16931,
// syntaxe CII). Le XML est la version « lue par les machines » : une plateforme agréée ne regarde que lui.
// Règle de construction : le XML reprend exactement les montants du PDF (mêmes lignes, mêmes totaux).

export const FACTURX_FILENAME = 'factur-x.xml'
// Profil « EN 16931 » (appelé aussi COMFORT) : le plus complet accepté pour la réforme française
const GUIDELINE = 'urn:cen.eu:en16931:2017'

export interface FacturxParty {
  nom: string
  // Adresse de la forme « rue\n42000 Saint-Étienne » (la dernière ligne contient le code postal et la ville)
  adresse: string
  siret?: string | null
  tvaIntra?: string | null
  email?: string | null
}
export interface FacturxInput {
  type: 'facture' | 'avoir'
  numero: string
  date: Date
  echeance: Date | null
  commande: string
  livraison: Date | null
  // Adresse de livraison sur le chantier, si elle diffère de celle du client
  livraisonAdresse?: string
  vendeur: FacturxParty & { iban?: string; bic?: string }
  acheteur: FacturxParty
  // Lignes de la facture d'origine, avec leur signe (une remise est négative). Pour un avoir : celles de la facture annulée.
  lignes: DocLine[]
  taux: number
  // Montants de la facture d'origine (positifs)
  totaux: { ht: number; tva: number; ttc: number }
  // Avoir : la facture annulée
  facture?: { numero: string; date: Date }
  conditions?: string
}

/**
 * Mentions obligatoires d'une facture entre professionnels, repérées par un code dans le XML (règle BR-FR-05) :
 * PMD pénalités de retard, PMT indemnité de recouvrement, AAB escompte. Textes types, à faire valider par le comptable.
 */
export const MENTIONS_FACTURE = [
  { code: 'PMD', texte: 'Pénalités de retard : trois fois le taux d’intérêt légal, exigibles dès le lendemain de la date d’échéance.' },
  { code: 'PMT', texte: 'Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.' },
  { code: 'AAB', texte: 'Pas d’escompte pour paiement anticipé.' },
] as const

const cents = (n: number) => Math.round(n * 100) / 100
const amount = (n: number) => cents(n).toFixed(2)
const quantity = (n: number) => String(Math.round(n * 10000) / 10000)
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d).replace(/-/g, '')
const date102 = (d: Date, ns = 'udt') => `<${ns}:DateTimeString format="102">${ymd(d)}</${ns}:DateTimeString>`

/** « 503 622 433 00061 » → « 503622433 » (SIREN : les 9 premiers chiffres du SIRET). */
export const siren = (siret: string | null | undefined) => (siret ?? '').replace(/\D/g, '').slice(0, 9)

/** Sépare « rue… \n 42490 Fraisses » en rue, code postal et ville. */
export function splitAddress(adresse: string) {
  const lines = adresse
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const last = lines.at(-1) ?? ''
  const m = /^(\d{5})\s+(.+)$/.exec(last)
  return { rue: (m ? lines.slice(0, -1) : lines).join(', '), codePostal: m?.[1] ?? '', ville: m?.[2] ?? '' }
}

/** Lieu de livraison : le nom du client, et l'adresse du chantier quand il y en a une. */
function shipTo(i: FacturxInput) {
  const a = splitAddress(i.livraisonAdresse || i.acheteur.adresse)
  return `<ram:ShipToTradeParty>
        <ram:Name>${esc(i.acheteur.nom)}</ram:Name>
        <ram:PostalTradeAddress>${a.codePostal ? `<ram:PostcodeCode>${esc(a.codePostal)}</ram:PostcodeCode>` : ''}${a.rue ? `<ram:LineOne>${esc(a.rue)}</ram:LineOne>` : ''}${a.ville ? `<ram:CityName>${esc(a.ville)}</ram:CityName>` : ''}<ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>
      </ram:ShipToTradeParty>`
}

function party(tag: string, p: FacturxParty, extra = '') {
  const a = splitAddress(p.adresse)
  const s = siren(p.siret)
  return `<ram:${tag}>
        <ram:Name>${esc(p.nom)}</ram:Name>${s.length === 9 ? `\n        <ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${s}</ram:ID></ram:SpecifiedLegalOrganization>` : ''}
        <ram:PostalTradeAddress>${a.codePostal ? `<ram:PostcodeCode>${esc(a.codePostal)}</ram:PostcodeCode>` : ''}${a.rue ? `<ram:LineOne>${esc(a.rue)}</ram:LineOne>` : ''}${a.ville ? `<ram:CityName>${esc(a.ville)}</ram:CityName>` : ''}<ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>${p.email ? `\n        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(p.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${extra}
      </ram:${tag}>`
}

/** Le fichier XML Factur-X d'une facture ou d'un avoir. */
export function buildFacturxXml(i: FacturxInput): string {
  const exempt = i.taux === 0
  const category = exempt ? 'E' : 'S'
  const rate = amount(i.taux)
  const tax = (withRate = true) => `<ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${category}</ram:CategoryCode>${withRate ? `<ram:RateApplicablePercent>${rate}</ram:RateApplicablePercent>` : ''}`

  // Les lignes à prix négatif (remises) deviennent des remises sur le document : le prix net d'une ligne ne peut pas être négatif
  const positives = i.lignes.filter((l) => l.prixUnitaire >= 0)
  const remises = i.lignes.filter((l) => l.prixUnitaire < 0)
  const lineTotal = (l: DocLine) => cents(l.quantite * l.prixUnitaire)
  const sumLines = cents(positives.reduce((s, l) => s + lineTotal(l), 0))
  const sumAllowances = cents(remises.reduce((s, l) => s - lineTotal(l), 0))
  const basis = cents(sumLines - sumAllowances)
  if (Math.abs(basis - i.totaux.ht) > 0.005) throw new Error(`Factur-X ${i.numero} : total HT du XML (${basis}) différent de celui de la facture (${i.totaux.ht}).`)

  const items = positives
    .map(
      (l, n) => `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${n + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.designation)}</ram:Name>${l.detail ? `<ram:Description>${esc(l.detail)}</ram:Description>` : ''}</ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amount(l.prixUnitaire)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${quantity(l.quantite)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>${tax()}</ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(lineTotal(l))}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join('\n')

  const allowances = remises
    .map(
      (l) => `      <ram:SpecifiedTradeAllowanceCharge>
        <ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>
        <ram:ActualAmount>${amount(-lineTotal(l))}</ram:ActualAmount>
        <ram:Reason>${esc(l.designation)}</ram:Reason>
        <ram:CategoryTradeTax>${tax()}</ram:CategoryTradeTax>
      </ram:SpecifiedTradeAllowanceCharge>`,
    )
    .join('\n')

  const seller = i.vendeur
  const payment = seller.iban
    ? `      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>30</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(seller.iban.replace(/\s/g, ''))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>${seller.bic ? `\n        <ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(seller.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>\n`
    : ''
  const terms =
    i.type === 'facture' && (i.echeance || i.conditions)
      ? `      <ram:SpecifiedTradePaymentTerms>${i.conditions ? `<ram:Description>${esc(i.conditions)}</ram:Description>` : ''}${i.echeance ? `<ram:DueDateDateTime>${date102(i.echeance)}</ram:DueDateDateTime>` : ''}</ram:SpecifiedTradePaymentTerms>\n`
      : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${GUIDELINE}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(i.numero)}</ram:ID>
    <ram:TypeCode>${i.type === 'avoir' ? '381' : '380'}</ram:TypeCode>
    <ram:IssueDateTime>${date102(i.date)}</ram:IssueDateTime>
${MENTIONS_FACTURE.map((m) => `    <ram:IncludedNote><ram:Content>${esc(m.texte)}</ram:Content><ram:SubjectCode>${m.code}</ram:SubjectCode></ram:IncludedNote>`).join('\n')}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${items}
    <ram:ApplicableHeaderTradeAgreement>
      ${party('SellerTradeParty', seller, seller.tvaIntra ? `\n        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(seller.tvaIntra.replace(/\s/g, ''))}</ram:ID></ram:SpecifiedTaxRegistration>` : '')}
      ${party('BuyerTradeParty', i.acheteur)}
      <ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${esc(i.commande)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      ${shipTo(i)}${i.livraison ? `\n      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${date102(i.livraison)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : ''}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(i.numero)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${payment}      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amount(i.totaux.tva)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>${exempt ? '\n        <ram:ExemptionReason>TVA non applicable</ram:ExemptionReason>' : ''}
        <ram:BasisAmount>${amount(basis)}</ram:BasisAmount>
        <ram:CategoryCode>${category}</ram:CategoryCode>
        <ram:RateApplicablePercent>${rate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
${allowances ? allowances + '\n' : ''}${terms}      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amount(sumLines)}</ram:LineTotalAmount>${remises.length ? `\n        <ram:AllowanceTotalAmount>${amount(sumAllowances)}</ram:AllowanceTotalAmount>` : ''}
        <ram:TaxBasisTotalAmount>${amount(basis)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${amount(i.totaux.tva)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amount(i.totaux.ttc)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${amount(i.totaux.ttc)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>${i.facture ? `\n      <ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(i.facture.numero)}</ram:IssuerAssignedID><ram:FormattedIssueDateTime>${date102(i.facture.date, 'qdt')}</ram:FormattedIssueDateTime></ram:InvoiceReferencedDocument>` : ''}
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`
}

/** Métadonnées XMP qui déclarent le fichier Factur-X dans le PDF (exigées par la norme). */
export const FACTURX_XMP = `
        <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
          <pdfaExtension:schemas>
            <rdf:Bag>
              <rdf:li rdf:parseType="Resource">
                <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
                <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
                <pdfaSchema:prefix>fx</pdfaSchema:prefix>
                <pdfaSchema:property>
                  <rdf:Seq>
                    <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description></rdf:li>
                    <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
                    <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description></rdf:li>
                    <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description></rdf:li>
                  </rdf:Seq>
                </pdfaSchema:property>
              </rdf:li>
            </rdf:Bag>
          </pdfaExtension:schemas>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
          <fx:DocumentType>INVOICE</fx:DocumentType>
          <fx:DocumentFileName>${FACTURX_FILENAME}</fx:DocumentFileName>
          <fx:Version>1.0</fx:Version>
          <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
        </rdf:Description>
        `

export interface FacturxCheck {
  key: 'siret' | 'tvaIntra' | 'adresse'
  label: string
  ok: boolean
}

/**
 * Chaque mention obligatoire d'une facture électronique conforme, point par point (SIRET, TVA, adresse).
 * Mêmes règles et même ordre que web/src/lib/documents.ts, qui les refait pour réagir pendant la saisie.
 */
export function facturxChecklist(c: Pick<CompanySettings, 'siret' | 'tvaIntra' | 'adresse'>): FacturxCheck[] {
  const a = splitAddress(c.adresse)
  return [
    { key: 'siret', label: 'le SIRET', ok: siren(c.siret).length === 9 && c.siret.replace(/\D/g, '').length === 14 },
    { key: 'tvaIntra', label: 'le numéro de TVA intracommunautaire', ok: !!c.tvaIntra },
    { key: 'adresse', label: 'l’adresse complète (rue, code postal et ville)', ok: !!(a.rue && a.codePostal && a.ville) },
  ]
}

/**
 * Ce qui manque à l'entreprise pour émettre une facture électronique conforme.
 * Vide quand tout est renseigné ; sinon une liste lisible, montrée à la direction.
 */
export function facturxMissing(c: Pick<CompanySettings, 'siret' | 'tvaIntra' | 'adresse'>) {
  return facturxChecklist(c)
    .filter((check) => !check.ok)
    .map((check) => check.label)
}

/** Idem pour une facture à émettre : l'entreprise, plus ce qu'on sait du client (règle française BR-FR-12 : adresse électronique de l'acheteur). */
export function facturxMissingFor(company: Pick<CompanySettings, 'siret' | 'tvaIntra' | 'adresse'>, client: { type: 'particulier' | 'professionnel'; siret: string | null; email: string | null }) {
  return [...facturxMissing(company), ...(client.type === 'professionnel' && !client.siret ? ['le SIRET du client'] : []), ...(client.email ? [] : ['l’adresse e-mail du client'])]
}
