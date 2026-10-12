import { instagram } from './instagram';
import { tiktok } from './tiktok';
import type { Platform, Rule } from './types';
import { youtube } from './youtube';

export * from './types';

/** Ordre d'affichage sur l'accueil et dans les réglages. */
export const PLATFORMS: Platform[] = [instagram, youtube, tiktok];

export function getPlatform(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

/** Toutes les règles, toutes plateformes confondues. */
export const ALL_RULES: Rule[] = PLATFORMS.flatMap((p) => p.rules);
