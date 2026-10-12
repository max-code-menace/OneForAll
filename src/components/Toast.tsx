import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { EASE, useReduceMotion, useTheme } from '../lib/theme';

export type ToastHandle = {
  /** Affiche le bandeau après `delay` ms, pendant `duration` ms (2,5 s ; Infinity = jusqu'à hide()). */
  show: (text: string, delay?: number, duration?: number) => void;
  hide: () => void;
};

/**
 * Petit bandeau en bas de l'écran (« Reels masqués », « Page bloquée »…).
 * Il monte de 12 pt en apparaissant, puis s'efface. On ne peut pas le toucher.
 */
export const Toast = forwardRef<ToastHandle, { pillRef?: RefObject<View | null> }>(function Toast({ pillRef }, ref) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const [text, setText] = useState('');
  const anim = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useImperativeHandle(ref, () => ({
    hide() {
      timers.current.forEach(clearTimeout);
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    },
    show(next, delay = 0, duration = 2500) {
      timers.current.forEach(clearTimeout);
      anim.stopAnimation();
      anim.setValue(0);
      timers.current = [
        setTimeout(() => {
          setText(next);
          Animated.timing(anim, { toValue: 1, duration: 260, easing: EASE, useNativeDriver: true }).start();
        }, delay),
        ...(Number.isFinite(duration)
          ? [
              setTimeout(() => {
                Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
              }, delay + duration),
            ]
          : []),
      ];
    },
  }));

  const translateY = reduce ? 0 : anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View
        ref={pillRef}
        collapsable={false}
        style={[styles.toast, { backgroundColor: t.inverse, opacity: anim, transform: [{ translateY }] }]}
        accessibilityLiveRegion="polite"
      >
        <View style={[styles.dot, { backgroundColor: t.primaryOnInverse }]} />
        <Text style={[styles.text, { color: t.onInverse }]} numberOfLines={2}>
          {text}
        </Text>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 52, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
});
