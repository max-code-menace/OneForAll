/**
 * Test du script injecté, dans un vrai navigateur (Chromium via Playwright),
 * sur de fausses pages Instagram / YouTube.
 *
 * Lancer :  npm run test:inject
 * (nécessite Playwright : `npm i -D playwright` ou une installation globale ;
 *  sans lui le test ÉCHOUE, sauf avec SANS_NAVIGATEUR=1 pour ne lancer que la 1re partie)
 *
 * Ça ne prouve pas que les sélecteurs collent au HTML ACTUEL d'Instagram
 * (seul un test sur iPhone le dit), mais ça vérifie que le moteur fonctionne :
 * masquage, MutationObserver, redirections, navigation interne, blocage.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const ts = require('typescript');

// Permet de faire require() des fichiers .ts du projet.
require.extensions['.ts'] = (module, filename) => {
  const src = fs.readFileSync(filename, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(out.outputText, filename);
};

const { DEFAULT_PLATFORMS: PLATFORMS } = require('../src/rules/index.ts');
const { mergeRemoteRules, sanitizePlatform } = require('../src/rules/validate.ts');
const ALL_RULES = PLATFORMS.flatMap((p) => p.rules);
const { buildInjectedScript } = require('../src/lib/buildInjection.ts');
const { findUrlAction, isSafeTarget } = require('../src/lib/urlRules.ts');
const { findBannedSite } = require('../src/lib/banned.ts');

const defaults = (id) => ALL_RULES.find((r) => r.id === id).defaultEnabled;

// ---------------------------------------------------------------------------
// 1. Logique d'URL côté React Native (pas besoin de navigateur)
// ---------------------------------------------------------------------------
function urlTests() {
  const t = (url) => {
    const a = findUrlAction(PLATFORMS, url, defaults);
    return a && (a.type === 'block' ? 'BLOCK' : a.url);
  };
  assert.equal(t('https://www.instagram.com/reels/'), 'https://www.instagram.com/');
  assert.equal(t('https://www.instagram.com/reels/C123/'), 'https://www.instagram.com/');
  assert.equal(t('https://www.instagram.com/reel/C123/?igsh=x'), 'https://www.instagram.com/?igsh=x');
  assert.equal(t('https://www.instagram.com/explore/'), 'https://www.instagram.com/explore/search/');
  assert.equal(t('https://www.instagram.com/martin/reels/'), 'https://www.instagram.com/martin/');
  assert.equal(t('https://www.instagram.com/martin/'), null);
  assert.equal(t('https://www.instagram.com/'), 'https://www.instagram.com/?variant=following');
  assert.equal(t('https://www.instagram.com/?variant=following'), null); // pas de boucle
  assert.equal(t('https://www.instagram.com/?hl=fr&variant=following'), null);
  assert.equal(t('https://www.instagram.com/reelsfan/'), null); // pseudo qui commence par "reels"
  assert.equal(t('https://www.instagram.com/direct/inbox/'), null);
  assert.equal(t('https://www.instagram.com/p/ABC/'), null);
  assert.equal(t('https://www.instagram.com/explore/search/'), null);
  assert.equal(t('https://m.youtube.com/shorts/abc123?feature=share'), 'https://m.youtube.com/watch?v=abc123');
  assert.equal(t('https://m.youtube.com/watch?v=abc123'), null);
  assert.equal(t('https://example.com/reels/'), null);
  // Règle désactivée => plus de redirection.
  assert.equal(findUrlAction(PLATFORMS, 'https://www.instagram.com/reels/', () => false), null);
  // Facebook : les Reels renvoient au fil ; une vidéo normale (/watch/?v=…) reste visible.
  assert.equal(t('https://m.facebook.com/reel/123456/'), 'https://m.facebook.com/');
  assert.equal(t('https://www.facebook.com/reels/'), 'https://www.facebook.com/');
  assert.equal(t('https://m.facebook.com/watch/?v=123'), null);
  assert.equal(t('https://m.facebook.com/reelsfan/'), null);
  assert.equal(t('https://m.facebook.com/messages/'), null);
  assert.deepEqual(PLATFORMS.map((p) => p.id), ['instagram', 'youtube', 'facebook']);

  // Une règle qui échapperait à la validation ne peut pas envoyer vers un autre site :
  // la cible est revérifiée après remplacement de $1.
  const evil = [{ ...PLATFORMS[0], rules: [{ id: 'ig.x', label: 'x', defaultEnabled: true,
    urls: [{ pattern: '^(/)fuite/$', redirectTo: '/$1evil.example/' }] }] }];
  assert.equal(findUrlAction(evil, 'https://www.instagram.com/fuite/', () => true), null, 'pas de sortie vers //evil');
  for (const t of ['/', '/a/b?c=1', '/watch?v=x']) assert.equal(isSafeTarget(t), true, t);
  for (const t of ['//evil.example/', '/\\evil.example/', 'https://evil.example/', 'evil', '/a b']) {
    assert.equal(isSafeTarget(t), false, t);
  }

  // Couleur envoyée par la page : seuls trois nombres sont gardés, le reste est refusé.
  const { parseSiteColor } = require('../src/lib/siteColor.ts');
  assert.deepEqual(parseSiteColor('#fff'), { css: 'rgb(255, 255, 255)', dark: false });
  assert.deepEqual(parseSiteColor('#000000'), { css: 'rgb(0, 0, 0)', dark: true });
  assert.deepEqual(parseSiteColor('rgb(15, 15, 15)'), { css: 'rgb(15, 15, 15)', dark: true });
  assert.deepEqual(parseSiteColor('rgba(255, 255, 255, 0.98)'), { css: 'rgb(255, 255, 255)', dark: false });
  for (const bad of ['rgba(0, 0, 0, 0)', 'transparent', 'red', 'rgb(300, 0, 0)', 'url(x)', '#12345', 12, null, 'x'.repeat(50)]) {
    assert.equal(parseSiteColor(bad), null, String(bad));
  }

  // TikTok est banni, partout, y compris via les liens courts. Les noms qui y ressemblent ne le sont pas.
  const banned = (u) => findBannedSite(u);
  for (const u of [
    'https://www.tiktok.com/@someone/video/1',
    'https://tiktok.com/',
    'https://vm.tiktok.com/ZMabc/',
    'https://vt.tiktok.com/ZSabc/',
    'https://m.tiktok.com/v/123',
    'https://www.tiktokv.com/x',
    'https://WWW.TIKTOK.COM:443/foo',
  ]) assert.equal(banned(u), 'TikTok', `devrait être banni : ${u}`);
  for (const u of [
    'https://www.instagram.com/',
    'https://m.youtube.com/watch?v=x',
    'https://nottiktok.com/',
    'https://tiktok.com.evil.example/',
    'https://example.com/?u=https://www.tiktok.com/',
    'about:blank',
  ]) assert.equal(banned(u), null, `ne devrait pas être banni : ${u}`);
  console.log('✓ règles d’URL (React Native) et sites bannis');
}

// ---------------------------------------------------------------------------
// 1 bis. Validation des fichiers de règles (ceux qui seront téléchargés)
// ---------------------------------------------------------------------------
function validationTests() {
  const rawOf = (id) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'rules', id + '.json'), 'utf8'));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const base = (id) => PLATFORMS.find((p) => p.id === id);

  // Les fichiers du dépôt sont valides, et css en liste de lignes est bien rassemblé.
  for (const p of PLATFORMS) mergeRemoteRules(p, rawOf(p.id));
  assert.match(base('instagram').rules.find((x) => x.id === 'ig.reelsTab').css, /display: none !important;/);

  const bad = (label, id, mutate) => {
    const raw = clone(rawOf(id));
    mutate(raw);
    assert.throws(() => mergeRemoteRules(base(id), raw), `devrait être refusé : ${label}`);
  };
  bad('CSS avec url()', 'instagram', (r) => (r.rules[0].css = ['a { background: url(https://evil.example/x) }']));
  bad('CSS avec @import', 'instagram', (r) => (r.rules[0].css = ['@import "https://evil.example/x.css";']));
  bad('redirection hors site', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.reelsRedirect').urls[0].redirectTo = '//evil.example/'));
  bad('redirection https', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.reelsRedirect').urls[0].redirectTo = 'https://evil.example/'));
  bad('regex invalide', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.reelsRedirect').urls[0].pattern = '('));
  bad('lien réécrit hors site', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.explore').rewriteLinks[0].href = 'https://evil.example/'));
  bad('version de format inconnue', 'instagram', (r) => (r.schemaVersion = 2));
  bad('mauvaise plateforme', 'instagram', (r) => (r.id = 'youtube'));
  bad('id de règle en double', 'instagram', (r) => (r.rules[1].id = r.rules[0].id));
  bad('id de règle invalide', 'instagram', (r) => (r.rules[0].id = 'x y'));
  bad('defaultEnabled absent', 'instagram', (r) => delete r.rules[0].defaultEnabled);
  // Attaques trouvées par l'audit : chacune doit être refusée.
  bad('libellé avec du HTML', 'instagram', (r) => (r.rules[0].label = '<img src=x onerror="alert(1)">'));
  bad('description avec du HTML', 'instagram', (r) => (r.rules[0].description = '<b>x</b>'));
  bad('CSS url() déguisé', 'instagram', (r) => (r.rules[0].css = ['a { background: \\75 rl(https://evil.example/x) }']));
  bad('CSS @font-face', 'instagram', (r) => (r.rules[0].css = ['@font-face { font-family: x }']));
  bad('CSS image()', 'instagram', (r) => (r.rules[0].css = ['a { background: image("x.png") }']));
  bad('redirection avec $&', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.reelsRedirect').urls[0].redirectTo = '/$&evil.example/'));
  bad('redirection avec $`', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.reelsRedirect').urls[0].redirectTo = '/$`x'));
  bad('regex qui peut tourner sans fin', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.reelsRedirect').urls[0].pattern = '^/(a+)+$'));
  bad('regex qui peut tourner sans fin (2)', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.reelsRedirect').urls[0].pattern = '^/(?:.*)*x$'));
  bad('référence arrière', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.reelsRedirect').urls[0].pattern = '^/(a)\\1$'));
  bad('silent pas vrai/faux', 'instagram', (r) => (r.rules[0].silent = 'oui'));
  bad('reload pas vrai/faux', 'instagram', (r) => (r.rules[0].reload = 'oui'));
  bad('cell pas vrai/faux', 'instagram', (r) => (r.rules.find((x) => x.id === 'ig.reelsTab').hide[0].cell = 'oui'));
  assert.equal(base('instagram').rules.find((x) => x.id === 'ig.reelsTab').hide[0].cell, true);
  // Les redirections du dépôt ($1 compris) restent acceptées.
  assert.equal(base('instagram').rules.find((x) => x.id === 'ig.profileReels').urls[0].redirectTo, '/$1/');
  assert.equal(base('instagram').rules.find((x) => x.id === 'ig.followingFeed').silent, true);
  assert.throws(() => mergeRemoteRules(base('instagram'), 'n importe quoi'));
  assert.throws(() => mergeRemoteRules(base('instagram'), null));

  // Un fichier distant ne peut pas changer l'adresse, les domaines ni le user-agent de l'app.
  const sneaky = clone(rawOf('instagram'));
  sneaky.startUrl = 'https://evil.example/';
  sneaky.hosts = ['evil.example'];
  sneaky.rules[0].evilField = 'ignoré';
  const merged = mergeRemoteRules(base('instagram'), sneaky);
  assert.equal(merged.startUrl, 'https://www.instagram.com/');
  assert.deepEqual(merged.hosts, ['instagram.com']);
  assert.equal('evilField' in merged.rules[0], false);
  assert.throws(() => sanitizePlatform({ ...clone(rawOf('instagram')), startUrl: 'http://pas-https.example/' }));
  console.log('✓ validation des règles distantes (fichiers dangereux refusés)');
}

// ---------------------------------------------------------------------------
// 2. Script injecté, dans Chromium
// ---------------------------------------------------------------------------
const PAGES = {
  'www.instagram.com': `
    <nav>
      <a id="home" href="/">Accueil</a>
      <a id="explore" href="/explore/">Explore</a>
      <a id="reels" href="/reels/">Reels</a>
      <a id="dm" href="/direct/inbox/">DMs</a>
    </nav>
    <main id="main">
      <article id="post"><a href="/p/AAA/">photo</a></article>
      <article id="reelpost"><a href="/reel/BBB/">reel</a></article>
      <div id="grid"><a id="gridpost" href="/p/CCC/">p</a><a id="gridreel" href="/reel/DDD/">r</a></div>
      <a id="profileReelsTab" role="tab" href="/martin/reels/">Reels</a>
    </main>`,
  'm.youtube.com': `
    <ytm-pivot-bar-renderer>
      <ytm-pivot-bar-item-renderer id="tabHome"><span>Accueil</span></ytm-pivot-bar-item-renderer>
      <ytm-pivot-bar-item-renderer id="tabShorts"><span> Shorts </span></ytm-pivot-bar-item-renderer>
    </ytm-pivot-bar-renderer>
    <ytm-chip-cloud-chip-renderer id="chipShorts">Shorts</ytm-chip-cloud-chip-renderer>
    <ytm-reel-shelf-renderer id="shelf">shorts…</ytm-reel-shelf-renderer>
    <ytm-rich-item-renderer id="video"><a href="/watch?v=x">vidéo</a></ytm-rich-item-renderer>
    <ytm-rich-item-renderer id="short"><a href="/shorts/y">short</a></ytm-rich-item-renderer>`,
};

async function browserTests() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    if (process.env.SANS_NAVIGATEUR === '1') {
      console.log('⚠ SANS_NAVIGATEUR=1 : tests navigateur ignorés.');
      return;
    }
    // Ne pas afficher « réussi » si la moitié des tests n'a pas tourné.
    throw new Error('Playwright absent : installe-le (npm i -D playwright) ou lance avec SANS_NAVIGATEUR=1.');
  }
  const browser = await chromium.launch();

  // Le fil « Abonnements » ajoute une redirection de « / » : testé à part, plus bas.
  const noFollow = (id) => id !== 'ig.followingFeed' && defaults(id);
  async function open(url, isEnabled = noFollow) {
    const page = await browser.newPage();
    // Toutes les requêtes reçoivent nos fausses pages (aucun accès réseau).
    await page.route('**/*', (route) => {
      const host = new URL(route.request().url()).host;
      route.fulfill({ contentType: 'text/html', body: `<html><head></head><body>${PAGES[host] ?? ''}</body></html>` });
    });
    // Fait semblant d'être la WebView de l'app : on garde les messages envoyés à l'app.
    await page.addInitScript(() => {
      window.__msgs = [];
      window.ReactNativeWebView = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };
    });
    // Équivalent de injectedJavaScriptBeforeContentLoaded.
    await page.addInitScript(buildInjectedScript(PLATFORMS, isEnabled));
    await page.goto(url);
    await page.waitForTimeout(250);
    return page;
  }
  const hidden = (page, sel) =>
    page.$eval(sel, (el) => getComputedStyle(el).display === 'none' || !el.offsetParent);
  const pathOf = (page) => new URL(page.url()).pathname + new URL(page.url()).search;

  // --- Instagram ---
  let page = await open('https://www.instagram.com/');
  assert.equal(await hidden(page, '#reels'), true, 'onglet Reels masqué');
  assert.equal(await hidden(page, '#dm'), false, 'DMs visibles');
  assert.equal(await hidden(page, '#reelpost'), true, 'Reel du fil masqué');
  assert.equal(await hidden(page, '#post'), false, 'post normal visible');
  assert.equal(await hidden(page, '#gridreel'), true, 'Reel de la grille masqué');
  assert.equal(await hidden(page, '#gridpost'), false, 'post de la grille visible');
  assert.equal(await hidden(page, '#profileReelsTab'), true, 'onglet Reels du profil masqué');
  assert.equal(await page.getAttribute('#explore', 'href'), '/explore/search/', 'Explore -> recherche');

  // Changements de la page (scroll infini, texte ou lien mis à jour) : traités AVANT la
  // prochaine image affichée, donc jamais visibles, même un instant. On fait le changement,
  // puis on regarde juste après l'image suivante.
  const atNextFrame = (p, change, sel) =>
    p.evaluate(
      ([change, sel]) => {
        new Function(change)();
        return new Promise((done) =>
          requestAnimationFrame(() => setTimeout(() => done(getComputedStyle(document.querySelector(sel)).display === 'none'), 0)),
        );
      },
      [change, sel],
    );
  assert.equal(
    await atNextFrame(page, `const a = document.createElement('article'); a.id = 'late';
      a.innerHTML = '<a href="/reel/EEE/">reel</a>'; document.getElementById('main').appendChild(a);`, '#late'),
    true,
    'Reel chargé dynamiquement masqué avant la prochaine image',
  );
  // Un texte « Sponsorisé » ajouté DANS une publication déjà là…
  await page.evaluate(() => {
    const a = document.createElement('article');
    a.id = 'adLater';
    a.innerHTML = '<span>Martin</span>';
    document.getElementById('main').appendChild(a);
  });
  await page.waitForTimeout(100);
  assert.equal(await hidden(page, '#adLater'), false, 'publication normale visible');
  assert.equal(
    await atNextFrame(page, `const s = document.createElement('span'); s.textContent = 'Sponsorisé';
      document.getElementById('adLater').appendChild(s);`, '#adLater'),
    true,
    'pub ajoutée dans une publication existante masquée',
  );
  // …un texte changé à l'intérieur d'un élément (<b> dans le <span> visé)…
  await page.evaluate(() => {
    const a = document.createElement('article');
    a.id = 'adText';
    a.innerHTML = '<span><b>Spon</b></span>';
    const b = document.createElement('article');
    b.id = 'adText2';
    b.innerHTML = '<span><b>Martin</b></span>';
    document.getElementById('main').append(a, b);
  });
  await page.waitForTimeout(100);
  assert.equal(await hidden(page, '#adText'), false, 'pas encore une pub');
  assert.equal(
    await atNextFrame(page, `document.querySelector('#adText b').appendChild(document.createTextNode('sorisé'));`, '#adText'),
    true,
    'texte ajouté dans un élément : masqué',
  );
  assert.equal(
    await atNextFrame(page, `document.querySelector('#adText2 b').firstChild.nodeValue = 'Sponsorisé';`, '#adText2'),
    true,
    'texte modifié sur place : masqué',
  );
  // …et un lien qui change d'adresse (React réutilise l'élément).
  await page.evaluate(() => {
    const a = document.createElement('article');
    a.id = 'hrefLater';
    a.innerHTML = '<a href="/p/ZZZ/">photo</a><a id="exploreLater" href="/p/Q/">x</a>';
    document.getElementById('main').appendChild(a);
  });
  await page.waitForTimeout(100);
  assert.equal(await hidden(page, '#hrefLater'), false, 'photo visible');
  assert.equal(
    await atNextFrame(page, `document.querySelector('#hrefLater a').setAttribute('href', '/reel/ZZZ/');`, '#hrefLater'),
    true,
    'lien devenu un Reel : publication masquée',
  );
  await page.evaluate(() => document.getElementById('exploreLater').setAttribute('href', '/explore/'));
  await page.waitForTimeout(100);
  assert.equal(await page.getAttribute('#exploreLater', 'href'), '/explore/search/', 'lien devenu Explore : réécrit');

  // Un site qui appelle replaceState sans changer d'adresse (position de défilement…) :
  // rien n'est relu. Avant, toute la page était relue à chaque appel (le défilement accrochait).
  const fullScans = await page.evaluate(async () => {
    let n = 0;
    const orig = Document.prototype.querySelectorAll;
    Document.prototype.querySelectorAll = function (...args) {
      n++;
      return orig.apply(this, args);
    };
    for (let i = 0; i < 50; i++) history.replaceState({ scroll: i }, '', location.href);
    await new Promise((r) => setTimeout(r, 100));
    Document.prototype.querySelectorAll = orig;
    return n;
  });
  assert.equal(fullScans, 0, `replaceState sans changement d'adresse : aucune relecture (${fullScans})`);

  // Navigation interne (pushState) vers /reels/ => retour accueil.
  await page.evaluate(() => history.pushState({}, '', '/reels/'));
  await page.waitForURL('https://www.instagram.com/');
  // Le mode diagnostic reçoit le chemin de la page, y compris après une navigation interne.
  await page.evaluate(() => history.pushState({}, '', '/p/AAA/'));
  await page.waitForTimeout(300);
  const paths = (await page.evaluate(() => window.__msgs)).filter((m) => m.type === 'path').map((m) => m.path);
  assert.ok(paths.includes('/p/AAA/'), `chemin signalé : ${paths}`);
  // Messages non lus : lus dans le titre de la page (« (3) Instagram ») et signalés à l'app.
  await page.evaluate(() => (document.title = '(3) Instagram'));
  await page.waitForTimeout(400);
  const unread = (await page.evaluate(() => window.__msgs)).filter((m) => m.type === 'unread').map((m) => m.count);
  assert.equal(unread[unread.length - 1], 3, `non lus signalés : ${unread}`);
  // Clic sur un lien vers un Reel => intercepté.
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.id = 'dmReel';
    a.href = '/reel/FFF/';
    a.textContent = 'reel envoyé en DM';
    document.body.appendChild(a);
  });
  await page.click('#dmReel');
  await page.waitForTimeout(300);
  assert.equal(pathOf(page), '/', 'clic sur un Reel intercepté');
  await page.close();

  for (const [from, to] of [
    ['/reels/', '/'],
    ['/reel/ZZZ/', '/'],
    ['/explore/', '/explore/search/'],
    ['/martin/reels/', '/martin/'],
  ]) {
    page = await open('https://www.instagram.com' + from);
    await page.waitForTimeout(200);
    assert.equal(pathOf(page), to, `${from} -> ${to}`);
    await page.close();
  }

  // Fil « Abonnements » : « / » devient « /?variant=following », une seule fois (pas de boucle).
  page = await open('https://www.instagram.com/', defaults);
  let loads = 0;
  page.on('load', () => loads++);
  await page.waitForTimeout(1200);
  assert.equal(pathOf(page), '/?variant=following', 'accueil -> fil Abonnements');
  assert.equal(loads, 0, 'pas de redirection en boucle');
  assert.equal(
    (await page.evaluate(() => window.__msgs)).some((m) => m.type === 'redirected'),
    false,
    'fil Abonnements : pas de bandeau à chaque retour à l’accueil',
  );
  await page.close();

  // --- Règles piégées qui auraient échappé à la validation : le moteur tient bon ---
  async function openWith(platforms, url) {
    const p = await browser.newPage();
    const requested = [];
    await p.route('**/*', (route) => {
      requested.push(route.request().url());
      route.fulfill({ contentType: 'text/html', body: '<html><head></head><body><a id="l" href="/fuite/">x</a></body></html>' });
    });
    await p.addInitScript(() => {
      window.__msgs = [];
      window.ReactNativeWebView = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };
    });
    await p.addInitScript(buildInjectedScript(platforms, () => true));
    await p.goto(url);
    await p.waitForTimeout(400);
    return { p, requested };
  }
  const trap = [{ ...PLATFORMS[0], rules: [
    { id: 'ig.x', label: '<img src=x onerror="window.__pwned=1">', defaultEnabled: true, urls: [{ pattern: '^/bloque/$', redirectTo: null }] },
    { id: 'ig.y', label: 'y', defaultEnabled: true, urls: [{ pattern: '^(/)fuite/$', redirectTo: '/$1evil.example/' }] },
  ] }];
  let r = await openWith(trap, 'https://www.instagram.com/bloque/');
  assert.equal(await r.p.evaluate(() => window.__pwned), undefined, 'libellé jamais exécuté comme du code');
  assert.match(await r.p.evaluate(() => document.body.textContent), /Page bloquée/, 'page bloquée affichée');
  assert.match(await r.p.evaluate(() => document.body.textContent), /<img/, 'libellé affiché comme simple texte');
  await r.p.close();
  r = await openWith(trap, 'https://www.instagram.com/fuite/');
  assert.equal(new URL(r.p.url()).host, 'www.instagram.com', 'pas de sortie vers un autre site');
  await r.p.click('#l');
  await r.p.waitForTimeout(300);
  assert.equal(new URL(r.p.url()).host, 'www.instagram.com', 'clic : pas de sortie vers un autre site');
  assert.equal(r.requested.some((u) => u.includes('evil.example')), false, 'aucune requête vers evil');
  await r.p.close();

  // Publicités : un post « Sponsorisé » est masqué, un post normal reste.
  page = await open('https://www.instagram.com/p/AAA/');
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend',
      '<article id="ad"><header><span>marque</span><span>Sponsorisé</span></header></article>' +
      '<article id="friend"><header><span>martin</span><span>Paris</span></header></article>');
  });
  await page.waitForTimeout(300);
  assert.equal(await hidden(page, '#ad'), true, 'publicité masquée');
  assert.equal(await hidden(page, '#friend'), false, 'post d’un ami visible');
  await page.close();

  // Barre d'onglets : la case du Reels disparaît entièrement, sans laisser de trou.
  page = await open('https://www.instagram.com/p/AAA/');
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend',
      '<div id="bar" style="display:flex;justify-content:space-around;width:300px">' +
      ['/', '/explore/', '/reels/', '/direct/inbox/', '/martin/'].map((h, i) =>
        '<div class="slot" id="slot' + i + '" style="flex:1"><span><a href="' + h + '">' + i + '</a></span>' +
        (i === 2 ? '<span class="badge">•</span>' : '') + '</div>').join('') +
      '</div>' +
      '<div id="mixed"><div id="mixedCell"><a href="/reels/">r</a><a id="other" href="/p/X/">p</a></div></div>');
  });
  await page.waitForTimeout(200);
  assert.equal(await hidden(page, '#slot2'), true, 'case Reels masquée en entier');
  assert.equal(await hidden(page, '#slot1'), false, 'case Recherche visible');
  assert.equal(await hidden(page, '#bar'), false, 'barre visible');
  const widths = await page.$$eval('#bar > .slot', (els) => els.filter((e) => e.offsetParent).map((e) => e.offsetWidth));
  assert.deepEqual(widths, [75, 75, 75, 75], `4 onglets de même largeur, sans trou (${widths})`);
  assert.equal(await hidden(page, '#mixedCell'), false, 'une case qui contient un autre lien reste');
  assert.equal(await hidden(page, '#other'), false, 'l’autre lien reste visible');
  await page.close();

  // --- Fil plein de Reels : pas d'espace vide, puis « Tu as tout vu » ---
  // Chaque publication est dans une case de hauteur fixe (comme une liste qui réserve la place).
  page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: `<html><head></head><body style="margin:0">
    <main><div id="list">
      <div class="row" id="row0" style="min-height:500px"><article id="p0"><a href="/p/A/">photo</a></article></div>
      <div class="row" id="row1" style="min-height:500px"><article id="p1"><a href="/p/B/">photo</a></article></div>
      ${Array.from({ length: 15 }, (_, i) => `<div class="row" id="reelrow${i}" style="min-height:500px"><article><a href="/reel/R${i}/">reel</a></article></div>`).join('')}
    </div></main></body></html>` }));
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
  await page.addInitScript(buildInjectedScript(PLATFORMS, noFollow));
  await page.goto('https://www.instagram.com/');
  await page.waitForTimeout(300);
  assert.equal(await hidden(page, '#reelrow0'), true, 'la case du Reel masqué ne laisse pas d’espace vide');
  assert.equal(await hidden(page, '#row1'), false, 'la case d’une photo reste');
  assert.equal(await page.evaluate(() => document.getElementById('list').offsetHeight), 1000, 'le fil ne fait que la hauteur des photos');
  const cardShown = () => page.evaluate(() => {
    const c = document.getElementById('sans-reels-feed-end');
    return !!c && getComputedStyle(c).display !== 'none';
  });
  assert.equal(await cardShown(), false, 'pas de carte tant qu’on voit encore des photos');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  assert.equal(await cardShown(), false, 'pas de carte tout de suite (elle attend 0,5 s, pas de clignotement)');
  await page.waitForTimeout(600);
  assert.equal(await cardShown(), true, '« Tu as tout vu » après la dernière photo');
  assert.match(await page.textContent('#sans-reels-feed-end'), /Tu as tout vu/);
  await page.click('#sans-reels-feed-end button');
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.scrollY), 0, '« Revenir en haut » remonte');
  assert.equal(await cardShown(), false, 'la carte disparaît en haut du fil');
  await page.close();

  // --- Fil VIRTUALISÉ (comme Instagram) : un Reel masqué ne doit pas garder sa place ---
  // Faux fils de scripts/fake-feed.cjs : le site mesure chaque publication dès qu'il l'ajoute
  // (avant le script) et réserve cette place quand elle sort de l'écran (V1 : espaceurs,
  // V2 : positions absolues). 3 photos séparées par des séries de Reels (6, 10, puis 30).
  const { feedPage } = require('./fake-feed.cjs');
  const withoutFeedCss = PLATFORMS.map((p) =>
    p.id !== 'instagram' ? p : { ...p, rules: p.rules.map((r) => (r.id === 'ig.feedReels' ? { ...r, css: undefined } : r)) },
  );
  async function virtualFeed(platforms, mode, list) {
    const p = await browser.newPage({ viewport: { width: 390, height: 760 } });
    await p.route('**/*', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: feedPage(mode, list) }));
    await p.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
    await p.addInitScript(buildInjectedScript(platforms, noFollow));
    await p.goto('https://www.instagram.com/');
    await p.waitForTimeout(600);
    // Comme l'utilisateur : descendre jusqu'en bas, plusieurs fois, en laissant charger.
    for (let i = 0, prev = -1, stable = 0; i < 40 && stable < 2; i++) {
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await p.waitForTimeout(400);
      const [h, st] = await p.evaluate(() => [document.documentElement.scrollHeight, window.__feed.stats()]);
      stable = h === prev && st.loaded >= st.total ? stable + 1 : 0;
      prev = h;
    }
    return p;
  }
  // Balayage de haut en bas : quelles publications visibles passent à l'écran, et combien
  // d'écrans sans aucune publication visible (le « vide ») ?
  async function sweep(p) {
    const seen = new Set();
    let empty = 0;
    for (let y = 0; ; y += 300) {
      const r = await p.evaluate(async (y) => {
        window.scrollTo(0, y);
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const H = innerHeight;
        const on = [...document.getElementsByTagName('article')]
          .filter((a) => a.getClientRects().length && a.getAttribute('data-sans-reels') !== 'hidden')
          .filter((a) => { const b = a.getBoundingClientRect(); return b.bottom > 44 && b.top < H - 50; })
          .map((a) => a.getAttribute('data-id'));
        return { on, y: scrollY, max: document.documentElement.scrollHeight - H };
      }, y);
      r.on.forEach((id) => seen.add(id));
      if (!r.on.length) empty++;
      if (r.y >= r.max - 1) break;
    }
    return { seen: [...seen].sort(), empty };
  }
  for (const mode of ['V1', 'V2']) {
    // Témoin : sans le CSS de ig.feedReels, le faux fil reproduit bien le vide de l'iPhone.
    page = await virtualFeed(withoutFeedCss, mode, 'fin');
    const witness = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.ok(witness > 10000, `${mode} témoin : grand vide sans le CSS (${witness} px)`);
    await page.close();
    // Avec les règles : le fil s'arrête sous la dernière photo, et les photos qui suivent
    // une série de Reels apparaissent bien (sans le CSS, elles restaient hors de l'écran en V1).
    page = await virtualFeed(PLATFORMS, mode, 'mixte');
    const sw = await sweep(page);
    assert.deepEqual(sw.seen, ['P0', 'P18', 'P7'], `${mode} : les 3 photos passent à l'écran (${sw.seen})`);
    assert.ok(sw.empty <= 1, `${mode} : pas de vide dans le fil (${sw.empty} écrans vides)`);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.ok(h < 3500, `${mode} : la page s'arrête après la dernière photo (${h} px)`);
    // En bas : la carte de fin (sur un fil virtualisé, l'ancienne condition ne la montrait jamais).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(800);
    assert.match(
      await page.evaluate(() => { const c = document.getElementById('sans-reels-feed-end'); return c && getComputedStyle(c).display !== 'none' ? c.textContent : ''; }),
      /Tu as tout vu/,
      `${mode} : « Tu as tout vu » en bas du fil`,
    );
    await page.close();
  }
  // Si Instagram gardait quand même une place (hauteurs tirées de ses données, V4) : au milieu
  // du vide, une carte le dit, avec « Revenir en haut ».
  page = await virtualFeed(PLATFORMS, 'V4', 'fin');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await page.waitForTimeout(800);
  assert.match(
    await page.evaluate(() => { const c = document.getElementById('sans-reels-feed-end'); return c && getComputedStyle(c).display !== 'none' ? c.textContent : ''; }),
    /que des Reels masqués/,
    'V4 : carte dans le vide',
  );
  await page.close();

  // --- Publication RÉUTILISÉE par Instagram (même <article>, autre contenu) ---
  page = await open('https://www.instagram.com/p/AAA/');
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend',
      '<article id="recy"><a href="/u/">u</a><a href="/reel/R1/">reel</a></article>' +
      '<article id="recyAd"><a href="/u2/">u2</a><span>Sponsorisé</span></article>');
  });
  await page.waitForTimeout(150);
  assert.equal(await hidden(page, '#recy'), true, 'Reel masqué');
  assert.equal(await hidden(page, '#recyAd'), true, 'pub masquée');
  // Vidée avant d'être remplie : pas encore une photo, elle reste masquée (pas de clignotement).
  assert.equal(await atNextFrame(page, `document.getElementById('recy').innerHTML = '';`, '#recy'), true, 'case vidée : reste masquée');
  assert.equal(
    await atNextFrame(page, `document.getElementById('recy').innerHTML = '<a href="/u/">u</a><a href="/p/P9/">photo</a>';`, '#recy'),
    false,
    'case devenue une photo : réaffichée',
  );
  assert.equal(
    await atNextFrame(page, `document.getElementById('recy').innerHTML = '<a href="/u/">u</a><a href="/reel/R2/">reel</a>';`, '#recy'),
    true,
    'redevenue un Reel : masquée de nouveau',
  );
  assert.equal(
    await atNextFrame(page, `document.querySelector('#recyAd span').firstChild.nodeValue = 'Paris';`, '#recyAd'),
    false,
    'pub devenue une publication normale : réaffichée',
  );
  await page.close();

  // Règles désactivées => rien n'est masqué.
  page = await open('https://www.instagram.com/', () => false);
  assert.equal(await hidden(page, '#reels'), false, 'règle désactivée respectée');
  await page.close();

  // --- Reel ouvert depuis un message (même adresse que la conversation) ---
  // Fil de vidéos plein écran + panneau de commentaires ; on glisse du doigt (CDP).
  async function openViewer(isEnabled) {
    const p = await browser.newPage({ hasTouch: true, viewport: { width: 390, height: 800 } });
    await p.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: `<html><head></head><body style="margin:0">
      <div id="viewer" style="position:fixed;inset:0;overflow-y:scroll;scroll-snap-type:y mandatory">
        <div style="height:100vh;scroll-snap-align:start"><video style="display:block;width:100%;height:100%"></video></div>
        <div style="height:100vh;scroll-snap-align:start"><video style="display:block;width:100%;height:100%"></video></div>
      </div>
      <div id="comments" style="position:fixed;left:0;bottom:0;width:100%;height:200px;overflow-y:scroll;background:#fff">
        <div style="height:1000px">commentaires</div>
      </div>
      <script>
        window.__siteMoves = 0;
        document.getElementById('viewer').addEventListener('touchmove', () => window.__siteMoves++);
      </script></body></html>` }));
    await p.addInitScript(() => {
      window.__msgs = [];
      window.ReactNativeWebView = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };
    });
    await p.addInitScript(buildInjectedScript(PLATFORMS, isEnabled));
    await p.goto('https://www.instagram.com/direct/t/123/');
    await p.waitForTimeout(250);
    return p;
  }
  async function swipe(p, x, y1, y2) {
    const cdp = await p.context().newCDPSession(p);
    const pt = (y) => [{ x, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y1) });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y1 + ((y2 - y1) * i) / 8) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(400);
  }
  const scrollTop = (p, sel) => p.$eval(sel, (el) => el.scrollTop);

  page = await openViewer(() => false); // témoin : sans la règle, le glissement fait défiler
  await swipe(page, 200, 500, 100);
  assert.ok((await scrollTop(page, '#viewer')) > 0, 'témoin : le glissement fait défiler sans la règle');
  await page.close();

  page = await openViewer(defaults);
  await swipe(page, 200, 500, 100);
  assert.equal(await scrollTop(page, '#viewer'), 0, 'pas de défilement vers le Reel suivant');
  assert.equal(await page.evaluate(() => window.__siteMoves), 0, 'le site ne reçoit pas le geste vertical');
  assert.ok((await page.evaluate(() => window.__msgs)).some((m) => m.type === 'feedLocked'), 'l’app est prévenue');
  await swipe(page, 200, 780, 640); // dans les commentaires : défilement libre
  assert.ok((await scrollTop(page, '#comments')) > 0, 'les commentaires défilent');
  // Glissement horizontal sur la vidéo : pas bloqué (carrousels…), pas de bandeau.
  await page.evaluate(() => (window.__msgs = []));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 400 }] });
  await page.evaluate(() => {
    window.__prevented = 0;
    window.addEventListener('touchmove', (e) => { if (e.defaultPrevented) window.__prevented++; });
  });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 30, y: 402 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  assert.ok((await page.evaluate(() => window.__prevented)) <= 1, 'glissement horizontal laissé libre');
  assert.equal((await page.evaluate(() => window.__msgs)).some((m) => m.type === 'feedLocked'), false, 'pas de bandeau en horizontal');
  // Vidéos du fil (format 4:5, ~60 % de la hauteur) : on défile normalement.
  await page.evaluate(() => document.querySelectorAll('#viewer > div').forEach((d) => (d.style.height = '60vh')));
  await swipe(page, 200, 500, 100);
  assert.ok((await scrollTop(page, '#viewer')) > 0, 'le fil avec des vidéos normales défile');
  // Petit écran (iPhone SE) : une vidéo 4:5 du fil y dépasse 75 % de la hauteur, mais ce
  // n'est pas un Reel (pas en format portrait 9:16) : le fil défile toujours.
  await page.setViewportSize({ width: 320, height: 480 });
  await page.evaluate(() => {
    document.getElementById('viewer').scrollTop = 0;
    document.querySelectorAll('#viewer > div').forEach((d) => (d.style.height = '400px'));
  });
  await page.waitForTimeout(600);
  await swipe(page, 160, 250, 20); // au-dessus du panneau de commentaires (en bas)
  assert.ok((await scrollTop(page, '#viewer')) > 0, 'petit écran : une vidéo 4:5 ne bloque pas le défilement');
  await page.close();

  // Stories (plein écran aussi) : on peut toujours glisser vers le bas pour les fermer.
  page = await openViewer(defaults);
  await page.evaluate(() => history.replaceState({}, '', '/stories/martin/123/'));
  await swipe(page, 200, 100, 500);
  assert.equal(await page.evaluate(() => window.__siteMoves), 8, 'story : le site reçoit le glissement');
  await page.close();

  // --- Fluidité : redirection SANS recharger la page quand le site a un routeur ---
  // Fausse page avec un « routeur » qui réaffiche le contenu à chaque popstate (comme Instagram).
  async function openSpa(withRouter) {
    const p = await browser.newPage();
    let loads = 0;
    // Messages à l'app, gardés même si la page se recharge.
    const sent = [];
    await p.exposeFunction('__report', (m) => sent.push(JSON.parse(m)));
    await p.route('**/*', (route) => {
      loads++;
      route.fulfill({ contentType: 'text/html', body: `<html><head></head><body>
        <a id="exploreLink" href="/explore/">Explore</a><a id="homeLink" href="/">Accueil</a><div id="view"></div>
        <script>
          ${withRouter ? "window.addEventListener('popstate', () => { const d = document.createElement('div'); d.textContent = location.pathname; document.getElementById('view').appendChild(d); });" : ''}
        </script></body></html>` });
    });
    await p.addInitScript(() => {
      window.__msgs = [];
      window.ReactNativeWebView = {
        postMessage: (m) => {
          window.__msgs.push(JSON.parse(m));
          window.__report(m);
        },
      };
    });
    await p.addInitScript(buildInjectedScript(PLATFORMS, defaults));
    await p.goto('https://www.instagram.com/p/AAA/');
    await p.waitForTimeout(250);
    return { p, loads: () => loads, sent };
  }
  let spa = await openSpa(true);
  await spa.p.click('#exploreLink');
  await spa.p.waitForTimeout(1000);
  assert.equal(pathOf(spa.p), '/explore/search/', 'Explore -> recherche');
  assert.equal(spa.loads(), 1, 'Explore -> recherche sans recharger la page');
  const before = await spa.p.evaluate(() => history.length);
  await spa.p.click('#exploreLink');
  await spa.p.waitForTimeout(300);
  assert.equal(await spa.p.evaluate(() => history.length), before, 'déjà sur la recherche : la page n’est pas empilée');
  assert.equal(pathOf(spa.p), '/explore/search/', 'toujours sur la recherche');
  assert.equal(spa.sent.some((m) => m.type === 'reloading'), false, 'aucun rechargement signalé');
  // Accueil -> fil Abonnements : un VRAI chargement, directement à la bonne adresse (sur le vrai
  // Instagram, la navigation douce changeait l'adresse mais le fil restait « Pour vous »).
  await spa.p.click('#homeLink');
  await spa.p.waitForTimeout(1000);
  assert.equal(pathOf(spa.p), '/?variant=following', 'Accueil -> fil Abonnements');
  assert.equal(spa.loads(), 2, 'fil Abonnements : un seul chargement de page');
  assert.deepEqual(spa.sent.filter((m) => m.type === 'reloading'), [{ type: 'reloading', why: 'rule' }], 'rechargement voulu, signalé');
  // Déjà sur le fil Abonnements : Accueil remonte en haut, sans recharger.
  await spa.p.click('#homeLink');
  await spa.p.waitForTimeout(500);
  assert.equal(spa.loads(), 2, 'Accueil sur le fil Abonnements : pas de rechargement');
  await spa.p.close();
  // Site sans routeur : au bout de 800 ms, on recharge à la bonne adresse (rien ne reste bloqué).
  spa = await openSpa(false);
  await spa.p.click('#exploreLink');
  await spa.p.waitForTimeout(1500);
  assert.equal(pathOf(spa.p), '/explore/search/', 'sans routeur : bonne adresse');
  assert.equal(spa.loads(), 2, 'sans routeur : page rechargée une fois');
  // Le compteur du mode diagnostic connaît la cause de ce rechargement.
  assert.deepEqual(spa.sent.filter((m) => m.type === 'reloading'), [{ type: 'reloading', why: 'stuck' }], 'rechargement signalé');
  await spa.p.close();

  // Défilement fluide : aucun écouteur qui bloque le défilement sur la page elle-même.
  page = await openViewer(defaults);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<div id="feed" style="position:fixed;left:0;top:0;width:100%;height:150px;overflow-y:scroll;z-index:5;background:#eee"><div style="height:2000px">fil</div></div>');
  });
  await page.waitForTimeout(300);
  await swipe(page, 200, 140, 20);
  assert.ok((await scrollTop(page, '#feed')) > 0, 'le fil hors vidéo défile normalement');
  await page.close();

  // --- Réseau gardé ouvert mais caché (retour à l'accueil) : la page se croit en arrière-plan ---
  page = await open('https://www.instagram.com/p/AAA/');
  const vis = await page.evaluate(async () => {
    const out = {};
    let events = 0;
    document.addEventListener('visibilitychange', () => events++);
    const v = document.createElement('video');
    let paused = 0;
    v.pause = () => paused++; // pas de vrai fichier vidéo : on compte les mises en pause
    document.body.appendChild(v);
    out.before = [document.visibilityState, document.hidden];
    window.__ONEFORALL_HIDDEN__(true);
    out.hidden = [document.visibilityState, document.hidden, document.hasFocus()];
    out.pausedOnHide = paused;
    v.dispatchEvent(new Event('play')); // lecture auto pendant que c'est caché
    out.pausedOnPlay = paused;
    window.__ONEFORALL_HIDDEN__(true); // répété : rien de plus
    window.__ONEFORALL_HIDDEN__(false);
    out.shown = [document.visibilityState, document.hidden];
    v.dispatchEvent(new Event('play'));
    out.pausedAfter = paused;
    out.events = events;
    return out;
  });
  assert.deepEqual(vis.before, ['visible', false], 'visible au départ');
  assert.deepEqual(vis.hidden, ['hidden', true, false], 'caché : la page se croit en arrière-plan');
  assert.equal(vis.pausedOnHide, 1, 'vidéo en pause quand on cache');
  assert.equal(vis.pausedOnPlay, 2, 'lecture arrêtée pendant que c’est caché');
  assert.deepEqual(vis.shown, ['visible', false], 'réaffiché : de nouveau visible');
  assert.equal(vis.pausedAfter, 2, 'réaffiché : la lecture n’est plus arrêtée');
  assert.equal(vis.events, 2, 'le site est prévenu (visibilitychange) à chaque changement');
  await page.close();
  // La commande envoyée par l'app ne casse pas une page où le script est absent.
  const { setPageHiddenCommand } = require('../src/lib/buildInjection.ts');
  const bare = await browser.newPage();
  await bare.setContent('<p>x</p>');
  await bare.evaluate(setPageHiddenCommand(true));
  await bare.close();

  // --- Couleur du haut du site (zone de l'heure) : envoyée à l'app, puis vérifiée par elle ---
  for (const [head, want] of [
    ['<meta name="theme-color" content="#000000">', '#000000'],
    ['<style>body{background:rgb(250, 250, 250)}</style>', 'rgb(250, 250, 250)'],
  ]) {
    const tp = await browser.newPage();
    await tp.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: `<html><head>${head}</head><body>x</body></html>` }));
    await tp.addInitScript(() => {
      window.__msgs = [];
      window.ReactNativeWebView = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };
    });
    await tp.addInitScript(buildInjectedScript(PLATFORMS, defaults));
    await tp.goto('https://www.instagram.com/p/AAA/');
    await tp.waitForTimeout(300);
    const themes = (await tp.evaluate(() => window.__msgs)).filter((m) => m.type === 'theme').map((m) => m.color);
    assert.equal(themes[themes.length - 1], want, `couleur du site : ${themes}`);
    await tp.close();
  }

  // --- YouTube ---
  page = await open('https://m.youtube.com/');
  assert.equal(await hidden(page, '#shelf'), true, 'étagère Shorts masquée');
  assert.equal(await hidden(page, '#tabShorts'), true, 'onglet Shorts masqué');
  assert.equal(await hidden(page, '#tabHome'), false, 'onglet Accueil visible');
  assert.equal(await hidden(page, '#chipShorts'), true, 'filtre Shorts masqué');
  assert.equal(await hidden(page, '#short'), true, 'Short isolé masqué');
  assert.equal(await hidden(page, '#video'), false, 'vidéo normale visible');
  await page.close();

  page = await open('https://m.youtube.com/shorts/abc123');
  await page.waitForTimeout(200);
  assert.equal(pathOf(page), '/watch?v=abc123', 'Short -> /watch');
  await page.close();

  await browser.close();
  console.log('✓ script injecté (Chromium) : masquage, observer, redirections, blocage');
}

urlTests();
validationTests();
browserTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
