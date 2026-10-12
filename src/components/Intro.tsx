import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIntro } from '../lib/intro';
import { cardShadow, EASE, PUSH, useReduceMotion, useTheme } from '../lib/theme';
import { CENTER_SIZE, DOT_SIZE, dotOffset, Mark, MARK_BOX } from './Mark';
import { PrimaryButton } from './ui';

/**
 * Par-dessus la navigation : l'animation de lancement, puis la présentation
 * (au premier lancement). Au lancement, le symbole glisse jusqu'à sa place sur
 * la première page de la présentation : aucune coupure entre les deux.
 */
export function Intro() {
  const { loaded, onboardingVisible, splashDone, setSplashDone } = useIntro();
  const onbMarkRef = useRef<View>(null);

  return (
    <>
      {loaded && <Onboarding visible={onboardingVisible} markRef={onbMarkRef} markShown={splashDone} />}
      {!splashDone && (
        <Splash ready={loaded} toOnboarding={onboardingVisible} targetRef={onbMarkRef} onDone={setSplashDone} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Lancement
// ---------------------------------------------------------------------------

function Splash({
  ready,
  toOnboarding,
  targetRef,
  onDone,
}: {
  ready: boolean;
  toOnboarding: boolean;
  targetRef: React.RefObject<View | null>;
  onDone: () => void;
}) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const markRef = useRef<View>(null);
  const center = useRef(new Animated.Value(0)).current;
  const dots = useRef([0, 1, 2, 3, 4, 5, 6, 7].map(() => new Animated.Value(0))).current;
  const dotsOpacity = useRef([0, 1, 2, 3, 4, 5, 6, 7].map(() => new Animated.Value(0))).current;
  const move = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const bg = useRef(new Animated.Value(1)).current;
  const markOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ready) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const run = (v: Animated.Value, toValue: number, duration: number, delay = 0, easing = EASE) =>
      Animated.timing(v, { toValue, duration, delay, easing, useNativeDriver: true }).start();
    const fade = (v: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(v, { toValue, duration, useNativeDriver: true }).start();

    // Lancements suivants (présentation déjà vue) : pas d'attente. Le symbole s'affiche
    // d'un coup et s'efface aussitôt (≈ 0,4 s au lieu de 2,65 s).
    if (!toOnboarding) {
      center.setValue(1);
      dots.forEach((d, i) => {
        d.setValue(1);
        dotsOpacity[i].setValue(1);
      });
      later(150, () => {
        fade(bg, 0, 250);
        fade(markOpacity, 0, 250);
      });
      later(400, onDone);
      return () => timers.forEach(clearTimeout);
    }

    // Premier lancement : l'animation complète, qui mène à la présentation.
    // 1. Le point terracotta apparaît.
    later(120, () => (reduce ? fade(center, 1, 200) : run(center, 1, 460)));
    // 2. Les 8 points verts sortent de lui et se placent en cercle.
    later(reduce ? 400 : 650, () =>
      dots.forEach((d, i) => {
        if (reduce) {
          d.setValue(1);
          fade(dotsOpacity[i], 1, 200);
        } else {
          run(d, 1, 720, i * 40);
          Animated.timing(dotsOpacity[i], { toValue: 1, duration: 260, delay: i * 40, useNativeDriver: true }).start();
        }
      }),
    );
    // 3. Le symbole glisse à sa place sur la présentation, le fond s'efface.
    later(reduce ? 900 : 1700, () => {
      fade(bg, 0, 520);
      const target = targetRef.current;
      const self = markRef.current;
      if (reduce || !target || !self) {
        fade(markOpacity, 0, reduce ? 200 : 0);
        return;
      }
      self.measureInWindow((ax, ay) =>
        target.measureInWindow((bx, by) =>
          Animated.timing(move, {
            toValue: { x: bx - ax, y: by - ay },
            duration: 700,
            easing: PUSH,
            useNativeDriver: true,
          }).start(),
        ),
      );
    });
    // 4. Fin : le symbole de la présentation prend le relais.
    later(reduce ? 1300 : 2650, onDone);
    return () => timers.forEach(clearTimeout);
    // On ne joue l'animation qu'une fois, dès que l'on sait où aller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const centerScale = reduce ? 1 : center.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const centerOpacity = center.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0, 1, 1] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, opacity: bg }]} />
      <View style={styles.splashCenter} pointerEvents="none">
        <Animated.View
          ref={markRef}
          collapsable={false}
          style={{ width: MARK_BOX, height: MARK_BOX, opacity: markOpacity, transform: move.getTranslateTransform() }}
        >
          {dots.map((d, i) => {
            const o = dotOffset(i);
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: t.primary,
                    opacity: dotsOpacity[i],
                    transform: [
                      { translateX: d.interpolate({ inputRange: [0, 1], outputRange: [0, o.x] }) },
                      { translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, o.y] }) },
                      { scale: d.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                    ],
                  },
                ]}
              />
            );
          })}
          <Animated.View
            style={[styles.center, { backgroundColor: t.accent, opacity: centerOpacity, transform: [{ scale: centerScale }] }]}
          />
        </Animated.View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Présentation
// ---------------------------------------------------------------------------

const PAGES = 3;

function Onboarding({
  visible,
  markRef,
  markShown,
}: {
  visible: boolean;
  markRef: React.RefObject<View | null>;
  markShown: boolean;
}) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { finishOnboarding } = useIntro();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  /** Hauteur de la zone des pages (une page horizontale ne s'étire pas toute seule). */
  const [pageHeight, setPageHeight] = useState(0);
  const [mounted, setMounted] = useState(visible);
  const leave = useRef(new Animated.Value(visible ? 0 : 1)).current;
  const dotWidths = useRef([0, 1, 2].map((i) => new Animated.Value(i === 0 ? 20 : 8))).current;

  // Réaffichée depuis les Réglages : on repart de la première page.
  useEffect(() => {
    if (!visible) return;
    setPage(0);
    scroller.current?.scrollTo({ x: 0, animated: false });
    leave.setValue(0);
    setMounted(true);
  }, [visible, leave]);

  useEffect(() => {
    dotWidths.forEach((w, i) =>
      Animated.timing(w, { toValue: i === page ? 20 : 8, duration: reduce ? 0 : 320, easing: EASE, useNativeDriver: false }).start(),
    );
  }, [page, dotWidths, reduce]);

  if (!mounted) return null;

  function goTo(i: number) {
    setPage(i);
    scroller.current?.scrollTo({ x: i * width, animated: !reduce });
  }

  function finish() {
    Animated.timing(leave, { toValue: 1, duration: 380, easing: EASE, useNativeDriver: true }).start(() => {
      setMounted(false);
      finishOnboarding();
    });
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  const opacity = leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const scale = reduce ? 1 : leave.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, paddingTop: insets.top, opacity, transform: [{ scale }] }]}
    >
      <View style={styles.skipBar}>
        <Pressable
          accessibilityRole="button"
          onPress={finish}
          disabled={page === PAGES - 1}
          // Invisible sur la dernière page : caché aussi pour VoiceOver.
          accessibilityElementsHidden={page === PAGES - 1}
          style={[styles.skip, { opacity: page === PAGES - 1 ? 0 : 1 }]}
        >
          <Text style={{ fontSize: 17, color: t.ink2 }}>Passer</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
        style={{ flex: 1 }}
      >
        {/* Chaque page défile verticalement si le texte est très grand (Réglages iOS → Taille du texte). */}
        {/* Page 1 */}
        <ScrollView
          style={{ width, height: pageHeight || undefined }}
          contentContainerStyle={[styles.page, { flexGrow: 1, gap: 20 }]}
        >
          <View style={styles.markArea}>
            <View ref={markRef} collapsable={false} style={{ opacity: markShown ? 1 : 0 }}>
              <Mark size={MARK_BOX} />
            </View>
          </View>
          <Text style={[styles.title, { color: t.ink }]}>Instagram, YouTube et Facebook, sans ce qui te retient.</Text>
          <Text style={[styles.lead, { color: t.ink2 }]}>
            OneForAll masque les Reels, les Shorts et Explore. Tu gardes tes messages, les profils, la recherche et la
            publication.
          </Text>
        </ScrollView>

        {/* Page 2 */}
        <ScrollView style={{ width, height: pageHeight || undefined }} contentContainerStyle={styles.page}>
          <Text style={[styles.title, { color: t.ink }]}>Ce que l’app ne fait pas</Text>
          <View style={{ gap: 12 }}>
            {[
              ['Elle ne collecte rien', 'Pas de compte, pas de serveur, pas de statistiques. Tes réglages restent sur ton téléphone.'],
              ['Elle n’est pas affiliée', 'OneForAll n’a aucun lien avec Instagram, Facebook (Meta) ni YouTube (Google).'],
              ['Elle ne te fera jamais payer', 'Pas de pub, pas d’abonnement. Le code est public et chacun peut le vérifier.'],
            ].map(([title, text]) => (
              <View key={title} style={[styles.promise, { backgroundColor: t.surface }, cardShadow(t)]}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: t.ink }}>{title}</Text>
                <Text style={{ fontSize: 15, lineHeight: 21, color: t.ink2 }}>{text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Page 3 */}
        <ScrollView style={{ width, height: pageHeight || undefined }} contentContainerStyle={styles.page}>
          <Text style={[styles.title, { color: t.ink }]}>Te connecter à tes comptes</Text>
          <View style={{ gap: 20 }}>
            {[
              'Touche une plateforme sur l’accueil.',
              'Connecte-toi comme sur le site, avec ton identifiant habituel.',
              'C’est tout : iOS garde ta connexion sur ton téléphone.',
            ].map((text, i) => (
              <View key={text} style={{ flexDirection: 'row', gap: 16 }}>
                <View style={[styles.stepNumber, { backgroundColor: t.primarySoft }]}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.onPrimarySoft }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 17, lineHeight: 24, paddingTop: 4, color: t.ink }}>{text}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.note, { backgroundColor: t.surface2 }]}>
            <Text style={{ fontSize: 15, lineHeight: 21, color: t.ink2 }}>
              Ton mot de passe va directement à la plateforme. OneForAll ne le voit jamais.
            </Text>
          </View>
        </ScrollView>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <View style={styles.dots}>
          {dotWidths.map((w, i) => (
            <Pressable
              key={i}
              onPress={() => goTo(i)}
              // Points de 8 pt : zone tactile agrandie (44 pt de haut).
              hitSlop={{ top: 18, bottom: 18, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Page ${i + 1} sur ${PAGES}`}
              accessibilityState={{ selected: i === page }}
            >
              <Animated.View
                style={{ height: 8, borderRadius: 4, width: w, backgroundColor: i === page ? t.primary : t.sep2 }}
              />
            </Pressable>
          ))}
        </View>
        <PrimaryButton label={page === PAGES - 1 ? 'C’est parti' : 'Continuer'} onPress={() => (page < PAGES - 1 ? goTo(page + 1) : finish())} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splashCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    left: (MARK_BOX - DOT_SIZE) / 2,
    top: (MARK_BOX - DOT_SIZE) / 2,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  center: {
    position: 'absolute',
    left: (MARK_BOX - CENTER_SIZE) / 2,
    top: (MARK_BOX - CENTER_SIZE) / 2,
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
  },
  skipBar: { height: 44, flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12 },
  skip: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  page: { paddingTop: 24, paddingHorizontal: 28, gap: 24 },
  markArea: { flex: 1, minHeight: MARK_BOX, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6 },
  lead: { fontSize: 17, lineHeight: 24, paddingBottom: 8 },
  promise: { padding: 18, borderRadius: 20, gap: 4 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  note: { paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18 },
  footer: { paddingTop: 16, paddingHorizontal: 28, gap: 20 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
});
