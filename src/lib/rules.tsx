import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { DEFAULT_PLATFORMS, mergeRemoteRules, type Platform, type Rule } from '../rules';

/**
 * Règles actives de l'app = règles intégrées, remplacées si possible par une
 * version plus récente téléchargée depuis GitHub.
 *
 * Ce que fait (et ne fait pas) la mise à jour automatique :
 *  - elle télécharge 2 petits fichiers JSON publics (src/rules/*.json du dépôt) ;
 *  - elle n'envoie AUCUNE donnée te concernant (juste une requête web classique,
 *    donc GitHub voit ton adresse IP, comme pour n'importe quelle page) ;
 *  - chaque fichier est vérifié strictement (src/rules/validate.ts) : s'il est
 *    invalide ou inaccessible, on garde les règles précédentes ou intégrées ;
 *  - elle peut être coupée dans les Réglages : l'app n'utilise alors que ses règles intégrées.
 */

/** Dossier public du dépôt qui contient les règles (branche main). */
export const RULES_BASE_URL = 'https://raw.githubusercontent.com/max-code-menace/OneForAll/main/src/rules/';

const CACHE_KEY = 'oneforall:remote-rules:v1';
const AUTO_KEY = 'oneforall:rules-autoupdate:v1';
const FETCH_TIMEOUT_MS = 6000;
const MAX_FILE_SIZE = 200_000;

export type RulesStatus =
  | { state: 'bundled' } // règles intégrées uniquement
  | { state: 'checking' }
  | { state: 'updated'; checkedAt: number } // vérifié avec succès
  | { state: 'failed'; checkedAt: number }; // hors ligne ou fichier refusé

type RulesContextValue = {
  /** false tant que les réglages enregistrés ne sont pas lus. */
  ready: boolean;
  platforms: Platform[];
  /** Toutes les règles de toutes les plateformes. */
  allRules: Rule[];
  autoUpdate: boolean;
  setAutoUpdate: (value: boolean) => void;
  status: RulesStatus;
  /** Vérifie tout de suite s'il existe des règles plus récentes. */
  refresh: () => Promise<void>;
};

const RulesContext = createContext<RulesContextValue | null>(null);

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (body.length > MAX_FILE_SIZE) throw new Error('fichier trop gros');
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

export function RulesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [autoUpdate, setAutoUpdateState] = useState(true);
  /** Règles téléchargées et validées, par plateforme. */
  const [remote, setRemote] = useState<Record<string, Rule[]>>({});
  const [status, setStatus] = useState<RulesStatus>({ state: 'bundled' });
  /** Fichiers bruts reçus (gardés pour le cache). */
  const rawCache = useRef<Record<string, unknown>>({});

  const refresh = useCallback(async () => {
    setStatus({ state: 'checking' });
    const results = await Promise.all(
      DEFAULT_PLATFORMS.map(async (base) => {
        try {
          const raw = await fetchJson(`${RULES_BASE_URL}${base.id}.json`);
          return { id: base.id, raw, rules: mergeRemoteRules(base, raw).rules };
        } catch {
          return null; // hors ligne, ou fichier refusé : on garde ce qu'on a
        }
      }),
    );
    const good = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (good.length > 0) {
      // On ne change l'état que si les règles ont vraiment changé : ça évite de recharger la page web inutilement.
      setRemote((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const r of good) {
          if (JSON.stringify(prev[r.id]) !== JSON.stringify(r.rules)) {
            next[r.id] = r.rules;
            changed = true;
          }
          rawCache.current[r.id] = r.raw;
        }
        return changed ? next : prev;
      });
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rawCache.current)).catch(() => {});
    }
    setStatus(
      good.length === DEFAULT_PLATFORMS.length
        ? { state: 'updated', checkedAt: Date.now() }
        : { state: 'failed', checkedAt: Date.now() },
    );
  }, []);

  // Au démarrage : réglage, puis règles en cache, puis vérification en arrière-plan.
  useEffect(() => {
    (async () => {
      let auto = true;
      try {
        auto = (await AsyncStorage.getItem(AUTO_KEY)) !== 'false';
        setAutoUpdateState(auto);
        if (auto) {
          const cached = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}');
          const restored: Record<string, Rule[]> = {};
          for (const base of DEFAULT_PLATFORMS) {
            try {
              // On revalide : le cache a pu être écrit par une ancienne version de l'app.
              restored[base.id] = mergeRemoteRules(base, cached[base.id]).rules;
              rawCache.current[base.id] = cached[base.id];
            } catch {
              // cache absent ou invalide pour cette plateforme : règles intégrées
            }
          }
          setRemote(restored);
        }
      } catch {
        // stockage illisible : on repart sur les règles intégrées
      }
      setReady(true);
      if (auto) refresh();
    })();
  }, [refresh]);

  const setAutoUpdate = useCallback(
    (value: boolean) => {
      setAutoUpdateState(value);
      AsyncStorage.setItem(AUTO_KEY, String(value)).catch(() => {});
      if (value) refresh();
      else setStatus({ state: 'bundled' });
    },
    [refresh],
  );

  // Mise à jour désactivée = règles intégrées uniquement.
  const platforms = useMemo<Platform[]>(
    () =>
      DEFAULT_PLATFORMS.map((p) => (autoUpdate && remote[p.id] ? { ...p, rules: remote[p.id] } : p)),
    [autoUpdate, remote],
  );
  const allRules = useMemo(() => platforms.flatMap((p) => p.rules), [platforms]);

  const value = useMemo(
    () => ({ ready, platforms, allRules, autoUpdate, setAutoUpdate, status, refresh }),
    [ready, platforms, allRules, autoUpdate, setAutoUpdate, status, refresh],
  );
  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
}

export function useRules(): RulesContextValue {
  const ctx = useContext(RulesContext);
  if (!ctx) throw new Error('useRules doit être utilisé dans <RulesProvider>');
  return ctx;
}
