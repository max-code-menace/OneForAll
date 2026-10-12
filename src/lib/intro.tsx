import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Présentation (3 pages) : affichée au premier lancement, puis à la demande
 * (Réglages → « Revoir la présentation »). Le fait de l'avoir vue est gardé sur le téléphone.
 */

const SEEN_KEY = 'oneforall:onboarding-seen:v1';

type IntroContextValue = {
  /** false tant qu'on ne sait pas encore si la présentation a déjà été vue. */
  loaded: boolean;
  onboardingVisible: boolean;
  showOnboarding: () => void;
  finishOnboarding: () => void;
};

const IntroContext = createContext<IntroContextValue | null>(null);

export function IntroProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [onboardingVisible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => setVisible(v !== 'true'))
      .catch(() => setVisible(true))
      .finally(() => setLoaded(true));
  }, []);

  const showOnboarding = useCallback(() => setVisible(true), []);
  const finishOnboarding = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(SEEN_KEY, 'true').catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ loaded, onboardingVisible, showOnboarding, finishOnboarding }),
    [loaded, onboardingVisible, showOnboarding, finishOnboarding],
  );
  return <IntroContext.Provider value={value}>{children}</IntroContext.Provider>;
}

export function useIntro(): IntroContextValue {
  const ctx = useContext(IntroContext);
  if (!ctx) throw new Error('useIntro doit être utilisé dans <IntroProvider>');
  return ctx;
}
