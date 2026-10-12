import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SiteWebView } from '../../components/SiteWebView';
import { useRules } from '../../lib/rules';
import { useSettings } from '../../lib/settings';
import { SITE_TEXT } from '../../lib/sites';
import { useTheme } from '../../lib/theme';

/** Une fois vu, l'astuce « glisser pour revenir » laisse place au bandeau habituel. */
const SWIPE_HINT_KEY = 'oneforall:swipe-hint-seen:v1';
const SWIPE_HINT = 'Glisse depuis le bord gauche pour revenir à OneForAll';

/**
 * Écran qui affiche un réseau social, en plein écran (pas de barre) :
 * glisser depuis le bord gauche = retour à l'accueil, tirer vers le bas = recharger.
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
    </View>
  );
}
