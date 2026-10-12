import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { findBannedSite } from '../lib/banned';
import { AFTER_LOAD_SCRIPT, buildInjectedScript } from '../lib/buildInjection';
import { useRules } from '../lib/rules';
import { useSettings } from '../lib/settings';
import { useTheme } from '../lib/theme';
import { findUrlAction, parseUrl } from '../lib/urlRules';
import type { Platform } from '../rules';
import { Toast, type ToastHandle } from './Toast';

type Props = {
  platform: Platform;
  /** Bandeau affiché 0,5 s après l'ouverture et à chaque rechargement (ex. « Reels masqués »). */
  welcome?: string;
};

/**
 * WebView qui affiche le site en appliquant les règles activées.
 * (Version iOS/Android. La version web est dans SiteWebView.web.tsx.)
 */
export function SiteWebView({ platform, welcome }: Props) {
  const t = useTheme();
  const webRef = useRef<WebView>(null);
  const { isEnabled, diagnostic } = useSettings();
  const { platforms } = useRules();
  const toast = useRef<ToastHandle>(null);
  /** Chemin de la page affichée (mode diagnostic uniquement). */
  const [path, setPath] = useState('');

  // Le script dépend des réglages : s'ils changent, il est reconstruit.
  const script = useMemo(() => buildInjectedScript(platforms, isEnabled), [platforms, isEnabled]);

  // À l'ouverture : rappel discret de ce qui est masqué.
  useEffect(() => {
    if (welcome) toast.current?.show(welcome, 500);
  }, [welcome]);

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
        userAgent={platform.userAgent}
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
        // Le glissement depuis le bord gauche ramène à OneForAll (geste de la pile d'écrans),
        // pas en arrière dans le site : les sites ont leurs propres flèches de retour.
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
      <Toast ref={toast} />
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
