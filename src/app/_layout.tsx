import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SettingsProvider } from '../lib/settings';

/** Navigation principale : une pile d'écrans (Accueil → Site / Réglages). */
export default function RootLayout() {
  return (
    <SettingsProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerBackTitle: 'Accueil' }}>
        <Stack.Screen name="index" options={{ title: 'OneForAll' }} />
        <Stack.Screen name="settings" options={{ title: 'Réglages' }} />
        <Stack.Screen
          name="browser/[platform]"
          // Le glissement depuis le bord sert à revenir en arrière DANS le site.
          options={{ gestureEnabled: false }}
        />
      </Stack>
    </SettingsProvider>
  );
}
