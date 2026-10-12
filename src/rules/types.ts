/**
 * Types communs à toutes les plateformes.
 *
 * Toutes les règles sont DÉCLARATIVES (des chaînes et des objets simples) :
 * elles vivent dans src/rules/<plateforme>.json et sont injectées dans la page web.
 * Pour modifier un sélecteur quand Instagram/YouTube/Facebook change son HTML,
 * il suffit d'éditer ce fichier JSON — pas besoin de toucher au moteur.
 * (Dans le JSON, `css` peut être une liste de lignes ; elle est jointe au chargement.)
 * Le format est vérifié par src/rules/validate.ts.
 */

/** Masquer des éléments de la page. */
export type HideRule = {
  /** Sélecteur CSS des éléments à trouver (ex: 'a[href*="/reel/"]'). */
  selector: string;
  /**
   * Optionnel : au lieu de masquer l'élément trouvé, masquer son ancêtre le
   * plus proche qui correspond à ce sélecteur (ex: 'article' = tout le post).
   */
  closest?: string;
  /**
   * Optionnel : ne masquer que si le texte de l'élément vaut exactement ceci
   * (insensible à la casse, espaces ignorés). Ex: 'Shorts'.
   */
  text?: string;
};

/** Réécrire la destination d'un lien (ex: Explore -> page de recherche). */
export type RewriteLinkRule = {
  selector: string;
  href: string;
};

/**
 * Règle d'URL : appliquée quand on navigue vers une URL.
 * - `pattern` est une expression régulière testée sur le chemin de l'URL
 *   (ex: "/reels/" dans https://www.instagram.com/reels/).
 * - `redirectTo` : chemin de remplacement (on peut utiliser $1, $2…).
 *   `null` = page bloquée (on n'y va pas du tout).
 */
export type UrlRule = {
  pattern: string;
  redirectTo: string | null;
};

/** Une règle = un interrupteur dans l'écran Réglages. */
export type Rule = {
  /** Identifiant unique et stable (sert de clé de sauvegarde). */
  id: string;
  /** Libellé affiché dans les réglages. */
  label: string;
  /** Petite explication affichée sous le libellé. */
  description?: string;
  /** Activée par défaut ? */
  defaultEnabled: boolean;
  /** CSS injecté tel quel (le plus rapide : appliqué avant même l'affichage). */
  css?: string;
  /** Éléments à masquer en JavaScript (pour les cas que le CSS ne sait pas gérer). */
  hide?: HideRule[];
  /** Liens à réécrire. */
  rewriteLinks?: RewriteLinkRule[];
  /** Redirections / blocages d'URL. */
  urls?: UrlRule[];
  /** Redirection sans bandeau (ex. fil « Abonnements » : à chaque retour à l'accueil). */
  silent?: boolean;
  /**
   * Empêche de glisser verticalement d'une vidéo plein écran à la suivante
   * (Reel ouvert depuis un message : on le voit, mais pas les suivants).
   * Ne dépend pas du HTML du site : le moteur repère une vidéo qui occupe l'écran.
   */
  lockVideoFeed?: boolean;
};

export type Platform = {
  id: 'instagram' | 'youtube' | 'facebook';
  name: string;
  /** Page ouverte quand on appuie sur le bouton. */
  startUrl: string;
  /** Domaines concernés (les sous-domaines sont inclus). */
  hosts: string[];
  /** Couleur du bouton sur l'accueil. */
  color: string;
  /**
   * User-agent optionnel. S'il est présent, l'app se présente comme Safari, avec la vraie
   * version d'iOS du téléphone (voir SiteWebView.tsx) : la chaîne elle-même n'est plus
   * utilisée telle quelle. Utile pour YouTube et Facebook : Google (et Facebook) refusent la connexion
   * depuis une WebView « reconnue », on se présente donc comme Safari iOS.
   */
  userAgent?: string;
  rules: Rule[];
};
