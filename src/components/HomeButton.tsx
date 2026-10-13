import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '../lib/settings';
import { cardShadow, useReduceMotion, useTheme } from '../lib/theme';
import { Mark } from './Mark';

const SIZE = 48;
/** Écart minimal avec les bords de l'écran. */
const MARGIN = 10;
/** Au-delà de ce déplacement (pt), l'appui devient un glissement : le bouton suit le doigt. */
const DRAG_START = 10;
/** Près d'un bord gauche/droit, le bouton s'y colle. */
const MAGNET = 36;

/**
 * Le bouton rond, dans un réseau :
 * - toucher = retour à l'accueil de OneForAll (petite vibration dès que le doigt se pose) ;
 * - glisser = le déplacer où l'on veut (haut, bas, milieu, gauche, droite). Sa place est
 *   gardée sur le téléphone, la même pour tous les réseaux (Réglages → Bouton de retour).
 */
export function HomeButton({ onHome, markerRef }: { onHome: () => void; markerRef?: RefObject<View | null> }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { homePos, setHomePos, haptics } = useSettings();

  // Zone permise pour le coin haut-gauche du bouton (hors encoche et barre du bas).
  const area = useMemo(() => {
    const minX = MARGIN + insets.left;
    const maxX = width - SIZE - MARGIN - insets.right;
    const minY = insets.top + MARGIN;
    const maxY = height - SIZE - MARGIN - insets.bottom;
    return { minX, maxX, minY, maxY };
  }, [width, height, insets.left, insets.right, insets.top, insets.bottom]);

  /** Place enregistrée → position à l'écran. Par défaut : en bas à droite (comme avant). */
  const toPoint = (pos: typeof homePos) =>
    pos
      ? { x: area.minX + pos.x * (area.maxX - area.minX), y: area.minY + pos.y * (area.maxY - area.minY) }
      : { x: area.maxX, y: Math.max(area.minY, height - insets.bottom - 72 - SIZE) };

  const start = toPoint(homePos);
  const xy = useRef(new Animated.ValueXY(start)).current;
  const scale = useRef(new Animated.Value(1)).current;
  /** Position actuelle (Animated ne permet pas de la lire simplement). */
  const current = useRef(start);

  // Place changée ailleurs (autre réseau, Réglages) ou écran tourné.
  useEffect(() => {
    const p = toPoint(homePos);
    current.current = p;
    xy.setValue(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homePos, area]);

  // Les fonctions changent à chaque affichage ; le PanResponder, lui, est créé une fois.
  const latest = useRef({ onHome, haptics, area, setHomePos, reduce });
  latest.current = { onHome, haptics, area, setHomePos, reduce };

  const pan = useMemo(() => {
    let origin = { x: 0, y: 0 };
    let dragging = false;

    const feel = (kind: 'press' | 'lift' | 'drop') => {
      if (!latest.current.haptics) return;
      const run =
        kind === 'press'
          ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          : kind === 'lift'
            ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
            : Haptics.selectionAsync();
      run.catch(() => {});
    };
    const scaleTo = (v: number) =>
      Animated.spring(scale, { toValue: v, speed: 40, bounciness: 6, useNativeDriver: true }).start();
    const clamp = (x: number, y: number) => {
      const a = latest.current.area;
      return { x: Math.min(a.maxX, Math.max(a.minX, x)), y: Math.min(a.maxY, Math.max(a.minY, y)) };
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // La page du réseau ne peut pas « voler » le geste en cours.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        origin = current.current;
        dragging = false;
        feel('press');
        scaleTo(0.86);
      },
      onPanResponderMove: (_, g) => {
        if (!dragging && Math.hypot(g.dx, g.dy) < DRAG_START) return;
        if (!dragging) {
          dragging = true;
          feel('lift');
          scaleTo(1.18);
        }
        const p = clamp(origin.x + g.dx, origin.y + g.dy);
        current.current = p;
        xy.setValue(p);
      },
      onPanResponderRelease: () => {
        scaleTo(1);
        if (!dragging) {
          latest.current.onHome();
          return;
        }
        const a = latest.current.area;
        let { x, y } = current.current;
        // Aimant : collé au bord gauche ou droit s'il en est tout près.
        if (x - a.minX < MAGNET) x = a.minX;
        else if (a.maxX - x < MAGNET) x = a.maxX;
        current.current = { x, y };
        if (latest.current.reduce) xy.setValue({ x, y });
        else Animated.spring(xy, { toValue: { x, y }, speed: 24, bounciness: 4, useNativeDriver: true }).start();
        feel('drop');
        const w = a.maxX - a.minX;
        const h = a.maxY - a.minY;
        latest.current.setHomePos({ x: w > 0 ? (x - a.minX) / w : 1, y: h > 0 ? (y - a.minY) / h : 1 });
      },
      onPanResponderTerminate: () => {
        scaleTo(1);
        if (dragging) xy.setValue(current.current);
      },
    });
  }, [scale, xy]);

  return (
    <Animated.View
      {...pan.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Retour à OneForAll"
      accessibilityHint="Tu peux aussi le faire glisser pour le changer de place."
      onAccessibilityTap={onHome}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && onHome()}
      hitSlop={8}
      style={[styles.home, { transform: [...xy.getTranslateTransform(), { scale }] }]}
    >
      <View ref={markerRef} style={[styles.inner, { backgroundColor: t.surface }, cardShadow(t)]}>
        <Mark size={22} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  home: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
  },
  inner: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.94,
  },
});
