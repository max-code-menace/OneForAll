import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, useColorScheme } from 'react-native';

/**
 * Couleurs et animations de l'app, reprises du design (Claude Design, « OneForAll Prototype »).
 * Le thème suit le réglage clair / sombre de l'iPhone.
 */

export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  ink2: string;
  ink3: string;
  sep: string;
  sep2: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string;
  danger: string;
  inverse: string;
  onInverse: string;
  primaryOnInverse: string;
  switchOff: string;
};

export const LIGHT: Theme = {
  dark: false,
  bg: '#F6F3EE',
  surface: '#FFFDFA',
  surface2: '#EDE9E2',
  ink: '#1F1D1A',
  ink2: '#5E5850',
  ink3: '#706A60',
  sep: '#E3DED5',
  sep2: '#CFC8BC',
  primary: '#3E6B5A',
  onPrimary: '#FFFFFF',
  primarySoft: '#E2EBE5',
  onPrimarySoft: '#2C5143',
  accent: '#A85A36',
  danger: '#B3412F',
  inverse: '#2A2724',
  onInverse: '#F6F3EE',
  primaryOnInverse: '#8FBFA9',
  switchOff: '#DCD6CC',
};

export const DARK: Theme = {
  dark: true,
  bg: '#161513',
  surface: '#211F1C',
  surface2: '#2B2925',
  ink: '#F2EEE8',
  ink2: '#BDB6AB',
  ink3: '#968F84',
  sep: '#37332E',
  sep2: '#4A463F',
  primary: '#8FBFA9',
  onPrimary: '#10201A',
  primarySoft: '#22302A',
  onPrimarySoft: '#B5D6C6',
  accent: '#E3A07E',
  danger: '#EC8B78',
  inverse: '#F2EEE8',
  onInverse: '#1F1D1A',
  primaryOnInverse: '#3E6B5A',
  switchOff: '#3D3A35',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

/** Ombre douce des cartes (en sombre : pas d'ombre, un léger contour). */
export function cardShadow(t: Theme) {
  return t.dark
    ? { borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.06)' }
    : {
        shadowColor: '#1F1D1A',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      };
}

/** Courbe commune : aucun rebond. */
export const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
/** Courbe des déplacements (le symbole qui glisse au lancement). */
export const PUSH = Easing.bezier(0.32, 0.72, 0, 1);

/** « Réduire les animations » (Réglages iOS → Accessibilité) : les mouvements deviennent des fondus. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Adresses publiques du projet (ouvertes dans Safari). */
export const REPO_URL = 'https://github.com/max-code-menace/OneForAll';
