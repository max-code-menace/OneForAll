/** Version web (aperçu) : pas de tâche de fond ni de notifications. */
export const TASK = 'oneforall-check-messages';
export async function isNotificationsEnabled(): Promise<boolean> {
  return false;
}
export type NotificationsResult = 'ok' | 'denied' | 'background-off';
export async function setNotificationsEnabled(_enabled: boolean): Promise<NotificationsResult> {
  return 'background-off';
}
export async function syncAppBadge(_count: number): Promise<void> {}
export function useOpenFromNotification() {}
