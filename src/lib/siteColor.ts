/**
 * Couleur envoyée par la page (zone du haut de l'écran, voir reportTheme dans
 * buildInjection.ts). Elle vient du site : on ne la recopie jamais telle quelle, on en
 * extrait seulement trois nombres. Couleur transparente ou illisible : null.
 */
export type SiteColor = { css: string; dark: boolean };

export function parseSiteColor(input: unknown): SiteColor | null {
  if (typeof input !== 'string' || input.length > 40) return null;
  const s = input.trim().toLowerCase();
  let rgb: number[] | null = null;
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else if ((m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s))) {
    // Presque transparente : ce n'est pas la couleur qu'on voit.
    if (m[4] !== undefined && Number(m[4]) < 0.5) return null;
    rgb = [m[1], m[2], m[3]].map(Number);
  }
  if (!rgb || rgb.some((n) => !(n >= 0 && n <= 255))) return null;
  const [r, g, b] = rgb;
  // Luminosité perçue : fond sombre → heure et batterie en blanc.
  const dark = 0.299 * r + 0.587 * g + 0.114 * b < 140;
  return { css: `rgb(${r}, ${g}, ${b})`, dark };
}
