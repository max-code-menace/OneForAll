/**
 * Faux fils Instagram VIRTUALISÉS (une page HTML autonome, servie sur https://www.instagram.com/),
 * pour scripts/test-injection.cjs. D'après plusieurs projets indépendants (2026), le fil d'Instagram
 * ne garde dans la page que les publications proches de l'écran et réserve la place des autres :
 * un Reel masqué APRÈS avoir été mesuré y gardait sa place (grand vide blanc constaté sur iPhone).
 * Ce n'est PAS le vrai Instagram : le vrai mécanisme n'a jamais été observé directement.
 *
 * Modes :
 *  V1 « espaceurs »  : padding-top / padding-bottom (style inline) = publications non montées ;
 *                      hauteur MESURÉE (offsetHeight) juste après l'insertion, dans la même tâche
 *                      (comme un useLayoutEffect), gardée en cache pour toujours ; 600 px estimés avant.
 *  V2 « absolues »   : position:absolute, top = somme des hauteurs mesurées (même mesure, même cache).
 *  V3 « absolues+RO »: V2 + ResizeObserver qui remet la hauteur à jour.
 *  V4 « données »    : V2 mais hauteurs calculées depuis les données (format du média), jamais mesurées.
 *
 * Listes :
 *  fin    : 3 photos puis 40 Reels (rien après).
 *  mixte  : photo, 6 Reels, photo, 10 Reels, photo, 30 Reels.
 *  infini : 3 photos puis des Reels « sans fin » (plafond 600), pour voir si le chargement s'emballe.
 *
 * 1er rendu 150 ms après DOMContentLoaded (comme React après ses scripts) ; option 'sync' : pendant la
 * lecture du HTML, avant la 1re image (pour voir si la feuille de style du moteur arrive à temps).
 * Rendu « à la React » : le défilement programme un rendu dans une tâche à part (MessageChannel,
 * comme le planificateur de React) ; insertion + mesure + re-rendu dans cette même tâche, AVANT
 * toute micro-tâche (donc avant le MutationObserver du moteur, et avant son requestAnimationFrame).
 * Chargement de la page suivante (12 publications, 300 ms de « réseau ») quand le bas du fil est à
 * moins de 1500 px du bas de l'écran (vérifié après chaque rendu) : trig='dom' (défaut) = position
 * RÉELLE du « chargement… » sous le fil (comme un IntersectionObserver) ; trig='model' = d'après
 * les hauteurs en cache du virtualiseur.
 * overflow-anchor:none : pas d'ancrage du défilement (Safari n'en fait pas non plus, supposé).
 */
function feedPage(mode, listName, trig = 'dom', first = 'late') {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{overflow-anchor:none}
body{margin:0;font:14px -apple-system,sans-serif;background:#fff;padding-top:44px;padding-bottom:50px}
#top{position:fixed;top:0;left:0;right:0;height:44px;background:#fff;z-index:5;display:flex;align-items:center;padding:0 12px;font-weight:700;border-bottom:1px solid #eee}
nav{position:fixed;bottom:0;left:0;right:0;height:50px;display:flex;background:#fff;z-index:5;border-top:1px solid #eee}
nav>div{flex:1;display:flex;align-items:center;justify-content:center}
#list{position:relative}
.hd{height:56px;display:flex;align-items:center;padding:0 12px}
.media{width:100%;background:#bbb}
.photo .media{aspect-ratio:1/1;background:#7a9}
.reel .media{aspect-ratio:4/5;background:#a77}
.act{height:44px}
.cap{height:96px}
#loader{height:64px;display:flex;align-items:center;justify-content:center;color:#999}
</style></head><body>
<div id="top">Pour vous ⌄</div>
<main role="main"><div><div id="list"></div><div id="loader"></div></div></main>
<nav>${['/', '/explore/', '/direct/inbox/', '/moi/'].map((h) => `<div><a href="${h}">·</a></div>`).join('')}</nav>
<script>
(function(){
var MODE = ${JSON.stringify(mode)}, LIST = ${JSON.stringify(listName)}, TRIG = ${JSON.stringify(trig)}, FIRST = ${JSON.stringify(first)};
var EST = 600, OVERSCAN = 1000, LOAD_AHEAD = 1500, PAGE = 12, DELAY = 300;
var DATA_H = { photo: 586, reel: 684 }; // V4 : hauteur « calculée » depuis le format du média
var data = [];
function add(kind, n){ for (var i=0;i<n;i++) data.push({ id: (kind==='photo'?'P':'R') + data.length, kind: kind }); }
if (LIST === 'fin') { add('photo',3); add('reel',40); }
else if (LIST === 'mixte') { add('photo',1); add('reel',6); add('photo',1); add('reel',10); add('photo',1); add('reel',30); }
else { add('photo',3); add('reel',597); }
var lastPhotoId = null; data.forEach(function(d){ if (d.kind==='photo') lastPhotoId = d.id; });

var loaded = Math.min(PAGE, data.length), loading = false, fetches = 0, renders = 0;
var heights = new Map(), rows = new Map();
var list = document.getElementById('list'), loader = document.getElementById('loader');
var ABS = MODE !== 'V1';
var ro = MODE === 'V3' ? new ResizeObserver(function(entries){
  var dirty = false;
  for (var i=0;i<entries.length;i++){
    var el = entries[i].target, id = el.getAttribute('data-id');
    var b = entries[i].borderBoxSize && entries[i].borderBoxSize[0];
    var hh = b ? Math.round(b.blockSize) : el.offsetHeight;
    if (heights.get(id) !== hh) { heights.set(id, hh); dirty = true; }
  }
  if (dirty) render();
}) : null;

function h(it){
  if (MODE === 'V4') return DATA_H[it.kind];
  return heights.has(it.id) ? heights.get(it.id) : EST;
}
function rowFor(it){
  var r = rows.get(it.id);
  if (r) return r;
  var t = document.createElement('template');
  var href = it.kind === 'reel' ? '/reel/' + it.id + '/' : '/p/' + it.id + '/';
  t.innerHTML = '<div class="row" data-id="' + it.id + '"><div class="cell"><article class="' + it.kind + '" data-id="' + it.id + '">' +
    '<div class="hd"><a href="/u' + it.id + '/">compte_' + it.id + '</a></div>' +
    '<div><a href="' + href + '"><div class="media"></div></a></div>' +
    '<section class="act"></section><div class="cap"><span>' + it.kind + ' ' + it.id + '</span></div></article></div></div>';
  r = t.content.firstChild;
  if (ABS) { r.style.position = 'absolute'; r.style.left = '0'; r.style.right = '0'; }
  rows.set(it.id, r);
  return r;
}
var LT = null;
function listTop(){ if (LT === null) LT = 44; return LT; }
var total = 0;
function render(){
  renders++;
  for (var pass = 0; pass < 50; pass++) { // comme React : re-rendu tant que les mesures changent (50 = limite de React)
    var offs = [], acc = 0;
    for (var i=0;i<loaded;i++){ offs.push(acc); acc += h(data[i]); }
    total = acc;
    var vt = window.scrollY - listTop();
    var lo = vt - OVERSCAN, hi = vt + window.innerHeight + OVERSCAN;
    var s = 0; while (s < loaded && offs[s] + h(data[s]) < lo) s++;
    var e = s - 1; while (e + 1 < loaded && offs[e + 1] <= hi) e++;
    var keep = new Set();
    for (var k = s; k <= e; k++) keep.add(data[k].id);
    // Démonter ce qui sort de la fenêtre.
    rows.forEach(function(r, id){
      if (!keep.has(id) && r.parentNode) { if (ro) ro.unobserve(r); r.parentNode.removeChild(r); }
    });
    var fresh = [];
    for (var k2 = s; k2 <= e; k2++) {
      var it = data[k2], r = rowFor(it), idx = k2 - s;
      var wasIn = r.parentNode === list;
      if (list.children[idx] !== r) list.insertBefore(r, list.children[idx] || null);
      if (ABS) { r.style.top = offs[k2] + 'px'; }
      if (!wasIn) { fresh.push(it); if (ro) ro.observe(r); }
    }
    if (ABS) list.style.height = total + 'px';
    else {
      list.style.paddingTop = (e >= s ? offs[s] : 0) + 'px';
      list.style.paddingBottom = (e >= s ? total - (offs[e] + h(data[e])) : total) + 'px';
    }
    // Mesure synchrone (comme useLayoutEffect), une seule fois par publication, gardée pour toujours.
    var changed = false;
    if (MODE !== 'V4') {
      for (var f = 0; f < fresh.length; f++) {
        if (heights.has(fresh[f].id)) continue;
        var mh = rows.get(fresh[f].id).offsetHeight;
        heights.set(fresh[f].id, mh);
        if (mh !== EST) changed = true;
      }
    }
    if (!changed) break;
  }
  maybeLoad();
}
function maybeLoad(){
  if (loading || loaded >= data.length) return;
  if (TRIG === 'model') {
    // D'après le MODÈLE (hauteurs en cache) : bas du fil à moins de LOAD_AHEAD du bas de l'écran.
    var vt = window.scrollY - listTop();
    if (total - (vt + window.innerHeight) > LOAD_AHEAD) return;
  } else {
    // D'après la PAGE (comme un IntersectionObserver sur le « chargement… » sous le fil).
    if (loader.getBoundingClientRect().top - window.innerHeight > LOAD_AHEAD) return;
  }
  loading = true; fetches++;
  loader.textContent = 'chargement…';
  setTimeout(function(){
    loaded = Math.min(loaded + PAGE, data.length);
    loading = false;
    loader.textContent = '';
    render();
  }, DELAY);
}
var mc = new MessageChannel(), scheduled = false;
mc.port1.onmessage = function(){ scheduled = false; render(); };
window.addEventListener('scroll', function(){ if (!scheduled) { scheduled = true; mc.port2.postMessage(0); } }, { passive: true });
window.__feed = { stats: function(){ return { loaded: loaded, total: data.length, fetches: fetches, renders: renders, lastPhotoId: lastPhotoId, model: total }; } };
// 1er rendu : comme React après le chargement de ses scripts (pas pendant la lecture du HTML).
// first='sync' : rendu immédiat, pendant la lecture du HTML (avant la 1re image).
if (FIRST === 'sync') render();
else document.addEventListener('DOMContentLoaded', function(){ setTimeout(render, 150); });
})();
</script></body></html>`;
}

module.exports = { feedPage };
