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
