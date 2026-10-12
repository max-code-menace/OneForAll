import type { HideRule, Platform, RewriteLinkRule, Rule, UrlRule } from './types';

/**
 * Validation STRICTE des fichiers de règles (src/rules/*.json).
 *
 * Ces fichiers sont téléchargés depuis GitHub au lancement de l'app, puis leur
 * contenu est injecté dans les pages web. On ne leur fait donc pas confiance
 * aveuglément : tout ce qui n'est pas explicitement autorisé ici est REFUSÉ.
 *
 *  - Seuls des champs connus sont gardés (le reste est ignoré).
 *  - Pas de code : uniquement des sélecteurs, du texte, des regex et du CSS.
 *  - Le CSS ne peut rien charger depuis Internet (url(), @import… interdits).
 *  - Les redirections restent sur le même site (chemins commençant par "/").
 *  - Au moindre doute, le fichier ENTIER est refusé et l'app garde ses règles
 *    précédentes.
 */

/** À incrémenter si le format change de façon incompatible. */
export const SCHEMA_VERSION = 1;

const PLATFORM_IDS = ['instagram', 'youtube', 'tiktok'] as const;
const MAX_CSS = 20_000;
const MAX_RULES = 60;

/** Le CSS ne doit rien pouvoir charger ni exécuter (pas de fuite par requête réseau). */
const FORBIDDEN_CSS = [/url\s*\(/i, /@import/i, /@font-face/i, /image-set\s*\(/i, /expression\s*\(/i, /javascript:/i];

function fail(where: string, message: string): never {
  throw new Error(`${where} : ${message}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v: unknown, where: string, max = 300): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) {
    fail(where, `texte attendu (1 à ${max} caractères)`);
  }
  return v;
}

function optionalText(v: unknown, where: string, max = 300): string | undefined {
  return v === undefined ? undefined : text(v, where, max);
}

function array(v: unknown, where: string, max = 100): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) fail(where, `liste attendue (${max} éléments maximum)`);
  return v;
}

/** Chemin interne au site : "/xxx", jamais "//autre.site" ni "https://…". */
function internalPath(v: unknown, where: string): string {
  const s = text(v, where, 200);
  if (!s.startsWith('/') || s.startsWith('//') || /[\s\\]/.test(s)) {
    fail(where, 'chemin interne attendu (commence par un seul « / », sans espace)');
  }
  return s;
}

function cssText(v: unknown, where: string): string | undefined {
  if (v === undefined) return undefined;
  let css: string;
  if (Array.isArray(v)) {
    if (v.some((line) => typeof line !== 'string')) fail(where, 'liste de lignes de texte attendue');
    css = v.join('\n');
  } else if (typeof v === 'string') {
    css = v;
  } else {
    return fail(where, 'texte ou liste de lignes attendu');
  }
  if (css.length > MAX_CSS) fail(where, `CSS trop long (${MAX_CSS} caractères maximum)`);
  for (const re of FORBIDDEN_CSS) {
    if (re.test(css)) fail(where, `CSS interdit (${re.source})`);
  }
  return css;
}

function sanitizeHide(raw: unknown, where: string): HideRule {
  if (!isObject(raw)) return fail(where, 'objet attendu');
  const rule: HideRule = { selector: text(raw.selector, `${where}.selector`) };
  const closest = optionalText(raw.closest, `${where}.closest`);
  const textMatch = optionalText(raw.text, `${where}.text`, 100);
  if (closest) rule.closest = closest;
  if (textMatch) rule.text = textMatch;
  return rule;
}

function sanitizeRewrite(raw: unknown, where: string): RewriteLinkRule {
  if (!isObject(raw)) return fail(where, 'objet attendu');
  return {
    selector: text(raw.selector, `${where}.selector`),
    href: internalPath(raw.href, `${where}.href`),
  };
}

function sanitizeUrlRule(raw: unknown, where: string): UrlRule {
  if (!isObject(raw)) return fail(where, 'objet attendu');
  const pattern = text(raw.pattern, `${where}.pattern`, 200);
  try {
    new RegExp(pattern);
  } catch {
    fail(`${where}.pattern`, 'expression régulière invalide');
  }
  const redirectTo = raw.redirectTo === null ? null : internalPath(raw.redirectTo, `${where}.redirectTo`);
  return { pattern, redirectTo };
}

function sanitizeRule(raw: unknown, index: number): Rule {
  const where = `règle n°${index + 1}`;
  if (!isObject(raw)) return fail(where, 'objet attendu');

  const id = text(raw.id, `${where}.id`, 60);
  if (!/^[a-z]{2,4}\.[A-Za-z0-9]+$/.test(id)) {
    fail(`${where}.id`, `identifiant invalide « ${id} » (format : ig.exemple)`);
  }
  const name = `règle ${id}`;
  if (typeof raw.defaultEnabled !== 'boolean') fail(`${name}.defaultEnabled`, 'vrai/faux attendu');

  const rule: Rule = {
    id,
    label: text(raw.label, `${name}.label`, 120),
    defaultEnabled: raw.defaultEnabled,
  };
  const description = optionalText(raw.description, `${name}.description`, 400);
  if (description) rule.description = description;
  const css = cssText(raw.css, `${name}.css`);
  if (css) rule.css = css;

  const hide = array(raw.hide, `${name}.hide`).map((h, i) => sanitizeHide(h, `${name}.hide[${i}]`));
  if (hide.length) rule.hide = hide;
  const rewrite = array(raw.rewriteLinks, `${name}.rewriteLinks`).map((r, i) =>
    sanitizeRewrite(r, `${name}.rewriteLinks[${i}]`),
  );
  if (rewrite.length) rule.rewriteLinks = rewrite;
  const urls = array(raw.urls, `${name}.urls`).map((u, i) => sanitizeUrlRule(u, `${name}.urls[${i}]`));
  if (urls.length) rule.urls = urls;
  return rule;
}

export function sanitizeRules(raw: unknown): Rule[] {
  const list = array(raw, 'rules', MAX_RULES);
  const rules = list.map(sanitizeRule);
  const ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) fail('rules', `identifiant en double « ${r.id} »`);
    ids.add(r.id);
  }
  return rules;
}

/** Valide un fichier de plateforme complet. Lance une erreur s'il est invalide. */
export function sanitizePlatform(raw: unknown): Platform {
  if (!isObject(raw)) return fail('fichier', 'objet attendu');
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    fail('schemaVersion', `version ${String(raw.schemaVersion)} non gérée (attendu : ${SCHEMA_VERSION})`);
  }
  const id = raw.id;
  if (!PLATFORM_IDS.includes(id as (typeof PLATFORM_IDS)[number])) fail('id', 'plateforme inconnue');

  const startUrl = text(raw.startUrl, 'startUrl', 200);
  if (!/^https:\/\/[a-z0-9.-]+\//i.test(startUrl)) fail('startUrl', 'adresse https:// attendue');
  const hosts = array(raw.hosts, 'hosts', 10).map((h, i) => {
    const host = text(h, `hosts[${i}]`, 100);
    if (!/^[a-z0-9.-]+$/i.test(host)) fail(`hosts[${i}]`, 'nom de domaine attendu');
    return host.toLowerCase();
  });
  if (hosts.length === 0) fail('hosts', 'au moins un domaine attendu');
  const color = text(raw.color, 'color', 7);
  if (!/^#[0-9a-f]{6}$/i.test(color)) fail('color', 'couleur #RRGGBB attendue');

  const rules = sanitizeRules(raw.rules);
  const platform: Platform = {
    id: id as Platform['id'],
    name: text(raw.name, 'name', 40),
    startUrl,
    hosts,
    color,
    rules,
  };
  const userAgent = optionalText(raw.userAgent, 'userAgent', 400);
  if (userAgent) platform.userAgent = userAgent;
  const blockAll = optionalText(raw.blockAllRuleId, 'blockAllRuleId', 60);
  if (blockAll) {
    if (!rules.some((r) => r.id === blockAll)) fail('blockAllRuleId', `la règle « ${blockAll} » n'existe pas`);
    platform.blockAllRuleId = blockAll;
  }
  return platform;
}

/**
 * Applique un fichier de règles TÉLÉCHARGÉ à une plateforme intégrée à l'app.
 *
 * On ne reprend que `rules` : l'adresse de départ, les domaines, la couleur et
 * le user-agent restent ceux de l'app, pour qu'un fichier distant ne puisse jamais
 * rediriger l'app vers un autre site.
 * Lance une erreur si le fichier est invalide : l'appelant garde alors ses règles.
 */
export function mergeRemoteRules(base: Platform, raw: unknown): Platform {
  const remote = sanitizePlatform(raw);
  if (remote.id !== base.id) fail('id', `fichier « ${remote.id} » reçu à la place de « ${base.id} »`);
  // Un fichier distant ne doit pas pouvoir « débloquer » TikTok en supprimant la règle de blocage.
  if (base.blockAllRuleId && !remote.rules.some((r) => r.id === base.blockAllRuleId)) {
    fail('rules', `la règle « ${base.blockAllRuleId} » est obligatoire`);
  }
  return { ...base, rules: remote.rules };
}
