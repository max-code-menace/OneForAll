import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton, Initial, PrimaryButton } from '../components/ui';
import { EASE, useReduceMotion, useTheme } from '../lib/theme';

/**
 * TikTok est banni (src/lib/banned.ts, codé en dur) : cette page l'explique.
 * Pas de lien vers les Réglages : ce bannissement ne se désactive pas.
 * Le contenu apparaît en quatre temps, du logo au bouton. Pas de secousse, pas de rouge.
 */
export default function BlockedScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const steps = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      reduce ? 0 : 90,
      steps.map((v) => Animated.timing(v, { toValue: 1, duration: 360, delay: reduce ? 0 : 200, easing: EASE, useNativeDriver: true })),
    ).start();
  }, [steps, reduce]);

  const appear = (i: number) => ({
    opacity: steps[i],
    transform: [{ translateY: reduce ? 0 : steps[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={styles.bar}>
        <BackButton label="Accueil" />
      </View>
      <View style={styles.content}>
        <Animated.View style={appear(0)}>
          <Initial letter="T" size={88} radius={28} muted />
        </Animated.View>
        <Animated.Text style={[styles.title, { color: t.ink }, appear(1)]}>TikTok est bloqué</Animated.Text>
        <Animated.Text style={[styles.text, { color: t.ink2 }, appear(2)]}>
          TikTok ne propose que des vidéos courtes, à la suite, sans fin. OneForAll ne l’ouvre donc pas. Instagram,
          YouTube et Facebook restent là pour toi.
        </Animated.Text>
        <Animated.View style={[styles.actions, appear(3)]}>
          <PrimaryButton label="Retour à l’accueil" height={52} onPress={() => router.back()} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 52, justifyContent: 'center', paddingHorizontal: 8 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
    paddingHorizontal: 36,
    paddingBottom: 72,
    gap: 16,
  },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.56, marginTop: 8, textAlign: 'center' },
  text: { fontSize: 17, lineHeight: 24, textAlign: 'center' },
  actions: { marginTop: 16, gap: 8, alignItems: 'center', alignSelf: 'stretch' },
});
