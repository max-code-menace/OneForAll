import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useRules } from './rules';

/**
 * Réglages = un booléen par règle (activée / désactivée), sauvegardés sur le
 * téléphone avec AsyncStorage. Si une règle n'a jamais été touchée, on utilise
 * sa valeur par défaut (`defaultEnabled` dans src/rules/*.json).
 */

const STORAGE_KEY = 'sans-reels:settings:v1';
const DIAGNOSTIC_KEY = 'oneforall:diagnostic:v1';
const PRELOAD_KEY = 'oneforall:preload:v1';
const HOME_POS_KEY = 'oneforall:home-pos:v1';
const HAPTICS_KEY = 'oneforall:haptics:v1';

/** Place du bouton rond, de 0 à 1 dans la zone permise (0 = gauche / haut). `null` = en bas à droite. */
export type HomePos = { x: number; y: number } | null;

type Overrides = Record<string, boolean>;

type SettingsContextValue = {
  loaded: boolean;
  isEnabled: (ruleId: string) => boolean;
  setEnabled: (ruleId: string, value: boolean) => void;
  resetAll: () => void;
  /** Affiche l'adresse de la page en bas du navigateur (aide au dépannage). */
  diagnostic: boolean;
  setDiagnostic: (value: boolean) => void;
  /** Préparer le dernier réseau utilisé au lancement (activé par défaut). */
  preload: boolean;
  setPreload: (value: boolean) => void;
  /** Place choisie pour le bouton rond (le même pour tous les réseaux). */
  homePos: HomePos;
  setHomePos: (value: HomePos) => void;
  /** Petites vibrations (retours haptiques), activées par défaut. */
  haptics: boolean;
  setHaptics: (value: boolean) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { allRules } = useRules();
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loaded, setLoaded] = useState(false);
  const [diagnostic, setDiagnosticState] = useState(false);
  const [preload, setPreloadState] = useState(true);
  const [homePos, setHomePosState] = useState<HomePos>(null);
  const [haptics, setHapticsState] = useState(true);

  // Chargement au démarrage.
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(DIAGNOSTIC_KEY)
        .then((v) => setDiagnosticState(v === 'true'))
        .catch(() => {}),
      AsyncStorage.getItem(PRELOAD_KEY)
        .then((v) => setPreloadState(v !== 'false'))
        .catch(() => {}),
      AsyncStorage.getItem(HAPTICS_KEY)
        .then((v) => setHapticsState(v !== 'false'))
        .catch(() => {}),
      AsyncStorage.getItem(HOME_POS_KEY)
        .then((raw) => {
          const v = raw ? JSON.parse(raw) : null;
          if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) setHomePosState({ x: clamp01(v.x), y: clamp01(v.y) });
        })
        .catch(() => {}),
      AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => {
          if (raw) setOverrides(JSON.parse(raw));
        })
        .catch(() => {}),
    ]).finally(() => setLoaded(true));
  }, []);

  const save = useCallback((next: Overrides) => {
    setOverrides(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const isEnabled = useCallback(
    (ruleId: string) => {
      if (ruleId in overrides) return overrides[ruleId];
      return allRules.find((r) => r.id === ruleId)?.defaultEnabled ?? false;
    },
    [overrides, allRules],
  );

  const setEnabled = useCallback(
    (ruleId: string, value: boolean) => save({ ...overrides, [ruleId]: value }),
    [overrides, save],
  );

  const resetAll = useCallback(() => save({}), [save]);

  const setDiagnostic = useCallback((value: boolean) => {
    setDiagnosticState(value);
    AsyncStorage.setItem(DIAGNOSTIC_KEY, String(value)).catch(() => {});
  }, []);

  const setPreload = useCallback((value: boolean) => {
    setPreloadState(value);
    AsyncStorage.setItem(PRELOAD_KEY, String(value)).catch(() => {});
  }, []);

  const setHomePos = useCallback((value: HomePos) => {
    setHomePosState(value);
    if (value) AsyncStorage.setItem(HOME_POS_KEY, JSON.stringify(value)).catch(() => {});
    else AsyncStorage.removeItem(HOME_POS_KEY).catch(() => {});
  }, []);

  const setHaptics = useCallback((value: boolean) => {
    setHapticsState(value);
    AsyncStorage.setItem(HAPTICS_KEY, String(value)).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      loaded,
      isEnabled,
      setEnabled,
      resetAll,
      diagnostic,
      setDiagnostic,
      preload,
      setPreload,
      homePos,
      setHomePos,
      haptics,
      setHaptics,
    }),
    [loaded, isEnabled, setEnabled, resetAll, diagnostic, setDiagnostic, preload, setPreload, homePos, setHomePos, haptics, setHaptics],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings doit être utilisé dans <SettingsProvider>');
  return ctx;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
