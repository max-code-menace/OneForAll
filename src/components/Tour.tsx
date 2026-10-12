import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { EASE, useReduceMotion, useTheme } from '../lib/theme';

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
  const { height: H } = useWindowDimensions();
  const [bubbleH, setBubbleH] = useState(150);
  const appear = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const go = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: reduce ? 200 : 320, easing: EASE, useNativeDriver: true }).start();
  }, [step, appear, reduce]);

  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);

  useEffect(() => {
    go.setValue(0);
    if (!step.go || reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(250),
        Animated.timing(go, { toValue: 1, duration: 900, easing: EASE, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(go, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [step, go, reduce]);

  if (!rect) return null;
  const hole = { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 };
  const below = hole.y + hole.h + 18 + bubbleH < H - 24;
  const bubbleTop = below ? hole.y + hole.h + 18 : Math.max(24, hole.y - 18 - bubbleH);
  const cx = rect.x + rect.w * step.fx + (step.dx ?? 0);
  const cy = rect.y + rect.h * step.fy;
  const radius = Math.min(step.r, hole.w / 2, hole.h / 2);

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      {/* Bloque les touches sur l'écran pendant le tuto. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} accessible={false}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: hole.x - B,
            top: hole.y - B,
            width: hole.w + B * 2,
            height: hole.h + B * 2,
            borderWidth: B,
            borderColor: SHADE,
            borderRadius: radius + B,
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: cx - 9,
            top: cy - 9,
            width: 18,
            height: 18,
            opacity: appear,
            transform: step.go
              ? [
                  { translateX: go.interpolate({ inputRange: [0, 1], outputRange: [0, step.go[0]] }) },
                  { translateY: go.interpolate({ inputRange: [0, 1], outputRange: [0, step.go[1]] }) },
                ]
              : [],
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

        <Animated.View
          onLayout={(e) => setBubbleH(e.nativeEvent.layout.height)}
          style={[
            styles.bubble,
            {
              top: bubbleTop,
              backgroundColor: t.surface,
              opacity: appear,
              transform: [{ translateY: reduce ? 0 : appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
          accessibilityViewIsModal
        >
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.ink }}>{step.title}</Text>
          <Text style={{ fontSize: 15, lineHeight: 21, color: t.ink2 }}>{step.text}</Text>
          <View style={styles.actions}>
            <Text style={{ flex: 1, fontSize: 13, color: t.ink3 }}>{position}</Text>
            {!last && (
              <Pressable accessibilityRole="button" onPress={onSkip} style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.5 : 1 }]}>
                <Text style={{ fontSize: 15, color: t.ink2 }}>Passer</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={onNext}
              style={({ pressed }) => [styles.next, { backgroundColor: t.primary, opacity: pressed ? 0.8 : 1 }]}
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
