import { eq, sql } from 'drizzle-orm'
import { db } from './db/index.js'
import { siteContent } from './db/schema.js'
import { getCompany } from './documents.js'
import { env } from './env.js'

// Textes du site vitrine. La direction les modifie dans « Site vitrine » ; sans modification on affiche la valeur par défaut.
// Les pages légales ne sont pas modifiables par le client : elles font partie de l'application et suivent ses versions (la loi change,
// c'est la maintenance qui les met à jour). Dans ces textes, {raisonSociale}, {adresse}, {siret}, {telephone} et {email} viennent de
// « Modèles de documents », {hebergeur} et {mediateur} de la configuration du déploiement (LEGAL_HEBERGEUR, LEGAL_MEDIATEUR).

export interface Field {
  key: string
  groupe: string
  label: string
  // Zone de texte sur plusieurs lignes
  long?: boolean
  max: number
  defaut: string
}

const MENTIONS = `# Éditeur du site
{raisonSociale}
{adresse}
Téléphone : {telephone}
E-mail : {email}
SIRET : {siret}

# Responsable de la publication
La direction de {raisonSociale}.

# Hébergement
{hebergeur}

# Propriété intellectuelle
Les textes, photos et schémas de ce site sont la propriété de {raisonSociale}. Toute reproduction sans autorisation est interdite.

# Données personnelles
Voir la politique de confidentialité.`

const CONFIDENTIALITE = `# Qui est responsable de vos données ?
{raisonSociale}, {adresse}. Pour toute question : {email}.

# Quelles données, et pourquoi ?
Quand vous nous écrivez par le formulaire de contact, nous recevons votre nom, votre adresse e-mail, votre message, et ce que vous choisissez d’ajouter : téléphone, adresse, plan joint. Nous les utilisons uniquement pour répondre à votre demande et, si vous passez commande, pour établir votre devis, votre commande et votre facture.

Si vous payez en ligne dans la boutique, le règlement par carte est traité par notre prestataire de paiement : nous recevons seulement la confirmation et le montant, jamais votre numéro de carte.

Si vous créez un espace client, nous gardons en plus votre mot de passe, sous une forme chiffrée que nous ne pouvons pas lire, ainsi que les pièces que vous composez dans le configurateur, vos devis, vos commandes et leur suivi. Ces données servent uniquement à vous remettre votre devis, à fabriquer et facturer vos pièces, et à vous montrer l’avancement de votre commande. Elles ne servent à aucune publicité ni prospection : pas de revente, pas d’e-mail commercial, pas de cookie de suivi.

# Combien de temps ?
Une demande restée sans suite est supprimée au bout de 12 mois. Les devis, commandes et factures sont conservés le temps imposé par la loi (10 ans pour les factures). Vous pouvez obtenir la fermeture de votre espace client à tout moment, depuis la page « Mon espace » : vos coordonnées sont alors effacées et vos commandes sont anonymisées. Seules les factures et avoirs sont gardés, sans lien avec votre identité côté fiche client, car la loi l’impose.

# Les e-mails que nous vous envoyons
Nous ne vous écrivons que pour le service : la création et l’accès à votre espace client (y compris pour retrouver votre mot de passe), la confirmation et le suivi de vos commandes, l’envoi de vos devis et factures, et la réponse à votre demande de contact.

Nous n’envoyons aucune publicité, aucune lettre d’information et aucun message de prospection. Votre adresse e-mail n’est jamais vendue, ni utilisée pour de la communication commerciale.

Pour votre sécurité, nous ne vous demanderons jamais votre mot de passe, vos coordonnées bancaires ni votre numéro de carte par e-mail. Quand vous avez un espace client, vos devis et vos factures ne sont pas joints à nos messages : vous les retrouvez dans votre espace, après connexion.

# Qui y a accès ?
L’équipe de {raisonSociale}. Pour faire fonctionner le site, nous faisons appel à des prestataires techniques qui traitent vos données uniquement pour notre compte : le paiement en ligne, l’hébergement et l’envoi des e-mails. Ils n’ont pas le droit de les utiliser pour leurs propres besoins. Vos données ne sont ni vendues ni transmises à des tiers à des fins commerciales.

# Vos droits
Vous pouvez demander l’accès à vos données, leur correction ou leur suppression en écrivant à {email}. Vous pouvez aussi saisir la CNIL (www.cnil.fr).

# Cookies et suivi
Ce site n’utilise aucun cookie de suivi ni outil de mesure d’audience. Voir la page « Cookies ».`

const COOKIES = `# Aucun cookie de suivi
En tant que visiteur, vous ne recevez aucun cookie : ce site ne contient ni publicité, ni outil de mesure d’audience, ni vidéo ou carte intégrée venant d’un autre site. C’est pourquoi il n’affiche pas de bandeau de consentement.

# Espace client et espace de l’équipe
Un cookie de session n’est déposé que si vous vous connectez : à votre espace client, ou, pour l’équipe de {raisonSociale}, à l’atelier. Il sert uniquement à vous reconnaître d’une page à l’autre. Il est strictement nécessaire à ce service, il ne suit pas votre navigation et il n’est lu par aucun autre site. Il disparaît quand vous vous déconnectez (ou à la fermeture du navigateur, sauf si vous cochez « Rester connecté »).

# Panier de la boutique
Les articles que vous mettez dans votre panier sont gardés dans votre navigateur (stockage local de l’appareil), pour que vous les retrouviez à votre retour. Ils ne sont envoyés à personne tant que vous ne validez pas votre commande, et vous pouvez les effacer en vidant le panier ou les données du site. Ce n’est pas un cookie et il ne sert à aucun suivi.

# Liens vers d’autres sites
Le bouton « Voir sur Google » et le lien d’itinéraire vous envoient sur le site de Google, qui a ses propres règles.`

const CGV = `# Objet
Les présentes conditions s’appliquent à toute commande de pièces de tôlerie (pliage d’aluminium ou d’acier) passée auprès de {raisonSociale}, {adresse}.

# Devis et commande
Les pièces sont fabriquées sur mesure, d’après les dimensions, la matière et le coloris que vous indiquez. Le configurateur affiche un prix indicatif, téléchargeable sans compte. Le devis gratuit, numéroté, est établi dans votre espace client, où il est enregistré avec le suivi de votre commande, et vous est remis avant toute fabrication ; il est valable pendant la durée qui y est indiquée. La commande est ferme une fois le devis accepté. Vous êtes responsable des cotes que vous nous transmettez.

# Prix
Les prix sont indiqués en euros, hors taxes et toutes taxes comprises. Ils comprennent le façonnage ; la livraison est facturée à part, sauf mention contraire sur le devis.

# Paiement
Les conditions de paiement figurent sur le devis et sur la facture. En cas de retard, des pénalités de retard et l’indemnité forfaitaire de recouvrement de 40 € sont dues entre professionnels.

# Délais
Les délais sont donnés à titre indicatif et courent à partir de la validation de la commande. Un retard ne donne pas droit à annulation ni à indemnité, sauf accord écrit.

# Retrait et livraison
Les pièces sont à retirer à l’atelier ou livrées sur le chantier. Vérifiez les pièces à la réception et signalez toute anomalie sous 48 heures.

# Commande en ligne (boutique)
Les articles de la boutique se commandent depuis votre espace client et se règlent à la commande, par carte bancaire, auprès de notre prestataire de paiement : nous ne voyons ni ne conservons votre numéro de carte. La commande est ferme dès la confirmation du paiement, et nous nous engageons à la réaliser. Si, après vérification, nous constatons qu’elle ne peut pas l’être (par exemple une pièce impossible à plier ou une matière indisponible), nous la refusons en vous indiquant le motif et nous vous remboursons la totalité des sommes versées, sur le moyen de paiement utilisé.

# Droit de rétractation
Les pièces étant fabriquées selon vos spécifications, le droit de rétractation de 14 jours ne s’applique pas aux particuliers (article L221-28 du Code de la consommation). Pour les articles standard de la boutique, un particulier dispose de 14 jours à compter de la réception pour se rétracter, sauf pour les pièces coupées ou pliées à ses dimensions. À COMPLÉTER : conditions de retour et de remboursement, à faire valider.

# Garanties
Les garanties légales de conformité et des vices cachés s’appliquent. La garantie ne couvre pas une pièce conforme à la commande mais mal dimensionnée, ni une mauvaise pose.

# Litiges
Droit français. Un consommateur peut recourir gratuitement à un médiateur de la consommation. {mediateur}`

export const FIELDS: Field[] = [
  // Accueil
  { key: 'accueil.titre', groupe: 'Accueil', label: 'Titre principal', max: 120, defaut: 'Pliage d’aluminium et d’acier sur mesure' },
  {
    key: 'accueil.accroche',
    groupe: 'Accueil',
    label: 'Phrase sous le titre',
    long: true,
    max: 300,
    defaut: 'Couvertines, bavettes d’appui, bandeaux : fabriqués à vos dimensions dans notre atelier de Fraisses, près de Saint-Étienne.',
  },
  {
    key: 'accueil.presentation',
    groupe: 'Accueil',
    label: 'Présentation de l’atelier',
    long: true,
    max: 1200,
    defaut:
      'Nous fabriquons toutes sortes de pièces de tôlerie pliée, pour les professionnels du bâtiment (façadiers, étancheurs, couvreurs, maçons, architectes) comme pour les particuliers. Équipés de cisailles et de plieuses numériques de dernière génération, nous façonnons à la demande vos pièces en aluminium jusqu’à 3 mètres, avec un suivi personnalisé, efficace et rapide.',
  },
  {
    key: 'accueil.pourquoi',
    groupe: 'Accueil',
    label: 'Pourquoi nous choisir (un point par ligne)',
    long: true,
    max: 800,
    defaut: 'Disponibilité et rapidité\nConseils et partage de savoir-faire\nDevis sur mesure\nTarifs compétitifs\nUn interlocuteur à l’écoute',
  },
  // Pages produits
  {
    key: 'pliage.intro',
    groupe: 'Pliage aluminium',
    label: 'Introduction',
    long: true,
    max: 1200,
    defaut: 'Pliage sur mesure d’aluminium, d’acier et d’acier galvanisé, pour protéger et habiller vos constructions : couvertines, bavettes d’appui de fenêtre, bandeaux, encadrements de porte.',
  },
  {
    key: 'produit.couvertine',
    groupe: 'Pliage aluminium',
    label: 'Couvertine',
    long: true,
    max: 1200,
    defaut:
      'La couvertine protège le dessus des murs de clôture, des acrotères et des toits-terrasses. Elle assure l’étanchéité et préserve la maçonnerie de la saleté, des intempéries et de la pollution. Fabriquée à vos dimensions jusqu’à 3 mètres, avec larmiers, elle se fixe par pattes ou par mastic-colle. Des accessoires complètent la finition : bouchons et éclisses de jonction.',
  },
  {
    key: 'produit.bavette',
    groupe: 'Pliage aluminium',
    label: 'Bavette d’appui de fenêtre',
    long: true,
    max: 1200,
    defaut:
      'La bavette d’appui évacue l’eau de pluie et protège le bas de la fenêtre. Avec ou sans rejingot, avec pente et larmier, elle se termine par des embouts latéraux. Vous choisissez les dimensions et le coloris.',
  },
  {
    key: 'produit.bandeau',
    groupe: 'Pliage aluminium',
    label: 'Bandeau et planche de rive',
    long: true,
    max: 1200,
    defaut: 'Le bandeau habille et protège les rives de toiture et les débords de façade. Il se fait en L, en U ou avec retour, jusqu’à 3 mètres, avec des angles de bandeau assortis.',
  },
  {
    key: 'pliage.formes',
    groupe: 'Pliage aluminium',
    label: 'Autres pliages (un par ligne)',
    long: true,
    max: 600,
    defaut: 'Z, L, U, oméga\nAngles et profils à plusieurs plis\nTôle plate découpée à la cisaille\nPièces personnalisées, dessinées dans le configurateur',
  },
  // Contact et pied de page
  {
    key: 'contact.intro',
    groupe: 'Contact',
    label: 'Introduction de la page Contact',
    long: true,
    max: 600,
    defaut: 'Une question, une demande particulière ? Écrivez-nous : nous vous répondons rapidement. Pour un devis, le plus rapide est le configurateur.',
  },
  {
    key: 'site.horaires',
    groupe: 'Contact',
    label: 'Horaires (une ligne par jour ou groupe de jours)',
    long: true,
    max: 400,
    defaut: 'Du lundi au jeudi : 7h30–12h et 13h30–16h\nLe vendredi : 7h30–12h',
  },
  {
    key: 'site.description',
    groupe: 'Référencement',
    label: 'Description pour les moteurs de recherche',
    long: true,
    max: 200,
    defaut: 'Alu Pliage Service, pliage de tôle aluminium sur mesure à Fraisses, près de Saint-Étienne : couvertines, bavettes, bandeaux. Devis gratuit.',
  },
]

export const FIELD = new Map(FIELDS.map((f) => [f.key, f]))

/** Pages légales : servies avec le site, jamais modifiables depuis l'application. */
const LEGAL_TEXTS: Record<string, string> = {
  'legal.mentions': MENTIONS,
  'legal.confidentialite': CONFIDENTIALITE,
  'legal.cookies': COOKIES,
  'legal.cgv': CGV,
}

/** Valeurs enregistrées (les champs jamais modifiés ne sont pas en base). */
async function stored() {
  const rows = await db.select().from(siteContent)
  return new Map(rows.map((r) => [r.key, r.value]))
}

/** Tous les textes, avec la valeur par défaut pour ceux qui n'ont pas été modifiés. */
export async function getContent() {
  const saved = await stored()
  return { ...Object.fromEntries(FIELDS.map((f) => [f.key, saved.get(f.key) ?? f.defaut])), ...LEGAL_TEXTS }
}

/** Même chose, avec le détail utile à l'éditeur. */
export async function getEditableContent() {
  const saved = await stored()
  return FIELDS.map((f) => ({ ...f, valeur: saved.get(f.key) ?? f.defaut, modifie: saved.has(f.key) && saved.get(f.key) !== f.defaut }))
}

export async function setContent(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    const f = FIELD.get(key)!
    // Remettre le texte d'origine efface la ligne : on retrouve les futures améliorations des valeurs par défaut
    if (value === f.defaut) await db.delete(siteContent).where(eq(siteContent.key, key))
    else
      await db
        .insert(siteContent)
        .values({ key, value })
        .onConflictDoUpdate({ target: siteContent.key, set: { value, updatedAt: sql`now()` } })
  }
}

/** Remplace {raisonSociale}, {adresse}… dans un texte juridique. */
export async function fillCompany(texts: Record<string, string>) {
  const c = await getCompany()
  const vars: Record<string, string> = {
    raisonSociale: c.raisonSociale,
    adresse: c.adresse.replace(/\n+/g, ', '),
    siret: c.siret || 'À COMPLÉTER',
    telephone: c.telephone || 'À COMPLÉTER',
    email: c.email || 'À COMPLÉTER',
    hebergeur: env.LEGAL_HEBERGEUR || 'À COMPLÉTER : nom, adresse et téléphone de l’hébergeur du site.',
    mediateur: env.LEGAL_MEDIATEUR || 'À COMPLÉTER : nom et coordonnées du médiateur de la consommation.',
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(texts)) out[k] = v.replace(/\{(\w+)\}/g, (m, name: string) => vars[name] ?? m)
  return out
}
