import { router } from 'expo-router';
import { useRef, type ReactNode, type RefObject } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SITE_ICON } from '../lib/sites';
import { cardShadow, EASE, useReduceMotion, useTheme } from '../lib/theme';

/** Nom de l'app : « One » « For » (en vert) « All ». */
export function Wordmark({ size }: { size: number }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: size, fontWeight: '600', letterSpacing: -0.02 * size, color: t.ink }}>
      One<Text style={{ color: t.primary, fontWeight: '500' }}>For</Text>All
    </Text>
  );
}

/** Bouton « ‹ Accueil » en haut à gauche des écrans. */
export function BackButton({ label, onPress }: { label: string; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Retour : ${label}`}
      hitSlop={6}
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Text style={[styles.backChevron, { color: t.primary }]}>‹</Text>
      <Text style={[styles.backLabel, { color: t.primary }]}>{label}</Text>
    </Pressable>
  );
}

/** Pastille carrée avec l'initiale d'un réseau (à la place de son logo). */
export function Initial({ letter, size, radius, muted }: { letter: string; size: number; radius: number; muted?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: t.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: muted ? 0.55 : 1,
      }}
    >
      <Text style={{ fontSize: size * 0.42, fontWeight: '600', color: t.ink2 }}>{letter}</Text>
    </View>
  );
}

/** Icône d'un réseau (ou son initiale si l'icône manque). */
export function SiteIcon({ platformId, name, size, radius }: { platformId: string; name: string; size: number; radius: number }) {
  const icon = SITE_ICON[platformId];
  if (!icon) return <Initial letter={name[0]} size={size} radius={radius} />;
  return <Image source={icon} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: radius }} />;
}

/** Zone qui se tasse très légèrement quand on appuie (scale 0.98, sans rebond). */
export function PressScale({
  onPress,
  style,
  children,
  accessibilityLabel,
  pressedStyle,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel?: string;
}) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number, duration: number) =>
    Animated.timing(scale, { toValue: value, duration, easing: EASE, useNativeDriver: true }).start();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => !reduce && to(0.98, 120)}
      onPressOut={() => to(1, 220)}
    >
      {({ pressed }) => (
        <Animated.View style={[style, pressed && pressedStyle, { transform: [{ scale }] }]}>{children}</Animated.View>
      )}
    </Pressable>
  );
}

/** Grand bouton vert (« Continuer », « Retour à l'accueil »). */
export function PrimaryButton({ label, onPress, height = 54 }: { label: string; onPress: () => void; height?: number }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { minHeight: height, borderRadius: height / 2, backgroundColor: t.primary, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.primaryText, { color: t.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

/** Carte blanche arrondie qui regroupe des lignes de réglages. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.surface },
        cardShadow(t),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Séparateur fin entre deux lignes d'une carte (décalé à gauche, style iOS). */
export function Separator() {
  const t = useTheme();
  return <View style={{ marginLeft: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.sep }} />;
}

/** Ligne avec un titre, une explication et un interrupteur iOS. */
export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  border,
  switchRef,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  border?: boolean;
  /** Pour que le tuto puisse montrer l'interrupteur. */
  switchRef?: RefObject<View | null>;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onValueChange(!value)} style={styles.switchRow} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View
        style={[
          styles.switchText,
          border && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.sep },
        ]}
      >
        <Text style={[styles.rowLabel, { color: t.ink }]}>{label}</Text>
        {description ? <Text style={[styles.rowDescription, { color: t.ink2 }]}>{description}</Text> : null}
      </View>
      <View ref={switchRef} collapsable={false}>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ true: t.primary, false: t.switchOff }}
          ios_backgroundColor={t.switchOff}
        />
      </View>
    </Pressable>
  );
}

/** Ligne cliquable « Texte  › ». */
export function LinkRow({ label, onPress, external }: { label: string; onPress: () => void; external?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: t.surface2 }]}
    >
      <Text style={[styles.rowLabel, { color: t.ink }]}>{label}</Text>
      <Text style={{ fontSize: external ? 17 : 22, color: t.ink3 }}>{external ? '↗' : '›'}</Text>
    </Pressable>
  );
}

/** Titre d'une section de réglages. */
export function SectionTitle({ children, initial, platformId }: { children: string; initial?: string; platformId?: string }) {
  const t = useTheme();
  return (
    <View style={styles.sectionTitle}>
      {platformId ? (
        <SiteIcon platformId={platformId} name={children} size={24} radius={7} />
      ) : initial ? (
        <View style={[styles.sectionInitial, { backgroundColor: t.surface2 }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: t.ink2 }}>{initial}</Text>
        </View>
      ) : null}
      <Text style={{ fontSize: 15, fontWeight: '600', color: t.ink2 }}>{children}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, alignSelf: 'flex-start' },
  backChevron: { fontSize: 30, lineHeight: 30, marginTop: -3 },
  backLabel: { fontSize: 17 },
  primary: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 17, fontWeight: '600' },
  card: { borderRadius: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  switchText: { flex: 1, gap: 3, paddingVertical: 13 },
  rowLabel: { fontSize: 17, lineHeight: 22 },
  rowDescription: { fontSize: 13, lineHeight: 18 },
  linkRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4 },
  sectionInitial: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
