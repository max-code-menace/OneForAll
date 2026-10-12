import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mark } from '../../components/Mark';
import { SiteWebView } from '../../components/SiteWebView';
import { TourMarker, useTour, type TourStep } from '../../components/Tour';
import { useRules } from '../../lib/rules';
import { useSettings } from '../../lib/settings';
import { SITE_TEXT } from '../../lib/sites';
import { cardShadow, useTheme } from '../../lib/theme';
import { useUsageTimer } from '../../lib/usage';

const TOUR: TourStep[] = [
  {
    target: 'toast',
    title: 'Ce qui est masqué',
    text: 'À chaque ouverture, ce bandeau rappelle ce que OneForAll a retiré de la page.',
    fx: 0,
    fy: 0.5,
    dx: 20,
    r: 999,
  },
  {
    target: 'edge-right',
    title: 'Onglet suivant',
    text: 'Glisse ton doigt de droite à gauche pour découvrir l’onglet suivant sans quitter la page.',
    fx: 0.5,
    fy: 0.5,
    r: 14,
    go: [-150, 0],
  },
  {
    target: 'edge-left',
    title: 'Onglet précédent',
    text: 'Glisse ton doigt de gauche à droite pour revenir à l’onglet précédent sans quitter la page.',
    fx: 0.5,
    fy: 0.5,
    r: 14,
    go: [150, 0],
  },
  {
    target: 'home-btn',
    title: 'Revenir à OneForAll',
    text: 'Touche le symbole pour retrouver l’accueil de OneForAll.',
    fx: 0.5,
    fy: 0.5,
    r: 26,
  },
  { target: 'pull', title: 'Recharger la page', text: 'Tire la page vers le bas, puis lâche.', fx: 0.5, fy: 0.15, r: 28, go: [0, 90] },
];

/**
 * Écran qui affiche un réseau social, en plein écran (pas de barre) :
 * - glisser depuis le bord droit = onglet suivant du réseau, depuis le bord gauche = onglet précédent
 *   (repéré dans la page, qui envoie « edgeSwipe » à SiteWebView) ;
 * - le bouton rond (le symbole) = retour à OneForAll ;
 * - tirer la page vers le bas = recharger.
 */
export default function BrowserScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { platform: platformId } = useLocalSearchParams<{ platform: string }>();
  const { platforms, ready } = useRules();
  const platform = platforms.find((p) => p.id === platformId);
  const { loaded } = useSettings();
  const controls = useRef<{ goTab: (dir: 1 | -1) => void } | null>(null);
  useUsageTimer(platformId);

  const showing = !!platform && loaded && ready;
  // Petit tuto la 1re fois qu'on ouvre un site (une fois le bandeau affiché).
  const tour = useTour('browser', TOUR, showing, 1100);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {!platform ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.ink2 }}>Plateforme inconnue : {platformId}</Text>
        </View>
      ) : // On attend les réglages pour ne pas charger la page sans les bonnes règles.
      showing ? (
        <SiteWebView
          platform={platform}
          welcome={SITE_TEXT[platform.id]?.toast}
          holdWelcome={tour.running}
          toastRef={tour.target('toast')}
          controlsRef={controls}
        />
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {/* Repères du tuto : zones des gestes (le glissement depuis un bord est repéré
          dans la page elle-même, voir buildInjection.ts : les boutons du site au bord
          de l'écran restent utilisables). */}
      <TourMarker markerRef={tour.target('edge-left')} style={{ left: 0, top: '38%', width: 26, height: 150 }} />
      <TourMarker markerRef={tour.target('edge-right')} style={{ right: 0, top: '38%', width: 26, height: 150 }} />
      <TourMarker markerRef={tour.target('pull')} style={{ left: 16, right: 16, top: insets.top + 8, height: 120 }} />

      <Pressable
        ref={tour.target('home-btn')}
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
      {tour.element}
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
