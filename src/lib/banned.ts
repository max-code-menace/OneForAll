import { hostMatches, parseUrl } from './urlRules';

/**
 * Sites BANNIS : OneForAll n'ouvre jamais ces adresses, où qu'on clique
 * (lien dans un message Instagram, dans une description YouTube, etc.).
 *
 * C'est volontairement écrit EN DUR dans l'app, et non dans les règles
 * téléchargeables (src/rules/*.json) : un fichier de règles distant ne peut donc
 * pas lever ce bannissement.
 *
 * Pourquoi TikTok : il ne contient que de la vidéo courte à défilement infini,
 * exactement ce que l'app existe pour éviter.
 */
export const BANNED_SITES: { name: string; hosts: string[] }[] = [
  // "tiktok.com" couvre aussi vm.tiktok.com, vt.tiktok.com, m.tiktok.com…
  { name: 'TikTok', hosts: ['tiktok.com', 'tiktokv.com'] },
];

/** Renvoie le site banni correspondant à cette adresse, ou null. */
export function findBannedSite(url: string): string | null {
  const u = parseUrl(url);
  if (!u) return null;
  return BANNED_SITES.find((s) => hostMatches(u.host, s.hosts))?.name ?? null;
}
