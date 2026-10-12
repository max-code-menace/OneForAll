import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Platform } from '../rules';

/**
 * Réseaux ouverts. Revenir à l'accueil ne ferme PAS un réseau : sa page reste en
 * vie, cachée (voir SitesLayer.tsx), et le rouvrir est instantané, là où on l'avait
 * laissé, comme une vraie app.
 */

type SiteId = Platform['id'];

type OpenSitesValue = {
  /** Réseaux dont la page existe (affichée ou cachée), dans l'ordre d'ouverture. */
  opened: SiteId[];
  /** Réseau affiché par-dessus l'accueil (null = accueil). */
  active: SiteId | null;
  /** Affiche un réseau (le crée s'il n'existe pas encore). */
  open: (id: SiteId) => void;
  /** Revient à l'accueil ; le réseau reste en vie, caché. */
  close: () => void;
};

const OpenSitesContext = createContext<OpenSitesValue | null>(null);

export function OpenSitesProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<SiteId[]>([]);
  const [active, setActive] = useState<SiteId | null>(null);

  const open = useCallback((id: SiteId) => {
    setOpened((list) => (list.includes(id) ? list : [...list, id]));
    setActive(id);
  }, []);
  const close = useCallback(() => setActive(null), []);

  const value = useMemo(() => ({ opened, active, open, close }), [opened, active, open, close]);
  return <OpenSitesContext.Provider value={value}>{children}</OpenSitesContext.Provider>;
}

export function useOpenSites(): OpenSitesValue {
  const ctx = useContext(OpenSitesContext);
  if (!ctx) throw new Error('useOpenSites doit être utilisé dans <OpenSitesProvider>');
  return ctx;
}
