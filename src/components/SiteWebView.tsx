import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Platform as RNPlatform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { findBannedSite } from '../lib/banned';
import { AFTER_LOAD_SCRIPT, buildInjectedScript } from '../lib/buildInjection';
import { useRules } from '../lib/rules';
import { useSettings } from '../lib/settings';
import { SITE_TABS, tabIndexForPath, tabScript } from '../lib/sites';
import { useTheme } from '../lib/theme';
import { saveUnread } from '../lib/unread';
import { findUrlAction, parseUrl } from '../lib/urlRules';
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
  /** Bandeau affiché 0,5 s après l'ouverture et à chaque rechargement (ex. « Reels masqués »). */
  welcome?: string;
  /** Pendant le tuto : le bandeau reste affiché tant que c'est vrai. */
  holdWelcome?: boolean;
  /** Le bandeau, pour que le tuto puisse le montrer. */
  toastRef?: RefObject<View | null>;
  /** Commande donnée au parent : passer à l'onglet suivant (+1) ou précédent (-1) du site. */
  controlsRef?: RefObject<{ goTab: (dir: 1 | -1) => void } | null>;
};

/**
 * WebView qui affiche le site en appliquant les règles activées.
 * (Version iOS/Android. La version web est dans SiteWebView.web.tsx.)
 */
export function SiteWebView({ platform, welcome, holdWelcome, toastRef, controlsRef }: Props) {
  const t = useTheme();
  const webRef = useRef<WebView>(null);
  const { isEnabled, diagnostic } = useSettings();
  const { platforms } = useRules();
  const toast = useRef<ToastHandle>(null);
  /** Chemin de la page affichée (mode diagnostic uniquement). */
  const [path, setPath] = useState('');

  // Le script dépend des réglages : s'ils changent, il est reconstruit.
  const script = useMemo(() => buildInjectedScript(platforms, isEnabled), [platforms, isEnabled]);

  // À l'ouverture : rappel discret de ce qui est masqué (gardé affiché pendant le tuto).
  useEffect(() => {
    if (welcome) toast.current?.show(welcome, 500, holdWelcome ? Infinity : 2500);
    // Seulement à l'ouverture ; la fin du tuto est gérée juste en dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcome]);
  const wasHolding = useRef(holdWelcome);
  useEffect(() => {
    if (holdWelcome && welcome) toast.current?.show(welcome, 0, Infinity);
    else if (wasHolding.current) toast.current?.hide();
    wasHolding.current = holdWelcome;
    // Ne réagit qu'au début et à la fin du tuto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdWelcome]);

  // Onglets du site : on retient le dernier choisi (le profil n'a pas d'adresse fixe).
  const lastTab = useRef(0);
  if (controlsRef) {
    controlsRef.current = {
      goTab(dir) {
        const tabs = SITE_TABS[platform.id] ?? [];
        const current = tabIndexForPath(tabs, path) ?? lastTab.current;
        const next = current + dir;
        if (next < 0 || next >= tabs.length) return;
        lastTab.current = next;
        webRef.current?.injectJavaScript(tabScript(tabs[next]));
        showBanner(tabs[next].label);
      },
    };
  }

  function showBanner(text: string) {
    toast.current?.show(text);
  }

  /** Appelé AVANT chaque chargement de page : on bloque/redirige si besoin. */
  function onShouldStartLoadWithRequest(req: ShouldStartLoadRequest): boolean {
    // Sites bannis (TikTok) : jamais ouverts, quel que soit le lien cliqué.
    const banned = findBannedSite(req.url);
    if (banned) {
      if (req.isTopFrame !== false) showBanner(`${banned} est bloqué`);
      return false;
    }

    const action = findUrlAction(platforms, req.url, isEnabled);
    if (!action) return true;

    // Contenu intégré (iframe) interdit : on le bloque sans rien dire.
    if (req.isTopFrame === false) return false;

    if (action.type === 'block') {
      showBanner('Page bloquée');
    } else {
      showBanner(action.rule.label);
      webRef.current?.injectJavaScript(`location.replace(${JSON.stringify(action.url)}); true;`);
    }
    return false;
  }

  /** Messages envoyés par le script injecté (redirection / blocage). */
  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'blocked') showBanner(msg.label ?? 'Page bloquée');
      if (msg.type === 'redirected' && msg.label) showBanner(msg.label);
      if (msg.type === 'path' && typeof msg.path === 'string') setPath(msg.path);
      if (msg.type === 'unread' && typeof msg.count === 'number') saveUnread(platform.id, msg.count);
      if (msg.type === 'tabMissing') showBanner('Onglet introuvable sur cette page');
      if (msg.type === 'feedLocked') showBanner('Les vidéos suivantes sont bloquées');
    } catch {
      // message qui ne vient pas de nous : on l'ignore
    }
  }

  function onNavigationStateChange(nav: WebViewNavigation) {
    const u = parseUrl(nav.url);
    if (u) setPath(u.path);
  }

  return (
    <View style={styles.flex}>
      <WebView
        // Si les réglages changent, on recrée la WebView avec le nouveau script.
        key={script}
        ref={webRef}
        style={styles.flex}
        source={{ uri: platform.startUrl }}
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
        // --- Confort -------------------------------------------------------
        // Les bords de l'écran changent d'onglet (voir browser/[platform].tsx), pas de page.
        allowsBackForwardNavigationGestures={false}
        allowsInlineMediaPlayback
        // Tirer la page vers le bas = recharger.
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
      />
      {diagnostic && (
        <View pointerEvents="none" style={[styles.diagnostic, { backgroundColor: t.inverse }]}>
          <Text style={[styles.diagnosticText, { color: t.onInverse }]} numberOfLines={2}>
            Page : {path || '…'}
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
});
