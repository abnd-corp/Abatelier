import type { Client, CompanySettings, ContactRequest } from './db/schema.js'
import { signature } from './mail.js'

// Textes des e-mails. Le message d'un devis ou d'une facture est proposé tel quel, puis modifiable avant l'envoi.

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }).replace(/[\u202f\u00a0]/g, ' ')
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
  const virement = company.iban
    ? `\n\nPour un règlement par virement :\nIBAN : ${company.iban}${company.bic ? `\nBIC : ${company.bic}` : ''}\nMerci d’indiquer le numéro ${doc.numero} en référence.`
    : ''
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
    text: [
      `${r.client} a ${verbe} le devis ${r.devis} (${eur(r.ttc)} TTC) depuis son espace client.`,
      '',
      r.reponse === 'accepte' ? `La commande ${r.commande} attend votre validation : ${link}` : `Commande concernée : ${r.commande} : ${link}`,
    ].join('\n'),
  }
}

/** Confirmation au client : son paiement est arrivé, sa commande est enregistrée. */
export function orderConfirmed(r: { nom: string; numero: string; ttc: number; articles: string; link: string; entreprise: string }) {
  const intro = `Bonjour ${r.nom},\n\nNous avons bien reçu votre paiement de ${eur(r.ttc)} TTC pour la commande ${r.numero} :\n${r.articles}`
  const reserve = 'Dans le cas exceptionnel où nous ne pourrions pas la réaliser, nous vous préviendrions et vous rembourserions intégralement.'
  return {
    subject: `Votre commande ${r.numero} est confirmée`,
    titre: 'Votre commande est confirmée',
    action: { label: 'Suivre ma commande', url: r.link },
    // Version texte : le lien figure dans le message ; version mise en page : il est derrière le bouton
    text: `${intro}\n\nSuivez-la depuis votre espace client : ${r.link}\n\n${reserve}\n\n${r.entreprise}`,
    htmlText: `${intro}\n\n${reserve}`,
  }
}

/** Message au client dont la commande payée en ligne est refusée : motif et remboursement. */
export function orderRefused(r: { nom: string; numero: string; motif: string; ttc: number; entreprise: string }) {
  const corps = `Bonjour ${r.nom},\n\nNous ne pouvons pas réaliser votre commande ${r.numero}.\nMotif : ${r.motif}\n\nNous vous remboursons la totalité, soit ${eur(r.ttc)}, sur le moyen de paiement utilisé. Le délai d’arrivée dépend de votre banque (quelques jours).\n\nNous restons à votre disposition pour trouver une solution.`
  return {
    subject: `Votre commande ${r.numero} ne peut pas être réalisée : remboursement`,
    titre: 'Votre commande ne peut pas être réalisée',
    text: `${corps}\n\n${r.entreprise}`,
    htmlText: corps,
  }
}

/** Alerte à la direction : une commande vient d'être payée en ligne. */
export function orderPaidAlert(r: { nom: string; email: string; numero: string; ttc: number; surMesure: boolean; articles: string; link: string }) {
  return {
    subject: `${r.surMesure ? 'Commande sur mesure' : 'Commande boutique'} payée : ${r.numero} (${eur(r.ttc)})`,
    text: `${r.nom} <${r.email}> vient de payer sa commande ${r.numero} ${r.surMesure ? 'depuis le configurateur' : 'sur la boutique'}, ${eur(r.ttc)} TTC.\n\n${r.articles}\n\nLa commande vaut contrat : elle est déjà validée et visible dans Fabrication. Si elle n’est finalement pas réalisable, vous pouvez la refuser, ce qui rembourse le client.\n${r.link}`,
  }
}

export type MailExample = { id: string; titre: string; audience: 'client' | 'equipe'; subject: string; text: string; htmlText?: string; titreMail?: string; action?: { label: string; url: string } }

/** Un exemple de chaque message, avec des données fictives : sert à voir le rendu et à se l'envoyer. */
export function mailExamples(company: CompanySettings, base: string): MailExample[] {
  const entreprise = company.raisonSociale
  const articles = '  - 4 × Couvertine « Mur sud » (Aluminium 1,5 mm, Gris anthracite (RAL 7016))\n  - 2 × Bavette d’appui (Aluminium 1 mm, Blanc pur (RAL 9010))'
  const client = { prenom: 'Camille', nom: 'Martin', email: 'camille.martin@exemple.fr' }
  const confirmee = orderConfirmed({ nom: 'Camille Martin', numero: 'C-2026-0042', ttc: 126, articles, link: `${base}/espace/commandes/exemple`, entreprise })
  const refusee = orderRefused({ nom: 'Camille Martin', numero: 'C-2026-0042', motif: 'La longueur demandée dépasse ce que notre plieuse peut réaliser.', ttc: 126, entreprise })
  const devis = defaultDocumentMail({ type: 'devis', numero: 'D-2026-0012', ttc: 432.12, echeance: '2026-11-30' }, client, company)
  const facture = defaultDocumentMail({ type: 'facture', numero: 'F-2026-0031', ttc: 432.12, echeance: '2026-12-15' }, client, company)
  const alerte = orderPaidAlert({ nom: 'Camille Martin', email: client.email, numero: 'C-2026-0042', ttc: 126, surMesure: true, articles, link: `${base}/commandes/exemple` })
  const contact = contactAlert(
    {
      nom: 'Jean Dupont',
      email: 'jean.dupont@exemple.fr',
      telephone: '06 12 34 56 78',
      adresse: '12 chemin du Bois',
      codePostal: '42700',
      ville: 'Firminy',
      objet: 'Couvertine 3 m',
      message: 'Bonjour, je voudrais un devis pour 12 couvertines de 3 m.',
      fichierNom: null,
      configuration: null,
    },
    `${base}/site-vitrine`,
  )
  return [
    {
      id: 'commande-confirmee',
      titre: 'Commande confirmée (au client)',
      audience: 'client',
      subject: confirmee.subject,
      text: confirmee.text,
      htmlText: confirmee.htmlText,
      titreMail: confirmee.titre,
      action: confirmee.action,
    },
    {
      id: 'commande-refusee',
      titre: 'Commande refusée et remboursée (au client)',
      audience: 'client',
      subject: refusee.subject,
      text: refusee.text,
      htmlText: refusee.htmlText,
      titreMail: refusee.titre,
    },
    { id: 'devis', titre: 'Envoi d’un devis (au client)', audience: 'client', subject: devis.sujet, text: devis.message },
    { id: 'facture', titre: 'Envoi d’une facture (au client)', audience: 'client', subject: facture.sujet, text: facture.message },
    { id: 'alerte-commande', titre: 'Commande payée (alerte à l’équipe)', audience: 'equipe', subject: alerte.subject, text: alerte.text },
    { id: 'alerte-contact', titre: 'Demande de contact (alerte à l’équipe)', audience: 'equipe', subject: contact.subject, text: contact.text },
    {
      id: 'essai',
      titre: 'Message d’essai',
      audience: 'equipe',
      subject: `Essai d’envoi — ${entreprise}`,
      text: `Bonjour,\n\nCe message est un essai : si vous le lisez, l’envoi d’e-mails fonctionne.\n\n${signature(company)}`,
    },
  ]
}
