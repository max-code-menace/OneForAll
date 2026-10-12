import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { Intro } from '../components/Intro';
// Définit la tâche de fond (iOS peut réveiller l'app juste pour elle).
import { useOpenFromNotification } from '../lib/backgroundCheck';
import { IntroProvider } from '../lib/intro';
import { RulesProvider } from '../lib/rules';
import { SettingsProvider } from '../lib/settings';
import { useTheme } from '../lib/theme';

/**
 * Navigation principale : une pile d'écrans (Accueil → Site / Réglages → À propos).
 * Chaque écran dessine son propre en-tête (design OneForAll) ; la poussée reste celle d'iOS.
 * Par-dessus : l'animation de lancement et la présentation.
 */
export default function RootLayout() {
  return (
    <RulesProvider>
      <SettingsProvider>
        <IntroProvider>
          <Navigation />
        </IntroProvider>
      </SettingsProvider>
    </RulesProvider>
  );
}

function Navigation() {
  const t = useTheme();
  useOpenFromNotification();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="about" />
        <Stack.Screen
          name="browser/[platform]"
          // Dans un site, les bords servent à changer d'onglet ; le bouton rond ramène à l'accueil.
          options={{ gestureEnabled: false }}
        />
      </Stack>
      <Intro />
    </View>
  );
}
