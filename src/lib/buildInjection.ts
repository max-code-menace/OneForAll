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
  var hideSels = [], hideBySel = {}, textSel = {}, maxText = 0;
  for (var h = 0; h < hide.length; h++) {
    var hs = hide[h].selector, ht = hide[h].text ? norm(hide[h].text) : null;
    if (!hideBySel[hs]) { hideBySel[hs] = []; hideSels.push(hs); }
    hideBySel[hs].push({ closest: hide[h].closest, cell: !!hide[h].cell, text: ht });
    if (ht) { textSel[hs] = true; maxText = Math.max(maxText, ht.length); }
  }
  // Un texte bien plus long que le plus long des textes cherchés ne peut pas lui être
  // égal : on ne le normalise pas (légendes de plusieurs lignes…).
  var MAX_RAW = maxText * 2 + 16;

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

  function hideEl(el, attr) {
    el.style.setProperty('display', 'none', 'important');
    el.setAttribute(attr, 'hidden');
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
          hideEl(target, 'data-sans-reels');
          // Publication entière masquée : on masque aussi la case qui ne contenait qu'elle,
          // sinon le site garde sa place et laisse un grand espace vide dans le fil.
          var box = r.closest ? rowOf(target) : r.cell ? cellOf(target) : target;
          if (box !== target) hideEl(box, 'data-sans-reels-row');
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
  function run(roots, deep) {
    reportUnread();
    if (roots) {
      if (leaving) return;
      clean(roots, false);
      afterLayout(false);
      return;
    }
    reportPath();
    if (checkUrl()) return;
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
    if (!pendingAll) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'childList') {
          var added = m.addedNodes;
          for (var j = 0; j < added.length; j++) {
            // Texte ajouté : c'est son élément parent qui a changé.
            pending.push(added[j].nodeType === 1 ? added[j] : m.target);
          }
        } else if (m.type === 'characterData') {
          if (m.target.parentElement) pending.push(m.target.parentElement);
        } else {
          pending.push(m.target); // lien dont l'adresse a changé
        }
      }
      if (pending.length > MAX_PENDING) { pendingAll = true; pending = []; }
    }
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
      var before = location.href;
      var result = original.apply(this, arguments);
      // Juste APRÈS la navigation du site (micro-tâche) : une redirection lancée pendant
      // qu'il change lui-même de page pouvait passer inaperçue de son routeur, et finir
      // en rechargement complet. Toujours avant l'affichage de la page interdite.
      // Seulement si l'adresse a changé : un site peut appeler replaceState sans arrêt
      // (pour retenir la position de défilement…) ; tout relire à chaque fois faisait
      // accrocher le défilement.
      if (location.href !== before) afterSite();
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
    // Déjà sur cette page (ex. loupe touchée sur la recherche) : on remonte en haut, comme
    // l'app, au lieu d'empiler la même page dans l'historique (2 retours pour en sortir).
    if (alreadyThere(location.pathname, location.search, action.target)) {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { window.scrollTo(0, 0); }
      return;
    }
    if (action.label && !action.silent) post({ type: 'redirected', label: action.label });
    softGo(action.target, false);
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
  // Quand beaucoup de comptes suivis publient des Reels (masqués), le fil n'a plus
  // rien à montrer mais se charge sans fin. Une fois la dernière publication visible
  // passée, et s'il ne reste après elle que des publications masquées (au moins
  // FEED_END_MIN), une carte l'indique. Elle est posée PAR-DESSUS la page (dans
  // <body>, hors du contenu géré par le site), et disparaît quand on remonte.
  if (feedEnd) {
    var FEED_END_MIN = 12;
    var card = null;
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
    // Défilement (de la page ou d'un conteneur) : vérifié au plus une fois par image, sans
    // freiner, après le masquage de cette image (voir onFrame).
    window.addEventListener('scroll', function () {
      endDue = true;
      needFrame();
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
