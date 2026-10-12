import { View } from 'react-native';

import { useTheme } from '../lib/theme';

/**
 * Symbole de OneForAll : 8 points verts en cercle autour d'un point terracotta.
 * Dessiné dans un carré de 136 pt (taille du design), mis à l'échelle via `size`.
 */
export const MARK_BOX = 136;
export const MARK_RADIUS = 55.9;
export const DOT_SIZE = 24.3;
export const CENTER_SIZE = 29.1;

/** Position (en pt, dans le carré de 136) du centre du point n° i (0 à 7). */
export function dotOffset(i: number) {
  const a = (i * Math.PI) / 4;
  return { x: Math.cos(a) * MARK_RADIUS, y: Math.sin(a) * MARK_RADIUS };
}

type Props = { size: number; dotColor?: string; centerColor?: string };

export function Mark({ size, dotColor, centerColor }: Props) {
  const t = useTheme();
  const k = size / MARK_BOX;
  const dot = DOT_SIZE * k;
  const center = CENTER_SIZE * k;
  return (
    <View style={{ width: size, height: size }} accessible={false}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const o = dotOffset(i);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: size / 2 + o.x * k - dot / 2,
              top: size / 2 + o.y * k - dot / 2,
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: dotColor ?? t.primary,
            }}
          />
        );
      })}
      <View
        style={{
          position: 'absolute',
          left: (size - center) / 2,
          top: (size - center) / 2,
          width: center,
          height: center,
          borderRadius: center / 2,
          backgroundColor: centerColor ?? t.accent,
        }}
      />
    </View>
  );
}
