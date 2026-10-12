/**
 * Test du script injecté, dans un vrai navigateur (Chromium via Playwright),
 * sur de fausses pages Instagram / YouTube / TikTok.
 *
 * Lancer :  npm run test:inject
 * (nécessite Playwright : `npm i -D playwright` ou une installation globale)
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
const { findUrlAction } = require('../src/lib/urlRules.ts');

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
  assert.equal(t('https://www.instagram.com/reelsfan/'), null); // pseudo qui commence par "reels"
  assert.equal(t('https://www.instagram.com/direct/inbox/'), null);
  assert.equal(t('https://www.instagram.com/p/ABC/'), null);
  assert.equal(t('https://www.instagram.com/explore/search/'), null);
  assert.equal(t('https://m.youtube.com/shorts/abc123?feature=share'), 'https://m.youtube.com/watch?v=abc123');
  assert.equal(t('https://m.youtube.com/watch?v=abc123'), null);
  assert.equal(t('https://www.tiktok.com/@someone/video/1'), 'BLOCK');
  assert.equal(t('https://example.com/reels/'), null);
  // Règle désactivée => plus de redirection.
  assert.equal(findUrlAction(PLATFORMS, 'https://www.instagram.com/reels/', () => false), null);
  console.log('✓ règles d’URL (React Native)');
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
  assert.match(base('instagram').rules[0].css, /display: none !important;/);

  const bad = (label, id, mutate) => {
    const raw = clone(rawOf(id));
    mutate(raw);
    assert.throws(() => mergeRemoteRules(base(id), raw), `devrait être refusé : ${label}`);
  };
  bad('CSS avec url()', 'instagram', (r) => (r.rules[0].css = ['a { background: url(https://evil.example/x) }']));
  bad('CSS avec @import', 'instagram', (r) => (r.rules[0].css = ['@import "https://evil.example/x.css";']));
  bad('redirection hors site', 'instagram', (r) => (r.rules[1].urls[0].redirectTo = '//evil.example/'));
  bad('redirection https', 'instagram', (r) => (r.rules[1].urls[0].redirectTo = 'https://evil.example/'));
  bad('regex invalide', 'instagram', (r) => (r.rules[1].urls[0].pattern = '('));
  bad('lien réécrit hors site', 'instagram', (r) => (r.rules[3].rewriteLinks[0].href = 'https://evil.example/'));
  bad('version de format inconnue', 'instagram', (r) => (r.schemaVersion = 2));
  bad('mauvaise plateforme', 'instagram', (r) => (r.id = 'youtube'));
  bad('id de règle en double', 'instagram', (r) => (r.rules[1].id = r.rules[0].id));
  bad('id de règle invalide', 'instagram', (r) => (r.rules[0].id = 'x y'));
  bad('defaultEnabled absent', 'instagram', (r) => delete r.rules[0].defaultEnabled);
  bad('TikTok débloqué (règle de blocage retirée)', 'tiktok', (r) => (r.rules = []));
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
  'www.tiktok.com': `<h1 id="tt">TikTok</h1>`,
};

async function browserTests() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.log('⚠ Playwright absent : tests navigateur ignorés.');
    return;
  }
  const browser = await chromium.launch();

  async function open(url, isEnabled = defaults) {
    const page = await browser.newPage();
    // Toutes les requêtes reçoivent nos fausses pages (aucun accès réseau).
    await page.route('**/*', (route) => {
      const host = new URL(route.request().url()).host;
      route.fulfill({ contentType: 'text/html', body: `<html><head></head><body>${PAGES[host] ?? ''}</body></html>` });
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

  // Contenu ajouté plus tard (scroll infini) => MutationObserver.
  await page.evaluate(() => {
    const a = document.createElement('article');
    a.id = 'late';
    a.innerHTML = '<a href="/reel/EEE/">reel</a>';
    document.getElementById('main').appendChild(a);
  });
  await page.waitForTimeout(300);
  assert.equal(await hidden(page, '#late'), true, 'Reel chargé dynamiquement masqué');

  // Navigation interne (pushState) vers /reels/ => retour accueil.
  await page.evaluate(() => history.pushState({}, '', '/reels/'));
  await page.waitForURL('https://www.instagram.com/');
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

  // Règles désactivées => rien n'est masqué.
  page = await open('https://www.instagram.com/', () => false);
  assert.equal(await hidden(page, '#reels'), false, 'règle désactivée respectée');
  await page.close();

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

  // --- TikTok ---
  page = await open('https://www.tiktok.com/');
  assert.match(await page.textContent('body'), /Page bloquée/, 'TikTok bloqué');
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
