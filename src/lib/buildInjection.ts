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
 *   5. si demandé, empêche de glisser d'une vidéo plein écran à la suivante ;
 *   6. signale à l'app un glissement depuis le bord de l'écran (changement d'onglet).
 *
 * Sécurité : les règles viennent d'un fichier téléchargé. Aucun de leurs textes
 * n'est inséré comme du HTML, et chaque redirection est revérifiée après
 * remplacement de $1, $2… (même logique que isSafeTarget, src/lib/urlRules.ts).
 */

type InjectedUrlRule = { pattern: string; redirectTo: string | null; label: string; silent: boolean };

type InjectedConfig = {
  hosts: string[];
  css: string;
  hide: HideRule[];
  rewrite: RewriteLinkRule[];
  urls: InjectedUrlRule[];
  lockFeed: boolean;
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
      rewrite: rules.flatMap((r) => r.rewriteLinks ?? []),
      urls: rules.flatMap((r) => (r.urls ?? []).map((u) => ({ ...u, label: r.label, silent: !!r.silent }))),
      lockFeed: rules.some((r) => r.lockVideoFeed),
    };
  });
}

/** Bords de l'écran qui captent le glissement (pt), et distance à parcourir vers l'intérieur. */
export const EDGE_WIDTH = 22;
export const EDGE_THRESHOLD = 50;

/** Script pour `injectedJavaScriptBeforeContentLoaded` (s'exécute avant la page). */
export function buildInjectedScript(
  platforms: Platform[],
  isEnabled: (ruleId: string) => boolean,
): string {
  return RUNTIME.replace('__CONFIG__', () => JSON.stringify(buildConfig(platforms, isEnabled)))
    .replace(/__EDGE__/g, String(EDGE_WIDTH))
    .replace(/__THRESHOLD__/g, String(EDGE_THRESHOLD));
}

/**
 * Script pour `injectedJavaScript` (après chargement) : relance un nettoyage
 * au cas où le premier script aurait tourné trop tôt.
 */
export const AFTER_LOAD_SCRIPT = `
  if (window.__SANS_REELS__) { window.__SANS_REELS__.run(); }
  true;
`;

// Écrit en JavaScript "classique" (pas de TypeScript ici : c'est exécuté par la page web).
const RUNTIME = `
(function () {
  if (window.__SANS_REELS__) { window.__SANS_REELS__.run(); return; }

  var ALL = __CONFIG__;

  // Envoie un message à l'app (pour afficher "Reel bloqué", etc.).
  function post(msg) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) {}
  }

  // --- 0. Bords de l'écran : glisser vers l'intérieur = onglet suivant / précédent --
  // Détecté ici, dans la page, pour que les appuis près des bords restent aux
  // boutons du site (une zone posée par-dessus la page les avalerait tous).
  var edge = null;
  window.addEventListener('touchstart', function (e) {
    edge = null;
    if (e.touches.length !== 1) return;
    var x = e.touches[0].clientX, W = window.innerWidth;
    if (x <= __EDGE__) edge = { dir: -1, x: x, y: e.touches[0].clientY };
    else if (x >= W - __EDGE__) edge = { dir: 1, x: x, y: e.touches[0].clientY };
  }, { capture: true, passive: true });
  window.addEventListener('touchcancel', function () { edge = null; }, true);
  window.addEventListener('touchend', function (e) {
    var g = edge, t = e.changedTouches && e.changedTouches[0];
    edge = null;
    if (!g || !t) return;
    var dx = t.clientX - g.x, dy = t.clientY - g.y;
    var inward = g.dir === 1 ? -dx : dx;
    if (inward >= __THRESHOLD__ && Math.abs(dy) < Math.abs(dx)) post({ type: 'edgeSwipe', dir: g.dir });
  }, true);

  function hostMatches(host, hosts) {
    for (var i = 0; i < hosts.length; i++) {
      if (host === hosts[i] || host.slice(-hosts[i].length - 1) === '.' + hosts[i]) return true;
    }
    return false;
  }

  // Ne garder que la configuration du site actuel.
  var css = '', hide = [], rewrite = [], urls = [], lockFeed = false;
  for (var i = 0; i < ALL.length; i++) {
    if (!hostMatches(location.hostname, ALL[i].hosts)) continue;
    css += ALL[i].css + '\\n';
    hide = hide.concat(ALL[i].hide);
    rewrite = rewrite.concat(ALL[i].rewrite);
    urls = urls.concat(ALL[i].urls);
    lockFeed = lockFeed || ALL[i].lockFeed;
  }
  if (!css.trim() && !hide.length && !rewrite.length && !urls.length && !lockFeed) return;

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
      var re;
      try { re = new RegExp(urls[i].pattern); } catch (e) { continue; }
      if (!re.test(path)) continue;
      if (urls[i].redirectTo === null) return { block: true, label: urls[i].label };
      var target = path.replace(re, urls[i].redirectTo);
      if (!safeTarget(target) || alreadyThere(path, search, target)) continue;
      if (target.indexOf('?') < 0) target += search || '';
      return { target: target, label: urls[i].label, silent: urls[i].silent };
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

  // Vérifie l'URL actuelle. Renvoie true si on quitte la page.
  function checkUrl() {
    if (leaving) return true;
    var a = urlAction(location.pathname, location.search);
    if (!a) return false;
    if (a.block) { blockPage(a.label); return true; }
    leaving = true;
    if (!a.silent) post({ type: 'redirected', label: a.label });
    location.replace(a.target);
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
  function norm(s) { return (s || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }

  function clean() {
    addStyle();
    for (var i = 0; i < hide.length; i++) {
      var r = hide[i], list;
      try { list = document.querySelectorAll(r.selector); } catch (e) { continue; }
      for (var j = 0; j < list.length; j++) {
        var el = list[j];
        if (r.text && norm(el.textContent) !== norm(r.text)) continue;
        var target = (r.closest && el.closest(r.closest)) || el;
        if (target.getAttribute('data-sans-reels') === 'hidden') continue;
        target.style.setProperty('display', 'none', 'important');
        target.setAttribute('data-sans-reels', 'hidden');
      }
    }
    for (var k = 0; k < rewrite.length; k++) {
      var links;
      try { links = document.querySelectorAll(rewrite[k].selector); } catch (e) { continue; }
      for (var m = 0; m < links.length; m++) {
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

  function run() {
    reportPath();
    reportUnread();
    if (!checkUrl()) clean();
  }

  // Regroupe les nombreux changements de la page en un seul nettoyage.
  var timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; run(); }, 120);
  }

  // --- 4. Surveillance ------------------------------------------------------
  // a) Navigation interne (Instagram/YouTube changent d'URL sans recharger).
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      run();
      return result;
    };
  });
  window.addEventListener('popstate', run);

  // b) Clic sur un lien interdit ou réécrit : on intercepte avant le site.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || a.host !== location.host) return;
    var rewritten = a.getAttribute('data-sans-reels-href');
    var action = rewritten ? { target: rewritten } : urlAction(a.pathname, a.search);
    if (!action || (action.target && !safeTarget(action.target))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (action.block) { post({ type: 'blocked', label: action.label }); return; }
    if (action.label && !action.silent) post({ type: 'redirected', label: action.label });
    location.assign(action.target);
  }, true);

  // c) Contenu ajouté dynamiquement (scroll infini, changement d'onglet…).
  //    On observe document (et pas <html>, qui peut ne pas encore exister).
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });

  // --- 5. Vidéos plein écran : pas de glissement vers la suivante ------------
  // Instagram ouvre un Reel reçu en message PAR-DESSUS la conversation, sans
  // changer d'adresse : les règles d'URL ne voient rien. On repère donc ce qui
  // caractérise un fil de vidéos courtes : une vidéo qui occupe (presque) tout
  // l'écran. Pendant un geste commencé sur elle, le glissement vertical est
  // bloqué, pour la page (défilement natif) comme pour le site (ses propres
  // gestionnaires de geste). Les taps, le glissement horizontal et les
  // panneaux sans vidéo (commentaires…) restent utilisables.
  if (lockFeed) {
    var fullVideo = function () {
      var vids = document.getElementsByTagName('video');
      var W = window.innerWidth, H = window.innerHeight;
      for (var i = 0; i < vids.length; i++) {
        var r = vids[i].getBoundingClientRect();
        // Une vidéo du fil (format 4:5) fait ~60 % de la hauteur : elle n'est pas concernée.
        if (r.width >= W * 0.9 && r.height >= H * 0.75 && r.top < H * 0.5 && r.bottom > H * 0.5) return vids[i];
      }
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
      if (gesture.vertical) e.stopPropagation();
    };
    var touchOpts = { capture: true, passive: false };
    window.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { gesture = null; return; }
      start(e.target, e.touches[0].clientX, e.touches[0].clientY);
    }, touchOpts);
    window.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 1) return;
      move(e, e.touches[0].clientX, e.touches[0].clientY);
    }, touchOpts);
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') move(e, e.clientX, e.clientY);
    }, true);
    window.addEventListener('touchend', function () { gesture = null; }, true);
  }

  // d) Filet de sécurité si une navigation nous échappe.
  var lastHref = location.href;
  setInterval(function () {
    if (location.href !== lastHref) { lastHref = location.href; run(); }
  }, 500);

  window.__SANS_REELS__ = { run: run };
  run();
  document.addEventListener('DOMContentLoaded', run);
})();
true;
`;
