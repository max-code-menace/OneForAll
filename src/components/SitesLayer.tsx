import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIntro } from '../lib/intro';
import { readLastSite, useOpenSites } from '../lib/openSites';
import { useRules } from '../lib/rules';
import { useSettings } from '../lib/settings';
import { SITE_TEXT } from '../lib/sites';
import { cardShadow, PUSH, useReduceMotion, useTheme } from '../lib/theme';
import { useUsageTimer } from '../lib/usage';
import type { Platform } from '../rules';
import { Mark } from './Mark';
import { SiteWebView } from './SiteWebView';
import { TourMarker, useTour, type TourStep } from './Tour';

const TOUR: TourStep[] = [
  {
    target: 'toast',
    title: 'Ce qui est masqué',
    text: 'À l’ouverture, ce bandeau rappelle ce que OneForAll a retiré de la page.',
    fx: 0,
    fy: 0.5,
    dx: 20,
    r: 999,
  },
  {
    target: 'home-btn',
    title: 'Revenir à OneForAll',
    text: 'Touche le symbole pour retrouver l’accueil de OneForAll. Le réseau reste ouvert : tu le retrouveras là où tu l’as laissé.',
    fx: 0.5,
    fy: 0.5,
    r: 26,
  },
  { target: 'pull', title: 'Recharger la page', text: 'Tire la page vers le bas, puis lâche.', fx: 0.5, fy: 0.15, r: 28, go: [0, 90] },
];

/**
 * Les réseaux, par-dessus l'accueil. Chaque réseau ouvert garde sa page en vie :
 * revenir à l'accueil la cache (vidéos en pause), sans la fermer. Le réseau
 * affiché glisse depuis la droite, comme un écran iOS.
 */
export function SitesLayer() {
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const { opened, active, close, preload } = useOpenSites();
  const { platforms, ready, status } = useRules();
  const { loaded, preload: preloadOn } = useSettings();
  const { splashDone } = useIntro();
  /** Réseau dessiné par-dessus l'accueil (reste affiché pendant qu'il glisse pour partir). */
  const [onTop, setOnTop] = useState<Platform['id'] | null>(null);
  const slide = useRef(new Animated.Value(width)).current;

  useEffect(() => {
    if (active) {
      setOnTop(active);
      slide.setValue(reduce ? 0 : width);
      Animated.timing(slide, { toValue: 0, duration: reduce ? 0 : 320, easing: PUSH, useNativeDriver: true }).start();
    } else {
      Animated.timing(slide, { toValue: width, duration: reduce ? 0 : 280, easing: PUSH, useNativeDriver: true }).start(
        ({ finished }) => finished && setOnTop(null),
      );
    }
    // Ne réagit qu'au réseau demandé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Au lancement : le dernier réseau utilisé se charge en arrière-plan (Réglages →
  // « Préparer au lancement »), une fois l'animation finie et les règles à jour (au plus
  // 3 s d'attente), pour ne pas devoir le recharger aussitôt avec des règles plus récentes.
  const preloadStarted = useRef(false);
  useEffect(() => {
    if (preloadStarted.current || !loaded || !ready || !splashDone || !preloadOn) return;
    const go = () => {
      if (preloadStarted.current) return;
      preloadStarted.current = true;
      readLastSite().then((id) => id && preload(id));
    };
    if (status.state !== 'checking') {
      go();
      return;
    }
    const timer = setTimeout(go, 3000);
    return () => clearTimeout(timer);
  }, [loaded, ready, splashDone, preloadOn, status.state, preload]);

  // Android : le bouton retour ramène à l'accueil (le réseau reste ouvert).
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [active, close]);

  // On attend les réglages pour ne pas charger une page sans les bonnes règles.
  if (!loaded || !ready) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={onTop ? 'box-none' : 'none'}>
      {opened.map((id) => {
        const platform = platforms.find((p) => p.id === id);
        if (!platform) return null;
        const top = id === onTop;
        return (
          <Animated.View
            key={id}
            // Caché : invisible, hors de l'écran, ne reçoit aucun appui et n'est pas lu par VoiceOver.
            pointerEvents={top ? 'auto' : 'none'}
            accessibilityElementsHidden={!top}
            importantForAccessibility={top ? 'auto' : 'no-hide-descendants'}
            style={[
              StyleSheet.absoluteFill,
              top ? { zIndex: 1, transform: [{ translateX: slide }] } : { opacity: 0, transform: [{ translateX: width }] },
            ]}
          >
            <SiteScreen platform={platform} visible={id === active} onHome={close} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Un réseau, en plein écran (pas de barre) :
 * - le bouton rond (le symbole) = retour à l'accueil de OneForAll ;
 * - tirer la page vers le bas = recharger.
 */
function SiteScreen({ platform, visible, onHome }: { platform: Platform; visible: boolean; onHome: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Petit tuto la 1re fois qu'on affiche un site (une fois le bandeau affiché).
  const tour = useTour('browser', TOUR, visible, 1100);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {visible && <UsageTimer id={platform.id} />}
      <SiteWebView
        platform={platform}
        visible={visible}
        welcome={SITE_TEXT[platform.id]?.toast}
        holdWelcome={tour.running}
        toastRef={tour.target('toast')}
      />

      {/* Repères du tuto : zones des gestes. */}
      <TourMarker markerRef={tour.target('pull')} style={{ left: 16, right: 16, top: insets.top + 8, height: 120 }} />

      <Pressable
        ref={tour.target('home-btn')}
        accessibilityRole="button"
        accessibilityLabel="Retour à OneForAll"
        hitSlop={6}
        onPress={onHome}
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

/** Temps du jour : compté seulement pendant que le réseau est affiché. */
function UsageTimer({ id }: { id: string }) {
  useUsageTimer(id);
  return null;
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
