import instagramJson from './instagram.json';
import tiktokJson from './tiktok.json';
import { sanitizePlatform } from './validate';
import youtubeJson from './youtube.json';

export * from './types';
export { mergeRemoteRules, sanitizePlatform, SCHEMA_VERSION } from './validate';

/**
 * Règles intégrées à l'app (fichiers JSON de ce dossier). Elles servent de base
 * et de secours : l'app peut les remplacer par une version plus récente
 * téléchargée depuis GitHub (voir src/lib/rules.tsx).
 *
 * Ordre = ordre d'affichage sur l'accueil et dans les réglages.
 */
export const DEFAULT_PLATFORMS = [instagramJson, youtubeJson, tiktokJson].map(sanitizePlatform);
