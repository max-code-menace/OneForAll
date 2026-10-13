/**
 * Banc d'essai de FLUIDITÉ du script injecté, sur un faux fil Instagram (Chromium).
 *
 * Lancer :  npm run bench:inject            (ou : node scripts/bench-injection.cjs 5 pour 5 essais)
 *
 * Fausse page : ~25 niveaux de <div> comme sur Instagram, barre d'onglets, publications
 * (photos, vidéos, Reels, pubs), défilement infini, textes mis à jour par « React », et un
 * site qui appelle history.replaceState sans arrêt. Processeur ralenti 4 fois (téléphone).
 * Compare la page SANS script et AVEC le script actuel ; affiche les médianes :
 *  - script : temps passé dans NOTRE script (ms, profileur) ;
 *  - style / layout : recalcul du style et de la mise en page par le navigateur (ms) ;
 *  - flash : images affichées alors qu'un Reel ou une pub ajoutés n'étaient pas encore masqués ;
 *  - longues : tâches de plus de 50 ms (images sautées).
 * Ce n'est PAS le vrai Instagram ni Safari : ça sert à comparer deux versions du script.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(out.outputText, filename);
};
const { DEFAULT_PLATFORMS } = require('../src/rules/index.ts');
const { buildInjectedScript } = require('../src/lib/buildInjection.ts');

const RUNS = Number(process.argv[2] || 3);
const ALL = DEFAULT_PLATFORMS.flatMap((p) => p.rules);
// Fil « Abonnements » coupé : sinon la fausse page serait redirigée.
const SCRIPT =
  buildInjectedScript(DEFAULT_PLATFORMS, (id) => id !== 'ig.followingFeed' && ALL.find((r) => r.id === id).defaultEnabled) +
  '\n//# sourceURL=oneforall.js';

const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#ffffff">
<style>body{margin:0;font:14px -apple-system,sans-serif} .media{width:100%;aspect-ratio:4/5;background:#ccc}
nav{position:fixed;bottom:0;left:0;right:0;display:flex;background:#fff;height:50px} nav>div{flex:1} svg{width:24px;height:24px}</style>
</head><body><div><div><div><div><div><div><div><div><div><div>
<nav>${['/', '/explore/', '/reels/', '/direct/inbox/', '/martin/'].map((h) => `<div><span><a href="${h}"><svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg></a></span></div>`).join('')}</nav>
<div><div><div><main><div><div><div><div><div id="feed"></div></div></div></div></div></main></div></div></div>
</div></div></div></div></div></div></div></div></div></div>
<script>
var n = 0, CAPTION = 'Une belle journée au bord du lac avec les amis, on a marché toute la matinée puis pique-nique. #lac #amis #été';
function post(i) {
  var kind = i % 3 === 1 ? 'reel' : i % 11 === 5 ? 'ad' : i % 4 === 0 ? 'video' : 'photo', id = 'P' + i;
  var media = kind === 'reel' ? '<a href="/reel/' + id + '/"><div class="media"></div></a>'
    : kind === 'video' ? '<div class="media"><video muted playsinline style="width:100%;height:100%"></video></div>'
    : '<a href="/p/' + id + '/"><div class="media"></div></a>';
  var btn = '<span><button><svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg></button></span>';
  return '<div><div><div><article data-kind="' + kind + '"><div><div><div><header><a href="/u' + i + '/">u' + i + '</a>' +
    '<span><span>Paris</span></span>' + (kind === 'ad' ? '<span><span>Sponsorisé</span></span>' : '') + '</header></div></div></div>' +
    '<div><div><div>' + media + '</div></div></div><section>' + btn + btn + btn + '</section>' +
    '<div><span><span class="likes">' + i * 37 + '</span> J’aime</span></div><div><span><a href="/u' + i + '/">u' + i + '</a> <span>' + CAPTION + '</span></span></div>' +
    '<div><a href="/p/' + id + '/"><time>il y a 2 h</time></a></div></article></div></div></div>';
}
function batch(k) {
  var t = document.createElement('template'), html = '';
  for (var j = 0; j < k; j++) html += post(n++);
  t.innerHTML = html;
  window.__watch = window.__watch.concat([].slice.call(t.content.querySelectorAll('article[data-kind="reel"], article[data-kind="ad"]')));
  document.getElementById('feed').appendChild(t.content);
}
window.__watch = [];
batch(location.hash === '#long' ? 250 : 30);
</script></body></html>`;

async function once(browser, withScript, mode) {
  const page = await browser.newPage({ viewport: { width: 390, height: 760 } });
  await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }));
  await page.addInitScript(() => {
    window.ReactNativeWebView = { postMessage() {} };
  });
  if (withScript) await page.addInitScript(SCRIPT);
  await page.goto('https://www.instagram.com/p/X/' + (mode === 'historique' ? '#long' : ''));
  await page.waitForTimeout(500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Profiler.start');
  const before = await cdp.send('Performance.getMetrics');
  const res = await page.evaluate(
    (mode) =>
      new Promise((done) => {
        let flash = 0, long = 0, stop = false, i = 0;
        try {
          new PerformanceObserver((l) => (long += l.getEntries().length)).observe({ entryTypes: ['longtask'] });
        } catch {}
        // Après chaque image : un Reel ou une pub ajoutés sont-ils encore visibles ?
        (function loop() {
          requestAnimationFrame(() => {
            setTimeout(() => {
              window.__watch = window.__watch.filter((a) => a.getAttribute('data-sans-reels') !== 'hidden');
              if (window.__watch.length) flash++;
            }, 0);
            if (!stop) loop();
          });
        })();
        const tick = setInterval(() => {
          i++;
          if (mode === 'fil') {
            if (i % 3 === 0) batch(4);
            const likes = document.querySelectorAll('.likes');
            likes[i % likes.length].firstChild.nodeValue = String(i);
            window.scrollBy(0, 120);
          } else {
            history.replaceState({ scroll: i }, '', location.href); // position de défilement retenue
          }
          if (i >= 150) {
            clearInterval(tick);
            stop = true;
            setTimeout(() => done({ flash, long }), 500);
          }
        }, 50);
      }),
    mode,
  );
  const after = await cdp.send('Performance.getMetrics');
  const { profile } = await cdp.send('Profiler.stop');
  const dt = (profile.endTime - profile.startTime) / 1000 / Math.max(1, profile.samples.length);
  const script = profile.nodes.filter((n) => n.callFrame.url === 'oneforall.js').reduce((s, n) => s + n.hitCount * dt, 0);
  const metric = (name) =>
    after.metrics.find((x) => x.name === name).value - before.metrics.find((x) => x.name === name).value;
  await page.close();
  return {
    script: Math.round(script),
    style: Math.round(metric('RecalcStyleDuration') * 1000),
    layout: Math.round(metric('LayoutDuration') * 1000),
    flash: withScript ? res.flash : '-',
    longues: res.long,
  };
}

(async () => {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    throw new Error('Playwright absent : installe-le (npm i -D playwright).');
  }
  const browser = await chromium.launch();
  const median = (xs) => (typeof xs[0] === 'number' ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : xs[0]);
  for (const mode of ['fil', 'historique']) {
    for (const withScript of [false, true]) {
      const runs = [];
      for (let r = 0; r < RUNS; r++) runs.push(await once(browser, withScript, mode));
      const med = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, median(runs.map((x) => x[k]))]));
      console.log(`${mode.padEnd(10)} ${withScript ? 'avec script' : 'sans script'} :`, JSON.stringify(med));
    }
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
