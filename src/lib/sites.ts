import type { ImageSourcePropType } from 'react-native';

/** Icônes des cartes (choisies par l'utilisateur ; une lettre s'affiche si une icône manque). */
export const SITE_ICON: Record<string, ImageSourcePropType> = {
  instagram: require('../../assets/sites/instagram.png'),
  youtube: require('../../assets/sites/youtube.png'),
  facebook: require('../../assets/sites/facebook.png'),
};

/**
 * Textes du design pour chaque réseau : sous-titre sur l'accueil et petit
 * bandeau affiché à l'ouverture du site. (Les règles, elles, sont dans src/rules/.)
 */
export const SITE_TEXT: Record<string, { sub: string; toast: string }> = {
  instagram: { sub: 'Reels et Explore masqués', toast: 'Reels masqués' },
  youtube: { sub: 'Shorts masqués', toast: 'Shorts masqués' },
  facebook: { sub: 'Reels et vidéos masqués', toast: 'Reels et vidéos masqués' },
};

/** Nom de domaine affiché sous le nom du site (ex. « m.youtube.com »). */
export function displayHost(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

/**
 * Onglets de chaque réseau, dans l'ordre du glissement : depuis le bord droit on passe
 * au suivant, depuis le bord gauche au précédent (on reste dans le réseau).
 * `path` : adresse de l'onglet ; on touche le lien du site s'il existe, sinon on y va.
 * `profile` : l'onglet « Profil » d'Instagram, dont l'adresse dépend du compte : on
 * touche le lien qui porte la photo de profil dans la barre du site.
 * `match` : début d'adresse qui compte comme cet onglet (ex. une conversation = « Messages »).
 */
export type SiteTab = { label: string; path?: string; match?: string; profile?: boolean };

export const SITE_TABS: Record<string, SiteTab[]> = {
  instagram: [
    { label: 'Fil et stories', path: '/' },
    { label: 'Messages', path: '/direct/inbox/', match: '/direct/' },
    { label: 'Profil', profile: true },
  ],
  youtube: [
    { label: 'Accueil', path: '/' },
    { label: 'Abonnements', path: '/feed/subscriptions' },
    { label: 'Bibliothèque', path: '/feed/library', match: '/feed/' },
  ],
  facebook: [
    { label: 'Fil', path: '/' },
    { label: 'Messages', path: '/messages/' },
    { label: 'Notifications', path: '/notifications/' },
  ],
};

/** Onglet correspondant à une adresse (null si aucun ne correspond). */
export function tabIndexForPath(tabs: SiteTab[], path: string): number | null {
  const i = tabs.findIndex((t) => {
    const prefix = t.match ?? t.path;
    return !!prefix && (prefix === '/' ? path === '/' : path.startsWith(prefix));
  });
  return i >= 0 ? i : null;
}

/** Script injecté pour aller à un onglet : clic sur le lien du site, sinon navigation. */
export function tabScript(tab: SiteTab): string {
  if (tab.profile) {
    return `(function () {
      var imgs = document.querySelectorAll('a[href^="/"] img[alt]');
      for (var i = 0; i < imgs.length; i++) {
        if (/profil|profile/i.test(imgs[i].alt)) { imgs[i].closest('a').click(); return; }
      }
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tabMissing' }));
    })(); true;`;
  }
  const path = JSON.stringify(tab.path);
  return `(function () {
    var a = document.querySelector('a[href=' + JSON.stringify(${path}) + ']');
    if (a) a.click(); else location.assign(${path});
  })(); true;`;
}
