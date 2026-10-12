import type { Platform } from './types';

/**
 * Règles YouTube (version web mobile : https://m.youtube.com).
 *
 * YouTube mobile utilise des balises personnalisées "ytm-…" ; la version
 * ordinateur utilise "ytd-…". On met les deux au cas où la WebView reçoit
 * l'une ou l'autre.
 */
export const youtube: Platform = {
  id: 'youtube',
  name: 'YouTube',
  startUrl: 'https://m.youtube.com/',
  hosts: ['youtube.com', 'youtu.be'],
  color: '#FF0000',
  // Google bloque la connexion dans les WebViews : on se présente comme Safari iOS.
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  rules: [
    {
      id: 'yt.shortsShelves',
      label: 'Masquer les étagères Shorts',
      description: 'Retire les rangées de Shorts sur l’accueil, les abonnements et la recherche.',
      defaultEnabled: true,
      css: `
        ytm-reel-shelf-renderer,
        ytm-shorts-lockup-view-model,
        ytm-shorts-lockup-view-model-v2,
        ytd-reel-shelf-renderer,
        ytd-rich-shelf-renderer[is-shorts],
        grid-shelf-view-model:has(ytm-shorts-lockup-view-model),
        ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model),
        ytm-rich-section-renderer:has(ytm-reel-shelf-renderer) { display: none !important; }
      `,
      hide: [
        // Vidéos isolées qui pointent vers un Short (dans les listes et la recherche).
        {
          selector: 'a[href^="/shorts/"]',
          closest:
            'ytm-rich-item-renderer, ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-shorts-lockup-view-model, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer',
        },
      ],
    },
    {
      id: 'yt.shortsTab',
      label: "Masquer l'onglet Shorts",
      description: 'Retire Shorts de la barre du bas, des menus et des filtres.',
      defaultEnabled: true,
      css: `
        ytm-pivot-bar-item-renderer:has(.pivot-shorts),
        ytm-pivot-bar-item-renderer:has(a[href^="/shorts"]),
        ytd-guide-entry-renderer:has(a[title="Shorts"]),
        ytd-mini-guide-entry-renderer[aria-label="Shorts"] { display: none !important; }
      `,
      hide: [
        // Bouton "Shorts" dans la barre du bas (si le :has() ci-dessus échoue).
        { selector: 'ytm-pivot-bar-item-renderer', text: 'Shorts' },
        // Filtre "Shorts" en haut de l'accueil, d'une chaîne ou de la recherche.
        { selector: 'ytm-chip-cloud-chip-renderer', text: 'Shorts' },
        { selector: 'yt-chip-cloud-chip-renderer', text: 'Shorts' },
        // Onglet "Shorts" d'une chaîne.
        { selector: 'a[role="tab"]', text: 'Shorts' },
        { selector: 'yt-tab-shape', text: 'Shorts' },
      ],
    },
    {
      id: 'yt.shortsRedirect',
      label: 'Ouvrir les Shorts comme une vidéo normale',
      description:
        '/shorts/ID devient /watch?v=ID : pas de défilement infini vers le Short suivant.',
      defaultEnabled: true,
      urls: [{ pattern: '^/shorts/([^/?#]+).*$', redirectTo: '/watch?v=$1' }],
    },
    {
      id: 'yt.homeFeed',
      label: 'Masquer les recommandations de l’accueil',
      description:
        'Accueil vide : tu ne vois que ce que tu cherches ou tes abonnements (désactivé par défaut).',
      defaultEnabled: false,
      css: `
        ytm-browse[page-subtype="home"] ytm-rich-grid-renderer,
        ytm-browse[page-subtype="home"] ytm-item-section-renderer,
        ytd-browse[page-subtype="home"] ytd-rich-grid-renderer { display: none !important; }
      `,
    },
    {
      id: 'yt.related',
      label: 'Masquer les vidéos suggérées sous une vidéo',
      description: 'Retire la liste « À suivre » (désactivé par défaut).',
      defaultEnabled: false,
      css: `
        ytm-watch ytm-item-section-renderer[section-identifier="related-items"],
        ytm-single-column-watch-next-results-renderer ytm-item-section-renderer:has(ytm-video-with-context-renderer),
        ytd-watch-next-secondary-results-renderer { display: none !important; }
      `,
    },
  ],
};
