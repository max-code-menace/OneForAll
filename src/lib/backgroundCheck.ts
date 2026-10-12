import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import * as TaskManager from 'expo-task-manager';

import { fetchInstagramUnread, readUnread, saveUnread } from './unread';

/**
 * Notifications de messages Instagram, EN RETARD et sans serveur.
 *
 * iOS réveille l'app de temps en temps (c'est lui qui décide : parfois toutes les
 * 20 minutes, parfois toutes les quelques heures, selon l'usage et la batterie).
 * À chaque réveil, le téléphone demande lui-même à Instagram combien de
 * conversations sont non lues ; s'il y en a de nouvelles, une notification locale
 * s'affiche. Rien n'est envoyé ailleurs qu'à instagram.com. Désactivé par défaut.
 */

export const TASK = 'oneforall-check-messages';
const ENABLED_KEY = 'oneforall:notifications:v1';

// Doit être défini au chargement de l'app (iOS peut la réveiller juste pour cette tâche).
TaskManager.defineTask(TASK, async () => {
  try {
    const count = await fetchInstagramUnread();
    if (count === null) return BackgroundFetch.BackgroundFetchResult.Failed;
    const before = (await readUnread()).instagram ?? 0;
    await saveUnread('instagram', count);
    await Notifications.setBadgeCountAsync(count).catch(() => {});
    if (count > before) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Instagram',
          body: count === 1 ? '1 conversation non lue' : `${count} conversations non lues`,
          data: { platform: 'instagram' },
        },
        trigger: null,
      });
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Si une notification arrive pendant que l'app est ouverte : l'afficher quand même.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function isNotificationsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY).catch(() => null)) === 'true';
}

/** Résultat de l'activation : 'ok', notifications refusées, ou actualisation en arrière-plan coupée. */
export type NotificationsResult = 'ok' | 'denied' | 'background-off';

/**
 * Active / désactive les vérifications en arrière-plan.
 * Si iOS ne le permet pas (notifications refusées, « Actualisation en arrière-plan »
 * coupée, mode économie d'énergie…), rien n'est activé et la raison est renvoyée.
 */
export async function setNotificationsEnabled(enabled: boolean): Promise<NotificationsResult> {
  if (enabled) {
    const status = await BackgroundFetch.getStatusAsync();
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return 'background-off';
    const { granted } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: false },
    });
    if (!granted) return 'denied';
    await BackgroundFetch.registerTaskAsync(TASK, { minimumInterval: 15 * 60 });
  } else {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundFetch.unregisterTaskAsync(TASK);
    await Notifications.setBadgeCountAsync(0).catch(() => {});
  }
  await AsyncStorage.setItem(ENABLED_KEY, String(enabled)).catch(() => {});
  return 'ok';
}

/**
 * Chiffre sur l'icône de l'app : mis à jour aussi quand l'app est ouverte (sinon
 * l'ancien nombre resterait affiché après avoir lu ses messages). Seulement si les
 * notifications sont activées.
 */
export async function syncAppBadge(count: number): Promise<void> {
  if (await isNotificationsEnabled()) await Notifications.setBadgeCountAsync(count).catch(() => {});
}

/** Toucher la notification ouvre directement Instagram dans OneForAll. */
export function useOpenFromNotification() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (response?.notification.request.content.data?.platform === 'instagram') {
      router.push({ pathname: '/browser/[platform]', params: { platform: 'instagram' } });
    }
  }, [response]);
}
