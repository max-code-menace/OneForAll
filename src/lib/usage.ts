import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Temps passé aujourd'hui sur chaque réseau, compté uniquement sur le téléphone
 * (rien n'est envoyé). Remis à zéro chaque jour.
 */

const KEY = 'oneforall:usage:v1';

type Usage = { day: string; seconds: Record<string, number> };

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export async function readUsage(): Promise<Record<string, number>> {
  try {
    const u: Usage = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
    return u && u.day === today() ? u.seconds : {};
  } catch {
    return {};
  }
}

async function addUsage(platformId: string, seconds: number) {
  if (seconds <= 0) return;
  const current = await readUsage();
  const next: Usage = { day: today(), seconds: { ...current, [platformId]: (current[platformId] ?? 0) + seconds } };
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

/** Compte le temps tant que l'écran du site est ouvert et l'app au premier plan. */
export function useUsageTimer(platformId: string) {
  useEffect(() => {
    let since: number | null = AppState.currentState === 'active' ? Date.now() : null;
    const flush = () => {
      if (since === null) return;
      // Passage de minuit : seul le temps depuis minuit compte pour le nouveau jour.
      since = Math.max(since, new Date().setHours(0, 0, 0, 0));
      const seconds = Math.round((Date.now() - since) / 1000);
      since = Date.now();
      addUsage(platformId, seconds);
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') since = Date.now();
      else {
        flush();
        since = null;
      }
    });
    const timer = setInterval(flush, 15_000);
    return () => {
      flush();
      clearInterval(timer);
      sub.remove();
    };
  }, [platformId]);
}

/** « 12 min », « 1 h 05 ». */
export function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
