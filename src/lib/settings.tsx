import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ALL_RULES } from '../rules';

/**
 * Réglages = un booléen par règle (activée / désactivée), sauvegardés sur le
 * téléphone avec AsyncStorage. Si une règle n'a jamais été touchée, on utilise
 * sa valeur par défaut (`defaultEnabled` dans src/rules/*.ts).
 */

const STORAGE_KEY = 'sans-reels:settings:v1';

type Overrides = Record<string, boolean>;

type SettingsContextValue = {
  loaded: boolean;
  isEnabled: (ruleId: string) => boolean;
  setEnabled: (ruleId: string, value: boolean) => void;
  resetAll: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loaded, setLoaded] = useState(false);

  // Chargement au démarrage.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setOverrides(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback((next: Overrides) => {
    setOverrides(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const isEnabled = useCallback(
    (ruleId: string) => {
      if (ruleId in overrides) return overrides[ruleId];
      return ALL_RULES.find((r) => r.id === ruleId)?.defaultEnabled ?? false;
    },
    [overrides],
  );

  const setEnabled = useCallback(
    (ruleId: string, value: boolean) => save({ ...overrides, [ruleId]: value }),
    [overrides, save],
  );

  const resetAll = useCallback(() => save({}), [save]);

  const value = useMemo(
    () => ({ loaded, isEnabled, setEnabled, resetAll }),
    [loaded, isEnabled, setEnabled, resetAll],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings doit être utilisé dans <SettingsProvider>');
  return ctx;
}
