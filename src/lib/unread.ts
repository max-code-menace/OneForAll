import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Nombre de messages non lus par réseau, pour la pastille de l'accueil.
 *
 * DÉSACTIVÉE par défaut (Réglages → « Pastille des messages Instagram »).
 * Deux sources, toutes deux SUR LE TÉLÉPHONE (rien ne passe par un serveur à nous) :
 *  - le titre de la page quand le site est ouvert (« (3) Instagram ») ;
 *  - pour Instagram, une petite requête directe à instagram.com, avec ta connexion
 *    (cookies) déjà enregistrée par iOS : à l'ouverture de l'accueil si la pastille
 *    est activée et, si les notifications sont activées, de temps en temps en
 *    arrière-plan (voir backgroundCheck.ts).
 */

const KEY = 'oneforall:unread:v1';
const BADGE_KEY = 'oneforall:unread-badge:v1';

/** La pastille de l'accueil est-elle activée ? (non par défaut) */
export async function isBadgeEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BADGE_KEY).catch(() => null)) === 'true';
}

export async function setBadgeEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BADGE_KEY, String(enabled)).catch(() => {});
}

export async function readUnread(): Promise<Record<string, number>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
  } catch {
    return {};
  }
}

export async function saveUnread(platformId: string, count: number): Promise<Record<string, number>> {
  const all = { ...(await readUnread()), [platformId]: count };
  await AsyncStorage.setItem(KEY, JSON.stringify(all)).catch(() => {});
  return all;
}

/**
 * Demande à Instagram le nombre de conversations non lues.
 * Adresse non officielle (celle qu'utilise le site web) : elle peut changer sans prévenir.
 * Renvoie null si on n'est pas connecté, hors ligne, ou si la réponse est inattendue.
 */
export async function fetchInstagramUnread(): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://www.instagram.com/api/v1/direct_v2/get_badge_count/?no_raven=1', {
      signal: controller.signal,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        // Identifiant public du site web d'Instagram (le même pour tout le monde, pas un secret).
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const n = data?.badge_count;
    return typeof n === 'number' && n >= 0 ? n : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

