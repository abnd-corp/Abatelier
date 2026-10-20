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

/** Alerte à la direction : un client du site vient de demander un devis depuis son espace. */
export function espaceQuoteAlert(r: { client: string; email: string; commande: string; devis: string | null; pieces: number; ht: number; ttc: number }, link: string) {
  return {
    subject: `Nouveau devis depuis l’espace client : ${r.client} (${eur(r.ttc)} TTC)`,
    text: [
      'Un client vient de composer des pièces dans le configurateur et de demander son devis depuis son espace client.',
      '',
      `Client : ${r.client} <${r.email}>`,
      `Commande : ${r.commande} (${r.pieces} pièce${r.pieces > 1 ? 's' : ''}, ${eur(r.ht)} HT, ${eur(r.ttc)} TTC)`,
      r.devis ? `Devis remis au client : ${r.devis}` : 'Le devis n’a pas pu être édité automatiquement : émettez-le depuis la commande.',
      '',
      `Vérifier la faisabilité et valider la commande : ${link}`,
    ].join('\n'),
  }
}

/** Alerte à la direction : un client a répondu à son devis depuis son espace. */
export function espaceAnswerAlert(r: { client: string; devis: string; commande: string; reponse: 'accepte' | 'refuse'; ttc: number }, link: string) {
  const verbe = r.reponse === 'accepte' ? 'accepté' : 'refusé'
  return {
    subject: `Devis ${r.devis} ${verbe} par ${r.client}`,
    text: [`${r.client} a ${verbe} le devis ${r.devis} (${eur(r.ttc)} TTC) depuis son espace client.`, '', r.reponse === 'accepte' ? `La commande ${r.commande} attend votre validation : ${link}` : `Commande concernée : ${r.commande} : ${link}`].join('\n'),
  }
}
