import type { Platform } from './types';

/**
 * TikTok = 100 % vidéo courte : on bloque tout.
 * Le bouton de l'accueil affiche l'écran « bloqué », et tout lien vers TikTok
 * ouvert depuis Instagram ou YouTube est aussi bloqué.
 */
export const tiktok: Platform = {
  id: 'tiktok',
  name: 'TikTok',
  startUrl: 'https://www.tiktok.com/',
  hosts: ['tiktok.com'],
  color: '#111111',
  blockAllRuleId: 'tt.blockAll',
  rules: [
    {
      id: 'tt.blockAll',
      label: 'Bloquer TikTok complètement',
      description: 'Recommandé : il n’y a rien d’autre que des vidéos courtes sur TikTok.',
      defaultEnabled: true,
      // N'importe quelle page de TikTok est bloquée.
      urls: [{ pattern: '^.*$', redirectTo: null }],
    },
  ],
};
