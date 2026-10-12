import { PLATFORMS, type Platform, type Rule } from '../rules';

/**
 * Décide, côté React Native, quoi faire d'une URL avant de la charger.
 * (Le script injecté dans la page applique la même logique pour les
 * navigations internes d'Instagram/YouTube, qui ne rechargent pas la page.)
 */

export type UrlAction =
  | { type: 'redirect'; url: string; rule: Rule; platform: Platform }
  | { type: 'block'; rule: Rule; platform: Platform };

type ParsedUrl = { origin: string; host: string; path: string; search: string };

/** Petit découpage d'URL (l'objet URL de React Native est incomplet). */
export function parseUrl(url: string): ParsedUrl | null {
  const m = /^(https?:)\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i.exec(url);
  if (!m) return null;
  const host = m[2].toLowerCase().replace(/:\d+$/, '');
  return { origin: `${m[1]}//${m[2]}`, host, path: m[3] || '/', search: m[4] || '' };
}

/** "www.instagram.com" correspond à "instagram.com". */
export function hostMatches(host: string, hosts: string[]): boolean {
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

export function findUrlAction(url: string, isEnabled: (ruleId: string) => boolean): UrlAction | null {
  const u = parseUrl(url);
  if (!u) return null;

  for (const platform of PLATFORMS) {
    if (!hostMatches(u.host, platform.hosts)) continue;
    for (const rule of platform.rules) {
      if (!isEnabled(rule.id) || !rule.urls) continue;
      for (const r of rule.urls) {
        const re = new RegExp(r.pattern);
        if (!re.test(u.path)) continue;
        if (r.redirectTo === null) return { type: 'block', rule, platform };
        let target = u.path.replace(re, r.redirectTo);
        if (target === u.path) continue;
        // On garde les paramètres d'origine sauf si la cible en définit déjà.
        if (!target.includes('?')) target += u.search;
        return { type: 'redirect', url: u.origin + target, rule, platform };
      }
    }
  }
  return null;
}
