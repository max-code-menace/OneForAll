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
 * nettoyage ne relit que ce qui vient d'apparaître (la page entière au plus toutes les
 * 2 s), cherche chaque sélecteur une seule fois, et mesure les vidéos au moment où le
 * navigateur calcule déjà la mise en page ; aucun écouteur de geste n'est posé sur
 * toute la page (ce qui ferait attendre le script à chaque défilement) : seulement
 * sur une vidéo plein écran.
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
      rewrite: rules.flatMap((r) => r.rewriteLinks ?? []),
      urls: rules.flatMap((r) => (r.urls ?? []).map((u) => ({ ...u, label: r.label, silent: !!r.silent }))),
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
  var hideSels = [], hideBySel = {};
  for (var h = 0; h < hide.length; h++) {
    var hs = hide[h].selector;
    if (!hideBySel[hs]) { hideBySel[hs] = []; hideSels.push(hs); }
    hideBySel[hs].push({ closest: hide[h].closest, text: hide[h].text ? norm(hide[h].text) : null });
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
      // Rechargement seulement si on est toujours sur cette adresse (l'utilisateur a pu repartir).
      if (!reacted && location.href === expected) {
        leaving = true;
        post({ type: 'reloading', why: 'stuck' });
        location.reload();
      }
    }, 800);
  }

  // Vérifie l'URL actuelle. Renvoie true si on quitte (ou change) la page.
  function checkUrl() {
    if (leaving) return true;
    var a = urlAction(location.pathname, location.search);
    if (!a) return false;
    if (a.block) { blockPage(a.label); return true; }
    if (!a.silent) post({ type: 'redirected', label: a.label });
    softGo(a.target, true);
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

  // Éléments qui correspondent au sélecteur : dans toute la page (roots = null), ou
  // seulement dans les morceaux qui viennent d'apparaître (roots = liste d'éléments).
  // Un sélecteur comme « article span » reste juste : matches() et querySelectorAll()
  // tiennent compte des ancêtres, même hors du morceau.
  function find(sel, roots) {
    if (!roots) return document.querySelectorAll(sel);
    var out = [];
    for (var i = 0; i < roots.length; i++) {
      var r = roots[i];
      if (r.matches(sel)) out.push(r);
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

  function clean(roots) {
    addStyle();
    for (var i = 0; i < hideSels.length; i++) {
      var rules = hideBySel[hideSels[i]], list;
      try { list = find(hideSels[i], roots); } catch (e) { continue; }
      for (var j = 0; j < list.length; j++) {
        var el = list[j], txt = null;
        for (var q = 0; q < rules.length; q++) {
          var r = rules[q];
          if (r.text) {
            if (txt === null) txt = norm(el.textContent); // lu une seule fois par élément
            if (txt !== r.text) continue;
          }
          var target = (r.closest && el.closest(r.closest)) || el;
          if (target.getAttribute('data-sans-reels') === 'hidden') continue;
          target.style.setProperty('display', 'none', 'important');
          target.setAttribute('data-sans-reels', 'hidden');
          // Publication entière masquée : on masque aussi la case qui ne contenait qu'elle,
          // sinon le site garde sa place et laisse un grand espace vide dans le fil.
          if (r.closest) {
            var row = rowOf(target);
            if (row !== target) {
              row.style.setProperty('display', 'none', 'important');
              row.setAttribute('data-sans-reels-row', 'hidden');
            }
          }
        }
      }
    }
    for (var k = 0; k < rewrite.length; k++) {
      var links;
      try { links = find(rewrite[k].selector, roots); } catch (e) { continue; }
      for (var m = 0; m < links.length; m++) {
        if (links[m].getAttribute('data-sans-reels-href') === rewrite[k].href) continue; // déjà fait
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

  // roots absent : toute la page (navigation, chargement). Sinon : seulement ces morceaux.
  var lastFull = 0;
  function run(roots) {
    reportPath();
    reportUnread();
    if (!checkUrl()) {
      if (!roots) lastFull = Date.now();
      clean(roots || null);
      afterLayout();
    }
  }
  var armVideos = null; // défini plus bas si le blocage du glissement est actif
  var checkFeedEnd = null; // défini plus bas si « Tu as tout vu » est actif

  // Mesures (taille des vidéos, position du fil) au moment où le navigateur calcule
  // de toute façon la mise en page, juste avant d'afficher : jamais de calcul forcé en plus.
  var frameQueued = false;
  function afterLayout() {
    if (frameQueued || (!armVideos && !checkFeedEnd)) return;
    frameQueued = true;
    requestAnimationFrame(function () {
      frameQueued = false;
      if (armVideos) armVideos();
      if (checkFeedEnd) checkFeedEnd();
    });
  }

  // Regroupe les nombreux changements de la page en un seul nettoyage, limité à ce qui
  // vient d'apparaître (avant : toute la page relue jusqu'à 8 fois par seconde, ce qui
  // coûtait cher sur un long fil). Filet de sécurité : la page entière est relue au plus
  // toutes les 2 s tant qu'elle change (un texte modifié à l'intérieur d'un élément…).
  var FULL_EVERY = 2000, MAX_PENDING = 400;
  var timer = null, pending = [], pendingAll = false;
  function onMutations(list) {
    if (!pendingAll) {
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          // Texte ajouté : c'est son élément parent qui a changé.
          pending.push(added[j].nodeType === 1 ? added[j] : list[i].target);
        }
      }
      if (pending.length > MAX_PENDING) { pendingAll = true; pending = []; }
    }
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      var all = pendingAll || Date.now() - lastFull > FULL_EVERY;
      var roots = all ? null : topRoots(pending);
      pending = [];
      pendingAll = false;
      if (roots && !roots.length) return;
      run(roots);
    }, 120);
  }

  // --- 4. Surveillance ------------------------------------------------------
  // a) Navigation interne (Instagram/YouTube changent d'URL sans recharger).
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      // Juste APRÈS la navigation du site (micro-tâche) : une redirection lancée pendant
      // qu'il change lui-même de page pouvait passer inaperçue de son routeur, et finir
      // en rechargement complet. Toujours avant l'affichage de la page interdite.
      afterSite();
      return result;
    };
  });
  var afterQueued = false;
  function afterSite() {
    if (afterQueued) return;
    afterQueued = true;
    Promise.resolve().then(function () { afterQueued = false; run(); });
  }
  window.addEventListener('popstate', function () { run(); });

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
    softGo(action.target, false);
  }, true);

  // c) Contenu ajouté dynamiquement (scroll infini, changement d'onglet…).
  //    On observe document (et pas <html>, qui peut ne pas encore exister).
  new MutationObserver(onMutations).observe(document, { childList: true, subtree: true });

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
      return r.width >= W * 0.9 && r.height >= H * 0.75 && r.top < H * 0.5 && r.bottom > H * 0.5;
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
  }

  // --- 6. Fin du fil : « Tu as tout vu » ------------------------------------------
  // Quand beaucoup de comptes suivis publient des Reels (masqués), le fil n'a plus
  // rien à montrer mais se charge sans fin. Une fois la dernière publication visible
  // passée, et s'il ne reste après elle que des publications masquées (au moins
  // FEED_END_MIN), une carte l'indique. Elle est posée PAR-DESSUS la page (dans
  // <body>, hors du contenu géré par le site), et disparaît quand on remonte.
  if (feedEnd) {
    var FEED_END_MIN = 12;
    var card = null, endQueued = false;
    var buildCard = function () {
      var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      var c = document.createElement('div');
      c.id = 'sans-reels-feed-end';
      c.setAttribute('role', 'status');
      c.setAttribute('style',
        'position:fixed;left:24px;right:24px;bottom:28%;z-index:2147483646;display:none;' +
        'flex-direction:column;align-items:center;gap:8px;padding:20px;border-radius:20px;text-align:center;' +
        'font-family:-apple-system,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
        (dark ? 'background:#211F1C;color:#F2EEE8;' : 'background:#FFFDFA;color:#1F1D1A;'));
      var title = document.createElement('div');
      title.setAttribute('style', 'font-size:20px;font-weight:700');
      title.textContent = '✓ Tu as tout vu';
      var text = document.createElement('div');
      text.setAttribute('style', 'font-size:15px;line-height:21px;opacity:.75');
      text.textContent = 'Plus bas, il n’y a que des Reels et des contenus masqués par OneForAll.';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('style',
        'margin-top:6px;min-height:44px;padding:0 20px;border:0;border-radius:22px;font-size:16px;font-weight:600;' +
        (dark ? 'background:#8FBFA9;color:#10201A;' : 'background:#3E6B5A;color:#FFFFFF;'));
      btn.textContent = 'Revenir en haut';
      btn.addEventListener('click', function () {
        var first = document.getElementsByTagName('article')[0];
        if (first && first.scrollIntoView) first.scrollIntoView({ block: 'start', behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      c.appendChild(title);
      c.appendChild(text);
      c.appendChild(btn);
      return c;
    };
    checkFeedEnd = function () {
      endQueued = false;
      var show = false;
      if (location.pathname === '/') {
        var arts = document.getElementsByTagName('article'), lastVisible = -1, hiddenAfter = 0;
        for (var i = 0; i < arts.length; i++) {
          if (arts[i].getAttribute('data-sans-reels') === 'hidden') hiddenAfter++;
          else { lastVisible = i; hiddenAfter = 0; }
        }
        if (hiddenAfter >= FEED_END_MIN) {
          show = lastVisible < 0 || arts[lastVisible].getBoundingClientRect().bottom < window.innerHeight * 0.6;
        }
      }
      if (show && !card && document.body) card = buildCard();
      if (card && !card.isConnected && document.body) document.body.appendChild(card);
      if (card) card.style.display = show ? 'flex' : 'none';
    };
    // Défilement (de la page ou d'un conteneur) : vérifié au plus une fois par image, sans freiner.
    window.addEventListener('scroll', function () {
      if (endQueued) return;
      endQueued = true;
      requestAnimationFrame(checkFeedEnd);
    }, { capture: true, passive: true });
  }

  // d) Filet de sécurité si une navigation nous échappe.
  var lastHref = location.href;
  setInterval(function () {
    if (document.hidden) return; // page cachée : rien à vérifier (relancé au retour, ci-dessous)
    if (location.href !== lastHref) { lastHref = location.href; run(); }
  }, 500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) run(); });

  window.__SANS_REELS__ = { run: function () { run(); } };
  run();
  document.addEventListener('DOMContentLoaded', function () { run(); });
})();
true;
`;
