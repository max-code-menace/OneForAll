/** Version web (aperçu) : pas de tâche de fond ni de notifications. */
export const TASK = 'oneforall-check-messages';
export async function isNotificationsEnabled(): Promise<boolean> {
  return false;
}
export async function setNotificationsEnabled(_enabled: boolean): Promise<boolean> {
  return false;
}
export function useOpenFromNotification() {}
