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

/**
 * Message proposé pour envoyer un devis, une facture ou un avoir. Aucun document n'est joint : le client le retrouve dans son espace client,
 * ou l'active d'abord avec son adresse e-mail s'il n'en a pas encore.
 */
export function defaultDocumentMail(doc: Doc, client: Pick<Client, 'prenom' | 'nom' | 'email'>, company: CompanySettings, espace: { url: string; actif: boolean }) {
  const name = [client.prenom, client.nom].filter(Boolean).join(' ')
  const hello = name ? `Bonjour ${name},` : 'Bonjour,'
  const montant = eur(Math.abs(doc.ttc))
  const virement = company.iban
    ? `\n\nPour un règlement par virement :\nIBAN : ${company.iban}${company.bic ? `\nBIC : ${company.bic}` : ''}\nMerci d’indiquer le numéro ${doc.numero} en référence.`
    : ''
  const nom = { devis: 'devis', facture: 'facture', avoir: 'avoir' }[doc.type]
  const sujet = doc.type === 'avoir' ? 'L’avoir' : `Votre ${nom}`
  // Où le trouver : dans l'espace client (connexion), ou après avoir activé cet espace avec l'adresse e-mail
  const ou = espace.actif
    ? `est disponible dans votre espace client, après connexion : ${espace.url}`
    : `est disponible dans votre espace client. Pour y accéder, activez-le avec cette adresse e-mail : ${espace.url}`
  const suite = {
    devis: `, d’un montant de ${montant} TTC${doc.echeance ? `, valable jusqu’au ${day(doc.echeance)}` : ''}.\n\nPour l’accepter, connectez-vous à votre espace client.`,
    facture: `, d’un montant de ${montant} TTC${doc.echeance ? `, à régler avant le ${day(doc.echeance)}` : ''}.${virement}`,
    avoir: `, d’un montant de ${montant} TTC.`,
  }[doc.type]
  const subjectName = { devis: 'Devis', facture: 'Facture', avoir: 'Avoir' }[doc.type]
  return {
    to: client.email ?? '',
    sujet: `${subjectName} ${doc.numero} — ${company.raisonSociale}`,
    message: `${hello}\n\n${sujet} ${doc.numero} ${ou}${suite}\n\nCordialement,\n${signature(company)}`,
  }
}

/** Récapitulatif d'un document, pour la version mise en page de son message. */
export function documentFaits(doc: Doc) {
  const nom = { devis: 'Devis', facture: 'Facture', avoir: 'Avoir' }[doc.type]
  return [
    { label: nom, value: doc.numero },
    { label: 'Montant', value: `${eur(Math.abs(doc.ttc))} TTC` },
    ...(doc.echeance && doc.type !== 'avoir' ? [{ label: doc.type === 'devis' ? 'Valable jusqu’au' : 'À régler avant le', value: day(doc.echeance) }] : []),
  ]
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
export function orderConfirmed(r: {
  nom: string
  numero: string
  ttc: number
  articles: string
  link: string
  espace: string
  entreprise: string
  remise: 'retrait' | 'livraison'
  dateEstimee: string | null
}) {
  const reserve = 'Dans le cas exceptionnel où nous ne pourrions pas la réaliser, nous vous préviendrions et vous rembourserions intégralement.'
  const remise = r.remise === 'retrait' ? 'Retrait à l’atelier' : 'Livraison'
  const faits = [
    { label: 'Commande', value: r.numero },
    { label: 'Montant payé', value: `${eur(r.ttc)} TTC` },
    { label: 'Remise', value: remise },
    ...(r.dateEstimee ? [{ label: 'Date estimée', value: r.dateEstimee }] : []),
  ]
  const recap = faits.map((f) => `${f.label} : ${f.value}`).join('\n')
  return {
    subject: `Votre commande ${r.numero} est confirmée`,
    titre: 'Votre commande est confirmée',
    faits,
    action: { label: 'Suivre ma commande', url: r.link },
    espace: r.espace,
    // Version texte : tout figure dans le message, avec les liens ; version mise en page : récapitulatif et boutons
    text: `Bonjour ${r.nom},\n\nNous avons bien reçu votre paiement. Votre commande est enregistrée :\n${r.articles}\n\n${recap}\n\nSuivez-la depuis votre espace client : ${r.link}\n\n${reserve}\n\n${r.entreprise}`,
    htmlText: `Bonjour ${r.nom},\n\nNous avons bien reçu votre paiement. Votre commande est enregistrée :\n${r.articles}\n\n${reserve}`,
  }
}

/** Message au client dont la commande payée en ligne est refusée : motif et remboursement. */
export function orderRefused(r: { nom: string; numero: string; motif: string; ttc: number; espace: string; entreprise: string }) {
  const faits = [
    { label: 'Commande', value: r.numero },
    { label: 'Motif', value: r.motif },
    { label: 'Montant remboursé', value: `${eur(r.ttc)} (la totalité)` },
    { label: 'Arrivée des fonds', value: 'quelques jours, selon votre banque' },
  ]
  const recap = faits.map((f) => `${f.label} : ${f.value}`).join('\n')
  const intro = `Bonjour ${r.nom},\n\nNous ne pouvons pas réaliser votre commande ${r.numero}. Nous vous remboursons la totalité sur le moyen de paiement utilisé.`
  const fin = 'Nous restons à votre disposition pour trouver une solution.'
  return {
    subject: `Votre commande ${r.numero} ne peut pas être réalisée : remboursement`,
    titre: 'Votre commande ne peut pas être réalisée',
    faits,
    espace: r.espace,
    text: `${intro}\n\n${recap}\n\n${fin}\n\n${r.entreprise}`,
    htmlText: `${intro}\n\n${fin}`,
  }
}

/** Alerte à la direction : une commande vient d'être payée en ligne. */
export function orderPaidAlert(r: { nom: string; email: string; numero: string; ttc: number; surMesure: boolean; articles: string; link: string }) {
  const intro = `${r.nom} vient de payer sa commande ${r.surMesure ? 'depuis le configurateur' : 'sur la boutique'}.\n${r.articles}`
  const suite = 'La commande vaut contrat : elle est déjà validée et visible dans Fabrication. Si elle n’est finalement pas réalisable, vous pouvez la refuser, ce qui rembourse le client.'
  const faits = [
    { label: 'Client', value: `${r.nom} <${r.email}>` },
    { label: 'Commande', value: r.numero },
    { label: 'Montant', value: `${eur(r.ttc)} TTC` },
    { label: 'Origine', value: r.surMesure ? 'Configurateur (sur mesure)' : 'Boutique' },
  ]
  return {
    subject: `${r.surMesure ? 'Commande sur mesure' : 'Commande boutique'} payée : ${r.numero} (${eur(r.ttc)})`,
    titre: 'Une commande vient d’être payée',
    faits,
    action: { label: 'Ouvrir la commande', url: r.link },
    text: `${r.nom} <${r.email}> vient de payer sa commande ${r.numero} ${r.surMesure ? 'depuis le configurateur' : 'sur la boutique'}, ${eur(r.ttc)} TTC.\n\n${r.articles}\n\n${suite}\n${r.link}`,
    htmlText: `${intro}\n\n${suite}`,
  }
}

/** Bienvenue : l'espace client vient d'être créé. */
export function welcomeMail(r: { nom: string; espace: string; entreprise: string }) {
  const corps = `Bonjour ${r.nom},\n\nVotre espace client est créé. Vous y composez vos pièces dans le configurateur, retrouvez vos devis et vos factures, et suivez l’avancement de vos commandes.\n\nNous n’enverrons jamais de publicité à cette adresse : seulement les messages utiles à votre compte et à vos commandes.`
  return {
    subject: `Bienvenue chez ${r.entreprise}`,
    titre: 'Bienvenue !',
    action: { label: 'Accéder à mon espace client', url: r.espace },
    text: `${corps}\n\nAccéder à votre espace : ${r.espace}\n\n${r.entreprise}`,
    htmlText: corps,
  }
}

/** Activation : une fiche existe déjà pour cette adresse (créée par l'atelier) ; le client choisit son mot de passe. */
export function activationMail(r: { nom: string; lien: string; entreprise: string }) {
  const corps = `Bonjour ${r.nom},\n\nUne fiche est déjà ouverte à votre nom chez ${r.entreprise}, par exemple pour un devis. Pour y accéder en ligne, choisissez votre mot de passe : ce lien est valable 7 jours et ne peut servir qu’une fois.\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message : rien ne sera modifié.`
  return {
    subject: `Activez votre espace client — ${r.entreprise}`,
    titre: 'Activez votre espace client',
    faits: [{ label: 'Validité du lien', value: '7 jours, une seule utilisation' }],
    action: { label: 'Choisir mon mot de passe', url: r.lien },
    text: `${corps}\n\nChoisir mon mot de passe : ${r.lien}\n\n${r.entreprise}`,
    htmlText: corps,
  }
}

/** Mot de passe oublié : un lien valable une heure. */
export function passwordResetMail(r: { nom: string; lien: string; entreprise: string }) {
  const corps = `Bonjour ${r.nom},\n\nVous avez demandé à réinitialiser le mot de passe de votre espace client. Ce lien est valable 1 heure et ne peut servir qu’une fois.\n\nSi vous n’avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.`
  return {
    subject: `Réinitialisation de votre mot de passe — ${r.entreprise}`,
    titre: 'Choisissez un nouveau mot de passe',
    faits: [{ label: 'Validité du lien', value: '1 heure, une seule utilisation' }],
    action: { label: 'Choisir un nouveau mot de passe', url: r.lien },
    text: `${corps}\n\nChoisir un nouveau mot de passe : ${r.lien}\n\n${r.entreprise}`,
    htmlText: corps,
  }
}

/** Alerte de sécurité : le mot de passe vient d'être changé. */
export function passwordChangedMail(r: { nom: string; reinitialisation: string; entreprise: string }) {
  const corps = `Bonjour ${r.nom},\n\nLe mot de passe de votre espace client vient d’être modifié, et vous avez été déconnecté de vos autres appareils.\n\nSi ce n’est pas vous, réinitialisez-le tout de suite et prévenez-nous.`
  return {
    subject: `Votre mot de passe a été modifié — ${r.entreprise}`,
    titre: 'Votre mot de passe a été modifié',
    action: { label: 'Ce n’était pas moi', url: r.reinitialisation },
    text: `${corps}\n\nRéinitialiser mon mot de passe : ${r.reinitialisation}\n\n${r.entreprise}`,
    htmlText: corps,
  }
}

export type MailExample = {
  id: string
  titre: string
  audience: 'client' | 'equipe'
  subject: string
  text: string
  htmlText?: string
  titreMail?: string
  faits?: { label: string; value: string }[]
  action?: { label: string; url: string }
  espace?: string
}

/** Un exemple de chaque message, avec des données fictives : sert à voir le rendu et à se l'envoyer. */
export function mailExamples(company: CompanySettings, base: string): MailExample[] {
  const entreprise = company.raisonSociale
  const articles = '  - 4 × Couvertine « Mur sud » (Aluminium 1,5 mm, Gris anthracite (RAL 7016))\n  - 2 × Bavette d’appui (Aluminium 1 mm, Blanc pur (RAL 9010))'
  const client = { prenom: 'Camille', nom: 'Martin', email: 'camille.martin@exemple.fr' }
  const espace = `${base}/espace`
  const confirmee = orderConfirmed({
    nom: 'Camille Martin',
    numero: 'C-2026-0042',
    ttc: 126,
    articles,
    link: `${base}/espace/commandes/exemple`,
    espace,
    entreprise,
    remise: 'retrait',
    dateEstimee: 'mercredi 4 novembre 2026',
  })
  const refusee = orderRefused({ nom: 'Camille Martin', numero: 'C-2026-0042', motif: 'La longueur demandée dépasse ce que notre plieuse peut réaliser.', ttc: 126, espace, entreprise })
  const docDevis = { type: 'devis' as const, numero: 'D-2026-0012', ttc: 432.12, echeance: '2026-11-30' }
  const docFacture = { type: 'facture' as const, numero: 'F-2026-0031', ttc: 432.12, echeance: '2026-12-15' }
  const devis = defaultDocumentMail(docDevis, client, company, { url: espace, actif: true })
  const facture = defaultDocumentMail(docFacture, client, company, { url: espace, actif: true })
  const bienvenue = welcomeMail({ nom: 'Camille Martin', espace, entreprise })
  const activation = activationMail({ nom: 'Camille Martin', lien: `${base}/espace/nouveau-mot-de-passe?jeton=exemple`, entreprise })
  const oubli = passwordResetMail({ nom: 'Camille Martin', lien: `${base}/espace/nouveau-mot-de-passe?jeton=exemple`, entreprise })
  const modifie = passwordChangedMail({ nom: 'Camille Martin', reinitialisation: `${base}/espace/mot-de-passe-oublie`, entreprise })
  const alerteDevis = espaceQuoteAlert({ client: 'Camille Martin', email: client.email, commande: 'C-2026-0042', devis: 'D-2026-0012', pieces: 6, ht: 360.1, ttc: 432.12 }, `${base}/commandes/exemple`)
  const alerteReponse = espaceAnswerAlert({ client: 'Camille Martin', devis: 'D-2026-0012', commande: 'C-2026-0042', reponse: 'accepte', ttc: 432.12 }, `${base}/commandes/exemple`)
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
      faits: confirmee.faits,
      action: confirmee.action,
      espace: confirmee.espace,
    },
    {
      id: 'commande-refusee',
      titre: 'Commande refusée et remboursée (au client)',
      audience: 'client',
      subject: refusee.subject,
      text: refusee.text,
      htmlText: refusee.htmlText,
      titreMail: refusee.titre,
      faits: refusee.faits,
      espace: refusee.espace,
    },
    {
      id: 'bienvenue',
      titre: 'Bienvenue, espace créé (au client)',
      audience: 'client',
      subject: bienvenue.subject,
      text: bienvenue.text,
      htmlText: bienvenue.htmlText,
      titreMail: bienvenue.titre,
      action: bienvenue.action,
      espace,
    },
    {
      id: 'activation',
      titre: 'Activer son espace, adresse confirmée (au client)',
      audience: 'client',
      subject: activation.subject,
      text: activation.text,
      htmlText: activation.htmlText,
      titreMail: activation.titre,
      faits: activation.faits,
      action: activation.action,
    },
    {
      id: 'mot-de-passe-oublie',
      titre: 'Mot de passe oublié (au client)',
      audience: 'client',
      subject: oubli.subject,
      text: oubli.text,
      htmlText: oubli.htmlText,
      titreMail: oubli.titre,
      faits: oubli.faits,
      action: oubli.action,
    },
    {
      id: 'mot-de-passe-modifie',
      titre: 'Mot de passe modifié (au client)',
      audience: 'client',
      subject: modifie.subject,
      text: modifie.text,
      htmlText: modifie.htmlText,
      titreMail: modifie.titre,
      action: modifie.action,
    },
    {
      id: 'devis',
      titre: 'Envoi d’un devis (au client)',
      audience: 'client',
      subject: devis.sujet,
      text: devis.message,
      titreMail: 'Votre devis est disponible',
      faits: documentFaits(docDevis),
      action: { label: 'Consulter mon devis', url: espace },
      espace,
    },
    {
      id: 'facture',
      titre: 'Envoi d’une facture (au client)',
      audience: 'client',
      subject: facture.sujet,
      text: facture.message,
      titreMail: 'Votre facture est disponible',
      faits: documentFaits(docFacture),
      action: { label: 'Consulter ma facture', url: espace },
      espace,
    },
    {
      id: 'alerte-commande',
      titre: 'Commande payée (alerte à l’équipe)',
      audience: 'equipe',
      subject: alerte.subject,
      text: alerte.text,
      htmlText: alerte.htmlText,
      titreMail: alerte.titre,
      faits: alerte.faits,
      action: alerte.action,
    },
    {
      id: 'alerte-devis',
      titre: 'Devis demandé depuis l’espace client (alerte à l’équipe)',
      audience: 'equipe',
      subject: alerteDevis.subject,
      text: alerteDevis.text,
      titreMail: 'Un client demande un devis',
      action: { label: 'Ouvrir la commande', url: `${base}/commandes/exemple` },
    },
    {
      id: 'alerte-reponse',
      titre: 'Devis accepté ou refusé (alerte à l’équipe)',
      audience: 'equipe',
      subject: alerteReponse.subject,
      text: alerteReponse.text,
      titreMail: 'Réponse à un devis',
      action: { label: 'Ouvrir la commande', url: `${base}/commandes/exemple` },
    },
    {
      id: 'alerte-contact',
      titre: 'Demande de contact (alerte à l’équipe)',
      audience: 'equipe',
      subject: contact.subject,
      text: contact.text,
      titreMail: 'Nouvelle demande de contact',
      action: { label: 'Traiter la demande', url: `${base}/site-vitrine` },
    },
    {
      id: 'essai',
      titre: 'Message d’essai',
      audience: 'equipe',
      subject: `Essai d’envoi — ${entreprise}`,
      text: `Bonjour,\n\nCe message est un essai : si vous le lisez, l’envoi d’e-mails fonctionne.\n\n${signature(company)}`,
      titreMail: 'Message d’essai',
    },
  ]
}
