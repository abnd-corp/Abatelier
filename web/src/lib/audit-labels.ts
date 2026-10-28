export interface AuditEntry {
  id: number
  at: string
  action: string
  identifiant: string | null
  nom: string | null
  userId: string | null
  targetType: string | null
  targetId: string | null
  targetName: string | null
  ip: string | null
  device: string
  details: Record<string, unknown> | null
}

export type Tone = 'neutral' | 'bad' | 'accent'

// Anciennes écritures du journal (avant les sections) : le rôle
const ROLE: Record<string, string> = { direction: 'direction', admin: 'direction', rh: 'RH', atelier: 'atelier' }

const SECTION: Record<string, string> = { ventes: 'Ventes', atelier: 'Atelier', direction: 'Direction' }
/** « Ventes, Atelier + administration » à partir des détails d'une écriture du journal. */
const droits = (sections: unknown, admin: unknown) => {
  const noms = (Array.isArray(sections) ? sections : []).map((x) => SECTION[String(x)] ?? String(x))
  return [noms.join(', ') || null, admin ? 'administration' : null].filter(Boolean).join(' + ') || 'aucun accès'
}

const eur = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : String(n))

/** Texte cité, raccourci s'il est long (mentions légales…) ; « vide » s'il n'y a rien. */
const quote = (v: unknown) => {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return s ? `« ${s.length > 60 ? s.slice(0, 57) + '…' : s} »` : 'vide'
}

const ORDER_STEPS: Record<string, string> = { recue: 'Reçue', validee: 'Validée', fabrication: 'En fabrication', prete: 'Prête', livree: 'Livrée / retirée', annulee: 'Annulée' }

const MODES: Record<string, string> = { virement: 'virement', cheque: 'chèque', carte: 'carte bancaire', especes: 'espèces' }
const day = (v: unknown) => (typeof v === 'string' ? new Date(`${v}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : String(v))

const PLACES: Record<string, string> = { accueil: 'accueil', realisation: 'réalisations', couvertine: 'couvertine', bavette: 'bavette', bandeau: 'bandeau' }

const QTY: Record<string, string> = { aucune: 'aucune', fixe: 'nombre fixe', par_piece: 'une par pièce', jonctions: 'une par jonction' }

// Libellés et unités des champs du catalogue, pour décrire un changement de prix lisiblement
const CATALOG_FIELDS: Record<string, { label: string; fmt: (v: unknown) => string }> = {
  prixM2: { label: 'prix au m²', fmt: eur },
  epaisseur: { label: 'épaisseur', fmt: (v) => `${String(v).replace('.', ',')} mm` },
  retourMin: { label: 'retour minimum', fmt: (v) => `${v} mm` },
  majoration: { label: 'majoration', fmt: (v) => `${String(v).replace('.', ',')} %` },
  delaiSup: { label: 'délai supplémentaire', fmt: (v) => `${v} j` },
  actif: { label: 'statut', fmt: (v) => (v ? 'actif' : 'désactivé') },
  nom: { label: 'nom', fmt: (v) => `« ${v} »` },
  reference: { label: 'référence', fmt: (v) => `« ${v} »` },
  hex: { label: 'teinte', fmt: (v) => String(v) },
  prixPliMl: { label: 'prix par pli et par mètre', fmt: eur },
  miseEnRoute: { label: 'mise en route', fmt: eur },
  minimumCommande: { label: 'minimum de commande', fmt: eur },
  remisePro: { label: 'remise pro', fmt: (v) => `${String(v).replace('.', ',')} %` },
  tva: { label: 'TVA', fmt: (v) => `${String(v).replace('.', ',')} %` },
  delaiStandard: { label: 'délai standard', fmt: (v) => `${v} j` },
  largeurTole: { label: 'largeur de tôle', fmt: (v) => `${v} mm` },
  longueurMin: { label: 'longueur minimum', fmt: (v) => `${v} mm` },
  longueurMax: { label: 'longueur maximum', fmt: (v) => `${v} mm` },
  plisMax: { label: 'plis maximum', fmt: (v) => String(v) },
  angleMin: { label: 'angle minimum', fmt: (v) => `${v}°` },
  angleMax: { label: 'angle maximum', fmt: (v) => `${v}°` },
  pinceAutorisee: { label: 'pinces', fmt: (v) => (v ? 'faites' : 'non faites') },
  prix: { label: 'prix', fmt: eur },
  unite: { label: 'unité', fmt: (v) => (v === 'paire' ? 'à la paire' : 'à la pièce') },
  modeles: { label: 'modèles', fmt: (v) => (Array.isArray(v) ? v.join(', ') : String(v)) },
  cotes: { label: 'cotes', fmt: (v) => (Array.isArray(v) ? v.map((c, i) => `${String.fromCharCode(65 + i)} ${c}`).join(' ') : String(v)) },
  angles: { label: 'plis', fmt: (v) => (Array.isArray(v) ? v.map((a: number) => (Math.abs(a) === 1 ? 'pince' : `${Math.abs(a)}°${a < 0 ? '↓' : '↑'}`)).join(' ') : String(v)) },
  noms: { label: 'noms des cotes', fmt: (v) => (Array.isArray(v) ? v.map((n) => n || '—').join(', ') : String(v)) },
  cap: { label: 'orientation du dessin', fmt: (v) => `${v}°` },
  longueur: { label: 'longueur proposée', fmt: (v) => `${v} mm` },
  quantite: { label: 'quantité proposée', fmt: (v) => `${v} pièce${Number(v) > 1 ? 's' : ''}` },
  quantiteAuto: { label: 'quantité proposée', fmt: (v) => QTY[String(v)] ?? String(v) },
  quantiteFixe: { label: 'quantité fixe', fmt: (v) => String(v) },
  retraitActif: { label: 'retrait à l’atelier', fmt: (v) => (v ? 'proposé' : 'désactivé') },
  retraitInfo: { label: 'infos de retrait', fmt: (v) => `« ${v} »` },
  atelierAdresse: { label: 'adresse de départ', fmt: (v) => `« ${v} »` },
  longueurSeuil: { label: 'seuil des pièces longues', fmt: (v) => (v === null ? 'aucun' : `${v} mm`) },
  longueurPrix: { label: 'supplément pièces longues', fmt: eur },
  zones: {
    label: 'zones de livraison',
    fmt: (v) =>
      Array.isArray(v) && v.length
        ? v.map((z: { distanceMax: number; prix: number; franco: number | null }) => `${z.distanceMax} km : ${eur(z.prix)}${z.franco !== null ? ` (offerte dès ${eur(z.franco)})` : ''}`).join(', ')
        : 'aucune',
  },
  // Modèles de documents
  raisonSociale: { label: 'raison sociale', fmt: (v) => quote(v) },
  formeJuridique: { label: 'forme juridique', fmt: (v) => quote(v) },
  capital: { label: 'capital', fmt: (v) => quote(v) },
  adresse: { label: 'adresse', fmt: (v) => quote(v) },
  telephone: { label: 'téléphone', fmt: (v) => quote(v) },
  email: { label: 'e-mail', fmt: (v) => quote(v) },
  siteWeb: { label: 'site web', fmt: (v) => quote(v) },
  siret: { label: 'SIRET', fmt: (v) => quote(v) },
  rcs: { label: 'RCS', fmt: (v) => quote(v) },
  tvaIntra: { label: 'TVA intracommunautaire', fmt: (v) => quote(v) },
  iban: { label: 'IBAN', fmt: (v) => quote(v) },
  bic: { label: 'BIC', fmt: (v) => quote(v) },
  couleur: { label: 'couleur', fmt: (v) => String(v) },
  entete: { label: 'introduction', fmt: (v) => quote(v) },
  conditionsPaiement: { label: 'conditions de paiement', fmt: (v) => quote(v) },
  validiteDevis: { label: 'validité du devis', fmt: (v) => `${v} j` },
  echeanceFacture: { label: 'délai de paiement', fmt: (v) => `${v} j` },
  noteDevis: { label: 'note du devis', fmt: (v) => quote(v) },
  noteFacture: { label: 'note de la facture', fmt: (v) => quote(v) },
  mentionsLegales: { label: 'mentions légales', fmt: (v) => quote(v) },
  piedDePage: { label: 'pied de page', fmt: (v) => quote(v) },
  prefixeDevis: { label: 'préfixe des devis', fmt: (v) => quote(v) },
  prefixeFacture: { label: 'préfixe des factures', fmt: (v) => quote(v) },
  remisesQuantite: {
    label: 'remises quantité',
    fmt: (v) => (Array.isArray(v) && v.length ? v.map((p: { seuil: number; remise: number }) => `−${String(p.remise).replace('.', ',')} % dès ${p.seuil}`).join(', ') : 'aucune'),
  },
}
function changes(c: Record<string, { avant: unknown; apres: unknown }> | undefined) {
  return Object.entries(c ?? {})
    .map(([k, { avant, apres }]) => {
      const f = CATALOG_FIELDS[k] ?? { label: k, fmt: String }
      return `${f.label} ${f.fmt(avant)} → ${f.fmt(apres)}`
    })
    .join(', ')
}

/** Phrase lisible et couleur pour une ligne du journal. Les futures actions métier s'ajoutent ici. */
export function describe(e: AuditEntry): { text: string; tone: Tone } {
  const d = (e.details ?? {}) as Record<string, any>
  const cible = e.targetName ?? d.nom ?? d.identifiant ?? 'un compte'
  switch (e.action) {
    case 'login.success':
      return { text: d.remember ? 'Connexion (rester connecté)' : 'Connexion', tone: 'neutral' }
    case 'login.failed':
      return { text: e.userId ? 'Mot de passe incorrect' : `Échec de connexion avec l’identifiant « ${e.identifiant} »`, tone: 'bad' }
    case 'login.locked':
      return { text: `Connexion bloquée après trop d’essais (« ${e.identifiant} »)`, tone: 'bad' }
    case 'login.disabled':
      return { text: 'Tentative de connexion sur un compte désactivé', tone: 'bad' }
    case 'logout':
      return { text: 'Déconnexion', tone: 'neutral' }
    case 'password.changed':
      return { text: d.autresSessionsFermees ? `A changé son mot de passe (${d.autresSessionsFermees} autre(s) appareil(s) déconnecté(s))` : 'A changé son mot de passe', tone: 'accent' }
    case 'password.change_failed':
      return { text: 'Mot de passe actuel incorrect lors d’un changement', tone: 'bad' }
    case 'session.revoked':
      return { text: `A déconnecté un appareil (${d.appareil ?? 'inconnu'})`, tone: 'neutral' }
    case 'session.revoked_all':
      return { text: `A déconnecté ses autres appareils (${d.nombre})`, tone: 'neutral' }
    case 'user.created':
      return { text: `A créé le compte de ${d.nom} (${d.role ? (ROLE[d.role] ?? d.role) : droits(d.sections, d.admin)})`, tone: 'accent' }
    case 'user.updated': {
      const parts = []
      if (d.role) parts.push(`rôle ${ROLE[d.role.avant] ?? d.role.avant} → ${ROLE[d.role.apres] ?? d.role.apres}`)
      if (d.droits) parts.push(`droits : ${droits(d.droits.avant.sections, d.droits.avant.admin)} → ${droits(d.droits.apres.sections, d.droits.apres.admin)}`)
      if (d.nom) parts.push(`nom « ${d.nom.avant} » → « ${d.nom.apres} »`)
      return { text: `A modifié le compte de ${cible} : ${parts.join(', ')}`, tone: 'accent' }
    }
    case 'user.disabled':
      if (d.raison === 'date de sortie') return { text: `Compte de ${cible} désactivé automatiquement : date de sortie atteinte`, tone: 'bad' }
      return { text: `A désactivé le compte de ${cible}`, tone: 'bad' }
    case 'employee.created':
      return { text: `A ajouté ${d.nom} à l’équipe${d.compte ? ' avec un compte de connexion' : ''}`, tone: 'accent' }
    case 'employee.updated':
      return { text: `A modifié la fiche de ${d.nom ?? cible} (${(d.champs ?? []).join(', ')})`, tone: 'neutral' }
    case 'catalog.material_created':
      return { text: `A ajouté la matière ${d.nom} (${eur(d.prixM2)}/m²)`, tone: 'accent' }
    case 'catalog.material_updated':
      return { text: `A modifié la matière ${d.nom} : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.color_created':
      return { text: `A ajouté le coloris ${d.nom}`, tone: 'accent' }
    case 'catalog.settings_updated':
      return { text: `A modifié le façonnage et les conditions : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.color_updated':
      return { text: `A modifié le coloris ${d.nom} : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.accessory_created':
      return { text: `A ajouté l’accessoire ${d.nom} (${eur(d.prix)} ${d.unite === 'paire' ? 'la paire' : 'la pièce'})`, tone: 'accent' }
    case 'catalog.accessory_updated':
      return { text: `A modifié l’accessoire ${d.nom} : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.model_created':
      return { text: `A ajouté le modèle de pièce ${d.nom} (${d.forme})`, tone: 'accent' }
    case 'catalog.model_updated':
      return { text: `A modifié le modèle de pièce ${d.nom} : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.delivery_updated':
      return { text: `A modifié la livraison : ${changes(d.changements)}`, tone: 'accent' }
    case 'documents.company_updated':
      return { text: `A modifié l’identité de l’entreprise : ${changes(d.changements)}`, tone: 'accent' }
    case 'documents.template_updated':
      return { text: `A modifié le modèle des devis et factures : ${changes(d.changements)}`, tone: 'accent' }
    case 'documents.numbering_updated':
      return { text: `A fixé le prochain numéro ${d.type === 'facture' ? 'de facture' : 'de devis'} ${d.annee} : ${d.avant} → ${d.apres}`, tone: 'accent' }
    case 'documents.logo_updated':
      return { text: `A envoyé un nouveau logo (${d.type === 'image/png' ? 'PNG' : 'JPEG'}, ${d.largeur} × ${d.hauteur} px)`, tone: 'accent' }
    case 'documents.logo_removed':
      return { text: 'A remis le logo de l’appli sur les documents', tone: 'accent' }
    case 'client.created':
      return { text: `A ajouté le client ${d.nom}${d.type === 'professionnel' ? ' (professionnel)' : ''}`, tone: 'accent' }
    case 'client.updated':
      return { text: `A modifié la fiche de ${d.nom} (${(d.champs ?? []).join(', ')})`, tone: 'neutral' }
    case 'client.archived':
      return { text: `A archivé le client ${d.nom}`, tone: 'neutral' }
    case 'client.unarchived':
      return { text: `A sorti le client ${d.nom} des archives`, tone: 'neutral' }
    case 'client.site_added':
      return { text: `A ajouté le chantier « ${d.chantier} » (${d.ville}) à ${d.nom}`, tone: 'neutral' }
    case 'client.site_updated':
      return { text: `A modifié le chantier « ${d.chantier} » de ${d.nom}`, tone: 'neutral' }
    case 'client.site_removed':
      return { text: `A retiré le chantier « ${d.chantier} » de ${d.nom}`, tone: 'neutral' }
    case 'order.created':
      return {
        text: `${d.origine === 'espace' ? 'Commande' : 'A enregistré la commande'} ${d.numero} de ${d.client} (${eur(d.ht)} HT)${d.origine === 'espace' ? ', demandée depuis l’espace client' : ''}`,
        tone: 'accent',
      }
    case 'order.updated':
      return { text: `A modifié la commande ${d.numero} (${eur(d.avant)} → ${eur(d.apres)} HT)`, tone: 'neutral' }
    case 'order.status_changed':
      return {
        text: d.apres === 'annulee' ? `A annulé la commande ${d.numero}${d.note ? ` : ${d.note}` : ''}` : `A passé la commande ${d.numero} à « ${ORDER_STEPS[d.apres] ?? d.apres} »`,
        tone: d.apres === 'annulee' ? 'bad' : 'neutral',
      }
    case 'order.production_assigned':
      return { text: `A pris en charge la commande ${d.numero}${d.avant ? ` (reprise à ${d.avant})` : ''}`, tone: 'neutral' }
    case 'order.production_released':
      return { text: `A annulé la prise en charge de la commande ${d.numero}${d.avant ? ` par ${d.avant}` : ''}`, tone: 'neutral' }
    case 'order.sheet_printed':
      return { text: `A imprimé la fiche de fabrication de la commande ${d.numero}`, tone: 'neutral' }
    case 'billing.devis_created':
      return {
        text: `${d.origine === 'espace' ? 'Devis' : 'A émis le devis'} ${d.numero} pour ${d.client} (commande ${d.commande}, ${eur(d.ttc)} TTC)${d.origine === 'espace' ? ', remis dans l’espace client' : ''}`,
        tone: 'accent',
      }
    case 'billing.facture_created':
      return { text: `A émis la facture ${d.numero} pour ${d.client} (commande ${d.commande}, ${eur(d.ttc)} TTC)`, tone: 'accent' }
    case 'billing.avoir_created':
      return { text: `A émis l’avoir ${d.numero} qui annule la facture ${d.facture} de ${d.client}${d.motif ? ` : ${d.motif}` : ''}`, tone: 'bad' }
    case 'billing.sent':
      return { text: `A marqué ${String(d.numero).startsWith('D') ? 'le devis' : 'la facture'} ${d.numero} comme envoyé${String(d.numero).startsWith('D') ? '' : 'e'} à ${d.client}`, tone: 'neutral' }
    case 'billing.devis_answered':
      return { text: `A noté le devis ${d.numero} comme ${d.reponse === 'accepte' ? 'accepté' : 'refusé'} par ${d.client}`, tone: d.reponse === 'accepte' ? 'accent' : 'neutral' }
    case 'billing.paid':
      return { text: `A enregistré le paiement de la facture ${d.numero} (${eur(d.ttc)}, ${MODES[d.mode] ?? d.mode}, le ${day(d.date)})`, tone: 'accent' }
    case 'billing.exported':
      return {
        text: `A exporté les ${d.type === 'ventes' ? 'ventes (factures et avoirs)' : 'encaissements'} du ${day(d.du)} au ${day(d.au)} pour le comptable (${d.lignes} ligne${Number(d.lignes) > 1 ? 's' : ''})`,
        tone: 'neutral',
      }
    case 'billing.emailed':
      return {
        text: `A envoyé par e-mail ${String(d.numero).startsWith('D') ? 'le devis' : String(d.numero).startsWith('A') ? 'l’avoir' : 'la facture'} ${d.numero} à ${d.client} (${d.destinataires} destinataire${Number(d.destinataires) > 1 ? 's' : ''})`,
        tone: 'accent',
      }
    case 'mail.test':
      return { text: 'A envoyé un e-mail d’essai pour vérifier la messagerie', tone: 'neutral' }
    case 'billing.payment_cancelled':
      return { text: `A annulé le paiement enregistré sur la facture ${d.numero}`, tone: 'bad' }
    case 'site.content_updated':
      return { text: `A modifié les textes du site (${(d.champs ?? []).join(', ')})`, tone: 'accent' }
    case 'site.content_reset':
      return { text: `A rétabli le texte d’origine du site : ${d.champ}`, tone: 'neutral' }
    case 'site.photo_added':
      return { text: `A ajouté une photo au site (${PLACES[d.emplacement as string] ?? d.emplacement}, ${d.largeur} × ${d.hauteur} px)`, tone: 'accent' }
    case 'site.photo_updated':
      return { text: `A modifié une photo du site (${(d.champs ?? []).join(', ')})`, tone: 'neutral' }
    case 'site.photo_deleted':
      return { text: `A supprimé une photo du site (${PLACES[d.emplacement as string] ?? d.emplacement})`, tone: 'bad' }
    case 'contact.received':
      return { text: `Demande de contact reçue par le site : « ${d.objet} »${d.fichier ? ' (plan joint)' : ''}`, tone: 'accent' }
    case 'contact.order_created':
      return { text: `A créé la commande ${d.commande} à partir de la demande « ${d.objet} »${d.clientCree ? ' (nouvelle fiche client)' : ''}`, tone: 'accent' }
    case 'contact.file_downloaded':
      return { text: `A téléchargé le plan joint à la demande « ${d.objet} »`, tone: 'neutral' }
    case 'contact.handled':
      return { text: `A marqué la demande « ${d.objet} » comme traitée`, tone: 'neutral' }
    case 'contact.reopened':
      return { text: `A remis la demande « ${d.objet} » à traiter`, tone: 'neutral' }
    case 'contact.deleted':
      return { text: `A supprimé la demande de contact « ${d.objet} »`, tone: 'bad' }
    case 'product.created':
      return { text: `A créé le produit « ${d.nom} »`, tone: 'accent' }
    case 'product.updated':
      return { text: `A modifié le produit « ${d.nom} » (${(d.champs as string[]).join(', ')})`, tone: 'neutral' }
    case 'product.activated':
      return { text: `A mis en ligne le produit « ${d.nom} »`, tone: 'accent' }
    case 'product.deactivated':
      return { text: `A retiré du site le produit « ${d.nom} »`, tone: 'neutral' }
    case 'product.deleted':
      return { text: `A supprimé le produit « ${d.nom} »`, tone: 'bad' }
    case 'product.image_updated':
      return { text: `A changé la photo du produit « ${d.nom} » (${d.largeur} × ${d.hauteur})`, tone: 'neutral' }
    case 'product.image_deleted':
      return { text: `A retiré la photo du produit « ${d.nom} »`, tone: 'neutral' }
    case 'product.variant_added':
      return { text: `A ajouté la déclinaison « ${d.libelle} » (${eur(d.prixTtc)} TTC) à « ${d.nom} »`, tone: 'accent' }
    case 'product.variant_updated': {
      const prix = d.prixTtc ? ` : prix ${eur(d.prixTtc.avant)} → ${eur(d.prixTtc.apres)} TTC` : d.actif !== undefined ? ` : ${d.actif ? 'remise en vente' : 'retirée de la vente'}` : ''
      return { text: `A modifié la déclinaison « ${d.libelle} » du produit « ${d.nom} »${prix}`, tone: 'neutral' }
    }
    case 'product.variant_deleted':
      return { text: `A supprimé la déclinaison « ${d.libelle} » du produit « ${d.nom} »`, tone: 'bad' }
    case 'stock.sheet_created':
      return { text: `A ajouté au stock la feuille ${d.libelle} (${d.quantite})`, tone: 'accent' }
    case 'stock.sheet_updated':
      return { text: `A modifié la feuille ${d.libelle} (${(d.champs as string[]).join(', ')})`, tone: 'neutral' }
    case 'stock.code_linked':
      return { text: `A associé le code-barres ${d.code} à la feuille ${d.libelle}`, tone: 'accent' }
    case 'stock.code_unlinked':
      return { text: `A retiré le code-barres ${d.code} de la feuille ${d.libelle}`, tone: 'neutral' }
    case 'stock.moved':
      return {
        text: `${d.motif === 'inventaire' ? 'Inventaire' : d.delta > 0 ? 'Entrée' : 'Sortie'} de ${Math.abs(d.delta)} feuille${Math.abs(d.delta) > 1 ? 's' : ''} : ${d.libelle} (reste ${d.apres})${d.code ? ` · code ${d.code}` : ''}`,
        tone: d.delta > 0 ? 'accent' : 'neutral',
      }
    case 'stock.sheet_archived':
      return { text: `A archivé la référence ${d.libelle}`, tone: 'neutral' }
    case 'stock.sheet_unarchived':
      return { text: `A désarchivé la référence ${d.libelle}`, tone: 'accent' }
    case 'stock.sheet_deleted':
      return { text: `A supprimé du stock la référence ${d.libelle}`, tone: 'bad' }
    case 'product.imported':
      return {
        text: `A importé un catalogue : ${d.produitsCrees} produit${d.produitsCrees > 1 ? 's' : ''} créé${d.produitsCrees > 1 ? 's' : ''} (cachés du site), ${d.variantesCreees} déclinaison${d.variantesCreees > 1 ? 's' : ''} ajoutée${d.variantesCreees > 1 ? 's' : ''}, ${d.variantesMisesAJour} prix mis à jour`,
        tone: 'accent',
      }
    case 'product.duplicated':
      return { text: `A copié le produit « ${d.source} » en « ${d.nom} »`, tone: 'accent' }
    case 'product.prices_adjusted':
      return {
        text: `A ${d.pourcent > 0 ? 'augmenté' : 'baissé'} de ${Math.abs(d.pourcent).toLocaleString('fr-FR')} % les prix de « ${d.nom} » (${d.variantes} déclinaison${d.variantes > 1 ? 's' : ''})`,
        tone: 'neutral',
      }
    case 'product.bulk':
      return {
        text: `A ${d.action === 'mettre_en_ligne' ? 'mis en ligne' : d.action === 'retirer' ? 'retiré du site' : 'supprimé'} ${d.produits} produit${d.produits > 1 ? 's' : ''}`,
        tone: d.action === 'supprimer' ? 'bad' : 'neutral',
      }
    case 'boutique.checkout_started':
      return { text: `Un client ouvre le paiement de ${eur(d.montant)} (${d.articles} article${d.articles > 1 ? 's' : ''})`, tone: 'neutral' }
    case 'boutique.payment_confirmed':
      return { text: `Paiement de ${eur(d.montant)} reçu : commande ${d.numero} créée`, tone: 'accent' }
    case 'boutique.payment_failed':
      return { text: `Paiement de ${eur(d.montant)} abandonné ou échoué`, tone: 'bad' }
    case 'order.refused':
      return { text: `A refusé la commande ${d.numero} et remboursé ${eur(d.montant)} au client : ${d.motif}${d.avoir ? ` (avoir ${d.avoir})` : ''}`, tone: 'bad' }
    case 'espace.registered':
      return { text: `Espace client créé : ${d.nom}`, tone: 'accent' }
    case 'espace.password_reset_requested':
      return { text: 'Lien de réinitialisation du mot de passe envoyé à un client', tone: 'neutral' }
    case 'espace.password_reset':
      return { text: 'Mot de passe d’un client réinitialisé avec le lien reçu par e-mail', tone: 'accent' }
    case 'espace.activation_sent':
      return { text: 'Lien d’activation d’espace client envoyé à une fiche existante', tone: 'neutral' }
    case 'espace.activated':
      return { text: 'Espace client activé sur une fiche existante', tone: 'accent' }
    case 'espace.profile_updated':
      return { text: `Un client a modifié ses informations (${(d.champs ?? []).join(', ')})`, tone: 'neutral' }
    case 'espace.login':
      return { text: 'Connexion d’un client à son espace', tone: 'neutral' }
    case 'espace.login_failed':
      return { text: 'Échec de connexion à un espace client', tone: 'bad' }
    case 'espace.logout':
      return { text: 'Déconnexion d’un client de son espace', tone: 'neutral' }
    case 'espace.document_downloaded':
      return { text: `Un client a téléchargé ${d.type === 'devis' ? 'le devis' : d.type === 'avoir' ? 'l’avoir' : 'la facture'} ${d.numero}`, tone: 'neutral' }
    case 'espace.account_closed':
      return { text: 'Un client a fermé son espace : sa fiche est anonymisée, ses factures sont conservées', tone: 'neutral' }
    case 'espace.devis_answered':
      return {
        text: `Un client a ${d.reponse === 'accepte' ? 'accepté' : 'refusé'} le devis ${d.numero} (commande ${d.commande}) depuis son espace`,
        tone: d.reponse === 'accepte' ? 'accent' : 'neutral',
      }
    case 'user.enabled':
      return { text: `A réactivé le compte de ${cible}`, tone: 'accent' }
    case 'user.password_reset':
      return { text: `A réinitialisé le mot de passe de ${cible}`, tone: 'accent' }
    default:
      return { text: e.action, tone: 'neutral' }
  }
}
