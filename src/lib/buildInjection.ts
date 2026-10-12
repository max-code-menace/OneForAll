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
 */

type InjectedUrlRule = { pattern: string; redirectTo: string | null; label: string };

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
      urls: rules.flatMap((r) => (r.urls ?? []).map((u) => ({ ...u, label: r.label }))),
      lockFeed: rules.some((r) => r.lockVideoFeed),
    };
  });
}

/** Script pour `injectedJavaScriptBeforeContentLoaded` (s'exécute avant la page). */
export function buildInjectedScript(
  platforms: Platform[],
  isEnabled: (ruleId: string) => boolean,
): string {
  return RUNTIME.replace('__CONFIG__', () => JSON.stringify(buildConfig(platforms, isEnabled)));
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

  // Envoie un message à l'app (pour afficher "Reel bloqué", etc.).
  function post(msg) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) {}
  }

  // --- 1. URLs -------------------------------------------------------------
  // Renvoie { block: true } / { target: '/nouveau/chemin' } / null.
  function urlAction(path, search) {
    for (var i = 0; i < urls.length; i++) {
      var re;
      try { re = new RegExp(urls[i].pattern); } catch (e) { continue; }
      if (!re.test(path)) continue;
      if (urls[i].redirectTo === null) return { block: true, label: urls[i].label };
      var target = path.replace(re, urls[i].redirectTo);
      if (target === path) continue;
      if (target.indexOf('?') < 0) target += search || '';
      return { target: target, label: urls[i].label };
    }
    return null;
  }

  var leaving = false;
  function blockPage(label) {
    leaving = true;
    post({ type: 'blocked', label: label });
    var html =
      '<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;font-family:-apple-system,sans-serif;background:#111;color:#fff;text-align:center;padding:24px">' +
      '<div style="font-size:56px">🚫</div><h2>Page bloquée</h2><p style="opacity:.7">' + label + '</p></body>';
    function render() {
      if (document.documentElement) document.documentElement.innerHTML = html;
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
    post({ type: 'redirected', label: a.label });
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

  function run() {
    reportPath();
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
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (action.block) { post({ type: 'blocked', label: action.label }); return; }
    if (action.label) post({ type: 'redirected', label: action.label });
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
    var gesture = null;
    var start = function (target, x, y) {
      gesture = null;
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
        if (dx > 6 || dy > 6) gesture.vertical = dy > dx;
      }
      // Toujours annuler le défilement natif (sinon il démarre avant qu'on ait tranché) ;
      // en vertical, le site ne reçoit pas non plus le geste.
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
