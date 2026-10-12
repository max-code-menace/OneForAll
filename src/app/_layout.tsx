import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { Intro } from '../components/Intro';
import { SitesLayer } from '../components/SitesLayer';
// Définit la tâche de fond (iOS peut réveiller l'app juste pour elle).
import { useOpenFromNotification } from '../lib/backgroundCheck';
import { IntroProvider } from '../lib/intro';
import { OpenSitesProvider, useOpenSites } from '../lib/openSites';
import { RulesProvider } from '../lib/rules';
import { SettingsProvider } from '../lib/settings';
import { useTestUpdates } from '../lib/testUpdates';
import { useTheme } from '../lib/theme';

/**
 * Navigation principale : une pile d'écrans (Accueil → Réglages → À propos).
 * Chaque écran dessine son propre en-tête (design OneForAll) ; la poussée reste celle d'iOS.
 * Par-dessus : les réseaux (gardés ouverts en arrière-plan, voir SitesLayer), puis
 * l'animation de lancement et la présentation.
 */
export default function RootLayout() {
  return (
    <RulesProvider>
      <SettingsProvider>
        <IntroProvider>
          <OpenSitesProvider>
            <Navigation />
          </OpenSitesProvider>
        </IntroProvider>
      </SettingsProvider>
    </RulesProvider>
  );
}

function Navigation() {
  const t = useTheme();
  const { open } = useOpenSites();
  useOpenFromNotification(open);
  // App de test seulement : installe tout de suite la dernière version envoyée.
  useTestUpdates();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="about" />
      </Stack>
      {/* Dans un site, pas de glissement gauche/droite : seul le bouton rond ramène à l'accueil. */}
      <SitesLayer />
      <Intro />
    </View>
  );
}
