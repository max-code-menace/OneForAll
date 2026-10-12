import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SiteWebView } from '../../components/SiteWebView';
import { BackButton } from '../../components/ui';
import { useRules } from '../../lib/rules';
import { useSettings } from '../../lib/settings';
import { displayHost, SITE_TEXT } from '../../lib/sites';
import { EASE, useReduceMotion, useTheme } from '../../lib/theme';

/** Écran qui affiche un réseau social. */
export default function BrowserScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { platform: platformId } = useLocalSearchParams<{ platform: string }>();
  const { platforms, ready } = useRules();
  const platform = platforms.find((p) => p.id === platformId);
  const { loaded } = useSettings();
  const [canGoBack, setCanGoBack] = useState(false);
  const controls = useRef<{ goBack: () => void; reload: () => void } | null>(null);
  const spin = useRef(new Animated.Value(0)).current;

  function reload() {
    controls.current?.reload();
    if (reduce) return;
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 600, easing: EASE, useNativeDriver: true }).start();
  }
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={[styles.bar, { borderBottomColor: t.sep }]}>
        <View style={styles.title} pointerEvents="none">
          <Text style={{ fontSize: 17, fontWeight: '600', color: t.ink }}>{platform?.name ?? ''}</Text>
          {platform && <Text style={{ fontSize: 11, color: t.ink3 }}>{displayHost(platform.startUrl)}</Text>}
        </View>
        <BackButton label="Accueil" />
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Page précédente"
            disabled={!canGoBack}
            onPress={() => controls.current?.goBack()}
            style={styles.action}
          >
            <View style={[styles.circle, { backgroundColor: t.surface2, opacity: canGoBack ? 1 : 0.5 }]}>
              <Text style={{ fontSize: 17, color: canGoBack ? t.ink : t.ink3 }}>←</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Recharger" onPress={reload} style={styles.action}>
            <Animated.View style={[styles.circle, { backgroundColor: t.surface2, transform: [{ rotate }] }]}>
              <Text style={{ fontSize: 17, color: t.ink }}>↻</Text>
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {!platform ? (
        <View style={styles.center}>
          <Text style={{ color: t.ink2 }}>Plateforme inconnue : {platformId}</Text>
        </View>
      ) : // On attend les réglages pour ne pas charger la page sans les bonnes règles.
      loaded && ready ? (
        <SiteWebView
          platform={platform}
          onCanGoBackChange={setCanGoBack}
          controlsRef={controls}
          welcome={SITE_TEXT[platform.id]?.toast}
        />
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row' },
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
