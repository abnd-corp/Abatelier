import type { Client, CompanySettings, ContactRequest } from './db/schema.js'
import { signature } from './mail.js'

// Textes des e-mails. Le message d'un devis ou d'une facture est proposé tel quel, puis modifiable avant l'envoi.

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }).replace(/[  ]/g, ' ')
const day = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')

/** Alerte à la direction : une demande vient d'arriver par le formulaire du site. */
export function contactAlert(r: Pick<ContactRequest, 'nom' | 'email' | 'telephone' | 'adresse' | 'codePostal' | 'ville' | 'objet' | 'message' | 'fichierNom' | 'configuration'>, link: string) {
  const lieu = [r.adresse, [r.codePostal, r.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return {
    subject: `Nouvelle demande de contact : ${r.objet}`,
    text: [
      'Une demande vient d’arriver par le formulaire de contact du site.',
      '',
      `Objet : ${r.objet}`,
      `De : ${r.nom} <${r.email}>`,
      r.telephone && `Téléphone : ${r.telephone}`,
      lieu && `Adresse : ${lieu}`,
      r.fichierNom && `Plan joint : ${r.fichierNom} (à télécharger depuis l’atelier)`,
      r.configuration && '',
      r.configuration && 'Pièces choisies dans le configurateur :',
      ...(r.configuration?.resume.map((l) => `  - ${l}`) ?? []),
      r.configuration && `Prix affiché au visiteur : ${eur(r.configuration.ht)} HT, ${eur(r.configuration.ttc)} TTC`,
      '',
      r.message,
      '',
      `Traiter la demande : ${link}`,
      '',
      'Vous pouvez répondre directement à ce message : la réponse ira à la personne.',
    ]
      .filter((l): l is string => typeof l === 'string')
      .join('\n'),
  }
}

type Doc = { type: 'devis' | 'facture' | 'avoir'; numero: string; ttc: number; echeance: string | null }

/** Message proposé pour envoyer un devis, une facture ou un avoir (PDF en pièce jointe). */
export function defaultDocumentMail(doc: Doc, client: Pick<Client, 'prenom' | 'nom' | 'email'>, company: CompanySettings) {
  const name = [client.prenom, client.nom].filter(Boolean).join(' ')
  const hello = name ? `Bonjour ${name},` : 'Bonjour,'
  const montant = eur(Math.abs(doc.ttc))
  const virement = company.iban ? `\n\nPour un règlement par virement :\nIBAN : ${company.iban}${company.bic ? `\nBIC : ${company.bic}` : ''}\nMerci d’indiquer le numéro ${doc.numero} en référence.` : ''
  const body = {
    devis: `Veuillez trouver ci-joint notre devis ${doc.numero} d’un montant de ${montant} TTC${doc.echeance ? `, valable jusqu’au ${day(doc.echeance)}` : ''}.\n\nPour l’accepter, répondez simplement à ce message. Nous lançons la fabrication dès votre accord.`,
    facture: `Veuillez trouver ci-joint notre facture ${doc.numero} d’un montant de ${montant} TTC${doc.echeance ? `, à régler avant le ${day(doc.echeance)}` : ''}.${virement}`,
    avoir: `Veuillez trouver ci-joint l’avoir ${doc.numero} d’un montant de ${montant} TTC.`,
  }[doc.type]
  const subjectName = { devis: 'Devis', facture: 'Facture', avoir: 'Avoir' }[doc.type]
  return {
    to: client.email ?? '',
    sujet: `${subjectName} ${doc.numero} — ${company.raisonSociale}`,
    message: `${hello}\n\n${body}\n\nCordialement,\n${signature(company)}`,
  }
}
