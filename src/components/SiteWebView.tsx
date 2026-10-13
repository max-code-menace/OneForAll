import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Linking, Pressable, Platform as RNPlatform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { WebViewNavigationEvent } from 'react-native-webview/lib/WebViewTypes';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { syncAppBadge } from '../lib/backgroundCheck';
import { findBannedSite } from '../lib/banned';
import { AFTER_LOAD_SCRIPT, buildInjectedScript, setPageHiddenCommand } from '../lib/buildInjection';
import { useRules } from '../lib/rules';
import { useSettings } from '../lib/settings';
import { INSIDE_HOSTS } from '../lib/sites';
import { useTheme } from '../lib/theme';
import { parseSiteColor, type SiteColor } from '../lib/siteColor';
import { saveUnread } from '../lib/unread';
import { findUrlAction, hostMatches, parseUrl } from '../lib/urlRules';
import type { Platform } from '../rules';
import { Toast, type ToastHandle } from './Toast';

/**
 * Se présenter comme Safari, avec la VRAIE version d'iOS du téléphone.
 * WKWebView compose déjà le début (« Mozilla/5.0 (iPhone; CPU iPhone OS …) AppleWebKit/… ») ;
 * on remplace seulement la fin (« Mobile/15E148 ») par celle de Safari. Une version écrite
 * en dur (ancienne) ne correspond plus au moteur réel : c'est un signal de robot.
 */
const SAFARI_APP_NAME = `Version/${String(RNPlatform.Version).split('.').slice(0, 2).join('.')} Mobile/15E148 Safari/604.1`;

type Props = {
  platform: Platform;
  /**
   * Affiché à l'écran ? Le réseau reste ouvert quand on revient à l'accueil : il est
   * seulement caché (vidéos en pause, la page se croit en arrière-plan).
   */
  visible: boolean;
  /** Bandeau affiché 0,5 s après la 1re apparition (ex. « Reels masqués »). */
  welcome?: string;
  /** Pendant le tuto : le bandeau reste affiché tant que c'est vrai. */
  holdWelcome?: boolean;
  /** Le bandeau, pour que le tuto puisse le montrer. */
  toastRef?: RefObject<View | null>;
  /** Couleur du haut du site (pour colorer la zone de l'heure et de la batterie). */
  onSiteColor?: (color: SiteColor) => void;
};

/**
 * WebView qui affiche le site en appliquant les règles activées.
 * (Version iOS/Android. La version web est dans SiteWebView.web.tsx.)
 */
export function SiteWebView({ platform, visible, welcome, holdWelcome, toastRef, onSiteColor }: Props) {
  const t = useTheme();
  const webRef = useRef<WebView>(null);
  const { isEnabled, diagnostic } = useSettings();
  const { platforms } = useRules();
  const toast = useRef<ToastHandle>(null);
  /** Chemin de la page affichée (gardé dans une ref, affiché en mode diagnostic uniquement). */
  const pathRef = useRef('');
  const [path, setPathShown] = useState('');
  function setPath(p: string) {
    pathRef.current = p;
    // Hors diagnostic, rien à afficher : pas de nouveau dessin de l'écran à chaque page.
    if (diagnostic) setPathShown(p);
  }
  /**
   * Chargements COMPLETS de la page (mode diagnostic) : le 1er est l'ouverture, les
   * suivants sont des rechargements à traquer. Compté dans une ref (pas de nouveau
   * dessin de l'écran), affiché seulement en mode diagnostic.
   */
  const loads = useRef({ count: 0, last: '' });
  const [loadsShown, setLoadsShown] = useState(loads.current);
  /** Cause connue du prochain chargement (une redirection décidée par l'app…). */
  const nextCause = useRef<string | null>(null);
  // Mode diagnostic activé pendant que le site reste ouvert : on affiche l'état actuel.
  useEffect(() => {
    if (!diagnostic) return;
    setPathShown(pathRef.current);
    setLoadsShown(loads.current);
  }, [diagnostic]);
  /** Augmente à chaque « Réessayer » : la WebView repart de zéro. */
  const [attempt, setAttempt] = useState(0);

  // Le script est figé à la création de la page : des règles qui changent pendant qu'on est
  // dessus ne la rechargent pas d'un coup (un message en cours serait perdu). Elles sont
  // appliquées quand le réseau est caché (un rechargement en arrière-plan), voir plus bas.
  const fresh = useMemo(() => buildInjectedScript(platforms, isEnabled), [platforms, isEnabled]);
  const [script, setScript] = useState(fresh);
  // Adresse de départ déjà redirigée (ex. Instagram : directement le fil Abonnements) : sinon
  // la 1re page est annulée puis relancée à la bonne adresse, une étape d'attente pour rien.
  const startUrl = () => {
    const a = findUrlAction(platforms, platform.startUrl, isEnabled);
    return a?.type === 'redirect' ? a.url : platform.startUrl;
  };
  const [startUri, setStartUri] = useState(startUrl);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // Domaines des réseaux (les liens entre réseaux restent dans l'app, filtrés).
  const allHosts = platforms.flatMap((p) => p.hosts);

  // À la 1re apparition : rappel discret de ce qui est masqué (gardé affiché pendant le tuto).
  // Pas à chaque retour : le réseau est resté ouvert, rien n'a changé.
  const welcomed = useRef(false);
  useEffect(() => {
    if (!visible || welcomed.current || !welcome) return;
    welcomed.current = true;
    toast.current?.show(welcome, 500, holdWelcome ? Infinity : 2500);
    // Seulement à la 1re apparition ; la fin du tuto est gérée juste en dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, welcome]);
  const wasHolding = useRef(holdWelcome);
  useEffect(() => {
    if (holdWelcome && welcome) toast.current?.show(welcome, 0, Infinity);
    else if (wasHolding.current) toast.current?.hide();
    wasHolding.current = holdWelcome;
    // Ne réagit qu'au début et à la fin du tuto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdWelcome]);

  /** iOS a fermé la page cachée (mémoire) : rechargée quand on la réaffiche. */
  const killedWhileHidden = useRef(false);

  // Caché / réaffiché : on prévient la page (veille, vidéos en pause).
  useEffect(() => {
    webRef.current?.injectJavaScript(setPageHiddenCommand(!visible));
    if (visible && killedWhileHidden.current) {
      killedWhileHidden.current = false;
      webRef.current?.reload();
    }
  }, [visible]);

  // Règles changées (Réglages, mise à jour) : appliquées dès que le réseau est caché,
  // par un rechargement en arrière-plan (jamais sous les yeux de l'utilisateur).
  useEffect(() => {
    if (fresh === script || visible) return;
    const timer = setTimeout(() => {
      nextCause.current = 'règles changées';
      setScript(fresh);
      setStartUri(startUrl());
      setAttempt((n) => n + 1);
    }, 1500);
    return () => clearTimeout(timer);
  }, [fresh, script, visible]);

  /**
   * iOS a fermé la page pour libérer de la mémoire (fréquent après un long moment en
   * arrière-plan) : sans rien faire, elle resterait blanche. On la recharge, tout de
   * suite si elle est affichée, sinon au moment où on la réaffiche.
   */
  function onContentProcessDidTerminate() {
    nextCause.current = 'page fermée par iOS';
    if (visibleRef.current) webRef.current?.reload();
    else killedWhileHidden.current = true;
  }

  function showBanner(text: string) {
    // Page cachée : pas de bandeau (il apparaîtrait sur l'accueil).
    if (visibleRef.current) toast.current?.show(text);
  }

  /** Appelé AVANT chaque chargement de page : on bloque/redirige si besoin. */
  function onShouldStartLoadWithRequest(req: ShouldStartLoadRequest): boolean {
    // Sites bannis (TikTok) : jamais ouverts, quel que soit le lien cliqué.
    const banned = findBannedSite(req.url);
    if (banned) {
      if (req.isTopFrame !== false) showBanner(`${banned} est bloqué`);
      return false;
    }

    // Autre site (lien d'une bio, d'une description…) : ouvert dans Safari, avec sa
    // vraie adresse et un bouton retour. Restent ici les réseaux et leurs pages de
    // connexion (INSIDE_HOSTS).
    const u = parseUrl(req.url);
    if (u && req.isTopFrame !== false && !hostMatches(u.host, allHosts) && !hostMatches(u.host, INSIDE_HOSTS)) {
      Linking.openURL(req.url).catch(() => {});
      return false;
    }

    const action = findUrlAction(platforms, req.url, isEnabled);
    if (!action) return true;

    // Contenu intégré (iframe) interdit : on le bloque sans rien dire.
    if (req.isTopFrame === false) return false;

    if (action.type === 'block') {
      showBanner('Page bloquée');
    } else {
      if (!action.rule.silent) showBanner(action.rule.label);
      nextCause.current = 'redirection OneForAll';
      webRef.current?.injectJavaScript(`location.replace(${JSON.stringify(action.url)}); true;`);
    }
    return false;
  }

  /**
   * Messages envoyés par le script injecté (redirection / blocage…).
   * N'importe quelle page peut en envoyer : on ne les écoute que sur les réseaux,
   * et chaque valeur est vérifiée (type, longueur) avant usage.
   */
  function onMessage(e: WebViewMessageEvent) {
    const from = parseUrl(e.nativeEvent.url ?? '');
    if (!from || !hostMatches(from.host, allHosts)) return;
    const onThisSite = hostMatches(from.host, platform.hosts);
    let msg: unknown;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return; // message qui ne vient pas de nous : on l'ignore
    }
    if (typeof msg !== 'object' || msg === null) return;
    const m = msg as Record<string, unknown>;
    const label = typeof m.label === 'string' && m.label ? m.label.slice(0, 120) : null;
    switch (m.type) {
      case 'blocked':
        showBanner(label ?? 'Page bloquée');
        break;
      case 'redirected':
        if (label) showBanner(label);
        break;
      case 'path':
        if (typeof m.path === 'string') setPath(m.path.slice(0, 300));
        break;
      case 'reloading':
        // Le script recharge la page lui-même : redirection pendant le chargement, redirection
        // qui demande un vrai chargement (fil Abonnements), ou redirection douce à laquelle le
        // site n'a pas réagi.
        if (onThisSite) {
          nextCause.current =
            m.why === 'early' ? 'redirection au chargement' : m.why === 'rule' ? 'redirection OneForAll' : 'redirection douce ratée';
        }
        break;
      case 'unread':
        if (onThisSite && Number.isInteger(m.count) && (m.count as number) >= 0 && (m.count as number) < 10000) {
          const count = m.count as number;
          saveUnread(platform.id, count);
          if (platform.id === 'instagram') syncAppBadge(count);
        }
        break;
      case 'theme': {
        const color = onThisSite ? parseSiteColor(m.color) : null;
        if (color) onSiteColor?.(color);
        break;
      }
      case 'feedLocked':
        showBanner('Les vidéos suivantes sont bloquées');
        break;
    }
  }

  function onNavigationStateChange(nav: WebViewNavigation) {
    const u = parseUrl(nav.url);
    if (u) setPath(u.path);
  }

  /** Début d'un chargement complet de la page (pas les changements de page internes du site). */
  function onLoadStart(e: WebViewNavigationEvent) {
    const n = loads.current.count + 1;
    const cause =
      n === 1
        ? 'ouverture'
        : nextCause.current ??
          ({ reload: 'rechargement', click: 'lien', backforward: 'retour', formsubmit: 'formulaire' } as Record<string, string>)[
            e.nativeEvent.navigationType
          ] ??
          'navigation';
    nextCause.current = null;
    const u = parseUrl(e.nativeEvent.url);
    loads.current = { count: n, last: u ? `${cause} (${u.path.slice(0, 60)})` : cause };
    if (diagnostic) setLoadsShown(loads.current);
  }

  return (
    <View style={styles.flex}>
      <WebView
        // « Réessayer » (page hors ligne) : on recrée la WebView.
        key={attempt}
        ref={webRef}
        style={styles.flex}
        source={{ uri: startUri }}
        // Plateformes qui refusent les WebView (Google, Facebook) : on se présente comme Safari.
        applicationNameForUserAgent={platform.userAgent ? SAFARI_APP_NAME : undefined}
        // --- Rester connecté -----------------------------------------------
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        incognito={false}
        cacheEnabled
        // --- Injection des règles ------------------------------------------
        javaScriptEnabled
        injectedJavaScriptBeforeContentLoaded={script}
        injectedJavaScript={AFTER_LOAD_SCRIPT}
        onMessage={onMessage}
        // --- Blocage des URLs ----------------------------------------------
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onNavigationStateChange={onNavigationStateChange}
        onLoadStart={onLoadStart}
        // Page cachée : à chaque nouvelle page chargée, on lui redit qu'elle est en arrière-plan.
        onLoadEnd={() => {
          if (!visibleRef.current) webRef.current?.injectJavaScript(setPageHiddenCommand(true));
        }}
        onContentProcessDidTerminate={onContentProcessDidTerminate}
        // --- Confort -------------------------------------------------------
        // Élan du défilement (la page continue de glisser quand on lâche) : celui des listes
        // d'iOS. Sans cette ligne, react-native-webview (nouvelle architecture, RNCWebView.mm)
        // laisse la valeur à 0 et l'applique à chaque début de glissement.
        decelerationRate="normal"
        // Pas de glissement gauche/droite (choix de l'utilisateur) : seul « tirer vers le bas » recharge.
        allowsBackForwardNavigationGestures={false}
        allowsInlineMediaPlayback
        // Vidéos qui démarrent seules (sans le son), comme dans la vraie app (choix de l'utilisateur).
        // Sinon une vidéo YouTube ouverte peut demander un 2e appui sur Lecture.
        mediaPlaybackRequiresUserAction={false}
        // Appui long sur un lien : pas d'aperçu à la Safari (pas comme une app, et l'aperçu
        // charge la page à part, peut-être sans nos blocages).
        allowsLinkPreview={false}
        // Tirer la page vers le bas = recharger.
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        // Hors ligne ou site injoignable : un écran en français, avec « Réessayer ».
        renderError={() => (
          <View style={[styles.error, { backgroundColor: t.bg }]}>
            <Text style={[styles.errorTitle, { color: t.ink }]}>Pas de connexion</Text>
            <Text style={[styles.errorText, { color: t.ink2 }]}>
              {platform.name} ne répond pas. Vérifie le Wi-Fi ou les données mobiles, puis réessaie.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAttempt((n) => n + 1)}
              style={({ pressed }) => [styles.retry, { backgroundColor: t.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ fontSize: 17, fontWeight: '600', color: t.onPrimary }}>Réessayer</Text>
            </Pressable>
          </View>
        )}
      />
      {diagnostic && (
        <View pointerEvents="none" style={[styles.diagnostic, { backgroundColor: t.inverse }]}>
          <Text style={[styles.diagnosticText, { color: t.onInverse }]} numberOfLines={2}>
            Page : {path || '…'}
          </Text>
          <Text style={[styles.diagnosticText, { color: t.onInverse }]} numberOfLines={2}>
            Chargements : {loadsShown.count} · dernier : {loadsShown.last || '…'}
          </Text>
        </View>
      )}
      <Toast ref={toast} pillRef={toastRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  diagnostic: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    opacity: 0.92,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '92%',
  },
  diagnosticText: { fontSize: 12, fontFamily: 'Menlo' },
  error: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  errorText: { fontSize: 17, lineHeight: 24, textAlign: 'center' },
  retry: { minHeight: 50, paddingHorizontal: 28, borderRadius: 25, justifyContent: 'center', marginTop: 8 },
});
