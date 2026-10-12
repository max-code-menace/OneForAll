import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { AFTER_LOAD_SCRIPT, buildInjectedScript } from '../lib/buildInjection';
import { useSettings } from '../lib/settings';
import { findUrlAction } from '../lib/urlRules';
import { PLATFORMS, type Platform } from '../rules';

type Props = {
  platform: Platform;
  /** Prévient l'écran parent quand on peut revenir en arrière dans le site. */
  onCanGoBackChange?: (canGoBack: boolean) => void;
  /** Donne au parent les commandes "retour" et "recharger". */
  controlsRef?: React.RefObject<{ goBack: () => void; reload: () => void } | null>;
};

/**
 * WebView qui affiche le site en appliquant les règles activées.
 * (Version iOS/Android. La version web est dans SiteWebView.web.tsx.)
 */
export function SiteWebView({ platform, onCanGoBackChange, controlsRef }: Props) {
  const webRef = useRef<WebView>(null);
  const { isEnabled } = useSettings();
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Le script dépend des réglages : s'ils changent, il est reconstruit.
  const script = useMemo(() => buildInjectedScript(PLATFORMS, isEnabled), [isEnabled]);

  if (controlsRef) {
    controlsRef.current = {
      goBack: () => webRef.current?.goBack(),
      reload: () => webRef.current?.reload(),
    };
  }

  function showBanner(text: string) {
    setBanner(text);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 2500);
  }

  /** Appelé AVANT chaque chargement de page : on bloque/redirige si besoin. */
  function onShouldStartLoadWithRequest(req: ShouldStartLoadRequest): boolean {
    const action = findUrlAction(req.url, isEnabled);
    if (!action) return true;

    // Contenu intégré (iframe) interdit : on le bloque sans rien dire.
    if (req.isTopFrame === false) return false;

    if (action.type === 'block') {
      showBanner(`🚫 ${action.platform.name} est bloqué`);
    } else {
      showBanner(`↪︎ ${action.rule.label}`);
      webRef.current?.injectJavaScript(`location.replace(${JSON.stringify(action.url)}); true;`);
    }
    return false;
  }

  /** Messages envoyés par le script injecté (redirection / blocage). */
  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'blocked') showBanner(`🚫 ${msg.label ?? 'Bloqué'}`);
      if (msg.type === 'redirected' && msg.label) showBanner(`↪︎ ${msg.label}`);
    } catch {
      // message qui ne vient pas de nous : on l'ignore
    }
  }

  function onNavigationStateChange(nav: WebViewNavigation) {
    onCanGoBackChange?.(nav.canGoBack);
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
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
      />
      {banner && (
        <View pointerEvents="none" style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '90%',
  },
  bannerText: { color: '#fff', fontSize: 14 },
});
