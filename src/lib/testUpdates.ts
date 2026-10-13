import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * App de TEST uniquement (« OneForAll Test », voir app.config.js) : dès qu'une nouvelle
 * version du code a été envoyée (EAS Update, canal « test »), elle est téléchargée et
 * l'app redémarre dessus. Vérifié au lancement et à chaque retour dans l'app.
 * Dans la vraie app, les mises à jour à distance sont coupées : ce code ne fait rien.
 */

export const IS_TEST_APP = Constants.expoConfig?.extra?.variant === 'test';

const MIN_GAP_MS = 20_000;

/** « ✓ Mise à jour reçue : version de test du 12/10 à 21:34 » (date d'envoi de la mise à jour en cours). */
export function testVersionLabel(): string | null {
  if (!IS_TEST_APP) return null;
  const d = Updates.isEmbeddedLaunch ? null : Updates.createdAt;
  if (!d) return 'Version de test (installée)';
  const p = (n: number) => String(n).padStart(2, '0');
  return `✓ Mise à jour reçue : version de test du ${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function useTestUpdates() {
  useEffect(() => {
    if (!IS_TEST_APP || !Updates.isEnabled) return;
    let last = 0;
    let busy = false;
    const check = async () => {
      if (busy || Date.now() - last < MIN_GAP_MS) return;
      busy = true;
      last = Date.now();
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // hors ligne ou serveur injoignable : on garde la version actuelle
      } finally {
        busy = false;
      }
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);
}
