import type { HideRule, Platform, RewriteLinkRule } from '../rules/types';

/**
 * Construit le JavaScript injecté dans la WebView.
 *
 * On ne garde que les règles activées dans les Réglages, on les convertit en
 * JSON, puis on les insère dans un petit "moteur" (RUNTIME ci-dessous) qui :
 *   1. ajoute une feuille de style CSS (masquage instantané, avant affichage) ;
 *   2. vérifie l'URL et redirige /reels/, /shorts/ID… ;
 *   3. masque en JS ce que le CSS ne sait pas cibler (texte, ancêtre…) ;
 *   4. recommence à chaque changement de la page (MutationObserver = scroll infini)
 *      et à chaque navigation interne (history.pushState des sites "SPA") ;
 *   5. si demandé, empêche de glisser d'une vidéo plein écran à la suivante.
 *
 * Fluidité : les redirections se font si possible SANS recharger la page (comme le
 * site lui-même, voir softGo), juste après la navigation du site (pas pendant) ; le
 * nettoyage ne relit que ce qui vient d'apparaître ou de changer, juste avant l'affichage
 * de l'image suivante (un Reel n'apparaît donc jamais, même une fraction de seconde) ;
 * la page entière n'est relue qu'à un vrai changement d'adresse, sans relire le texte de
 * ce qui a déjà été examiné ; chaque sélecteur est cherché une seule fois ; les vidéos
 * sont mesurées au plus 4 fois par seconde ; aucun écouteur de geste n'est posé sur
 * toute la page (ce qui ferait attendre le script à chaque défilement) : seulement
 * sur une vidéo plein écran.
 *
 * Sécurité : les règles viennent d'un fichier téléchargé. Aucun de leurs textes
 * n'est inséré comme du HTML, et chaque redirection est revérifiée après
 * remplacement de $1, $2… (même logique que isSafeTarget, src/lib/urlRules.ts).
 */

type InjectedUrlRule = { pattern: string; redirectTo: string | null; label: string; silent: boolean; reload: boolean };
type InjectedRewrite = RewriteLinkRule & { reload: boolean };

type InjectedConfig = {
  hosts: string[];
  css: string;
  hide: HideRule[];
  rewrite: InjectedRewrite[];
  urls: InjectedUrlRule[];
  lockFeed: boolean;
  feedEnd: boolean;
};

export function buildConfig(
  platforms: Platform[],
  isEnabled: (ruleId: string) => boolean,
): InjectedConfig[] {
  return platforms.map((p) => {
    const rules = p.rules.filter((r) => isEnabled(r.id));
    return {
      hosts: p.hosts,
      css: rules.map((r) => r.css ?? '').join('\n'),
      hide: rules.flatMap((r) => r.hide ?? []),
      rewrite: rules.flatMap((r) => (r.rewriteLinks ?? []).map((l) => ({ ...l, reload: !!r.reload }))),
      urls: rules.flatMap((r) =>
        (r.urls ?? []).map((u) => ({ ...u, label: r.label, silent: !!r.silent, reload: !!r.reload })),
      ),
      lockFeed: rules.some((r) => r.lockVideoFeed),
      feedEnd: rules.some((r) => r.feedEnd),
    };
  });
}

/** Script pour `injectedJavaScriptBeforeContentLoaded` (s'exécute avant la page). */
export function buildInjectedScript(
  platforms: Platform[],
  isEnabled: (ruleId: string) => boolean,
): string {
  return PAGE_HIDDEN_SCRIPT + RUNTIME.replace('__CONFIG__', () => JSON.stringify(buildConfig(platforms, isEnabled)));
}

/**
 * Commande envoyée à la page quand l'app la cache (retour à l'accueil) ou la réaffiche.
 * Le réseau reste ouvert en arrière-plan : voir PAGE_HIDDEN_SCRIPT.
 */
export function setPageHiddenCommand(hidden: boolean): string {
  return `window.__ONEFORALL_HIDDEN__ && window.__ONEFORALL_HIDDEN__(${hidden ? 'true' : 'false'}); true;`;
}

/**
 * Page cachée par l'app (réseau gardé ouvert pendant qu'on est sur l'accueil).
 * iOS, lui, croit qu'elle est encore à l'écran. On fait donc croire au SITE qu'il
 * est en arrière-plan, comme un onglet de Safari qu'on quitte :
 *  - document.visibilityState = 'hidden', document.hidden = true, hasFocus() = false,
 *    puis les événements visibilitychange et blur. Les sites s'en servent pour se
 *    mettre en veille, et pour ne pas marquer « Vu » un message arrivé pendant
 *    qu'on n'est pas là (supposé : on ne voit pas leur code) ;
 *  - vidéos et sons en pause, et toute lecture qui démarre est arrêtée aussitôt.
 * Posé sur toutes les pages (même sans règles) ; ne change rien tant que l'app n'a pas caché la page.
 */
const PAGE_HIDDEN_SCRIPT = `
(function () {
  if (window.__ONEFORALL_HIDDEN__) return;
  var hidden = false;
  var proto = window.Document && Document.prototype;
  function real(name) {
    var d = proto && Object.getOwnPropertyDescriptor(proto, name);
    return d && d.get ? function () { return d.get.call(document); } : null;
  }
  var realState = real('visibilityState'), realHidden = real('hidden');
  try {
    if (realState) Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return hidden ? 'hidden' : realState(); } });
    if (realHidden) Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return hidden || realHidden(); } });
    var realFocus = document.hasFocus;
    if (realFocus) document.hasFocus = function () { return !hidden && realFocus.call(document); };
  } catch (e) {}
  function pauseAll() {
    var media = document.querySelectorAll('video, audio');
    for (var i = 0; i < media.length; i++) { try { media[i].pause(); } catch (e) {} }
  }
  // Pendant que la page est cachée, une vidéo qui démarre (lecture auto…) est arrêtée.
  document.addEventListener('play', function (e) {
    if (hidden && e.target && e.target.pause) { try { e.target.pause(); } catch (err) {} }
  }, true);
  window.__ONEFORALL_HIDDEN__ = function (h) {
    h = !!h;
    if (h === hidden) return;
    hidden = h;
    if (h) pauseAll();
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event(h ? 'blur' : 'focus'));
    } catch (e) {}
  };
})();
`;

/**
 * Script pour `injectedJavaScript` (après chargement) : relance un nettoyage
 * au cas où le premier script aurait tourné trop tôt.
 */
export const AFTER_LOAD_SCRIPT = `
  if (window.__SANS_REELS__) { window.__SANS_REELS__.run(); }
  true;
`;

/**
 * Relevé de la structure du fil (mode diagnostic, bouton « Relevé ») : la FORME de la page, sans
 * aucun contenu (ni texte, ni nom de compte, ni adresse de publication : seulement des tailles, des
 * positions et le type de chaque case), pour comprendre le fil d'Instagram sans y avoir accès.
 * Renvoyé à l'app, qui ouvre la feuille de partage d'iOS : l'utilisateur décide de l'envoyer ou non.
 */
export const SNAPSHOT_SCRIPT = `
(function () {
  function send(text) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'snapshot', text: text.slice(0, 12000) })); } catch (e) {}
  }
  try {
    var H = window.innerHeight, se = document.scrollingElement || document.documentElement, L = [];
    var KNOWN = { direct: 1, t: 1, p: 1, reel: 1, reels: 1, explore: 1, search: 1, stories: 1, accounts: 1, inbox: 1 };
    var path = location.pathname.split('/').map(function (x) {
      return !x || Object.prototype.hasOwnProperty.call(KNOWN, x) ? x : '…';
    }).join('/');
    var keys = location.search ? location.search.slice(1).split('&').map(function (x) { return x.split('=')[0]; }) : [];
    var n = function (v) { return Math.round(v); };
    var kind = function (el) {
      if (el.querySelector('a[href*="/reel/"]')) return 'reel';
      if (el.querySelector('a[href*="/p/"]')) return 'photo';
      return el.tagName === 'ARTICLE' ? 'article' : '-';
    };
    var KEYS = ['position', 'top', 'height', 'min-height', 'padding-top', 'padding-bottom', 'transform', 'display'];
    var inline = function (el) {
      var out = [];
      for (var i = 0; i < KEYS.length; i++) {
        var v = el.style ? el.style.getPropertyValue(KEYS[i]) : '';
        if (v) out.push(KEYS[i] + ':' + String(v).slice(0, 40));
      }
      return out.length ? ' {' + out.join(';') + '}' : '';
    };
    var mark = function (el) {
      return (el.getAttribute('data-sans-reels') === 'hidden' ? (el.hasAttribute('data-sans-reels-collapse') ? ' <replié>' : ' <masqué>') : '') +
        (el.getAttribute('data-sans-reels-row') === 'hidden' ? ' <case masquée>' : '');
    };
    var box = function (el) {
      var cs = getComputedStyle(el), r = el.getBoundingClientRect(), role = el.getAttribute('role');
      return el.tagName.toLowerCase() + (role ? '[' + role + ']' : '') + ' haut=' + n(r.top) + ' h=' + n(r.height) + ' ' + cs.position +
        (cs.paddingTop !== '0px' ? ' pt=' + cs.paddingTop : '') + (cs.paddingBottom !== '0px' ? ' pb=' + cs.paddingBottom : '') +
        (cs.transform !== 'none' ? ' transform' : '') + ' enfants=' + el.children.length + inline(el) + mark(el);
    };
    L.push('Relevé OneForAll 1 · ' + path + (keys.length ? ' ?' + keys.join('&') : ''));
    L.push('écran ' + window.innerWidth + 'x' + H + ' · défilé ' + n(window.scrollY) + ' sur ' + n(se.scrollHeight));
    var arts = document.getElementsByTagName('article');
    var card = document.getElementById('sans-reels-feed-end');
    L.push('articles montés ' + arts.length + ' · carte de fin ' + (card && getComputedStyle(card).display !== 'none' ? 'affichée' : 'non'));
    if (arts.length) {
      L.push('Ancêtres du 1er article :');
      for (var el = arts[0], d = 0; el && el !== document.documentElement && d < 12; el = el.parentElement, d++) L.push(' ' + d + ' ' + box(el));
      var list = arts[0].parentElement, others = 0;
      L.push('Enfants de son parent (' + list.children.length + ') :');
      for (var i = 0; i < list.children.length && i < 60; i++) L.push(' ' + i + ' ' + kind(list.children[i]) + ' ' + box(list.children[i]));
      for (var j = 0; j < arts.length; j++) if (arts[j].parentElement !== list) others++;
      if (others) L.push(others + ' article(s) ailleurs');
    }
    // Grands blocs sans publication : espaceurs probables du fil.
    var big = 0, divs = document.querySelectorAll('main div, body > div');
    for (var k = 0; k < divs.length && big < 8; k++) {
      if (divs[k].offsetHeight > 2 * H && !divs[k].getElementsByTagName('article').length) { L.push('bloc sans publication : ' + box(divs[k])); big++; }
    }
    send(L.join('\\n'));
  } catch (e) {
    send('Relevé impossible : ' + String(e && e.message));
  }
})();
true;
`;

// Écrit en JavaScript "classique" (pas de TypeScript ici : c'est exécuté par la page web).
const RUNTIME = `
(function () {
  if (window.__SANS_REELS__) { window.__SANS_REELS__.run(); return; }

  var ALL = __CONFIG__;

  function norm(s) { return (s || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }

  // Envoie un message à l'app (pour afficher "Reel bloqué", etc.).
  function post(msg) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) {}
  }

  function hostMatches(host, hosts) {
    for (var i = 0; i < hosts.length; i++) {
      if (host === hosts[i] || host.slice(-hosts[i].length - 1) === '.' + hosts[i]) return true;
    }
    return false;
  }

  // Ne garder que la configuration du site actuel.
  var css = '', hide = [], rewrite = [], urls = [], lockFeed = false, feedEnd = false;
  for (var i = 0; i < ALL.length; i++) {
    if (!hostMatches(location.hostname, ALL[i].hosts)) continue;
    css += ALL[i].css + '\\n';
    hide = hide.concat(ALL[i].hide);
    rewrite = rewrite.concat(ALL[i].rewrite);
    urls = urls.concat(ALL[i].urls);
    lockFeed = lockFeed || ALL[i].lockFeed;
    feedEnd = feedEnd || ALL[i].feedEnd;
  }
  if (!css.trim() && !hide.length && !rewrite.length && !urls.length && !lockFeed) return;

  // Règles de masquage regroupées par sélecteur : chaque sélecteur n'est cherché
  // qu'une fois par nettoyage (ex. « article span » sert à 7 règles de texte).
  var hideSels = [], hideBySel = {}, textSel = {}, maxText = 0, anyCollapse = false;
  for (var h = 0; h < hide.length; h++) {
    var hs = hide[h].selector, ht = hide[h].text ? norm(hide[h].text) : null;
    if (!hideBySel[hs]) { hideBySel[hs] = []; hideSels.push(hs); }
    hideBySel[hs].push({ closest: hide[h].closest, cell: !!hide[h].cell, collapse: !!hide[h].collapse, text: ht });
    if (hide[h].collapse) anyCollapse = true;
    if (ht) { textSel[hs] = true; maxText = Math.max(maxText, ht.length); }
  }
  // « Replié » (champ collapse) : au lieu de disparaître (display:none), l'élément devient une
  // boîte de hauteur 0, sans contenu. Pour un fil VIRTUALISÉ comme celui d'Instagram : un élément
  // en display:none n'est plus « vu » par le site, qui garde pour lui une place estimée. D'où le
  // grand vide en bas du fil et les sauts du contenu pendant le défilement (vidéo de l'utilisateur,
  // 13/10). Boîte de 0 px : le site la mesure, et sa place devient 0 (NoReel fait de même).
  if (anyCollapse) {
    // Sa case éventuelle (rowOf) est repliée aussi, mais SANS cacher son contenu : la publication
    // repliée qu'elle contient doit rester mesurable.
    css = '[data-sans-reels-collapse],[data-sans-reels-collapse-row]{height:0!important;min-height:0!important;' +
      'max-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}' +
      '[data-sans-reels-collapse]>*{display:none!important}\\n' + css;
  }

  // Un texte bien plus long que le plus long des textes cherchés ne peut pas lui être
  // égal : on ne le normalise pas (légendes de plusieurs lignes…).
  var MAX_RAW = maxText * 2 + 16;

  // Liens réécrits dont la règle demande un vrai chargement (champ « reload »).
  var reloadHref = {};
  for (var w = 0; w < rewrite.length; w++) if (rewrite[w].reload) reloadHref[rewrite[w].href] = true;

  // Expressions des règles d'URL préparées une seule fois (pas à chaque vérification).
  for (var u = 0; u < urls.length; u++) {
    try { urls[u].re = new RegExp(urls[u].pattern); } catch (e) { urls[u].re = null; }
  }

  // --- 1. URLs -------------------------------------------------------------
  // Même logique que isAlreadyThere (src/lib/urlRules.ts) : pas de redirection en boucle.
  function alreadyThere(path, search, target) {
    var parts = target.split('?'), want = (parts[1] || '').split('&');
    if (parts[0] !== path) return false;
    var have = (search || '').replace(/^\\?/, '').split('&');
    for (var i = 0; i < want.length; i++) {
      if (want[i] && have.indexOf(want[i]) < 0) return false;
    }
    return true;
  }

  // Même logique que isSafeTarget (src/lib/urlRules.ts) : « /chemin », jamais « //autre.site ».
  function safeTarget(t) {
    return /^\\/(?![\\/\\\\])/.test(t) && !/[\\s\\\\]/.test(t);
  }

  // Renvoie { block: true } / { target: '/nouveau/chemin' } / null.
  function urlAction(path, search) {
    for (var i = 0; i < urls.length; i++) {
      var re = urls[i].re;
      if (!re || !re.test(path)) continue;
      if (urls[i].redirectTo === null) return { block: true, label: urls[i].label };
      var target = path.replace(re, urls[i].redirectTo);
      if (!safeTarget(target) || alreadyThere(path, search, target)) continue;
      if (target.indexOf('?') < 0) target += search || '';
      return { target: target, label: urls[i].label, silent: urls[i].silent, reload: urls[i].reload };
    }
    return null;
  }

  var leaving = false;
  function blockPage(label) {
    leaving = true;
    post({ type: 'blocked', label: label });
    // Page construite élément par élément : le libellé (venu des règles) reste du
    // simple texte, il ne peut jamais devenir du HTML ou du code.
    function el(tag, style, text) {
      var e = document.createElement(tag);
      if (style) e.setAttribute('style', style);
      if (text) e.textContent = text;
      return e;
    }
    function render() {
      var root = document.documentElement;
      if (!root) return;
      while (root.firstChild) root.removeChild(root.firstChild);
      var body = el('body',
        'margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'font-family:-apple-system,sans-serif;background:#111;color:#fff;text-align:center;padding:24px');
      body.appendChild(el('div', 'font-size:56px', '🚫'));
      body.appendChild(el('h2', '', 'Page bloquée'));
      body.appendChild(el('p', 'opacity:.7', String(label || '')));
      root.appendChild(body);
    }
    // Maintenant si possible, puis à nouveau une fois la page lue (elle aurait
    // pu ré-écrire du contenu entre-temps).
    render();
    document.addEventListener('DOMContentLoaded', render);
  }

  // Navigation « douce » vers un chemin du même site : comme le site le fait lui-même
  // (history + événement popstate, que son routeur écoute), donc SANS recharger toute
  // la page. Si le site ne réagit pas (aucun élément ajouté en 800 ms), on recharge
  // à la bonne adresse. Pendant le chargement initial : navigation classique.
  function softGo(target, replace) {
    if (document.readyState === 'loading' || !document.body || typeof PopStateEvent !== 'function') {
      leaving = true;
      post({ type: 'reloading', why: 'early' }); // compteur du mode diagnostic
      if (replace) location.replace(target); else location.assign(target);
      return;
    }
    var reacted = false;
    var watch = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].addedNodes.length) { reacted = true; watch.disconnect(); return; }
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });
    try {
      history[replace ? 'replaceState' : 'pushState'](history.state, '', target);
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    } catch (e) {
      watch.disconnect();
      leaving = true;
      post({ type: 'reloading', why: 'stuck' });
      location.assign(target);
      return;
    }
    var expected = location.href;
    setTimeout(function () {
      watch.disconnect();
      // Rechargement seulement si on est toujours sur cette adresse (l'utilisateur a pu repartir),
      // et pas en boucle (un site qui remettrait lui-même l'ancienne adresse après chaque chargement).
      if (!reacted && location.href === expected && reloadAllowed()) {
        leaving = true;
        post({ type: 'reloading', why: 'stuck' });
        location.reload();
      }
    }, 800);
  }

  // Au plus 2 rechargements automatiques en 10 s (gardé pour la durée de l'onglet).
  function reloadAllowed() {
    var now = Date.now(), log = [];
    try { log = JSON.parse(sessionStorage.getItem('__sansReelsReloads') || '[]'); } catch (e) {}
    if (!Array.isArray(log)) log = [];
    log = log.filter(function (t) { return typeof t === 'number' && now - t < 10000; });
    if (log.length >= 2) return false;
    log.push(now);
    try { sessionStorage.setItem('__sansReelsReloads', JSON.stringify(log)); } catch (e) {}
    return true;
  }

  // Vrai chargement de la page, voulu par la règle (champ « reload »), au TOUCHER d'un lien
  // seulement : quand le site ne suit pas une navigation douce. Ex. Instagram : l'adresse passait
  // bien à « ?variant=following », mais le fil affiché restait « Pour vous » (iPhone, 13/10).
  // Jamais quand c'est le site qui change de page tout seul (ex. retour au fil après
  // « Partager ») : un rechargement couperait ce qu'il est en train de faire (envoi…).
  function hardGo(target, replace) {
    leaving = true;
    post({ type: 'reloading', why: 'rule' }); // compteur du mode diagnostic
    if (replace) location.replace(target); else location.assign(target);
  }

  // Vérifie l'URL actuelle. Renvoie true si on quitte (ou change) la page.
  function checkUrl() {
    if (leaving) return true;
    var a = urlAction(location.pathname, location.search);
    if (!a) return false;
    if (a.block) { blockPage(a.label); return true; }
    if (!a.silent) post({ type: 'redirected', label: a.label });
    softGo(a.target, true); // « reload » : seulement au toucher d'un lien (voir hardGo)
    return true;
  }

  // --- 2. CSS --------------------------------------------------------------
  function addStyle() {
    if (!css.trim()) return;
    var el = document.getElementById('sans-reels-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'sans-reels-style';
      el.textContent = css;
    }
    // Au tout début du chargement, <html> peut ne pas encore exister : on réessaiera.
    var parent = document.head || document.documentElement;
    if (parent && !el.isConnected) parent.appendChild(el);
  }

  // --- 3. Masquage / réécriture en JS -----------------------------------------

  // Case qui ne contient que cet élément : on remonte tant que le parent n'a pas
  // d'autre enfant (3 niveaux au plus, jamais jusqu'à <main> ou <body>).
  function rowOf(el) {
    var t = el;
    for (var i = 0; i < 3; i++) {
      var p = t.parentElement;
      if (!p || p === document.body || p === document.documentElement || p.tagName === 'MAIN') break;
      if (p.children.length !== 1) break;
      t = p;
    }
    return t;
  }

  // Case d'une barre d'onglets : on remonte tant que le parent ne contient aucun autre
  // lien (3 niveaux au plus, seulement des div/span/li). Sinon la case vide garde sa
  // place et laisse un trou entre les onglets. (Avant : des sélecteurs CSS « :has() »
  // qui faisaient recalculer le style de toute la page à chaque ajout de lien.)
  function cellOf(el) {
    var own = (el.tagName === 'A' ? 1 : 0) + el.getElementsByTagName('a').length, t = el;
    for (var i = 0; i < 3; i++) {
      var p = t.parentElement;
      if (!p || !/^(DIV|SPAN|LI)$/.test(p.tagName)) break;
      if (p.getElementsByTagName('a').length > own) break;
      t = p;
    }
    return t;
  }

  // Le « display » que le site avait mis lui-même est gardé, pour le remettre au réaffichage.
  var hiddenTotal = 0; // publications masquées depuis le chargement (carte de fin)
  function hideEl(el, attr, collapse) {
    el.setAttribute(attr, 'hidden');
    if (attr === 'data-sans-reels') {
      // Une vidéo qui jouait déjà (lien du Reel arrivé tard) : coupée tout de suite ; celles qui
      // démarreraient ensuite le sont par l'écouteur « play ».
      var vids = el.tagName === 'VIDEO' ? [el] : el.getElementsByTagName('video');
      for (var v = 0; v < vids.length; v++) { try { vids[v].muted = true; vids[v].pause(); } catch (e) {} }
    }
    // Replié : géré par la feuille de style (attribut), rien n'est écrit dans son style.
    if (collapse) { el.setAttribute(collapse === 'row' ? 'data-sans-reels-collapse-row' : 'data-sans-reels-collapse', ''); return; }
    if (!el.__sansReelsDisplay) {
      el.__sansReelsDisplay = [el.style.getPropertyValue('display'), el.style.getPropertyPriority('display')];
    }
    el.style.setProperty('display', 'none', 'important');
  }
  function showEl(el, attr) {
    el.removeAttribute(attr);
    if (el.hasAttribute('data-sans-reels-collapse') || el.hasAttribute('data-sans-reels-collapse-row')) {
      el.removeAttribute('data-sans-reels-collapse');
      el.removeAttribute('data-sans-reels-collapse-row');
      return;
    }
    var d = el.__sansReelsDisplay;
    el.__sansReelsDisplay = null;
    if (d && d[0]) el.style.setProperty('display', d[0], d[1]);
    else el.style.removeProperty('display');
  }

  // Un élément masqué est-il encore visé par une règle ?
  function stillMatches(target) {
    for (var i = 0; i < hideSels.length; i++) {
      var sel = hideSels[i], rules = hideBySel[sel], cands = [];
      try {
        if (target.matches(sel)) cands.push(target);
        var sub = target.querySelectorAll(sel);
        for (var j = 0; j < sub.length; j++) cands.push(sub[j]);
      } catch (e) { continue; }
      for (var c = 0; c < cands.length; c++) {
        var el = cands[c], txt = null;
        for (var q = 0; q < rules.length; q++) {
          var r = rules[q];
          if (r.text) {
            if (txt === null) {
              var raw = el.textContent || '';
              txt = raw.length > MAX_RAW ? '' : norm(raw);
            }
            if (txt !== r.text) continue;
          }
          if (((r.closest && el.closest(r.closest)) || el) === target) return true;
        }
      }
    }
    return false;
  }

  // Instagram réutilise les mêmes <article> pour d'autres publications pendant le défilement :
  // une case masquée (un Reel) peut devenir une photo. Quand le contenu d'un élément masqué
  // change, on revérifie ; si plus aucune règle ne le vise, il est réaffiché. Seulement s'il a
  // du contenu (au moins un lien, lui compris) : une case vidée avant d'être remplie n'est pas
  // une photo. Une case (rowOf/cellOf) qui ne contient plus l'élément masqué pour lequel elle
  // l'a été est réaffichée ; la boucle de masquage qui suit la remasque si son nouveau contenu
  // est visé.
  var HIDDEN_SEL = '[data-sans-reels="hidden"],[data-sans-reels-row="hidden"]';
  var checkStamp = 0;
  function recheckAll(list) {
    checkStamp++;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.__sansReelsChecked === checkStamp) continue;
      t.__sansReelsChecked = checkStamp;
      if (t.getAttribute('data-sans-reels') !== 'hidden') {
        var of = t.__sansReelsOf;
        if (!of || !t.contains(of) || of.getAttribute('data-sans-reels') !== 'hidden') showEl(t, 'data-sans-reels-row');
        continue;
      }
      var links = (t.tagName === 'A' ? 1 : 0) + t.getElementsByTagName('a').length;
      if (!links || stillMatches(t)) continue;
      showEl(t, 'data-sans-reels');
      var box = t.__sansReelsBox;
      t.__sansReelsBox = null;
      if (box && box.getAttribute('data-sans-reels-row') === 'hidden') showEl(box, 'data-sans-reels-row');
    }
  }
  // Morceaux changés : les éléments masqués qui les contiennent, et ceux qu'ils contiennent.
  function recheck(roots) {
    var list = [];
    for (var i = 0; i < roots.length; i++) {
      var up = roots[i].closest(HIDDEN_SEL);
      if (up) list.push(up);
      var down = roots[i].querySelectorAll(HIDDEN_SEL);
      for (var j = 0; j < down.length; j++) list.push(down[j]);
    }
    if (list.length) recheckAll(list);
  }

  // Éléments qui correspondent au sélecteur : dans toute la page (roots = null), ou
  // seulement dans les morceaux qui viennent d'apparaître ou de changer (roots = liste
  // d'éléments). Un sélecteur comme « article span » reste juste : closest() et
  // querySelectorAll() tiennent compte des ancêtres, même hors du morceau.
  // up : pour les règles de texte, l'ancêtre qui correspond compte aussi (un texte
  // changé dans un <b> à l'intérieur du <span> visé).
  function find(sel, roots, up) {
    if (!roots) return document.querySelectorAll(sel);
    var out = [];
    for (var i = 0; i < roots.length; i++) {
      var r = roots[i];
      var self = up ? r.closest(sel) : r.matches(sel) ? r : null;
      if (self) out.push(self);
      var sub = r.querySelectorAll(sel);
      for (var j = 0; j < sub.length; j++) out.push(sub[j]);
    }
    return out;
  }

  // Ne garde que les morceaux encore dans la page, et pas ceux déjà contenus dans un autre.
  var stamp = 0;
  function topRoots(list) {
    stamp++;
    var keep = [];
    for (var i = 0; i < list.length; i++) if (list[i].isConnected) list[i].__sansReels = stamp;
    for (var j = 0; j < list.length; j++) {
      var el = list[j];
      if (el.__sansReels !== stamp) continue;
      var inside = false;
      for (var p = el.parentElement; p; p = p.parentElement) {
        if (p.__sansReels === stamp) { inside = true; break; }
      }
      if (!inside) { keep.push(el); el.__sansReels = -1; } // -1 : pas compté deux fois
    }
    return keep;
  }

  // roots : morceaux à relire (null = toute la page).
  // deep : relire aussi ce qui a déjà été examiné. Sans deep, la relecture de toute la
  // page saute les éléments déjà vus : s'ils avaient changé (texte, lien, contenu),
  // l'observateur les aurait signalés et ils auraient été relus aussitôt.
  function clean(roots, deep) {
    addStyle();
    // Relecture de toute la page : tous les éléments masqués (peu nombreux) sont revérifiés.
    if (roots) recheck(roots);
    else recheckAll(document.querySelectorAll(HIDDEN_SEL));
    var skipSeen = !roots && !deep;
    for (var i = 0; i < hideSels.length; i++) {
      var rules = hideBySel[hideSels[i]], list;
      try { list = find(hideSels[i], roots, textSel[hideSels[i]]); } catch (e) { continue; }
      for (var j = 0; j < list.length; j++) {
        var el = list[j], txt = null;
        if (skipSeen && el.__sansReelsSeen) continue;
        el.__sansReelsSeen = true;
        for (var q = 0; q < rules.length; q++) {
          var r = rules[q];
          if (r.text) {
            if (txt === null) { // lu une seule fois par élément
              var raw = el.textContent || '';
              txt = raw.length > MAX_RAW ? '' : norm(raw);
            }
            if (txt !== r.text) continue;
          }
          var target = (r.closest && el.closest(r.closest)) || el;
          if (target.getAttribute('data-sans-reels') === 'hidden') continue;
          hideEl(target, 'data-sans-reels', r.collapse);
          hiddenTotal++;
          // Publication entière masquée : on masque aussi la case qui ne contenait qu'elle,
          // sinon le site garde sa place et laisse un grand espace vide dans le fil.
          var box = r.closest ? rowOf(target) : r.cell ? cellOf(target) : target;
          if (box !== target) {
            hideEl(box, 'data-sans-reels-row', r.collapse ? 'row' : false);
            target.__sansReelsBox = box;
            box.__sansReelsOf = target;
          }
        }
      }
    }
    for (var k = 0; k < rewrite.length; k++) {
      var links;
      try { links = find(rewrite[k].selector, roots, false); } catch (e) { continue; }
      for (var m = 0; m < links.length; m++) {
        if (links[m].getAttribute('href') === rewrite[k].href) continue; // déjà fait
        links[m].setAttribute('href', rewrite[k].href);
        links[m].setAttribute('data-sans-reels-href', rewrite[k].href);
      }
    }
  }

  // Prévient l'app du chemin de la page (affiché seulement en mode diagnostic).
  var lastPath = '';
  function reportPath() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    post({ type: 'path', path: location.pathname });
  }

  // Messages non lus : les sites les affichent dans le titre (« (3) Instagram »).
  var lastUnread = -1;
  function reportUnread() {
    var m = /^\\((\\d{1,4})\\+?\\)/.exec((document.title || '').trim());
    var n = m ? Number(m[1]) : 0;
    if (!document.title || n === lastUnread) return;
    lastUnread = n;
    post({ type: 'unread', count: n });
  }

  // Couleur du haut de la page (barre du site), pour que l'app colore la zone de l'heure
  // et de la batterie pareil : la couleur « theme-color » du site, sinon le fond de la page.
  // Lue à chaque changement de page (avec les autres mesures), envoyée si elle change.
  var lastTheme = '';
  function reportTheme() {
    var color = '';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length && !color; i++) {
      var media = metas[i].getAttribute('media');
      if (!media || (window.matchMedia && window.matchMedia(media).matches)) color = metas[i].getAttribute('content') || '';
    }
    if (!color && document.body) {
      color = getComputedStyle(document.body).backgroundColor;
      if (/^rgba\\(.*,\\s*0\\)$|^transparent$/.test(color)) color = getComputedStyle(document.documentElement).backgroundColor;
    }
    color = String(color).slice(0, 40);
    if (!color || color === lastTheme) return;
    lastTheme = color;
    post({ type: 'theme', color: color });
  }

  // roots : morceaux changés (l'adresse, elle, est surveillée à part : navigation, minuteur).
  // Sans roots : changement de page ou chargement. deep : voir clean().
  var themeQueued = false;
  function run(roots, deep, noUrl) {
    reportUnread();
    if (roots) {
      if (leaving) return;
      clean(roots, false);
      afterLayout(false);
      return;
    }
    reportPath();
    if (noUrl || (guardHref !== null && location.href === guardHref) ? leaving : checkUrl()) return;
    themeQueued = true;
    addStyle();
    // Chargement : toute la page, tout de suite. Changement de page : tout ce qui est
    // apparu a déjà été traité au fil de l'eau ; la relecture complète n'est qu'un
    // contrôle, faite plus tard pour ne pas ralentir le site qui dessine la nouvelle page.
    if (deep) clean(null, true);
    else laterCheck();
    afterLayout(true);
  }
  var checkTimer = null;
  function laterCheck() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(function () {
      checkTimer = null;
      if (!leaving) clean(null, false);
    }, 1500);
  }
  var armVideos = null; // défini plus bas si le blocage du glissement est actif
  var checkFeedEnd = null; // défini plus bas si « Tu as tout vu » est actif

  // Une seule fonction par image, juste avant l'affichage : d'abord masquer ce qui vient
  // d'apparaître (écritures), PUIS mesurer (lectures). Dans cet ordre, le navigateur ne
  // calcule la mise en page qu'une fois par image (mesurer avant de masquer la lui
  // ferait calculer deux fois).
  var frameQueued = false, inFrame = false, endDue = false;
  function needFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(onFrame);
  }
  function onFrame() {
    frameQueued = false;
    inFrame = true;
    try {
      flush();
      if (measureDue) measure();
      else if (endDue) { endDue = false; checkFeedEnd(); }
    } finally {
      inFrame = false;
    }
  }

  // Mesures (taille des vidéos, position du fil, couleur du site). Pendant que la page
  // change sans arrêt (fil qui se charge…), au plus 4 fois par seconde. urgent : tout de
  // suite (changement de page).
  var MEASURE_EVERY = 250;
  var measureDue = false, lastMeasure = 0, measureTimer = null;
  function afterLayout(urgent) {
    if (measureDue || (!armVideos && !checkFeedEnd && !themeQueued)) return;
    var wait = urgent ? 0 : MEASURE_EVERY - (Date.now() - lastMeasure);
    if (wait > 0) {
      if (!measureTimer) measureTimer = setTimeout(function () { measureTimer = null; afterLayout(true); }, wait);
      return;
    }
    if (measureTimer) { clearTimeout(measureTimer); measureTimer = null; }
    measureDue = true;
    if (!inFrame) needFrame(); // dans onFrame : mesuré juste après, dans la même image
  }
  function measure() {
    measureDue = false;
    endDue = false;
    lastMeasure = Date.now();
    if (themeQueued) { themeQueued = false; reportTheme(); }
    if (armVideos) armVideos();
    if (checkFeedEnd) checkFeedEnd();
  }

  // Les changements de la page (ajouts, textes changés, liens changés) sont regroupés et
  // traités JUSTE AVANT l'affichage de l'image suivante : un Reel ou une pub ajoutés au
  // fil sont masqués avant d'avoir été dessinés une seule fois (avant : jusqu'à 120 ms
  // plus tard, le temps de 7 images). Seul ce qui a changé est relu. Si l'affichage est
  // suspendu, un minuteur prend le relais.
  var MAX_PENDING = 400;
  var queued = false, timerId = 0, pending = [], pendingAll = false;
  function onMutations(list) {
    var removed = false;
    if (!pendingAll) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'childList') {
          if (m.removedNodes.length) removed = true;
          var added = m.addedNodes;
          for (var j = 0; j < added.length; j++) {
            // Texte ajouté : c'est son élément parent qui a changé (jamais le document lui-même).
            var node = added[j].nodeType === 1 ? added[j] : m.target;
            if (node.nodeType === 1) pending.push(node);
          }
        } else if (m.type === 'characterData') {
          if (m.target.parentElement) pending.push(m.target.parentElement);
        } else {
          pending.push(m.target); // lien dont l'adresse a changé
        }
      }
      if (pending.length > MAX_PENDING) { pendingAll = true; pending = []; }
    }
    // Quelque chose a seulement été retiré (fenêtre fermée, publication démontée) : rien à
    // masquer, mais la mise en page a changé (fin du fil, vidéos) : une mesure suffit.
    if (removed) afterLayout(false);
    if (queued || (!pending.length && !pendingAll)) return;
    queued = true;
    needFrame();
    timerId = setTimeout(flush, 250);
  }
  function flush() {
    if (!queued) return;
    queued = false;
    clearTimeout(timerId);
    // Trop de changements d'un coup (chargement d'une page) : toute la page, sans raccourci.
    var all = pendingAll;
    var roots = all ? null : topRoots(pending);
    pending = [];
    pendingAll = false;
    if (roots && !roots.length) return;
    run(roots, all);
  }

  // --- 4. Surveillance ------------------------------------------------------
  // a) Navigation interne (Instagram/YouTube changent d'URL sans recharger).
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var before = location.href, fromFeed = location.pathname === '/';
      var result = original.apply(this, arguments);
      // Juste APRÈS la navigation du site (micro-tâche) : une redirection lancée pendant
      // qu'il change lui-même de page pouvait passer inaperçue de son routeur, et finir
      // en rechargement complet. Toujours avant l'affichage de la page interdite.
      // Seulement si l'adresse a changé : un site peut appeler replaceState sans arrêt
      // (pour retenir la position de défilement…) ; tout relire à chaque fois faisait
      // accrocher le défilement.
      // Le site qui RÉÉCRIT l'adresse du fil (replaceState) avec le lien d'une publication que
      // nous avons masquée (elle passe à l'écran, repliée) ne change pas de page : les règles
      // d'adresse ne s'appliquent pas à CETTE adresse (sinon retour à l'accueil, voire
      // rechargement). Toute autre adresse est vérifiée normalement (pas de trou dans les règles).
      if (location.href !== before) {
        var guard = name === 'replaceState' && fromFeed && location.pathname !== '/' && isHiddenPostPath(location.pathname);
        guardHref = guard ? location.href : null;
        if (guard) lastHref = location.href; // le filet de sécurité (minuteur) ne la revérifie pas
        afterSite(guard);
      }
      return result;
    };
  });
  var guardHref = null; // adresse réécrite par le site, qu'on laisse telle quelle (voir plus haut)
  function isHiddenPostPath(path) {
    var links = document.querySelectorAll('[data-sans-reels="hidden"] a[href]');
    for (var i = 0; i < links.length; i++) if (links[i].pathname === path) return true;
    return false;
  }
  var afterQueued = false, afterNoUrl = true;
  function afterSite(noUrl) {
    afterNoUrl = afterNoUrl && !!noUrl;
    if (afterQueued) return;
    afterQueued = true;
    Promise.resolve().then(function () {
      var skip = afterNoUrl;
      afterQueued = false;
      afterNoUrl = true;
      run(null, false, skip);
    });
  }
  // Retour en arrière : la page affichée peut vraiment être celle de cette adresse, on vérifie.
  window.addEventListener('popstate', function () { guardHref = null; run(); });

  // b) Clic sur un lien interdit ou réécrit : on intercepte avant le site.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || a.host !== location.host) return;
    var rewritten = a.getAttribute('data-sans-reels-href');
    // Le site a pu réutiliser ce lien pour une autre adresse depuis : la réécriture ne vaut plus.
    if (rewritten && a.getAttribute('href') !== rewritten) {
      a.removeAttribute('data-sans-reels-href');
      rewritten = null;
    }
    var action = rewritten ? { target: rewritten, reload: !!reloadHref[rewritten] } : urlAction(a.pathname, a.search);
    if (!action || (action.target && !safeTarget(action.target))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (action.block) { post({ type: 'blocked', label: action.label }); return; }
    // Déjà sur cette page (ex. loupe touchée sur la recherche) : on remonte en haut, comme
    // l'app, au lieu d'empiler la même page dans l'historique (2 retours pour en sortir).
    if (alreadyThere(location.pathname, location.search, action.target)) {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { window.scrollTo(0, 0); }
      return;
    }
    if (action.label && !action.silent) post({ type: 'redirected', label: action.label });
    if (action.reload) hardGo(action.target, false);
    else softGo(action.target, false);
  }, true);

  // Une vidéo dans une publication masquée ou repliée ne joue jamais (même sans le son).
  document.addEventListener('play', function (e) {
    var v = e.target;
    if (v && v.closest && v.closest('[data-sans-reels="hidden"]')) {
      try { v.muted = true; v.pause(); } catch (err) {}
    }
  }, true);

  // c) Contenu ajouté ou changé (scroll infini, changement d'onglet, texte mis à jour,
  //    lien qui change d'adresse). On observe document (et pas <html>, qui peut ne pas
  //    encore exister).
  new MutationObserver(onMutations).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href'],
  });

  // --- 5. Vidéos plein écran : pas de glissement vers la suivante ------------
  // Instagram ouvre un Reel reçu en message PAR-DESSUS la conversation, sans
  // changer d'adresse : les règles d'URL ne voient rien. On repère donc ce qui
  // caractérise un fil de vidéos courtes : une vidéo qui occupe (presque) tout
  // l'écran. Pendant un geste commencé sur elle, le glissement vertical est
  // bloqué, pour la page (défilement natif) comme pour le site (ses propres
  // gestionnaires de geste). Les taps, le glissement horizontal et les
  // panneaux sans vidéo (commentaires…) restent utilisables.
  if (lockFeed) {
    var isFull = function (v) {
      var r = v.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
      // Une vidéo du fil (format 4:5) fait ~60 % de la hauteur : elle n'est pas concernée.
      // Format portrait exigé en plus (un Reel est en 9:16) : sur un petit écran (iPhone SE),
      // une vidéo 4:5 du fil approche 75 % de la hauteur et ne doit pas bloquer le défilement.
      return r.width >= W * 0.9 && r.height >= H * 0.75 && r.height >= r.width * 1.3 &&
        r.top < H * 0.5 && r.bottom > H * 0.5;
    };
    var fullVideo = function () {
      var vids = document.getElementsByTagName('video');
      for (var i = 0; i < vids.length; i++) if (isFull(vids[i])) return vids[i];
      return null;
    };
    var scrollableParent = function (el) {
      for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        var oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
      }
      return null;
    };
    var gesture = null, lastNotice = 0;
    var start = function (target, x, y) {
      gesture = null;
      // Stories : plein écran aussi, mais on doit pouvoir les fermer en glissant vers le bas.
      if (/^\\/stories\\//.test(location.pathname)) return;
      var v = fullVideo();
      if (!v) return;
      var inner = scrollableParent(target);
      if (inner && !inner.contains(v)) return; // panneau à part (commentaires…) : libre
      gesture = { x: x, y: y, vertical: null };
    };
    var move = function (e, x, y) {
      if (!gesture) return;
      if (gesture.vertical === null) {
        var dx = Math.abs(x - gesture.x), dy = Math.abs(y - gesture.y);
        if (dx > 6 || dy > 6) {
          gesture.vertical = dy > dx;
          // Prévient l'app (bandeau « Les Reels suivants sont bloqués »), sans répéter.
          if (gesture.vertical && Date.now() - lastNotice > 4000) {
            lastNotice = Date.now();
            post({ type: 'feedLocked' });
          }
        }
      }
      // Tant qu'on n'a pas tranché, et en vertical : pas de défilement natif (sinon il
      // démarre trop tôt). En vertical, le site ne reçoit pas non plus le geste.
      // En horizontal : rien n'est bloqué (carrousels…).
      if (gesture.vertical === false) return;
      if (e.cancelable && e.type === 'touchmove') e.preventDefault();
      // stopImmediatePropagation : même un écouteur du site posé sur ce conteneur ne reçoit rien.
      if (gesture.vertical) e.stopImmediatePropagation();
    };
    var onStart = function (e) {
      if (e.touches.length !== 1) { gesture = null; return; }
      start(e.target, e.touches[0].clientX, e.touches[0].clientY);
    };
    var onMove = function (e) {
      if (e.touches.length !== 1) return;
      move(e, e.touches[0].clientX, e.touches[0].clientY);
    };
    // Les écouteurs qui peuvent bloquer le défilement (passive: false) ne sont posés
    // QUE sur le conteneur d'une vidéo plein écran, quand elle apparaît : partout
    // ailleurs (fil, messages…), iOS fait défiler sans attendre le script.
    var armed = [];
    armVideos = function () {
      var vids = document.getElementsByTagName('video');
      for (var i = 0; i < vids.length; i++) {
        if (!isFull(vids[i])) continue;
        var box = scrollableParent(vids[i]) || vids[i].parentElement || vids[i];
        if (armed.indexOf(box) >= 0) continue;
        armed.push(box);
        // capture : on passe avant les écouteurs du site (sur ce conteneur et à l'intérieur).
        box.addEventListener('touchstart', onStart, { capture: true, passive: false });
        box.addEventListener('touchmove', onMove, { capture: true, passive: false });
      }
      // Oublie les conteneurs retirés de la page.
      armed = armed.filter(function (b) { return b.isConnected; });
    };
    // Les événements « pointer » ne retardent jamais le défilement : sans risque sur toute la page.
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') move(e, e.clientX, e.clientY);
    }, true);
    window.addEventListener('touchend', function () { gesture = null; }, { capture: true, passive: true });
    window.addEventListener('touchcancel', function () { gesture = null; }, { capture: true, passive: true });
    // Une vidéo qui démarre (Reel ouvert depuis un message) : on la mesure aussitôt.
    document.addEventListener('play', function () { afterLayout(false); }, true);
  }

  // --- 6. Fin du fil : « Tu as tout vu » ------------------------------------------
  // Quand beaucoup de comptes suivis publient des Reels (masqués), le fil n'a plus rien à
  // montrer mais se charge sans fin. Le fil d'Instagram est VIRTUALISÉ : seules les
  // publications proches de l'écran sont dans la page, il faut donc juger d'après ce qui
  // est monté et d'après l'écran, pas d'après un compte de toute la liste. Deux cas :
  //  - « fin » : bas RÉEL de la page atteint, avec au moins END_MIN publications masquées
  //    après la dernière visible. Comme la suite peut être en train de charger (réseau lent),
  //    il faut en plus une preuve : une nouvelle page est arrivée et tout y a été masqué, ou
  //    plus rien n'arrive depuis END_QUIET ;
  //  - « vide » : on a défilé, aucune publication visible n'est à l'écran, seulement des
  //    masquées (si Instagram leur garde encore une place).
  // Aucune carte si une vraie publication arrive plus bas, ni pendant qu'une fenêtre d'Instagram
  // est ouverte (menu, partage). L'état doit durer END_DELAY. La carte est un bandeau compact
  // posé PAR-DESSUS la page (dans <body>, hors du contenu géré par le site), au-dessus de la
  // barre d'onglets et à gauche du bouton rond de l'app ; seul son bouton reçoit les touchers.
  if (feedEnd) {
    var END_MIN = 3, END_DELAY = 500, END_QUIET = 2500;
    var card = null, cardTitle = null, cardText = null, shownState = '';
    var endState = '', stateSince = 0, endSince = 0, endMark = 0, endTimer = null;
    var TEXTS = {
      end: ['✓ Tu as tout vu', 'Plus bas, il n’y a que des Reels et des contenus masqués par OneForAll.'],
      void: ['Ici, que des Reels masqués', 'OneForAll les a retirés du fil.'],
    };
    var buildCard = function () {
      var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      var c = document.createElement('div');
      c.id = 'sans-reels-feed-end';
      c.setAttribute('role', 'status');
      c.setAttribute('style',
        'position:fixed;left:12px;right:68px;bottom:104px;z-index:2147483646;display:none;pointer-events:none;' +
        'align-items:center;gap:12px;padding:10px 10px 10px 16px;border-radius:18px;' +
        'font-family:-apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.22);' +
        (dark ? 'background:#211F1C;color:#F2EEE8;' : 'background:#FFFDFA;color:#1F1D1A;'));
      var words = document.createElement('div');
      words.setAttribute('style', 'flex:1;min-width:0');
      cardTitle = document.createElement('div');
      cardTitle.setAttribute('style', 'font-size:16px;font-weight:700;line-height:21px');
      cardText = document.createElement('div');
      cardText.setAttribute('style', 'font-size:13px;line-height:17px;opacity:.75');
      words.appendChild(cardTitle);
      words.appendChild(cardText);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('style',
        'flex:none;pointer-events:auto;min-height:44px;padding:0 14px;border:0;border-radius:22px;font-size:15px;font-weight:600;' +
        (dark ? 'background:#8FBFA9;color:#10201A;' : 'background:#3E6B5A;color:#FFFFFF;'));
      btn.textContent = 'Revenir en haut';
      btn.addEventListener('click', function () {
        var first = document.getElementsByTagName('article')[0];
        if (first && first.scrollIntoView) first.scrollIntoView({ block: 'start', behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      c.appendChild(words);
      c.appendChild(btn);
      return c;
    };
    // Masquée par OneForAll (attribut), ou déjà par le CSS des règles, ou dans une case masquée
    // (dans ces deux cas, aucune boîte).
    var isHidden = function (a) {
      if (a.getAttribute('data-sans-reels') === 'hidden') return true;
      var rects = a.getClientRects();
      return !rects.length || rects[0].height < 1; // repliée par le CSS des règles
    };
    var feedState = function () {
      if (location.pathname !== '/') return '';
      var arts = document.getElementsByTagName('article');
      if (!arts.length) return '';
      var H = window.innerHeight, onScreen = false, hidden = 0, hiddenAfter = 0;
      for (var i = 0; i < arts.length; i++) {
        if (isHidden(arts[i])) { hidden++; hiddenAfter++; continue; }
        hiddenAfter = 0;
        var r = arts[i].getBoundingClientRect();
        if (r.top >= H * 0.9) return ''; // une vraie publication arrive plus bas : pas la fin
        if (r.bottom > H * 0.1) onScreen = true;
      }
      if (!onScreen && hidden && window.scrollY > H * 0.5) return 'void';
      var doc = document.scrollingElement || document.documentElement;
      if (hiddenAfter >= END_MIN && window.scrollY + H >= doc.scrollHeight - 4) return 'end';
      return '';
    };
    // Une fenêtre d'Instagram est ouverte (menu « … », partage) : la carte s'efface le temps
    // qu'elle reste ouverte, sans tout reprendre à zéro.
    var dialogOpen = function () {
      var dialogs = document.querySelectorAll('[role="dialog"]');
      for (var d = 0; d < dialogs.length; d++) if (dialogs[d].getClientRects().length) return true;
      return false;
    };
    checkFeedEnd = function () {
      var now = Date.now(), state = feedState();
      if (!state) stateSince = 0;
      else if (!endState) stateSince = now;
      if (state === 'end' && endState !== 'end') { endSince = now; endMark = hiddenTotal; }
      endState = state;
      var ok = !!state && now - stateSince >= END_DELAY &&
        (state !== 'end' || hiddenTotal > endMark || now - endSince >= END_QUIET);
      // Pas encore prouvé : la carte déjà affichée reste telle quelle (pas de clignotement),
      // et on revient voir quand le délai sera passé, même sans défilement.
      var shown = ok ? state : state && shownState ? shownState : '';
      if (shown && dialogOpen()) shown = '';
      if (state && !ok && !endTimer) {
        var at = state === 'end' ? Math.max(stateSince + END_DELAY, endSince + END_QUIET) : stateSince + END_DELAY;
        endTimer = setTimeout(function () { endTimer = null; endDue = true; needFrame(); }, Math.max(0, at - now) + 20);
      }
      if (shown && !card && document.body) card = buildCard();
      if (card && !card.isConnected && document.body) document.body.appendChild(card);
      if (!card || shown === shownState) return;
      // Textes écrits seulement quand l'état change : les réécrire à chaque mesure faisait des
      // changements dans la page, donc de nouvelles mesures, sans fin.
      if (shown) {
        cardTitle.textContent = TEXTS[shown][0];
        cardText.textContent = TEXTS[shown][1];
      }
      card.style.display = shown ? 'flex' : 'none';
      shownState = shown;
    };
    // Défilement (de la page ou d'un conteneur) : vérifié au plus toutes les 150 ms (pas à
    // chaque image : moins de travail pendant qu'on fait défiler), après le masquage (onFrame).
    var scrollTimer = null;
    window.addEventListener('scroll', function () {
      if (scrollTimer) return;
      scrollTimer = setTimeout(function () { scrollTimer = null; endDue = true; needFrame(); }, 150);
    }, { capture: true, passive: true });
  }

  // d) Filet de sécurité si une navigation nous échappe. Et, s'il y a des vidéos, une
  //    mesure par seconde : une vidéo peut s'agrandir en plein écran (animation) sans
  //    que la page change.
  var lastHref = location.href, ticks = 0;
  setInterval(function () {
    if (document.hidden) return; // page cachée : rien à vérifier (relancé au retour, ci-dessous)
    if (location.href !== lastHref) { lastHref = location.href; run(); }
    else if (armVideos && ++ticks % 2 === 0 && document.getElementsByTagName('video').length) afterLayout(false);
  }, 500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) run(); });

  // Mode sombre de l'iPhone changé : le site change de couleur, la zone du haut aussi.
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      themeQueued = true;
      afterLayout();
    });
  } catch (e) {}

  // Au chargement : toute la page, sans raccourci.
  window.__SANS_REELS__ = { run: function () { run(null, true); } };
  run(null, true);
  document.addEventListener('DOMContentLoaded', function () { run(null, true); });
})();
true;
`;
