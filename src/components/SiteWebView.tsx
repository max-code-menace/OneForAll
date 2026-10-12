import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { findBannedSite } from '../lib/banned';
import { AFTER_LOAD_SCRIPT, buildInjectedScript } from '../lib/buildInjection';
import { useRules } from '../lib/rules';
import { useSettings } from '../lib/settings';
import { findUrlAction, parseUrl } from '../lib/urlRules';
import type { Platform } from '../rules';

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
  const { isEnabled, diagnostic } = useSettings();
  const { platforms } = useRules();
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Chemin de la page affichée (mode diagnostic uniquement). */
  const [path, setPath] = useState('');

  // Le script dépend des réglages : s'ils changent, il est reconstruit.
  const script = useMemo(() => buildInjectedScript(platforms, isEnabled), [platforms, isEnabled]);

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
    // Sites bannis (TikTok) : jamais ouverts, quel que soit le lien cliqué.
    const banned = findBannedSite(req.url);
    if (banned) {
      if (req.isTopFrame !== false) showBanner(`🚫 ${banned} est banni`);
      return false;
    }

    const action = findUrlAction(platforms, req.url, isEnabled);
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
      if (msg.type === 'path' && typeof msg.path === 'string') setPath(msg.path);
    } catch {
      // message qui ne vient pas de nous : on l'ignore
    }
  }

  function onNavigationStateChange(nav: WebViewNavigation) {
    onCanGoBackChange?.(nav.canGoBack);
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
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
      />
      {diagnostic && (
        <View pointerEvents="none" style={styles.diagnostic}>
          <Text style={styles.diagnosticText} numberOfLines={2}>
            Page : {path || '…'}
          </Text>
        </View>
      )}
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
  diagnostic: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '92%',
  },
  diagnosticText: { color: '#9f9', fontSize: 12, fontFamily: 'Menlo' },
});
