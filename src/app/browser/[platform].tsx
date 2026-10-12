import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mark } from '../../components/Mark';
import { SiteWebView } from '../../components/SiteWebView';
import { useRules } from '../../lib/rules';
import { useSettings } from '../../lib/settings';
import { SITE_TEXT } from '../../lib/sites';
import { cardShadow, useTheme } from '../../lib/theme';
import { useUsageTimer } from '../../lib/usage';

/** Une fois vu, l'astuce « glisser pour revenir » laisse place au bandeau habituel. */
const SWIPE_HINT_KEY = 'oneforall:swipe-hint-seen:v1';
const SWIPE_HINT = 'Glisse depuis le bord gauche pour revenir à OneForAll';

/**
 * Écran qui affiche un réseau social, en plein écran (pas de barre) :
 * glisser depuis le bord gauche = retour à l'accueil, tirer vers le bas = recharger.
 * Un petit bouton rond (le symbole) ramène aussi à l'accueil, pour qui ne connaît pas le geste.
 */
export default function BrowserScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { platform: platformId } = useLocalSearchParams<{ platform: string }>();
  const { platforms, ready } = useRules();
  const platform = platforms.find((p) => p.id === platformId);
  const { loaded } = useSettings();
  /** Texte du bandeau d'ouverture ; null tant qu'on ne sait pas si l'astuce a été vue. */
  const [welcome, setWelcome] = useState<string | null>(null);
  useUsageTimer(platformId);

  useEffect(() => {
    AsyncStorage.getItem(SWIPE_HINT_KEY)
      .then((seen) => {
        if (seen === 'true') return setWelcome(SITE_TEXT[platformId]?.toast ?? '');
        setWelcome(SWIPE_HINT);
        AsyncStorage.setItem(SWIPE_HINT_KEY, 'true').catch(() => {});
      })
      .catch(() => setWelcome(SITE_TEXT[platformId]?.toast ?? ''));
  }, [platformId]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {!platform ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.ink2 }}>Plateforme inconnue : {platformId}</Text>
        </View>
      ) : // On attend les réglages pour ne pas charger la page sans les bonnes règles.
      loaded && ready && welcome !== null ? (
        <SiteWebView platform={platform} welcome={welcome || undefined} />
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retour à OneForAll"
        hitSlop={6}
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.home,
          { bottom: insets.bottom + 72, backgroundColor: t.surface, opacity: pressed ? 0.6 : 0.92 },
          cardShadow(t),
        ]}
      >
        <Mark size={22} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  home: {
    position: 'absolute',
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
