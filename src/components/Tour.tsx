import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useSettings } from '../lib/settings';
import { EASE, PUSH, useReduceMotion, useTheme } from '../lib/theme';

/**
 * Petit tuto, la 1re fois sur un écran (accueil, site, réglages) : l'écran
 * s'assombrit sauf l'élément expliqué, un point terracotta pulse dessus, une
 * bulle explique. Suivant / Passer, puis plus jamais (souvenir gardé sur le téléphone).
 */

export type TourScreen = 'home' | 'browser' | 'settings';

export type TourStep = {
  /** Nom de l'élément visé (voir `target()`). */
  target: string;
  title: string;
  text: string;
  /** Position du point dans l'élément (0 à 1) et décalage éventuel en pt. */
  fx: number;
  fy: number;
  dx?: number;
  /** Arrondi du « trou ». */
  r: number;
  /** Geste à mimer : le point glisse de [x, y] pt, en boucle. */
  go?: [number, number];
};

const SEEN_KEY = 'oneforall:tour-seen:v1';
const SHADE = 'rgba(20,18,16,0.55)';
const PAD = 6;
/** Bordure géante qui assombrit tout autour du « trou ». */
const B = 2000;

type Rect = { x: number; y: number; w: number; h: number };

async function readSeen(): Promise<Record<string, boolean>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

/** « Revoir la présentation » : le tuto de chaque écran s'affichera de nouveau. */
export async function resetTours(): Promise<void> {
  await AsyncStorage.removeItem(SEEN_KEY).catch(() => {});
}

/**
 * `ready` : l'écran est prêt (rien d'autre par-dessus). Les éléments visés se
 * déclarent avec `target('nom')` (à poser en `ref` sur une View).
 * `onEnd` est appelé quand le tuto se termine (ou tout de suite s'il a déjà été vu).
 */
export function useTour(screen: TourScreen, steps: TourStep[], ready: boolean, delay = 450) {
  const refs = useRef<Record<string, RefObject<View | null>>>({});
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const target = useCallback((key: string) => {
    if (!refs.current[key]) refs.current[key] = { current: null };
    return refs.current[key];
  }, []);

  // Ne garde que les étapes dont l'élément existe à l'écran.
  const visibleSteps = useRef<TourStep[]>([]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const seen = await readSeen();
      if (cancelled || seen[screen]) return;
      visibleSteps.current = steps.filter((s) => refs.current[s.target]?.current);
      if (!visibleSteps.current.length) return;
      setIndex(0);
      setRunning(true);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Une seule fois par écran, quand il devient prêt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Mesure l'élément visé à chaque étape.
  useEffect(() => {
    if (!running) return;
    const step = visibleSteps.current[index];
    const el = step && refs.current[step.target]?.current;
    if (!el) return;
    el.measureInWindow((x, y, w, h) => setRect({ x, y, w, h }));
  }, [running, index]);

  const end = useCallback(async () => {
    setRunning(false);
    setRect(null);
    setIndex(0);
    const seen = await readSeen();
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify({ ...seen, [screen]: true })).catch(() => {});
  }, [screen]);

  const next = useCallback(() => {
    if (index + 1 < visibleSteps.current.length) setIndex(index + 1);
    else end();
  }, [index, end]);

  const element = running ? (
    <TourOverlay
      step={visibleSteps.current[index]}
      rect={rect}
      position={visibleSteps.current.length > 1 ? `${index + 1} sur ${visibleSteps.current.length}` : ''}
      last={index + 1 === visibleSteps.current.length}
      onNext={next}
      onSkip={end}
    />
  ) : null;

  return { target, element, running };
}

/**
 * Le voile du tuto, monté du début à la fin (pas de saut entre deux étapes) :
 * - à l'ouverture, l'écran s'assombrit doucement et le trou se resserre sur l'élément ;
 * - « Suivant » : la bulle s'efface, le trou et le point glissent vers l'élément suivant,
 *   puis la nouvelle bulle apparaît à sa place ;
 * - à la fin, tout s'efface avant de rendre la main.
 * Le trou change de taille (largeur, hauteur) : animé sans le pilote natif, le reste l'est.
 */
function TourOverlay({
  step,
  rect,
  position,
  last,
  onNext,
  onSkip,
}: {
  step: TourStep;
  rect: Rect | null;
  position: string;
  last: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const { haptics } = useSettings();
  const { height: H } = useWindowDimensions();
  const bubbleH = useRef(150);
  /** Bulle visible et touchable (pas pendant un changement d'étape). */
  const [ready, setReady] = useState(false);

  // Voile entier, bulle, point.
  const shade = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;
  const bubbleY = useRef(new Animated.Value(0)).current;
  const dotX = useRef(new Animated.Value(0)).current;
  const dotY = useRef(new Animated.Value(0)).current;
  const dotIn = useRef(new Animated.Value(0)).current;
  // Trou (position, taille, arrondi).
  const holeX = useRef(new Animated.Value(0)).current;
  const holeY = useRef(new Animated.Value(0)).current;
  const holeW = useRef(new Animated.Value(0)).current;
  const holeH = useRef(new Animated.Value(0)).current;
  const holeR = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const go = useRef(new Animated.Value(0)).current;
  const goFade = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  const leaving = useRef(false);

  const feel = () => {
    if (haptics) Haptics.selectionAsync().catch(() => {});
  };

  /** Place de la bulle : sous le trou s'il y a la place, sinon au-dessus. */
  const bubbleTop = (r: Rect) => {
    const holeTop = r.y - PAD;
    const holeBottom = r.y + r.h + PAD;
    return holeBottom + 18 + bubbleH.current < H - 24 ? holeBottom + 18 : Math.max(24, holeTop - 18 - bubbleH.current);
  };

  // Nouvel élément mesuré : le trou et le point y glissent, puis la bulle apparaît.
  useEffect(() => {
    if (!rect) return;
    const hole = { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 };
    const radius = Math.min(step.r, hole.w / 2, hole.h / 2);
    const cx = rect.x + rect.w * step.fx + (step.dx ?? 0);
    const cy = rect.y + rect.h * step.fy;
    const move = reduce ? 0 : 460;

    const showBubble = () => {
      bubbleY.setValue(bubbleTop(rect) + (reduce ? 0 : 10));
      setReady(true);
      Animated.parallel([
        Animated.timing(bubble, { toValue: 1, duration: reduce ? 150 : 280, easing: EASE, useNativeDriver: true }),
        Animated.timing(bubbleY, { toValue: bubbleTop(rect), duration: reduce ? 0 : 380, easing: EASE, useNativeDriver: true }),
      ]).start();
    };

    if (first.current) {
      // Ouverture : trou large et voile transparent, qui se resserrent ensemble.
      first.current = false;
      const grow = reduce ? 0 : 60;
      holeX.setValue(hole.x - grow);
      holeY.setValue(hole.y - grow);
      holeW.setValue(hole.w + grow * 2);
      holeH.setValue(hole.h + grow * 2);
      holeR.setValue(radius + grow);
      dotX.setValue(cx);
      dotY.setValue(cy);
      Animated.parallel([
        Animated.timing(shade, { toValue: 1, duration: reduce ? 200 : 420, easing: EASE, useNativeDriver: true }),
        ...holeTo(hole, radius, reduce ? 0 : 560),
        Animated.sequence([
          Animated.delay(reduce ? 0 : 260),
          Animated.spring(dotIn, { toValue: 1, speed: 14, bounciness: 8, useNativeDriver: true }),
        ]),
      ]).start();
      setTimeout(showBubble, reduce ? 150 : 300);
      return;
    }

    Animated.parallel([
      ...holeTo(hole, radius, move),
      Animated.timing(dotX, { toValue: cx, duration: move, easing: PUSH, useNativeDriver: true }),
      Animated.timing(dotY, { toValue: cy, duration: move, easing: PUSH, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(showBubble, reduce ? 0 : move - 160);
    return () => clearTimeout(timer);
    // Seulement quand l'élément visé est mesuré.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect]);

  function holeTo(hole: { x: number; y: number; w: number; h: number }, radius: number, duration: number) {
    const anim = (v: Animated.Value, toValue: number) =>
      Animated.timing(v, { toValue, duration, easing: PUSH, useNativeDriver: false });
    return [anim(holeX, hole.x), anim(holeY, hole.y), anim(holeW, hole.w), anim(holeH, hole.h), anim(holeR, radius)];
  }

  // Le point pulse doucement, en continu.
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);

  // Geste à mimer : le point glisse, s'efface, revient au départ, réapparaît (pas de saut visible).
  useEffect(() => {
    go.setValue(0);
    goFade.setValue(1);
    if (!step.go || reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(go, { toValue: 1, duration: 900, easing: EASE, useNativeDriver: true }),
        Animated.timing(goFade, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(go, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(goFade, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [step, go, goFade, reduce]);

  /** La bulle s'efface, puis on passe à l'étape suivante. */
  function next() {
    if (!ready || leaving.current) return;
    feel();
    if (last) return leave(onNext);
    setReady(false);
    Animated.timing(bubble, { toValue: 0, duration: reduce ? 100 : 160, easing: EASE, useNativeDriver: true }).start(() =>
      onNext(),
    );
  }

  /** Tout s'efface, puis le tuto se termine. */
  function leave(done: () => void) {
    if (leaving.current) return;
    leaving.current = true;
    setReady(false);
    Animated.parallel([
      Animated.timing(shade, { toValue: 0, duration: reduce ? 150 : 300, easing: EASE, useNativeDriver: true }),
      Animated.timing(bubble, { toValue: 0, duration: reduce ? 100 : 200, easing: EASE, useNativeDriver: true }),
    ]).start(() => done());
  }

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={() => leave(onSkip)}>
      {/* Bloque les touches sur l'écran pendant le tuto. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} accessible={false}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: shade }]}>
          <Animated.View
            style={{
              position: 'absolute',
              left: Animated.subtract(holeX, B),
              top: Animated.subtract(holeY, B),
              width: Animated.add(holeW, B * 2),
              height: Animated.add(holeH, B * 2),
              borderWidth: B,
              borderColor: SHADE,
              borderRadius: Animated.add(holeR, B),
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              left: -9,
              top: -9,
              width: 18,
              height: 18,
              opacity: Animated.multiply(dotIn, goFade),
              transform: [
                { translateX: dotX },
                { translateY: dotY },
                ...(step.go
                  ? [
                      { translateX: go.interpolate({ inputRange: [0, 1], outputRange: [0, step.go[0]] }) },
                      { translateY: go.interpolate({ inputRange: [0, 1], outputRange: [0, step.go[1]] }) },
                    ]
                  : []),
                { scale: dotIn.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
              ],
            }}
          >
            <Animated.View
              style={[
                styles.ring,
                {
                  backgroundColor: t.accent,
                  opacity: reduce ? 0.3 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: reduce ? 1.6 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.8] }) }],
                },
              ]}
            />
            <View style={[styles.dot, { backgroundColor: t.accent }]} />
          </Animated.View>
        </Animated.View>

        <Animated.View
          onLayout={(e) => {
            bubbleH.current = e.nativeEvent.layout.height;
          }}
          pointerEvents={ready ? 'auto' : 'none'}
          style={[
            styles.bubble,
            {
              top: 0,
              backgroundColor: t.surface,
              opacity: bubble,
              transform: [
                { translateY: bubbleY },
                { scale: reduce ? 1 : bubble.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
              ],
            },
          ]}
          accessibilityViewIsModal
        >
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.ink }}>{step.title}</Text>
          <Text style={{ fontSize: 15, lineHeight: 21, color: t.ink2 }}>{step.text}</Text>
          <View style={styles.actions}>
            <Text style={{ flex: 1, fontSize: 13, color: t.ink3 }}>{position}</Text>
            {!last && (
              <Pressable
                accessibilityRole="button"
                onPress={() => leave(onSkip)}
                style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Text style={{ fontSize: 15, color: t.ink2 }}>Passer</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={next}
              style={({ pressed }) => [
                styles.next,
                { backgroundColor: t.primary, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
              ]}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: t.onPrimary }}>{last ? 'Compris' : 'Suivant'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** Repère invisible pour le tuto (zone d'un geste, par exemple un bord de l'écran). */
export function TourMarker({ markerRef, style }: { markerRef: RefObject<View | null>; style: object }): ReactNode {
  return <View ref={markerRef} collapsable={false} pointerEvents="none" style={[{ position: 'absolute' }, style]} />;
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: 0, top: 0, width: 18, height: 18, borderRadius: 9 },
  dot: {
    position: 'absolute',
    left: 3,
    top: 3,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFDFA',
  },
  bubble: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  skip: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  next: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center' },
});
